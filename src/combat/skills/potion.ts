// Healing Draught.
import * as THREE from 'three';
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { sfx } from '../../core/audio';
import type { InstantSkill, Needs } from './types';
import type { SkillDef } from '../../types';
import { rand } from '../../util';

const _ahead = new THREE.Vector3();

const skill: InstantSkill = {
  anim: 'drink',
  cast(player, rawDef) {
    const def = rawDef as Needs<'heal' | 'healPct'>;
    player.heal(def.heal + player.stats.maxLife * def.healPct);
    sfx.draught();
    // through the eyes a swirl round the body starts at the camera, where particles fade out: the motes
    // rise in a wider ring, where they're seen, and the light shines from ahead (Player.lightAhead)
    const eyes = player.eyes;
    flash({ color: 0xff5050, intensity: 15, distance: eyes ? 9 : 6, life: 0.6, follow: eyes ? () => player.lightAhead(_ahead) : player.obj });
    for (let i = 0; i < (eyes ? 110 : 50); i++) {
      const a = Math.random() * Math.PI * 2, r = eyes ? rand(1.7, 3.2) : rand(0.3, 0.8);
      particles.glow.spawn({
        x: player.pos.x + Math.cos(a) * r, y: eyes ? rand(0.2, 1.4) : rand(0.1, 1.5), z: player.pos.z + Math.sin(a) * r,
        vx: -Math.sin(a) * 1.5, vy: rand(1.5, 3), vz: Math.cos(a) * 1.5,
        life: rand(0.5, 1) * (eyes ? 1.4 : 1), size: rand(0.1, 0.25) * (eyes ? 1.5 : 1), sizeEnd: 0, color: col(i % 4 ? 0xff4040 : 0xffd080, 2.5), colorEnd: col(0x600010, 0.5), drag: 1.5,
      });
    }
  },
};

export default skill;
