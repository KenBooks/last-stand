// Veilstep: the mage's blink. Held, a ring on the floor and a column of light show where he would come out (the aim,
// within reach, and the furthest spot short of it no prop stands on); let go, he comes apart into arcane light where he
// stands (his body dissolving, its edges burning green), crosses to it as a streak of that light faster than anything
// can strike him, through whatever stands between, and is put together again there. Untouchable from the moment he
// comes apart until he starts to form again, and the foes round where he vanished are left dazed (`Enemy.daze`),
// standing there a moment while the rest come on. Every game shows it; his own game moves him and judges the daze, as
// it judges his hits (`dazeEnemy`).
import * as THREE from 'three';
import { G } from '../../state';
import { addEffect, shockwave } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { flash } from '../../fx/lights';
import { kickFov } from '../../core/renderer';
import { sfx } from '../../core/audio';
import { additive } from '../../core/materials';
import { groundHeight } from '../../world/arena';
import { inObstacle } from '../../world/collision';
import { dazeEnemy } from '../damage';
import { floorPatch, lay } from '../../fx/floorPatch';
import { rand } from '../../util';
import { Readiness } from './readiness';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';

type Def = Needs<'range' | 'radius' | 'duration'>;

/** his arcana: a pale green core fading to the deep blue of the motes off his hand */
const CORE = 0xc8ffe8, GREEN = 0x5dffa8, DEEP = 0x1060ff;
/** coming apart where he stands (s): his body dissolves, not moving yet */
const VANISH = 0.1;
/** how fast he crosses (m/s), and the crossing's least and longest time (s: his whole reach at that speed) */
const SPEED = 45, CROSS_MIN = 0.1, CROSS_MAX = 0.34;
/** put together again where he comes out (s): he can't act until he is */
const FORM = 0.14;
/** how far along the way the spot is searched back from the aim for one clear of the props (m) */
const SEARCH_STEP = 0.2;
/** the ring at his feet where he would come out, and the column of light standing in it (m) */
const RING_R = 0.62, COLUMN_R = 0.34, COLUMN_H = 1.9;
/** how high in the column of light the seconds of its cooldown count down (m) */
const COUNT_Y = 1.1;

const _reported = new THREE.Vector3();

/** The share of the way covered by `u` of the dash: nothing while he comes apart, then eased out and in. */
function crossing(still: number): (u: number) => number {
  return (u) => {
    if (u <= still) return 0;
    const x = (u - still) / (1 - still);
    return x * x * (3 - 2 * x);
  };
}

/**
 * Where he comes out for an aim at `target` from `from`: towards the aim as far as it or his reach, inside the arena,
 * and back along the way from there to the first spot no prop stands on (his own spot at worst).
 */
function landAt(from: THREE.Vector3, radius: number, def: Def, target: THREE.Vector3): THREE.Vector3 {
  const way = new THREE.Vector3(target.x - from.x, 0, target.z - from.z);
  const reach = Math.min(def.range, way.length());
  if (reach > 1e-3) way.divideScalar(way.length());
  const edge = G.arena.radius - radius - 0.1;
  const spot = new THREE.Vector3();
  for (let d = reach; d > 0; d -= SEARCH_STEP) {
    spot.set(from.x + way.x * d, 0, from.z + way.z * d);
    if (Math.hypot(spot.x, spot.z) <= edge && !inObstacle(spot, radius + 0.05)) return spot;
  }
  return spot.set(from.x, 0, from.z);
}

