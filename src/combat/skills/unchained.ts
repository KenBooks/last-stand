// Unchained: the warrior with both hands empty (#400). An instant roar: for `duration` s his Frenzy doesn't decay and
// its cap is `FRENZY.unchained` (combat/frenzy.ts), heat rising off him all the while.
import { G } from '../../state';
import { addEffect, shockwave, groundFlash } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'duration'>;
const HEAT = 0xff5a2a;

const skill: InstantSkill = {
  anim: null,
  cast(player, rawDef) {
    const def = rawDef as Def;
    const until = G.time + def.duration;
    player.unchainedUntil = until;
    const p = player.pos;
    shockwave(p, { color: HEAT, intensity: 1.6, from: 0.3, to: 3.2, life: 0.4 });
    groundFlash(p, { color: HEAT, intensity: 0.8, radius: 2.2, life: 0.3 });
    flash({ color: HEAT, intensity: 8, distance: 6, life: 0.3, pos: { x: p.x, y: 1.4, z: p.z } });
    if (player.local) addShake(0.2);
    sfx.roar();
    // (heat off his shoulders and arms while it runs, none through his own eyes: it would rise through the view)
    let owed = 0;
    addEffect({
      update(dt) {
        if (player.unchainedUntil !== until || G.time > until || !player.alive) return false;
        if (player.eyes || !player.obj.visible) return true;
        for (owed += dt * 24; owed >= 1; owed--) {
          const a = Math.random() * Math.PI * 2, r = rand(0.15, 0.35);
          particles.glow.spawn({
            x: player.pos.x + Math.cos(a) * r, y: player.obj.position.y + rand(0.9, 1.6), z: player.pos.z + Math.sin(a) * r,
            vy: rand(0.6, 1.4), life: rand(0.35, 0.6), size: rand(0.04, 0.08), sizeEnd: 0,
            color: col(0xff9050, 1.4), colorEnd: col(0x601008, 0.1), drag: 1,
          });
        }
        return true;
      },
      dispose() {},
    });
  },
};

export default skill;
