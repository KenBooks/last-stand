// Bull Rush: a charge along the aim that sweeps up what it meets and hurls it on ahead. A brace and a push-off
// that cracks the ground, then a few huge driving strides behind the shoulder, a wedge of force leading,
// dust bursting at each footfall and streaming behind (the model's 'charge': BRACE, then the rush up to RUSH of
// it). Each foe it meets is struck once and carried before the hero to the stop (entities/carry.ts), which lands
// as a ground-shaking impact and throws them on ahead through the air, an elite or a boss driven on instead; the
// fallen in its way, its kills among them, ride before it too (`ploughOf`) and slide on as it stops. Nothing ends
// behind him or beside him, and the stop strikes nothing more.
import * as THREE from 'three';
import { G } from '../../state';
import { carryEnemy, hitEnemy } from '../damage';
import { evades } from '../../entities/evade';
import { addEffect, shockwave, groundFlash, crackDecal, decal } from '../../fx/effects';
import { particles, col, smokePuff, debris } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { addShake, kickFov } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { rand } from '../../util';
import { sparks } from './cleave';
import { slashMesh } from './slash';
import { hurtPropsIn, PROP_DAMAGE, type Prop } from '../../world/destructible';
import type { InstantSkill, Needs } from './types';
import type { Enemy } from '../../entities/enemy';
import { addField } from '../../entities/corpse';
import { ploughOf, throwPloughed, touchesAny } from '../../entities/carry';

type Def = Needs<'damage' | 'range' | 'speed'>;
const EMBER = 0xffb46a, DUST = 0x2a241c;
const WEDGE = 1.7;
/** the charge meets what comes within this of its middle, past the foe's own size, or touches a foe it carries (m),
 *  a frame's way on ahead too (met as it was overlapped, a foe was shoved its overlap at once, 68 cm in a frame) */
const REACH = 1.1, TOUCH = 0.1;
/** seconds: the brace before it goes, the rush (at least: a long charge takes longer) and the follow-through standing after it */
const BRACE = 0.16, RUN = 0.42, HOLD = 0.42;
/** footfalls during the rush (in step with the model's 'charge' strides) */
const STRIDES = 3;
/** the way covered over the dash: nothing while it braces, a hard acceleration, flat out, and a skid into the stop */
function pace(b: number): (u: number) => number {
  const A = 0.18, C = 0.16, END = 0.35, area = A / 2 + (1 - A - C) + C * (1 + END) / 2;
  return (u) => {
    if (u <= b) return 0;
    const x = (u - b) / (1 - b);
    let d: number;
    if (x < A) d = x * x / (2 * A);
    else if (x < 1 - C) d = A / 2 + (x - A);
    else { const y = x - (1 - C); d = A / 2 + (1 - A - C) + y - (1 - END) * y * y / (2 * C); }
    return Math.min(1, d / area);
  };
}

/** the push-off: the ground cracks under the rear foot, a ring of dust and stone blasts out behind */
function launch(p: THREE.Vector3, dir: THREE.Vector3): void {
  const back = { x: p.x - dir.x * 0.4, y: 0, z: p.z - dir.z * 0.4 };
  crackDecal(back, { size: 1.4, color: EMBER, intensity: 0.9, life: 1.4 });
  shockwave(back, { color: EMBER, intensity: 1.4, from: 0.2, to: 1.8, life: 0.3 });
  debris({ x: back.x, y: 0, z: back.z }, { count: 10, speed: 5 });
  smokePuff(back, { count: 10, color: DUST, alpha: 0.55, size: 0.9, sizeEnd: 2.6, speed: 3, life: 1.1 });
  flash({ color: EMBER, intensity: 8, distance: 5, life: 0.2, pos: { x: p.x, y: 0.8, z: p.z } });
  addShake(0.15);
  sfx.bullLaunch();
}

/** a footfall at full tilt: the ground thumps, dust and grit kicked up behind */
function footfall(p: THREE.Vector3, dir: THREE.Vector3, side: number): void {
  const f = { x: p.x - dir.z * side * 0.18, y: 0, z: p.z + dir.x * side * 0.18 };
  smokePuff(f, { count: 3, color: DUST, alpha: 0.5, size: 0.5, sizeEnd: 1.6, speed: 1.6, life: 0.7 });
  debris({ x: f.x, y: 0, z: f.z }, { count: 4, speed: 3 });
  shockwave(f, { color: EMBER, intensity: 0.7, from: 0.1, to: 0.8, life: 0.2 });
  decal(f, { type: 'scorch', size: 0.6, life: 2.5, opacity: 0.45 });
  sfx.bullStep(side);
}

