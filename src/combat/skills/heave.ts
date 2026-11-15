// Heave: the warrior with both hands empty. The nearest foe before him is his mark: a step in at it, the foe struck
// and seized, carried before him for the step's last instant and thrown on through the air (the charge's own carry
// and throw, entities/carry.ts, so every game shows it as it does Bull Rush's, thrown `HEAVE.throw` times as hard);
// where it comes down, it and every foe round it take the landing. An elite or a boss is too heavy to throw: struck
// and shoved back. A training dummy stands. With no foe in his reach it isn't cast, and costs nothing.
//
// The mark is chosen by where he stands, not by where the click fell (from play: "it shoud grab the closest mob to
// the charecter. and the one its roughly facing, and less prioritzing where the mouse is when clicking. Becuase
// currently, the lauch works 50/50"): stepping at the aim and seizing what the step met, a click a little off a foe,
// or past a nearer one, took hold of nothing.
import * as THREE from 'three';
import { G } from '../../state';
import { carryEnemy, hitEnemy } from '../damage';
import { dealsDamage } from '../../net/role';
import { evades } from '../../entities/evade';
import { addEffect, shockwave, decal } from '../../fx/effects';
import { smokePuff, debris } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { blastCorpses } from '../../entities/corpse';
import { fistMark } from './knuckles';
import { angleBetween } from './slash';
import { HEAVE } from '../../data/balance';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'radius' | 'knock'>;

const DUST = 0x2a241c;
/** how near his hands must be to a foe's body to close on it (m) */
const REACH = 0.9;
/** how near his body the step brings a foe's (m) */
const CLOSE = 0.15;
/** how long a throw is watched for its landing at most (s) */
const WATCHED = 3;

/**
 * The foe a Heave cast towards `target` takes hold of: the nearest within his step and his reach among those before
 * him, the way he's turned to cast (`HEAVE.before` either side of the aim: the half of the ground the click is in),
 * or with none there the nearest all round.
 */
function markOf(player: Player, def: Def, target: THREE.Vector3): Enemy | null {
  const p = player.pos;
  const aimed = Math.hypot(target.x - p.x, target.z - p.z) > 1e-3 ? Math.atan2(target.x - p.x, target.z - p.z) : player.facing;
  let before: Enemy | null = null, any: Enemy | null = null, leastBefore = Infinity, leastAny = Infinity;
  for (const e of G.enemies) {
    if (!e.alive || e.invulnerable || e.carried || e.tossed) continue;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z, off = Math.hypot(dx, dz) - e.radius;
    if (off > def.range + REACH) continue;
    if (off < leastAny) { any = e; leastAny = off; }
    if (off < leastBefore && angleBetween(Math.atan2(dx, dz), aimed) <= HEAVE.before) { before = e; leastBefore = off; }
  }
  return before ?? any;
}

/** The landing: the thrown foe and all round where it came down struck, the ground answering. */
function land(player: Player, def: Def, thrown: Enemy): void {
  const c = { x: thrown.pos.x, y: 0, z: thrown.pos.z };
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > def.radius + e.radius) continue;
    // (the one thrown lands on what's under it: itself struck down, the others thrown out from it)
    const own = e === thrown;
    hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', knock: own ? 0 : def.knock, from: own ? player.pos : c, blow: { lift: own ? -0.4 : 0.3 } });
  }
  hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.swing);
  blastCorpses(c, def.radius, 4, { lift: 0.5 });
  shockwave(c, { color: 0xd8c0a0, intensity: 1.1, from: 0.2, to: def.radius, life: 0.3 });
  decal(c, { type: 'scorch', size: 1.2, life: 3, opacity: 0.4 });
  debris(c, { count: 8, speed: 4 });
  smokePuff(c, { count: 6, color: DUST, alpha: 0.5, size: 0.8, sizeEnd: 2.2, speed: 2, life: 0.9 });
  addShake(0.18);
  sfx.heaveLand();
}

const skill: InstantSkill = {
  anim: null,
  // (its step is how it takes hold: never cast as a charge runs, where it would ride on the charge and seize nothing)
  dashes: true,
  hits: (def) => [
    { per: 'grab', base: (def as Def).damage, type: 'physical', note: 'the foe seized' },
    { per: 'landing', base: (def as Def).damage, type: 'physical', note: 'the foe thrown and each one it lands among' },
  ],
  canCast: (player, def, target) => markOf(player, def as Def, target) !== null,
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const p = player.pos, deals = dealsDamage(player);
    // (a partner's copy of him steps at the foe its own game shows nearest, and throws the one his game seized)
    const mark = markOf(player, def, target);
    const to = mark?.pos ?? target;
    const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    // (closes in on it, up to its body: the hands close on it on the way, and it's carried the rest of the step.
    // Stopped at his hands' reach, he took hold only as the step ended and threw it the same instant, never carried)
    const step = Math.min(def.range, Math.max(0, d - (mark?.radius ?? 0) - player.radius - CLOSE));
    let seized: Enemy | null = null;
    sfx.heave(HEAVE.step);
    player.startDash(dir, step / HEAVE.step, HEAVE.step, { anim: 'heave', hold: HEAVE.hold, step: () => {
      const dash = player.dash;
      if (seized || !dash || !deals || !mark?.alive || mark.carried || mark.tossed) return;
      // (taken hold of as the hands come to it, or as the step ends: a foe that backed off a pace is still his)
      const off = Math.hypot(mark.pos.x - p.x, mark.pos.z - p.z) - mark.radius;
      if (off > REACH && dash.t < dash.dur) return;
      if (off > REACH * 2) return;
      seized = mark;
      if (evades(mark, player, { kind: 'rush', x: p.x, z: p.z, way: dir, half: REACH })) return;
      // (struck as he takes hold, then carried to the step's end and thrown on from there, entities/enemy `letGo`;
      // the way's length is how hard it's thrown, entities/carry `carryOf`)
      hitEnemy(mark, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', from: p, blow: { dir, lift: 0.5 } });
      carryEnemy(mark, player, { x: dir.x * HEAVE.throw, z: dir.z * HEAVE.throw }, Math.max(0.05, dash.dur - dash.t));
      fistMark(mark, 8);
      addShake(0.1);
      sfx.heaveGrab();
    } });
    const mine = player.dash;
    // the throw watched to where it comes down (every game's copy of the foe flies as its own game throws it)
    let t = 0, flying = false;
    addEffect({
      update(dt) {
        t += dt;
        if (!deals && !seized) seized = G.enemies.find((e) => e.alive && e.carried?.by === player) ?? null;
        if (!seized) return (player.dash === mine && mine !== null) || t < HEAVE.step + 0.5;
        if (!seized.alive || t > WATCHED) return false;
        if (seized.tossed) { flying = true; return true; }
        if (flying) { land(player, def, seized); return false; }
        // (not thrown: an elite or a boss shoved on, a dummy that stood)
        return !!seized.carried || t < HEAVE.step + 0.5;
      },
      dispose() {},
    });
  },
};

export default skill;
