// Glacial Nova: freezing burst around the caster.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { shockwave, groundFlash, decal, iceSpikes } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import type { InstantSkill, Needs } from './types';
import { blastCorpses } from '../../entities/corpse';
import type { SkillDef } from '../../types';
import { rand } from '../../util';
import { tunable } from '../../core/tuning';

const ICE = 0x8fd8ff;
/** Its rings (#214): the ice ring alone (`rings` 1), or with a white one inside it (2, compared in the lab: `--tune
 *  glacialNova.rings=2`). Over the shoulder in the crypt the two held up 3.5 of its 5.2% bright share, past the
 *  budget's 5%; the ice ring alone, 4.1% (two rings half as wide, 4.0%: the owner chose one ring). */
const NOVA_RINGS = tunable('glacialNova', { rings: 1 });

const skill: InstantSkill = {
  anim: 'slam',
  hits: (def) => [{ per: 'foe', base: def.damage ?? 0, type: 'cold' }],
  cast(player, rawDef) {
    const def = rawDef as Needs<'damage' | 'radius' | 'freeze'>;
    const c = player.pos.clone();
    shockwave(c, { color: ICE, intensity: 3, from: 0.5, to: def.radius, life: 0.45 });
    if (NOVA_RINGS.rings > 1) shockwave(c, { color: 0xffffff, intensity: 2, from: 0.3, to: def.radius * 0.7, life: 0.3 });
    // a faint flash of frost: bright over the whole radius, it blooms into a milky dome
    groundFlash(c, { color: ICE, intensity: 0.9, radius: def.radius, life: 0.3 });
    // none through the caster (in first person they'd rise through the camera)
    iceSpikes(c, def.radius * 0.95, 42, 1.2);
    // rime on the ground, faint: a pale sheet over the whole radius lingers like a patch of fog
    decal(c, { type: 'frost', size: def.radius * 1.05, life: 4, opacity: 0.35 });
    // above the caster's head: in first person it would sit at the camera and burn what's near white
    flash({ color: ICE, intensity: 30, distance: 10, life: 0.4, pos: { x: c.x, y: 4, z: c.z } });
    addShake(0.3);
    sfx.nova();
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(4, 16);
      particles.glow.spawn({
        x: c.x, y: rand(0.2, 1.4), z: c.z, vx: Math.cos(a) * s, vy: rand(-0.5, 2), vz: Math.sin(a) * s,
        life: rand(0.4, 0.9), size: rand(0.12, 0.35), sizeEnd: 0.02, color: col(i % 3 ? ICE : 0xffffff, 2.5), colorEnd: col(0x2060ff, 0.4), drag: 3.5,
      });
    }
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.burst);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius) {
        hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: 'cold', freeze: def.freeze, knock: 2, from: c, blow: { lift: 0.5 } });
      }
    }
    blastCorpses(c, def.radius, 6, { lift: 0.6 });
  },
};

export default skill;
