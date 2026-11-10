// Stormcall: the lightning staff's spell (#402). Held, the staff's orb gathers a charge for up to `draw` s; let go,
// lightning leaps from the orb to the aim and bursts there. The longer it was held the harder it strikes and the
// wider it reaches, and a quick tap still looses a spark. The foe at its middle is dazed for `duration` s, those
// round it for less the further out they stand; elites and bosses aren't dazed.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy, dazeEnemy } from '../damage';
import { blastCorpses } from '../../entities/corpse';
import { shockwave, groundFlash } from '../../fx/effects';
import { stormArc } from '../../fx/stormArc';
import { burst, particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { rand } from '../../util';
import { addEffect } from '../../fx/effects';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'radius' | 'edge' | 'color' | 'duration' | 'draw' | 'least'>;

/** how near the aim a foe must stand to be the strike's middle (m, past its own size) */
const SNAP = 1.2;
/** the least charge whose strike lights the ground round it (a share of the full charge: a second's hold) */
const LIT_FROM = 0.33;
/** through the eyes the arc is this much wider: it runs away from the eye, a thin line along the view's foot (from
 *  play: "lightning was underwhelming in 1st person") */
const EYES_WIDE = 1.25;
/** the arcs a strike throws up and out of where it lands, at a tap and at full charge, and how far they reach (m) */
const CROWN = { least: 2, most: 7, reach: [1.1, 2.6] };
/** the height the bolt strikes a foe at, as a share of its own */
const CHEST = 0.55;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** The strike's damage at its middle and its reach, drawn `power` of the way (0..1). */
export const stormAt = (def: Pick<Def, 'damage' | 'radius' | 'least'>, power: number): { damage: number; radius: number } =>
  ({ damage: def.damage * lerp(def.least, 1, power), radius: def.radius * lerp(def.least, 1, power) });

const _to = new THREE.Vector3(), _at = new THREE.Vector3();

/** casts whose charge already started (to play its sound once) */
const charged = new WeakSet<object>();

const skill: InstantSkill = {
  anim: 'point',
  hits(rawDef) {
    const def = rawDef as Def;
    return [{
      per: 'foe', base: def.damage, type: 'lightning', least: def.least * def.edge,
      note: `at full charge (${def.draw} s), least from a tap at the strike's edge`,
    }];
  },
  charging(player, rawDef, k, dt) {
    const def = rawDef as Def;
    const cast = player.casting;
    if (cast && !charged.has(cast) && !player.quiet) {
      charged.add(cast);
      // (its gathering heard until it's let go or cut short: watched, as nothing says a cast ended)
      const hush = sfx.stormCharge(def.draw);
      if (hush) addEffect({ update: () => { if (!cast.fired && player.casting === cast) return true; hush(); return false; }, dispose() {} });
    }
    // sparks drawn in round the orb, more the fuller the charge
    const tip = player.castPoint, want = (6 + 30 * k) * dt;
    const n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = rand(-1, 1), r = 0.25 + 0.35 * k, c = Math.sqrt(1 - b * b);
      particles.glow.spawn({
        x: tip.x + Math.cos(a) * c * r, y: tip.y + b * r, z: tip.z + Math.sin(a) * c * r,
        vx: -Math.cos(a) * c * r * 4, vy: -b * r * 4, vz: -Math.sin(a) * c * r * 4,
        life: 0.22, size: rand(0.05, 0.1), sizeEnd: 0.01, color: col(0xffffff, 3), colorEnd: col(def.color, 2), drag: 0,
      });
    }
  },
  cast(player, rawDef, target, power) {
    const def = rawDef as Def;
    const origin = player.castPoint;
    // where it strikes: the aim, no further than its range; the foe standing there is its middle
    _to.set(target.x - player.pos.x, 0, target.z - player.pos.z);
    const far = _to.length();
    if (far > def.range) _to.multiplyScalar(def.range / far);
    _at.set(player.pos.x + _to.x, 0, player.pos.z + _to.z);
    let middle: Enemy | null = null, nearest = SNAP;
    for (const e of G.enemies) {
      if (!e.alive || e.invulnerable) continue;
      const d = Math.hypot(e.pos.x - _at.x, e.pos.z - _at.z) - e.radius;
      if (d < nearest) { nearest = d; middle = e; }
    }
    if (middle) _at.set(middle.pos.x, 0, middle.pos.z);
    const at = _at.clone();
    const strike = at.clone().setY(middle ? middle.height * CHEST : 0.1);

    // the arc travels from the orb first; its strike lands as it arrives, and the arc stays a while after
    stormArc(origin.clone(), strike, {
      color: def.color, width: (0.02 + 0.03 * power) * (player.eyes ? EYES_WIDE : 1), linger: 0.5 + 0.5 * power, jag: 0.3 + 0.3 * power,
      forks: 1 + Math.round(4 * power), intensity: 2.2 + 1.2 * power,
      onArrive: () => land(player, def, power, at, strike, middle),
    });
    sfx.storm(power);
    burst(origin, { count: 6 + Math.round(10 * power), color: 0xffffff, colorEnd: def.color, speed: 2.5, life: 0.25, size: 0.18, gravity: 0 });
  },
};

