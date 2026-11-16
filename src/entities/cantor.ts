// The Ossuary Cantor (the Crypt's second rung's main boss, data/enemies.ts `cantor`, its numbers `CANTOR`): a towering
// skeletal priest of the ossuary, floating in rotted vestments, a bronze bell for a heart in its open ribcage. It comes
// with two Bell-Wardens as its guards (data/biomes.ts `BossRung.guards`). Built on the shared boss toolkit
// (entities/bossKit.ts); its model is models/cantor.ts.
//
// - **Warded** while either guard stands (`BossKitDef.ward`, `wardWhileGuarded`): it takes a quarter of the damage, a
//   pale shell round it. Warded rather than empowered: the heroes are told what to strike first, and the fight isn't
//   at its hardest while the arena is fullest.
// - **Grave Hands** (telegraphed): a ring of grave light under every hero, then bone hands tearing up through it. Each
//   game judges its own hero as the hands burst (enemyAI's `graveHands` fx).
// - **The Dirge** (its second phase on, telegraphed): a line of rings marching out from it to a hero, each bursting a
//   moment after the last (enemyAI's `dirge` fx); its rings never overlap.
// - **Its bell-heart** (its trick, the toolkit's weak-spot window): with the guards fallen, each cast leaves its ribs
//   open and its heart bared for `bared` s, taking double damage.
// - **Its last phase**: a dirge at every hero, and casts every `lastEvery` s.
// Its warned hits and the guards' tolls never land together (`claimBeat`).
import * as THREE from 'three';
import { G } from '../state';
import { CANTOR } from '../data/enemies';
import { hurtPlayer } from '../combat/damage';
import { shockwave, groundFlash } from '../fx/effects';
import { rubble } from '../fx/rubble';
import { burst, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { schedule } from '../core/timers';
import { claimBeat, openWeak, telegraphed, telegraphShare, telegraphTime, wardWhileGuarded } from './bossKit';
import { bossHooks } from './bossHooks';
import { fx, seek } from './enemyAI';
import type { Enemy } from './enemy';

const C = CANTOR;
/** its grave light, and the bone of the hands */
export const GRAVE_LIGHT = 0x5fe8a8;
const BONE = 0xd8cfb4;

/** The Cantor's behaviour, where the fight is simulated: glide to `keepAt` of its target, and cast in turn. */
export function cantorAI(e: Enemy): void {
  if (e.action) return;
  const p = e.target!;
  e.faceTo(p.pos.x, p.pos.z);
  const { dx, dz, dist } = e.toPlayer();
  if (e.cd <= 0 && cast(e)) return;
  // (it keeps its distance, floating: in after a hero who backs off, away from one who presses in)
  if (dist > C.keepAt + 2) seek(e, dx, dz, dist);
  else if (dist < C.keepAt - 2) seek(e, -dx, -dz, dist, 0.6);
}

/** A cast begun if its hits have their turn in the fight (`claimBeat`): grave hands, a dirge in turn with them from its
 *  second phase, both in its last. */
function cast(e: Enemy): boolean {
  const last = e.bossPhase >= 2;
  const dirge = last || (e.bossPhase >= 1 && (e.brain.casts ?? 0) % 2 === 1);
  const name = dirge ? 'dirge' : 'graveHands';
  const hitIn = telegraphTime(e, name) * telegraphShare(e, name)!;
  if (!claimBeat(hitIn, C.beat, dirge ? (C.dirge.count - 1) * C.dirge.step : 0)) { e.cd = 0.25; return false; }
  e.brain.casts = (e.brain.casts ?? 0) + 1;
  e.cd = (last ? C.lastEvery : C.every) - telegraphTime(e, name) * 0.5;
  fx('cantorChant', e.id, hitIn);
  if (dirge) dirgeAt(e, hitIn, last);
  else graveHands(e, hitIn);
  return true;
}

/** Grave hands under every hero standing (two heroes close together share one ring: no rings overlap). */
function graveHands(e: Enemy, hitIn: number): void {
  const spots: { x: number; z: number }[] = [];
  for (const p of G.players) {
    if (!p.active) continue;
    if (spots.some((s) => Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < C.hands.radius * 2)) continue;
    spots.push({ x: p.pos.x, z: p.pos.z });
  }
  for (const s of spots) fx('tele', e.id, s.x, s.z, C.hands.radius, hitIn, GRAVE_LIGHT);
  telegraphed(e, 'graveHands', () => {
    for (const s of spots) fx('graveHands', e.id, s.x, s.z, e.damage);
    bare(e);
  });
}

/** A dirge marching out at its target, or at every hero standing in its last phase. */
function dirgeAt(e: Enemy, hitIn: number, every: boolean): void {
  const d = C.dirge, start = e.radius + 1.2;
  const lines = (every ? G.players.filter((p) => p.active) : [e.target!]).map((p) => Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z));
  const ox = e.pos.x, oz = e.pos.z;
  for (const angle of lines) {
    for (let i = 0; i < d.count; i++) {
      const r = start + i * d.apart;
      fx('tele', e.id, ox + Math.sin(angle) * r, oz + Math.cos(angle) * r, d.radius, hitIn + i * d.step, GRAVE_LIGHT);
    }
  }
  telegraphed(e, 'dirge', () => {
    for (const angle of lines) fx('dirge', e.id, ox, oz, angle, e.damage);
    bare(e);
  });
}

