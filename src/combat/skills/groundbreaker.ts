// Groundbreaker: the warrior with both hands empty. Both fists raised overhead and driven into the ground before
// him: the floor cracks, and everything round where they land is struck and thrown back.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { debris, smokePuff } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { blastCorpses } from '../../entities/corpse';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'damage' | 'radius' | 'knock' | 'color'>;

const DUST = 0x2a241c;
/** how far before him the fists come down (m: the model's 'pound' lands them there) */
export const POUND_AHEAD = 0.7;
/** casts whose wind-up is already heard */
const raised = new WeakSet<object>();

const skill: InstantSkill = {
  anim: 'pound',
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical', note: 'every foe round where the fists land' }],
  charging(player) {
    const c = player.casting;
    if (c && !raised.has(c)) { raised.add(c); sfx.pound(c.fireAt - c.t); }
  },
  cast(player, rawDef) {
    const def = rawDef as Def;
    const p = player.pos, facing = player.facing;
    const c = new THREE.Vector3(p.x + Math.sin(facing) * POUND_AHEAD, 0, p.z + Math.cos(facing) * POUND_AHEAD);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > def.radius + e.radius) continue;
      // (the ground heaves under them: what it kills is thrown up and out)
      hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', knock: def.knock, from: c, blow: { lift: 0.7, force: 1.1 } });
    }
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.swing);
    blastCorpses(c, def.radius, 7, { lift: 1 });
    shockwave(c, { color: def.color, intensity: 2.2, from: 0.3, to: def.radius, life: 0.45 });
    shockwave(c, { color: 0xffffff, intensity: 1, from: 0.2, to: def.radius * 0.55, life: 0.3 });
    groundFlash(c, { color: def.color, intensity: 1.3, radius: def.radius * 0.6, life: 0.35 });
    crackDecal(c, { size: def.radius * 1.1, color: 0xffa050, intensity: 1.6, life: 3 });
    decal(c, { type: 'scorch', size: def.radius * 0.7, life: 7 });
    debris(c, { count: 26, speed: 8 });
    smokePuff(c, { count: 12, color: DUST, size: 1.2, sizeEnd: 3.2, speed: 3 });
    flash({ color: def.color, intensity: 9, distance: 8, life: 0.35, pos: { x: c.x, y: 0.5, z: c.z } });
    addShake(0.6);
  },
};

export default skill;