/** The strike landing at `at` as its arc arrives: its burst, and its damage and daze on the foes round it. */
function land(player: Player, def: Def, power: number, at: THREE.Vector3, strike: THREE.Vector3, middle: Enemy | null): void {
  const { damage, radius } = stormAt(def, power);
  // a crown of arcs thrown up and out of the strike, the more and the further the fuller the charge: what's seen
  // of it from every view, through the eyes above all
  const crown = Math.round(CROWN.least + (CROWN.most - CROWN.least) * power);
  for (let i = 0; i < crown; i++) {
    const a = (i + rand(0, 1)) / crown * Math.PI * 2, far = (CROWN.reach[0] + (CROWN.reach[1] - CROWN.reach[0]) * power) * rand(0.6, 1);
    const tip = new THREE.Vector3(strike.x + Math.cos(a) * far * 0.7, strike.y + far * rand(0.5, 1), strike.z + Math.sin(a) * far * 0.7);
    stormArc(strike.clone(), tip, { color: def.color, speed: 22, width: 0.012 + 0.012 * power, linger: 0.3 + 0.4 * power, jag: 0.22, forks: 0, intensity: 2 });
  }
  {
    shockwave(at, { color: def.color, intensity: 1 + power, from: 0.2, to: radius, life: 0.25 });
    burst(strike, { count: 8 + Math.round(18 * power), color: 0xffffff, colorEnd: def.color, speed: 5 + 4 * power, life: 0.3, size: 0.2 });
    // (a charged strike alone lights the ground: taps come two or three a second, and each one's flash across the
    // floor would flicker faster than anything large may, the root's Bright effects)
    if (power >= LIT_FROM) {
      groundFlash(at, { color: def.color, intensity: 1.5 * power, radius: radius * 0.8, life: 0.3 });
      flash({ color: def.color, intensity: 8 + 10 * power, distance: 5 + 2 * power, life: 0.2, pos: { x: at.x, y: 1.2, z: at.z } });
    }
    if (power > 0.4) addShake(0.12 * power);
    sfx.stormStrike(power);

    hurtPropsIn(player, at.x, at.z, radius * 0.8, PROP_DAMAGE.blast);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = e === middle ? 0 : Math.hypot(e.pos.x - at.x, e.pos.z - at.z) - e.radius * 0.5;
      if (d >= radius) continue;
      const x = Math.max(0, d) / radius, k = 1 - (1 - def.edge) * x * x * (3 - 2 * x);
      // (an arc from the middle to each other foe it reaches)
      if (e !== middle) stormArc(strike.clone(), new THREE.Vector3(e.pos.x, e.height * CHEST, e.pos.z), { color: def.color, speed: 45, width: 0.014, linger: 0.35 + 0.35 * power, jag: 0.22, forks: 0, intensity: 2 });
      hitEnemy(e, damage * k, { by: player, skill: def, tags: def.tags, type: 'lightning', knock: 2 * k * power, from: at, blow: { lift: 0.5, style: 'shock' } });
      // (dazed by how near the middle it stands, an elite or a boss not at all)
      if (e.alive && !e.hero && !e.boss) dazeEnemy(e, def.duration * (1 - x), player);
    }
    blastCorpses(at, radius, 3 * power, { lift: 0.5 });
  }
}

export default skill;