/** the preview's glow: a ring and a faint disc on the floor, and a column of light fading upwards */
const ringGeo = () => floorPatch(0.8, 1, 1, 48);
const discGeo = () => floorPatch(0, 1, 1, 32);
let columnGeo: THREE.BufferGeometry | null = null;
function column(): THREE.BufferGeometry {
  if (columnGeo) return columnGeo;
  const g = new THREE.CylinderGeometry(COLUMN_R, COLUMN_R, COLUMN_H, 28, 4, true).translate(0, COLUMN_H / 2, 0);
  // (light at its foot, none at its top: added light, so black is nothing)
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.fill((1 - p.getY(i) / COLUMN_H) ** 1.6, i * 3, i * 3 + 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  columnGeo = g;
  return g;
}
const columnMat = () => { const m = additive(GREEN, 0.9, 0.5); m.vertexColors = true; return m; };

/** The preview's meshes, its glows each with its brightness, and its readiness (red and counting down while letting
 *  go would cast nothing). */
interface Preview {
  ring: THREE.Mesh; ringG: THREE.BufferGeometry; disc: THREE.Mesh; discG: THREE.BufferGeometry; column: THREE.Mesh;
  mat: THREE.MeshBasicMaterial; glows: [THREE.MeshBasicMaterial, number][]; ready: Readiness; t: number;
}
let preview: Preview | null = null;
const _green = new THREE.Color(GREEN);

function previewFor(): Preview {
  if (preview) return preview;
  const ringG = ringGeo(), discG = discGeo();
  const ringMat = additive(GREEN, 1.6, 0.85), discMat = additive(GREEN, 1, 0.16), mat = columnMat();
  const ring = new THREE.Mesh(ringG, ringMat), disc = new THREE.Mesh(discG, discMat), col = new THREE.Mesh(column(), mat);
  ring.frustumCulled = disc.frustumCulled = col.frustumCulled = false;
  ring.name = 'blink-preview'; disc.name = 'blink-preview-disc'; col.name = 'blink-preview-column';
  G.scene.add(ring, disc, col);
  const glows: [THREE.MeshBasicMaterial, number][] = [[ringMat, 1.6], [discMat, 1], [mat, 0.9]];
  preview = { ring, ringG, disc, discG, column: col, mat, glows, ready: new Readiness('blink'), t: 0 };
  return preview;
}

/**
 * Shows where he would come out for `target` (null: nothing shown): red while letting go would cast nothing, turning
 * to his green as it would, so it can be held through the cooldown and let go once green. The ring keeps the second
 * its countdown shows (`userData.countdown`, null for none) for what measures it.
 */
function showLanding(player: Player, def: Def, target: THREE.Vector3 | null, dt: number): void {
  if (!target) {
    if (!preview) return;
    preview.ring.visible = preview.disc.visible = preview.column.visible = false;
    preview.ready.hide(dt);
    preview.ring.userData.countdown = null;
    return;
  }
  const p = previewFor(), at = landAt(player.pos, player.radius, def, target);
  p.ring.visible = p.disc.visible = p.column.visible = true;
  const floor = groundHeight(at.x, at.z);
  p.ready.show(player, def, { x: at.x, y: floor + COUNT_Y, z: at.z }, dt);
  p.ring.userData.countdown = p.ready.second || null;
  for (const [glow, bright] of p.glows) p.ready.tint(glow.color, _green, bright);
  for (const [mesh, g] of [[p.ring, p.ringG], [p.disc, p.discG]] as const) {
    mesh.position.set(at.x, 0, at.z);
    mesh.scale.set(RING_R, 1, RING_R);
    lay(g, at.x, at.z, 0.05, RING_R);
  }
  // (breathing slowly, well under a flash a second)
  p.t += dt;
  p.mat.opacity = 0.42 + 0.08 * Math.sin(p.t * 3.2);
  p.column.position.set(at.x, floor, at.z);
}

/** A mote of his light, `size` across, at x, y, z moving at vx, vy, vz (m/s), fading over `life` s. */
function mote(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, bright = 2.6,
  colour = CORE): void {
  particles.glow.spawn({ x, y, z, vx, vy, vz, life, size, sizeEnd: 0, color: col(colour, bright), colorEnd: col(DEEP, 0.4), drag: 2 });
}

/** Coming apart: motes drawn in from all over the body to his middle, and a ring on the floor. */
function comeApart(at: THREE.Vector3, floor: number): void {
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(0.15, 0.55), y = rand(0.1, 1.85);
    const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
    // (in towards the chest over their life)
    mote(x, floor + y, z, (at.x - x) * 4, (1.1 - y) * 4, (at.z - z) * 4, rand(0.06, 0.15), rand(0.2, 0.32));
  }
  shockwave({ x: at.x, y: 0, z: at.z }, { color: GREEN, intensity: 1.4, from: 0.9, to: 0.2, life: 0.22 });
}

/** Crossing, at `p` on the way: a bright head and a trail of motes left behind it, and through the eyes streaks of light
 *  rushing at them. */
function streak(player: Player, p: THREE.Vector3, dir: THREE.Vector3): void {
  const y = player.obj.position.y + 1.05;
  // (seen from the top-down camera's 30 m and more: a head the size of a fist and a green trail as wide as a body)
  mote(p.x, y, p.z, 0, 0, 0, rand(0.7, 0.9), 0.08, 3);
  for (let i = 0; i < 14; i++) {
    mote(p.x + rand(-0.25, 0.25), y + rand(-0.5, 0.5), p.z + rand(-0.25, 0.25), -dir.x * rand(1, 4) + rand(-0.6, 0.6), rand(-0.4, 0.6), -dir.z * rand(1, 4) + rand(-0.6, 0.6),
      rand(0.1, 0.24), rand(0.3, 0.55), 2.4, i % 3 ? GREEN : CORE);
  }
  if (!player.local) return;
  kickFov(12);
  if (!player.eyes) return;
  // (the motes round the head start inside the camera, where particles fade out: these start ahead, where they're seen)
  for (let i = 0; i < 4; i++) {
    const side = rand(-1.8, 1.8), ahead = rand(3, 6);
    particles.glow.spawn({
      x: p.x - dir.z * side + dir.x * ahead, y: y + rand(-0.8, 1.2), z: p.z + dir.x * side + dir.z * ahead, vx: -dir.x * rand(16, 24), vz: -dir.z * rand(16, 24),
      life: rand(0.15, 0.25), size: rand(0.04, 0.08), sizeEnd: 0, color: col(CORE, 1.6), colorEnd: col(DEEP, 0.2),
    });
  }
}

