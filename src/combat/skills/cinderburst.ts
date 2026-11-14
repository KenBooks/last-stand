// Cinderburst: the fire staff's spell (#402). A slow, heavy orb of fire that bursts where it strikes: the foe it
// meets takes it whole, those round it a share easing down to the blast's edge, and each may be set alight
// (combat/burn.ts). Cast a third as often as an arcane staff's bolt.
import * as THREE from 'three';
import { G } from '../../state';
import { spawnProjectile } from '../projectiles';
import { hitEnemy } from '../damage';
import { igniteEnemy, BURN_TICK } from '../burn';
import { blastCorpses } from '../../entities/corpse';
import { cinderOrb, cinderBlast } from '../../fx/cinder';
import { burst } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'speed' | 'range' | 'radius' | 'edge' | 'color' | 'trailEnd' | 'burn'>;

/** The orb bursts at `at`: `struck` (the foe it met, if any) takes it whole, the rest by how far out they stand. */
function burstAt(player: Player, def: Def, at: THREE.Vector3, struck: Enemy | null, way: { x: number; z: number }): void {
  // (its look: the flash, the ball of flame, the rings, the embers and the fire it leaves, fx/cinder.ts)
  cinderBlast(at, def.radius, def.color, def.trailEnd);
  flash({ color: def.color, intensity: 9, distance: 6, life: 0.3, pos: { x: at.x, y: at.y + 0.5, z: at.z } });
  addShake(0.08);
  sfx.cinderBurst();
  hurtPropsIn(player, at.x, at.z, def.radius * 0.8, PROP_DAMAGE.blast);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const d = e === struck ? 0 : Math.hypot(e.pos.x - at.x, e.pos.z - at.z) - e.radius * 0.5;
    if (d >= def.radius) continue;
    const x = Math.max(0, d) / def.radius, k = 1 - (1 - def.edge) * x * x * (3 - 2 * x);
    // (the foe it met is driven on along its flight, the others out from the burst)
    const blow = e === struck ? { dir: way, lift: 0.35, on: { x: at.x, z: at.z } } : { lift: 0.6 };
    hitEnemy(e, def.damage * k, { by: player, skill: def, tags: def.tags, type: 'fire', knock: 3 * k, from: at, blow });
    if (e.alive && Math.random() < def.burn.chance) igniteEnemy(e, def.burn.perSecond, def.burn.seconds, player, def);
  }
  blastCorpses(at, def.radius, 4, { lift: 0.7 });
}

const skill: InstantSkill = {
  anim: 'point',
  hits(rawDef) {
    const def = rawDef as Def;
    return [
      { per: 'foe', base: def.damage, type: 'fire', least: def.edge, note: `least at the blast's edge, ${def.radius} m out` },
      { per: 'burn tick', base: def.burn.perSecond * BURN_TICK, rate: 1 / BURN_TICK, type: 'fire', tags: ['fire'], note: `${Math.round(def.burn.chance * 100)}% to set a foe alight for ${def.burn.seconds} s` },
    ];
  },
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const origin = player.castPoint.clone();
    const angle = player.shotHeading(origin, target);
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const orb = cinderOrb(def.color, def.trailEnd);
    let done = false;
    const end = (at: THREE.Vector3, struck: Enemy | null, vel: THREE.Vector3): void => {
      if (done) return;
      done = true;
      orb.dispose();
      burstAt(player, def, at, struck, { x: vel.x, z: vel.z });
    };
    spawnProjectile({
      pos: origin, dir, speed: def.speed, radius: 0.5, life: def.range / def.speed,
      color: def.color, glow: 12, by: player, judged: new Set(), mesh: orb.mesh,
      trail: { color: def.color, colorEnd: def.trailEnd, size: 0.6, rate: 120, life: 0.45 },
      tick: (proj, dt) => orb.tick(proj.pos, proj.vel, dt),
      onHit: (target, proj) => end(proj.pos, target as Enemy, proj.vel),
      // (spent, or into a prop or the wall: it bursts there all the same)
      onExpire: (proj) => end(proj.pos, null, proj.vel),
      onProp: (_o, proj) => { end(proj.pos, null, proj.vel); return true; },
    });
    // a flare and a ring of fire off the crystal as it leaves
    burst(origin, { count: 22, color: def.color, colorEnd: def.trailEnd, speed: 3.5, life: 0.35, size: 0.34, gravity: 0 });
    burst(origin, { count: 10, color: 0xfff0c0, colorEnd: def.color, speed: 1.2, life: 0.2, size: 0.45, gravity: 0 });
    sfx.cinder();
  },
};

export default skill;
