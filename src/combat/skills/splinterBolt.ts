// Splintering Bolt: a fan of homing arcane bolts that split on impact.
import * as THREE from 'three';
import { spawnProjectile } from '../projectiles';
import { hitEnemy } from '../damage';
import { burst } from '../../fx/particles';
import { flash } from '../../fx/lights';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';

type Def = Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'splitCount' | 'splitDamage' | 'range' | 'color' | 'trailEnd'>;
import type { SkillDef } from '../../types';
import { sfx } from '../../core/audio';

function launch(
  player: Player, origin: THREE.Vector3, angle: number, def: Def, damage: number, gen: number, ignore: Set<Enemy>, withLight: boolean,
  judged: Set<Enemy>,
): void {
  const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  spawnProjectile({
    pos: origin, dir, speed: def.speed * (gen ? 0.85 : 1), radius: gen ? 0.3 : 0.38,
    life: (def.range / def.speed) * (gen ? 0.6 : 1),
    color: def.color, size: gen ? 0.08 : 0.12, intensity: 6,
    glow: withLight ? 10 : 0, homing: gen ? 5 : 2.2, ignore, by: player, judged,
    trail: { color: def.color, colorEnd: def.trailEnd, size: gen ? 0.22 : 0.34, rate: gen ? 50 : 90, life: 0.3 },
    onHit: (target, proj) => {
      const enemy = target as Enemy;   // friendly projectiles only hit enemies
      hitEnemy(enemy, damage, { by: player, skill: def, tags: def.tags, type: 'arcane', knock: 1.2, from: proj.pos, blow: { dir: { x: proj.vel.x, z: proj.vel.z }, lift: 0.25, on: { x: proj.pos.x, z: proj.pos.z } } });
      burst(proj.pos, { count: gen ? 8 : 14, color: def.color, speed: 4, life: 0.35, size: 0.28 });
      sfx.boltBurst(gen === 0);
      if (gen === 0) {
        flash({ color: def.color, intensity: 12, distance: 5, life: 0.15, pos: proj.pos });
        const heading = Math.atan2(proj.vel.x, proj.vel.z);
        const n = def.splitCount;
        for (let i = 0; i < n; i++) {
          const a = heading + (i - (n - 1) / 2) * 1.1;
          launch(player, proj.pos.clone(), a, def, damage * def.splitDamage, 1, new Set([enemy]), false, judged);
        }
      }
    },
  });
}

const skill: InstantSkill = {
  anim: 'point',
  hits(rawDef) {
    const def = rawDef as Def;
    return [
      { per: 'bolt', base: def.damage, type: 'arcane' },
      { per: 'split bolt', base: def.damage * def.splitDamage, type: 'arcane', note: `${def.splitCount} split off the foe it strikes` },
    ];
  },
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const origin = player.castPoint;
    const base = player.shotHeading(origin, target);
    const n = def.missiles;
    // (the cast's bolts and their splits seen coming as one: entities/evade.ts)
    const judged = new Set<Enemy>();
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * def.spread;
      launch(player, origin.clone(), a, def, def.damage, 0, new Set(), i === Math.floor(n / 2), judged);
    }
    burst(origin, { count: 10, color: def.color, speed: 2, life: 0.25, size: 0.25, gravity: 0 });
    sfx.bolt();
  },
};

export default skill;
