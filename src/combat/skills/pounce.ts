// Pounce: the warrior with both hands empty (#400). An instant leap onto the foe aimed at, up to `range` m off, landing
// on it with his weight and pinning it under a flurry of `blows` short punches to its body, the lead hand and the rear
// in turn. The foe is pinned (dazed) from the landing until the last blow; an elite or a boss is too strong to pin, and
// takes the blows standing. The first blow that lands builds a stack of Frenzy (combat/frenzy.ts).
import * as THREE from 'three';
import { G } from '../../state';
import { dazeEnemy, hitEnemy } from '../damage';
import { schedule } from '../../core/timers';
import { shockwave, decal } from '../../fx/effects';
import { smokePuff, debris } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { gainFrenzy } from '../frenzy';
import { FRENZY, POUNCE } from '../../data/balance';
import { fistMark } from './savageFists';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'blows'>;

/** where he lands: this far short of the foe's body (m, past both sizes), so his blows come down on it */
const SHORT = 0.4;
/** a foe within this of the aim's point is the one meant, where the aim isn't on a body (m) */
const NEAR_AIM = 2.5;
/** his blows reach a foe this far from him past its size (m): one that slips further off is missed */
const REACH = 1.6;

/** The foe it would leap onto for the aim at `target`: the one the aim is on, else the nearest the aim's point, within
 *  `range` of him. */
function quarry(player: Player, def: Def, target: THREE.Vector3): Enemy | null {
  const within = (e: Enemy) => e.alive && !e.spawning && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= def.range + e.radius;
  const on = player.local ? player.aimFoe : null;
  if (on && within(on)) return on;
  let best: Enemy | null = null, bd = NEAR_AIM;
  for (const e of G.enemies) {
    if (!within(e)) continue;
    const d = Math.hypot(e.pos.x - target.x, e.pos.z - target.z) - e.radius;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** The pose's length after the landing (s): the blows and the hold after them (the model keys its blows to these,
 *  `POUNCE` in data/balance.ts). */
const pounceHold = (blows: number): number => POUNCE.first + POUNCE.apart * (blows - 1) + POUNCE.after;

/** The rest of the leap aimed `SHORT` from the foe's body where it is now, along the leap's way, never back: aimed at
 *  where it stood as he sprang, he landed inside a foe that walked at him (an adversarial review). */
function steer(dash: { vx: number; vz: number; t: number; dur: number }, player: Player, foe: Enemy, dir: THREE.Vector3): void {
  const left = dash.dur - dash.t;
  if (left <= 1e-3) return;
  const gap = Math.hypot(foe.pos.x - player.pos.x, foe.pos.z - player.pos.z) - foe.radius - player.radius - SHORT;
  const speed = Math.max(0, gap) / left;
  dash.vx = dir.x * speed;
  dash.vz = dir.z * speed;
}

const skill: InstantSkill = {
  anim: 'pounce',
  dashes: true,
  hits: (def) => [{ per: 'blow', base: (def as Def).damage, type: 'physical', note: `${(def as Def).blows} blows on the foe pinned` }],
  canCast: (player, def, target) => quarry(player, def as Def, target) !== null,
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const foe = quarry(player, def, target);
    if (!foe) return;
    const p = player.pos;
    const dx = foe.pos.x - p.x, dz = foe.pos.z - p.z, d = Math.hypot(dx, dz);
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    const go = Math.max(0, d - foe.radius - player.radius - SHORT);
    const dur = POUNCE.leap, hold = pounceHold(def.blows);
    let down = false, built = false;
    sfx.bullLaunch(); sfx.grunt(player.frenzy / FRENZY.cap);
    player.startDash(dir, go / dur, dur, {
      anim: 'pounce', hold, lift: Math.min(POUNCE.top, go * POUNCE.rise),
      step: () => {
        const dash = player.dash;
        if (!down && dash && dash.t < dash.dur && foe.alive) steer(dash, player, foe, dir);
        if (down || !dash || dash.t < dash.dur) return;
        // the landing: his weight on it, the dust thrown out round them, and the foe pinned under him
        down = true;
        const at = player.pos.clone();
        shockwave(at, { color: 0xd8b890, intensity: 0.8, from: 0.2, to: 1.8, life: 0.3 });
        smokePuff(at, { count: 8, color: 0x2a241c, alpha: 0.5, size: 0.7, sizeEnd: 2, speed: 2.5 });
        debris({ x: at.x, y: 0, z: at.z }, { count: 6, speed: 4 });
        decal(at, { type: 'scorch', size: 0.9, life: 2.5, opacity: 0.4 });
        if (player.local) addShake(0.18);
        sfx.bullLand();
        if (foe.alive && !foe.hero && !foe.boss) dazeEnemy(foe, hold, player);
      },
    });
    for (let i = 0; i < def.blows; i++) {
      schedule(dur + POUNCE.first + POUNCE.apart * i, () => {
        if (!player.alive || player.stunned || !foe.alive) return;
        if (Math.hypot(foe.pos.x - player.pos.x, foe.pos.z - player.pos.z) > REACH + foe.radius) return;
        const way = { x: foe.pos.x - player.pos.x, z: foe.pos.z - player.pos.z }, len = Math.hypot(way.x, way.z) || 1;
        // (a blow into its body: what it kills is thrown back off it)
        hitEnemy(foe, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', from: player.pos, blow: { dir: { x: way.x / len, z: way.z / len }, lift: 0.1, at: 0.9 } });
        fistMark(foe, player.frenzy, 6);
        sfx.punchLand(i % 2 ? 1 : -1, player.frenzy / FRENZY.cap);
        if (player.local) addShake(0.06);
        if (!built && !player.sandbox) { built = true; gainFrenzy(player, def.frenzy ?? 0); }
      });
    }
  },
};

export default skill;
