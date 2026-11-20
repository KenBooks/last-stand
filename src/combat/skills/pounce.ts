// Pounce: the warrior with both hands empty (#400). An instant leap onto the foe aimed at, up to `range` m off, landing
// at arm's length from it with his weight, which staggers it a moment (dazed for `POUNCE.pin`; not an elite or a
// boss). The leap alone: it strikes nothing and builds no Frenzy, and he's free at once for whatever he casts next.
// (It pinned the foe under four blows of its own, taken out: from play, "lets change pounce to only jump, this allows
// stacking it with other attacks naturally".)
import * as THREE from 'three';
import { G } from '../../state';
import { dazeEnemy } from '../damage';
import { shockwave, crackDecal, decal } from '../../fx/effects';
import { particles, col, smokePuff, debris } from '../../fx/particles';
import { rand } from '../../util';
import { addShake, kickFov, liftView, tipView } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { FRENZY, POUNCE } from '../../data/balance';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'range'>;

/** where he lands: this far short of the foe's body (m, past both sizes), at arm's length, where a punch thrown next
 *  lands clean (0.4 short, his forearms went into a husk's body as they came down) */
const SHORT = 0.75;
/** a foe within this of the aim's point is the one meant, where the aim isn't on a body (m) */
const NEAR_AIM = 2.5;
/**
 * The leap through his own eyes: the view rises and falls with it (`rise` of the leap's own height: the body's lift
 * left the eyes on the ground, and the leap was a slide forward, from play: "1 skill is underwhelming in 1st person
 * ... it really needs to feel like pounce"), widens with its speed (`fov`, degrees at its middle), tips down onto
 * what he comes down on over its second half (`tip`, rad), and gives under the landing (`give`, m, and `giveFor`,
 * s), the tip let go with it.
 */
const EYES = { rise: 1, fov: 9, tip: 0.2, give: 0.28, giveFor: 0.16 };

/** His own view through the leap at `k` of it (0..1) and `landed` s after it came down (`EYES`). */
function leapView(k: number, landed: number, lift: number): void {
  if (landed <= 0) {
    liftView(EYES.rise * lift * 4 * k * (1 - k));
    kickFov(EYES.fov * Math.sin(Math.PI * k));
    const down = Math.max(0, (k - 0.45) / 0.55);
    tipView(EYES.tip * down * down * (3 - 2 * down));
    return;
  }
  const settle = Math.exp(-landed / EYES.giveFor);
  if (settle < 0.03) return;
  // (down into his knees as his weight lands, and up out of them)
  liftView(-EYES.give * settle * Math.min(1, landed / 0.03));
  tipView(EYES.tip * settle);
}

const DUST = 0x2a241c, EARTH = 0xd8b890;

/** The spring off the ground, seen from outside: the floor kicked out behind him. */
function springOff(at: THREE.Vector3, dir: THREE.Vector3): void {
  shockwave(at, { color: EARTH, intensity: 1, from: 0.15, to: 1.5, life: 0.25 });
  smokePuff({ x: at.x - dir.x * 0.3, y: 0, z: at.z - dir.z * 0.3 }, { count: 7, color: DUST, alpha: 0.5, size: 0.6, sizeEnd: 1.9, speed: 2.2, life: 0.9 });
  debris({ x: at.x, y: 0, z: at.z }, { count: 8, speed: 4.5 });
  decal(at, { type: 'scorch', size: 0.7, life: 2.5, opacity: 0.35 });
}

/** His way through the air at `high` m over the floor: streaks of air torn off him and dust carried up after him, so
 *  the leap reads as an arc from above and over the shoulder (through the eyes the view itself rises and falls). */
function airTrail(p: THREE.Vector3, dir: THREE.Vector3, high: number, speed: number): void {
  for (let i = 0; i < 3; i++) {
    const side = rand(-0.35, 0.35), up = high + rand(0.5, 1.5);
    particles.glow.spawn({
      x: p.x - dir.z * side - dir.x * 0.3, y: up, z: p.z + dir.x * side - dir.z * 0.3,
      vx: -dir.x * speed * 0.25, vy: rand(-0.3, 0.3), vz: -dir.z * speed * 0.25,
      life: rand(0.18, 0.3), size: rand(0.05, 0.09), sizeEnd: 0, color: col(EARTH, 0.45), colorEnd: col(0x5a4a3a, 0.1),
      gravity: 0, drag: 2,
    });
  }
  smokePuff({ x: p.x - dir.x * 0.4, y: high + 0.6, z: p.z - dir.z * 0.4 }, { count: 1, color: DUST, alpha: 0.3, size: 0.5, sizeEnd: 1.4, life: 0.5, speed: 0.4, rise: 0.1 });
}

/** The landing, his weight coming down from `high` m: the floor cracked under him and thrown out in a ring. */
function comeDown(at: THREE.Vector3, high: number): void {
  const hard = Math.min(1, 0.4 + high / POUNCE.top * 0.6);
  shockwave(at, { color: EARTH, intensity: 1.6 * hard, from: 0.2, to: 1.6 + 1.4 * hard, life: 0.35 });
  shockwave(at, { color: 0xffffff, intensity: 0.6 * hard, from: 0.15, to: 1 + 0.8 * hard, life: 0.22 });
  crackDecal(at, { size: 1.4 + 1.2 * hard, color: EARTH, intensity: 1.2, life: 2.5 });
  smokePuff(at, { count: 12, color: DUST, alpha: 0.55, size: 0.8, sizeEnd: 2.4, speed: 3.2, life: 1 });
  debris({ x: at.x, y: 0, z: at.z }, { count: Math.round(8 + 10 * hard), speed: 4 + 3 * hard });
  decal(at, { type: 'scorch', size: 1 + 0.6 * hard, life: 3, opacity: 0.45 });
}

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
  canCast: (player, def, target) => quarry(player, def as Def, target) !== null,
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const foe = quarry(player, def, target);
    if (!foe) return;
    const p = player.pos;
    const dx = foe.pos.x - p.x, dz = foe.pos.z - p.z, d = Math.hypot(dx, dz);
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    const go = Math.max(0, d - foe.radius - player.radius - SHORT);
    const dur = POUNCE.leap, hold = POUNCE.after;
    let down = false;
    sfx.bullLaunch(); sfx.grunt(player.frenzy / FRENZY.cap);
    const lift = Math.min(POUNCE.top, go * POUNCE.rise);
    springOff(p.clone(), dir);
    player.startDash(dir, go / dur, dur, {
      anim: 'pounce', hold, lift,
      step: () => {
        const dash = player.dash;
        if (player.local && dash) leapView(Math.min(1, dash.t / dash.dur), dash.t - dash.dur, dash.lift);
        if (dash && dash.t < dash.dur) {
          const k = dash.t / dash.dur;
          airTrail(player.pos, dir, lift * 4 * k * (1 - k), go / dur);
        }
        if (!down && dash && dash.t < dash.dur && foe.alive) steer(dash, player, foe, dir);
        if (down || !dash || dash.t < dash.dur) return;
        // the landing: his weight on it, the dust thrown out round them, and the foe staggered by it
        down = true;
        comeDown(player.pos.clone(), lift);
        if (player.local) addShake(0.34);
        sfx.bullLand();
        if (foe.alive && !foe.hero && !foe.boss) dazeEnemy(foe, POUNCE.pin, player);
      },
    });
  },
};

export default skill;
