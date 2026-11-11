// Rending Cleave: a wide melee sweep in front of the caster that restores energy per hit.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { particles, col } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx, type Heft } from '../../core/audio';
import { rand } from '../../util';
import { angleBetween } from './slash';
import type { InstantSkill, Needs } from './types';
import { hurtProp, PROP_DAMAGE, type Prop } from '../../world/destructible';
import { hurtsProps } from '../../net/role';
import type { Player } from '../../entities/player';
import { swingOn, swingWay, type Blow } from '../fling';

type Def = Needs<'damage' | 'range' | 'arc' | 'knock'>;

/** How heavy what the hero swings is, for its sound: a blade in each hand, a one-hander, a great weapon. */
export const heftOf = (player: Player): Heft => (player.weaponStyle === 'twoHanded' ? 2 : player.weaponStyle === 'dual' ? 0 : 1);

/** casts whose swing is already heard (its air starts with the swing and peaks as the blow lands) */
const swung = new WeakSet<object>();

/** Sparks where the blade bites. */
export function sparks(x: number, y: number, z: number, color: THREE.ColorRepresentation, n = 10): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rand(3, 8);
    particles.glow.spawn({
      x, y, z, vx: Math.cos(a) * s, vy: rand(1, 5), vz: Math.sin(a) * s,
      life: rand(0.2, 0.45), size: rand(0.05, 0.12), sizeEnd: 0, color: col(color, 3), colorEnd: col(0xff5010, 0.4), gravity: 14, drag: 2,
    });
  }
}

/** How a sweep hits: its knock and type; the way it sweeps (+1 from the right to the left: what it kills goes along
 *  it, and out) and how much of that goes up; or a blow of its own for a blow that isn't a sweep (a chop). */
interface SweepOpts { knock?: number; type?: 'physical' | 'fire' | 'lightning'; swing?: number; lift?: number; blow?: Blow }

/** Hit every enemy within `range` and half of `arc` of `facing` around the player. */
export function sweep(player: Player, def: Needs<'damage' | 'range' | 'arc'>, facing: number, opts: SweepOpts = {}): number {
  let hits = 0;
  const p = player.pos;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > def.range + e.radius) continue;
    if (d > e.radius + 0.6 && angleBetween(Math.atan2(dx, dz), facing) > def.arc / 2) continue;
    const swing = opts.swing ?? 1;
    const blow = opts.blow ?? { dir: swingWay(p, e.pos, swing), lift: opts.lift ?? 0.3, on: swingOn(p, e.pos, swing, e.radius) };
    hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: opts.type ?? 'physical', knock: opts.knock, from: p, blow });
    sparks(e.pos.x, e.height * 0.55, e.pos.z, 0xffd9a0, 8);
    hits++;
  }
  // and the props in reach take the blow too (a log is several circles, but one prop takes one blow)
  if (hurtsProps(player)) {
    const struck = new Set<Prop>();
    for (const o of G.arena.obstacles) {
      if (!o.prop || struck.has(o.prop)) continue;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d > def.range + o.r || (d > o.r + 0.6 && angleBetween(Math.atan2(dx, dz), facing) > def.arc / 2)) continue;
      struck.add(o.prop);
      if (hurtProp(o, PROP_DAMAGE.swing)) continue;
      sparks(o.x, Math.min(o.h, 1) * 0.6, o.z, 0xffd9a0, 5);
    }
  }
  return hits;
}

const skill: InstantSkill = {
  anim: 'swing',
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical' }],
  charging(player) {
    const c = player.casting;
    if (c && !swung.has(c)) { swung.add(c); sfx.cleave(c.fireAt - c.t, heftOf(player), player.model.swing ?? 1); }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    // the way the body (and so the swing) faces, which turned to the target during the cast
    const facing = player.facing;
    // (the cut's one mark is the trail its blade leaves, fx/swingTrail.ts: a flat arc laid at the tip's height drew a
    // second one, level across the view while the cut through the eyes ran down it)
    const hits = sweep(player, def, facing, { knock: def.knock, swing: player.model.swing ?? 1 });
    if (hits) {
      sfx.cleaveBite(heftOf(player));
      addShake(0.08);
      if (!player.sandbox) player.energy = Math.min(player.stats.maxEnergy, player.energy + (def.gain ?? 0) * hits);
    }
  },
};

export default skill;