function arrive(c: THREE.Vector3, dir: THREE.Vector3): void {
  shockwave(c, { color: EMBER, intensity: 2, from: 0.3, to: 3, life: 0.4 });
  shockwave(c, { color: 0xffffff, intensity: 0.9, from: 0.2, to: 1.8, life: 0.25 });
  groundFlash(c, { color: EMBER, intensity: 1, radius: 2, life: 0.3 });
  const ahead = { x: c.x + dir.x * 0.8, z: c.z + dir.z * 0.8 };
  crackDecal(ahead, { size: 2.2, color: EMBER, intensity: 1.2, life: 1.8 });
  debris({ x: ahead.x, y: 0, z: ahead.z }, { count: 16, speed: 6 });
  smokePuff(c, { count: 8, color: DUST, size: 1, sizeEnd: 2.6, speed: 2.5 });
  flash({ color: EMBER, intensity: 14, distance: 7, life: 0.3, pos: { x: c.x, y: 1, z: c.z } });
  addShake(0.35);
  sfx.bullLand();
}

const skill: InstantSkill = {
  anim: null,
  dashes: true,
  hits: (def) => [{ per: 'foe', base: (def as Def).damage, type: 'physical', note: 'each foe it meets, once' }],
  warm: () => [slashMesh(WEDGE, 0.55, 0xffffff, true).mesh],
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const dir = new THREE.Vector3(target.x - player.pos.x, 0, target.z - player.pos.z);
    // aiming at your own feet still charges the full distance, the way you face
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    dir.normalize();
    const hit = new Set<Enemy>(), struck = new Set<Prop>();
    let dust = 0, scrape = 0, arrived = false, launched = false, steps = 0;
    // (gathering for it: dust stirs round the feet)
    smokePuff(player.pos, { count: 4, color: DUST, alpha: 0.4, size: 0.6, sizeEnd: 1.6, speed: 1.2 });

    // the wedge of force in front of the charge
    const wedge = slashMesh(WEDGE, 0.55, EMBER, true);
    wedge.mesh.scale.setScalar(1.25);
    G.scene.add(wedge.mesh);

    const run = Math.max(RUN, def.range / def.speed), dur = BRACE + run;
    sfx.bullRush(BRACE, run);
    // (the fallen in its way driven on before it while it runs, from the push-off to the stop)
    let myDash: typeof player.dash = null;
    const running = () => player.dash === myDash && myDash !== null && myDash.t >= BRACE && myDash.t < myDash.dur;
    const calm = addField(ploughOf(player, dir, running));
    // (open: his other skills cast as it runs and as it holds, a strike charged before it landing in its run)
    player.startDash(dir, def.range / dur, dur, { hold: HOLD, open: true, pace: pace(BRACE / dur), step: () => {
      const p = player.pos, d = player.dash;
      if (arrived || !d) return;
      if (d.t < BRACE) return;
      if (!launched) { launched = true; launch(p.clone(), dir); if (player.local) addShake(0.2); }
      // each stride lands hard (the last is the skid's)
      const at = Math.floor(((d.t - BRACE) / run) * STRIDES);
      if (at > steps && at < STRIDES) { steps = at; footfall(p.clone(), dir, steps % 2 ? 1 : -1); if (player.local) addShake(0.06); }
      // through the eyes: the view widens with the speed, and streaks of air rush at it from ahead (the
      // ones round the body start inside the camera, where particles fade out)
      const eyes = player.eyes;
      if (player.local) kickFov(9);
      if (eyes) for (let i = 0; i < 3; i++) {
        const side = rand(-1.8, 1.8), ahead = rand(3, 6);
        particles.glow.spawn({
          x: p.x - dir.z * side + dir.x * ahead, y: rand(0.3, 2.6), z: p.z + dir.x * side + dir.z * ahead, vx: -dir.x * rand(14, 20), vz: -dir.z * rand(14, 20),
          life: rand(0.18, 0.3), size: rand(0.04, 0.08), sizeEnd: 0, color: col(0xffe0b0, 1.6), colorEnd: col(0x803010, 0.2),
        });
      }
      // dust kicked up and a scorched skid behind; streaks of air rush past
      if ((dust -= G.dt) <= 0) {
        dust = 0.03;
        for (const s of [1, -1]) smokePuff({ x: p.x - dir.z * s * 0.45 - dir.x * 0.4, y: 0, z: p.z + dir.x * s * 0.45 - dir.z * 0.4 }, { count: 1, color: DUST, alpha: 0.45, size: 0.6, sizeEnd: 2.1, life: 0.9, speed: 0.6 });
      }
      // sparks streaming off the leading shoulder and the wedge
      for (let i = 0; i < 2; i++) particles.glow.spawn({
        x: p.x + dir.x * 0.5 + rand(-0.25, 0.25), y: rand(1.1, 1.5), z: p.z + dir.z * 0.5 + rand(-0.25, 0.25), vx: -dir.x * rand(4, 8) + rand(-1, 1), vy: rand(0, 1.5), vz: -dir.z * rand(4, 8) + rand(-1, 1),
        life: rand(0.2, 0.35), size: rand(0.03, 0.05), sizeEnd: 0, color: col(0xffd090, 2), colorEnd: col(0xa03010, 0.2),
      });
      if ((scrape -= G.dt) <= 0) { scrape = 0.09; decal(p, { type: 'scorch', size: 0.9, life: 2.5, opacity: 0.5 }); }
      for (let i = 0; i < 4; i++) {
        const side = rand(-0.6, 0.6), up = rand(0.3, 1.8);
        particles.glow.spawn({
          x: p.x - dir.z * side + dir.x * 0.8, y: up, z: p.z + dir.x * side + dir.z * 0.8, vx: -dir.x * rand(10, 16), vz: -dir.z * rand(10, 16),
          life: rand(0.08, 0.16), size: rand(0.03, 0.06), sizeEnd: 0, color: col(0xffe0b0, 1.6), colorEnd: col(0x803010, 0.2),
        });
      }
      hurtPropsIn(player, p.x, p.z, REACH, PROP_DAMAGE.trample, struck);
      // (a foe the ones it carries run into is met too: carried on with them, not shoved aside off them)
      const riding = G.enemies.filter((e) => e.carried?.by === player);
      const touch = TOUCH + Math.hypot(player.vel.x, player.vel.z) * G.dt;
      for (const e of G.enemies) {
        if (!e.alive || hit.has(e)) continue;
        const near = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) <= REACH + e.radius;
        if (!near && !touchesAny(e, riding, touch)) continue;
        hit.add(e);
        if (evades(e, player, { kind: 'rush', x: p.x, z: p.z, way: dir, half: REACH })) continue;
        // (struck through its middle along the charge: a kill thrown on ahead, its body carried on by the field, and
        // a foe it leaves standing carried before it to the stop)
        hitEnemy(e, def.damage, { by: player, skill: def, tags: def.tags, type: 'physical', from: p, blow: { dir, lift: 0.3 } });
        carryEnemy(e, player, dir, Math.max(0, d.dur - d.t));
        sparks(e.pos.x, e.height * 0.5, e.pos.z, 0xffc080, 16);
        shockwave(e.pos, { color: EMBER, intensity: 1.5, from: 0.2, to: 1.4, life: 0.25 });
        debris(e.pos, { count: 6, speed: 5 });
        addShake(0.2);
        sfx.bullHit();
      }
      if (d && d.t >= d.dur) { arrived = true; arrive(p.clone(), dir); throwPloughed(player, dir); }
    } });
    myDash = player.dash;
    let t = 0;
    addEffect({
      update(dt) {
        t += dt;
        const on = player.dash === myDash && myDash !== null && myDash.t < myDash.dur && myDash.t >= BRACE;
        const p = player.pos;
        wedge.mesh.position.set(p.x + dir.x * 0.3, player.obj.position.y + 0.9, p.z + dir.z * 0.3);
        wedge.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        wedge.mat.uniforms.uFade.value = (on ? Math.min(1, (t - BRACE) / 0.06) : 0) * (0.6 + Math.random() * 0.2);
        return on || (myDash !== null && player.dash === myDash && myDash.t < BRACE);
      },
      dispose() { G.scene.remove(wedge.mesh); wedge.dispose(); calm(); },
    });
  },
};

export default skill;