/** Its ribs opened after a cast, its bell-heart bared, once its guards have fallen. */
function bare(e: Enemy): void {
  if (!e.warded) openWeak(e, C.bared);
}

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------

/** The Cantor's chant over a cast's warning (`cantorChant` fx). Its raised arms are its model's. */
export function cantorChanted(warn: number): void {
  sfx.cantorChant(warn);
}

/** Bone hands tearing up through the floor at (`x`, `z`), `radius` m: this game's hero hurt `hurt` of `damage` if he
 *  stands in them (and isn't in a leap: he's over them). */
function handsAt(id: number, x: number, z: number, radius: number, hurt: number, damage: number, loud = true): void {
  const foe = G.enemies.find((e) => e.id === id) ?? null;
  const p = G.player;
  if (p.active && !p.airborne && Math.hypot(p.pos.x - x, p.pos.z - z) < radius + p.radius) {
    hurtPlayer(p, damage * hurt, 'vitality', new THREE.Vector3(x, 0, z), { foe, attack: 'hands' });
  }
  rubble(x, z, { count: 9, color: BONE, kind: 'stone', radius: radius * 0.7, height: 1.4, size: 0.22, speed: 3.5, life: 1.6 });
  burst(new THREE.Vector3(x, 0.4, z), { count: 14, color: GRAVE_LIGHT, speed: 4, life: 0.5, size: 0.22 });
  shockwave({ x, z }, { color: GRAVE_LIGHT, intensity: 1.4, from: 0.3, to: radius * 1.2, life: 0.4 });
  groundFlash({ x, z }, { color: GRAVE_LIGHT, intensity: 1.2, radius: radius * 1.4, life: 0.5 });
  smokePuff({ x, y: 0, z }, { count: 5, color: 0x2a2a22, alpha: 0.35, size: 0.8, sizeEnd: 2, speed: 1.6, life: 0.9 });
  if (loud) sfx.boneHands();
}

/** Grave hands bursting at (`x`, `z`) (`graveHands` fx), one light and a shake for the cast. */
export function graveHandsAt(id: number, x: number, z: number, damage: number): void {
  handsAt(id, x, z, C.hands.radius, C.hands.hurt, damage);
  flash({ color: GRAVE_LIGHT, intensity: 10, distance: 9, life: 0.7, pos: { x, y: 1.2, z } });
  addShake(0.25);
}

/** A dirge from (`ox`, `oz`) along `angle` (`dirge` fx): its rings burst in turn, `step` s apart, each as its own ring's
 *  warning ends on every game. */
export function dirgeFrom(id: number, ox: number, oz: number, angle: number, damage: number): void {
  const d = C.dirge, foe = G.enemies.find((e) => e.id === id);
  const start = (foe?.radius ?? 2.4) + 1.2;
  for (let i = 0; i < d.count; i++) {
    const r = start + i * d.apart, x = ox + Math.sin(angle) * r, z = oz + Math.cos(angle) * r;
    schedule(i * d.step, () => handsAt(id, x, z, d.radius, d.hurt, damage, i % 2 === 0));
  }
  addShake(0.3);
}

// --- its phases (entities/bossKit.ts) ------------------------------------------------------

bossHooks('cantor', {
  enter(e, phase) {
    // (each phase's first cast comes soon: the change is heard)
    e.cd = Math.min(e.cd, phase >= 2 ? 0.8 : 1.4);
  },
  cue(e) {
    sfx.cantorWail();
    addShake(0.45);
    shockwave(e.pos, { color: GRAVE_LIGHT, intensity: 1.8, from: 1, to: 10, life: 1.0 });
  },
  frame(e) {
    wardWhileGuarded(e);
  },
});
