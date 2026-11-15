// Heave: the warrior with both hands empty. A step in at the aim, the first foe he meets seized and struck, carried
// before him for the step's last instant and thrown on along it through the air (the charge's own carry and throw,
// entities/carry.ts, so every game shows it as it does Bull Rush's); where it comes down, it and every foe round it
// take the landing. An elite or a boss is too heavy to throw: struck and shoved back. A training dummy stands.
import * as THREE from 'three';
import { G } from '../../state';
import { carryEnemy, hitEnemy } from '../damage';
import { evades } from '../../entities/evade';
import { addEffect, shockwave, decal } from '../../fx/effects';
import { smokePuff, debris } from '../../fx/particles';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { blastCorpses } from '../../entities/corpse';
import { fistMark } from './knuckles';
import { HEAVE } from '../../data/balance';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'range' | 'radius' | 'knock'>;

const DUST = 0x2a241c;
/** the hands close on what comes within this of his middle, past the foe's own size (m), before him */
const REACH = 0.9;
/** how long a throw is watched for its landing at most (s) */
const WATCHED = 3;

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
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const p = player.pos;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    const dir = d > 1e-3 ? new THREE.Vector3(dx / d, 0, dz / d) : new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    // (closes in on the aim, never past it: the hands reach the rest)
    const step = Math.min(def.range, Math.max(0, d - REACH));
    let seized: Enemy | null = null;
    sfx.heave(HEAVE.step);
    player.startDash(dir, step / HEAVE.step, HEAVE.step, { anim: 'heave', hold: HEAVE.hold, step: () => {
      const dash = player.dash;
      if (seized || !dash) return;
      let nearest: Enemy | null = null, least = Infinity;
      for (const e of G.enemies) {
        if (!e.alive || e.carried || e.tossed) continue;
        const ex = e.pos.x - p.x, ez = e.pos.z - p.z, off = Math.hypot(ex, ez) - e.radius;
        if (off > REACH || ex * dir.x + ez * dir.z < 0 || off >= least) continue;
        nearest = e; least = off;
      }
      if (!nearest || evades(nearest, player, { kind: 'rush', x: p.x, z: p.z, way: dir, half: REACH })) return;
      seized = nearest;
      // (struck as he takes hold, then carried to the step's end and thrown on from there, entities/enemy `letGo`)
      hitEnemy(nearest, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', from: p, blow: { dir, lift: 0.5 } });
      // (the way's length is how hard it's thrown, entities/carry `carryOf`)
      carryEnemy(nearest, player, { x: dir.x * HEAVE.throw, z: dir.z * HEAVE.throw }, Math.max(0, dash.dur - dash.t));
      fistMark(nearest, 8);
      addShake(0.1);
      sfx.heaveGrab();
    } });
    const mine = player.dash;
    // the throw watched to where it comes down (every game's copy of the foe flies as its own game throws it)
    let t = 0, flying = false;
    addEffect({
      update(dt) {
        t += dt;
        if (!seized) return player.dash === mine && mine !== null;
        if (!seized.alive || t > WATCHED) return false;
        if (seized.tossed) { flying = true; return true; }
        if (flying) { land(player, def, seized); return false; }
        // (not thrown: an elite or a boss shoved on, a dummy that stood)
        return !!seized.carried || t < HEAVE.step + 0.2;
      },
      dispose() {},
    });
  },
};

export default skill;
