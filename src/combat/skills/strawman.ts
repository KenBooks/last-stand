// Strawman: a scarecrow raised out of the ground at the aim. For `duration` s every foe within `radius` of it but the
// elites and bosses leaves the players for it (a lure, combat/lures.ts) and gathers round it striking at it: a clump
// for a rain of arrows. It takes their blows without harm, rocking under them, and sinks back into the ground when its
// time is up (it doesn't burst). Every game shows it; only the one simulating the fight has foes it can lure.
// The scarecrow itself is entities/models/scarecrow.ts.
import * as THREE from 'three';
import { G } from '../../state';
import { addEffect, shockwave } from '../../fx/effects';
import { debris } from '../../fx/particles';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { additive } from '../../core/materials';
import { floorPatch, lay } from '../../fx/floorPatch';
import { resolveWorld } from '../../world/collision';
import { lures, lurable, LURE_SLOT, type Lure } from '../lures';
import { buildScarecrow, scarecrowOutline } from '../../entities/models/scarecrow';
import { Readiness } from './readiness';
import type { InstantSkill, Needs } from './types';
import type { Player } from '../../entities/player';

type Def = Needs<'duration' | 'radius' | 'range'>;

const STRAW = 0xd8c072;
/** its post's radius on the floor (m): the foes' blows land from just outside it */
const BODY_R = 0.32;
/** rising out of the ground and sinking back (s), and how deep it starts (m) */
const RISE = 0.3, SINK = 0.45, DEPTH = 2;
let serial = 0;

/** Where it stands for an aim at `target`: at the aim, within reach, out of the props and inside the arena. */
function standAt(player: { pos: THREE.Vector3 }, def: Def, target: THREE.Vector3): THREE.Vector3 {
  const pos = target.clone().sub(player.pos); pos.y = 0;
  if (pos.length() > def.range) pos.setLength(def.range);
  pos.add(player.pos); pos.y = 0;
  const R = G.arena.radius - 1.5, r = Math.hypot(pos.x, pos.z);
  if (r > R) { pos.x *= R / r; pos.z *= R / r; }
  resolveWorld(pos, BODY_R + 0.1);
  return pos;
}

/** (it faces the one who raised it) */
const facingFrom = (player: { pos: THREE.Vector3 }, pos: THREE.Vector3): number => Math.atan2(player.pos.x - pos.x, player.pos.z - pos.z);

/** the preview's glow: the scarecrow's outline where it would stand, and the ring it calls foes from */
const ghostMat = () => additive(STRAW, 0.7, 0.32);
const reachGeo = () => floorPatch(0.975, 1, 1, 96);
/** the ring at its foot (m: from above, the scarecrow's outline alone was a small blur of light) */
const SPOT_R = BODY_R + 0.35;
const spotGeo = () => floorPatch(0.8, 1, 1, 40);

/** how high in the scarecrow's glow the seconds of its cooldown count down (m) */
const COUNT_Y = 1.1;

/**
 * While the key is held: a glowing outline of the scarecrow where it would stand, a ring at its foot, and how far it
 * would call foes from; red while letting go would cast nothing, the seconds of its cooldown counting down in it. Its
 * glows, each with its brightness.
 */
interface Preview {
  body: THREE.Mesh; spot: THREE.Mesh; spotG: THREE.BufferGeometry; reach: THREE.Mesh; reachG: THREE.BufferGeometry;
  glows: [THREE.MeshBasicMaterial, number][]; ready: Readiness;
}
let preview: Preview | null = null;
const _straw = new THREE.Color(STRAW);

function previewFor(): Preview {
  if (preview) return preview;
  const reachG = reachGeo(), spotG = spotGeo();
  const bodyMat = ghostMat(), reachMat = additive(STRAW, 1, 0.45), spotMat = additive(STRAW, 1.6, 0.8);
  const body = new THREE.Mesh(scarecrowOutline(), bodyMat), reach = new THREE.Mesh(reachG, reachMat);
  const spot = new THREE.Mesh(spotG, spotMat);
  body.frustumCulled = spot.frustumCulled = reach.frustumCulled = false;
  body.name = 'strawman-preview'; spot.name = 'strawman-preview-spot'; reach.name = 'strawman-preview-reach';
  G.scene.add(body, spot, reach);
  const glows: [THREE.MeshBasicMaterial, number][] = [[bodyMat, 0.7], [reachMat, 1], [spotMat, 1.6]];
  preview = { body, spot, spotG, reach, reachG, glows, ready: new Readiness('strawman') };
  return preview;
}