/** Put together again: motes gathering in on his body from round it, and a ring spreading out from his feet. */
function formAgain(at: THREE.Vector3, floor: number): void {
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(0.8, 1.3), y = rand(0.1, 2);
    const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r, k = rand(0.15, 0.22);
    // (reaching the body as they fade: in by about their distance over their life)
    mote(x, floor + y, z, (at.x - x) * 0.8 / k, 0, (at.z - z) * 0.8 / k, rand(0.06, 0.14), k);
  }
  shockwave({ x: at.x, y: 0, z: at.z }, { color: GREEN, intensity: 1.6, from: 0.3, to: 2.2, life: 0.35 });
  shockwave({ x: at.x, y: 0, z: at.z }, { color: CORE, intensity: 0.8, from: 0.2, to: 1.2, life: 0.22 });
}

/** His body as far gone as `k` (0 whole, 1 gone), hidden once it's gone (so is its shadow, which doesn't dissolve). */
function dissolve(player: Player, k: number): void {
  player.model.kit.u.uDissolve.value = k;
  player.show(k < 1 && !player.away);
}

const skill: InstantSkill = {
  anim: null,
  dashes: true,
  warm: () => [new THREE.Mesh(ringGeo(), additive(GREEN, 1.6, 0.85)), new THREE.Mesh(column(), columnMat())],
  aim: (player, def, target, dt) => showLanding(player, def as Def, target, dt),
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const from = player.pos.clone(), to = landAt(from, player.radius, def, target);
    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const dist = dir.length();
    // (on the spot: he comes apart and forms again facing as he was)
    if (dist > 1e-3) dir.divideScalar(dist);
    else dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
    const cross = Math.min(CROSS_MAX, Math.max(CROSS_MIN, dist / SPEED)), dur = VANISH + cross;
    // (untouchable from coming apart until he starts to form again)
    player.guardUntil = Math.max(player.guardUntil, G.time + dur);
    comeApart(from, player.obj.position.y);
    for (const e of G.enemies) {
      if (Math.hypot(e.pos.x - from.x, e.pos.z - from.z) < def.radius + e.radius) dazeEnemy(e, def.duration, player);
    }
    flash({ color: GREEN, intensity: 9, distance: 6, life: 0.25, pos: { x: from.x, y: player.obj.position.y + 1.1, z: from.z } });
    sfx.veilstep(dur);
    let formed = false;
    const pace = crossing(VANISH / dur), at = new THREE.Vector3();
    player.startDash(dir, dist / dur, dur, { hold: FORM, anim: 'cast', through: true, pace, step: () => {
      const d = player.dash;
      if (!d) return;
      // (a partner's copy goes his own way, as his game moves him, and is eased onto where its reports have it as he
      // forms again: read between them, it set off before it had come apart and overshot by metres as it crossed)
      at.copy(from).addScaledVector(dir, dist * (d.t < dur ? pace(d.t / dur) : 1));
      if (!player.local) {
        _reported.copy(player.pos);
        player.pos.lerpVectors(at, _reported, Math.max(0, Math.min(1, (d.t - dur) / FORM)));
      }
      if (d.t < VANISH) { dissolve(player, d.t / VANISH); return; }
      if (d.t < dur) {
        dissolve(player, 1);
        // (gone, his legs and sleeves start afresh each frame: left planted, they stretched back 10 m after him)
        player.model.reset?.();
        streak(player, at, dir);
        return;
      }
      if (!formed) {
        formed = true;
        // (where it was aimed exactly, standing: the legs and the sleeves' cloth start afresh there, not dragged 10 m)
        if (player.local) player.pos.set(to.x, 0, to.z);
        player.obj.position.y = groundHeight(player.pos.x, player.pos.z);
        player.model.reset?.();
        formAgain(player.pos, player.obj.position.y);
        flash({ color: GREEN, intensity: 10, distance: 6, life: 0.3, pos: { x: player.pos.x, y: player.obj.position.y + 1.1, z: player.pos.z } });
      }
      dissolve(player, Math.max(0, 1 - (d.t - dur) / FORM));
    } });
    // (cut short, his body is put back whole: the run reset, a fall)
    const mine = player.dash;
    addEffect({
      update() { return player.dash === mine; },
      dispose() {
        player.show(!player.away);
        if (player.alive) player.model.kit.u.uDissolve.value = 0;
      },
    });
  },
};

export default skill;