/** Shows where it would stand for `target` (null: nothing shown). */
function showStand(player: Player, def: Def, target: THREE.Vector3 | null, dt: number): void {
  if (!target) {
    if (!preview) return;
    preview.body.visible = preview.spot.visible = preview.reach.visible = false;
    preview.ready.hide(dt);
    return;
  }
  const p = previewFor(), pos = standAt(player, def, target);
  p.body.visible = p.spot.visible = p.reach.visible = true;
  p.ready.show(player, def, { x: pos.x, y: groundHeight(pos.x, pos.z) + COUNT_Y, z: pos.z }, dt);
  for (const [glow, bright] of p.glows) p.ready.tint(glow.color, _straw, bright);
  p.spot.position.set(pos.x, 0, pos.z);
  p.spot.scale.set(SPOT_R, 1, SPOT_R);
  lay(p.spotG, pos.x, pos.z, 0.05, SPOT_R);
  p.body.position.set(pos.x, groundHeight(pos.x, pos.z), pos.z);
  p.body.rotation.set(0, facingFrom(player, pos), 0);
  p.reach.position.set(pos.x, 0, pos.z);
  p.reach.scale.set(def.radius, 1, def.radius);
  lay(p.reachG, pos.x, pos.z, 0.05, def.radius);
}

const skill: InstantSkill = {
  anim: 'cast', warm: () => [buildScarecrow().root, new THREE.Mesh(scarecrowOutline(), ghostMat()), new THREE.Mesh(reachGeo(), additive(STRAW, 1, 0.45))],
  aim: (player, def, target, dt) => showStand(player, def as Def, target, dt),
  cast(player, rawDef, target) {
    const def = rawDef as Def;
    const pos = standAt(player, def, target);
    const { root: mesh, head } = buildScarecrow();
    const yaw = facingFrom(player, pos);
    G.scene.add(mesh);
    // rocking under the blows: a spring each way it can tip, and a looser one for its head, which lolls after it
    const tip = { x: 0, z: 0, vx: 0, vz: 0 }, loll = { x: 0, z: 0, vx: 0, vz: 0 };
    const lure: Lure = { pos, radius: BODY_R, until: G.time + def.duration, slot: LURE_SLOT + (serial++ % 8),
      struck() {
        const kx = (Math.random() - 0.5) * 3, kz = (Math.random() - 0.5) * 3;
        tip.vx += kx; tip.vz += kz; loll.vx -= kx * 1.6; loll.vz -= kz * 1.6;
        debris({ x: pos.x, y: groundHeight(pos.x, pos.z) + 1.1, z: pos.z }, { count: 4, color: STRAW, speed: 2, size: 0.07, life: 0.7 });
      } };
    lures.push(lure);
    const unlure = () => { const i = lures.indexOf(lure); if (i >= 0) lures.splice(i, 1); };
    const floor = groundHeight(pos.x, pos.z);
    debris({ x: pos.x, y: floor, z: pos.z }, { count: 14, color: 0x4a3a28, speed: 3.5, size: 0.12, life: 0.9 });
    debris({ x: pos.x, y: floor + 0.8, z: pos.z }, { count: 10, color: STRAW, speed: 2.5, size: 0.07, life: 0.9 });
    // (how far it calls them from)
    shockwave(pos, { color: STRAW, intensity: 0.55, from: 0.6, to: def.radius, life: 0.6 });
    sfx.straw();
    let t = 0, sunk = false;
    addEffect({
      update(dt) {
        t += dt;
        // every foe near it it can lure goes for it while it stands (one raised later takes them from an older one)
        if (t < def.duration) {
          for (const e of G.enemies) {
            if (e.lure === lure || !lurable(e) || (e.lure && e.lure.until > lure.until)) continue;
            if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < def.radius) e.lure = lure;
          }
        } else if (!sunk) {
          sunk = true; unlure();
          debris({ x: pos.x, y: floor + 0.6, z: pos.z }, { count: 12, color: STRAW, speed: 2, size: 0.07, life: 0.8 });
          debris({ x: pos.x, y: floor, z: pos.z }, { count: 8, color: 0x4a3a28, speed: 2.5, size: 0.1, life: 0.7 });
        }
        tip.vx += (-70 * tip.x - 7 * tip.vx) * dt; tip.vz += (-70 * tip.z - 7 * tip.vz) * dt;
        tip.x += tip.vx * dt; tip.z += tip.vz * dt;
        loll.vx += (-45 * loll.x - 5 * loll.vx) * dt; loll.vz += (-45 * loll.z - 5 * loll.vz) * dt;
        loll.x += loll.vx * dt; loll.z += loll.vz * dt;
        head.rotation.set(loll.x, 0, loll.z);
        const up = Math.min(1, t / RISE), down = Math.max(0, (t - def.duration) / SINK);
        // (up quickly, overshooting a little and settling; down slowly)
        const y = -DEPTH * (1 - up) ** 3 + Math.sin(up * Math.PI) * 0.06 - DEPTH * down * down;
        mesh.position.set(pos.x, floor + y, pos.z);
        mesh.rotation.set(tip.x + Math.sin(t * 2.1) * 0.015, yaw, tip.z + Math.sin(t * 1.7 + 1) * 0.02);
        return down < 1;
      },
      dispose() { unlure(); G.scene.remove(mesh); },
    });
  },
};

export default skill;
