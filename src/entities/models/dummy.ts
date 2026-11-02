// Training dummy: a straw-stuffed burlap sack on a wooden post, with a glowing
// target rune. It wobbles on a spring when hit (lobby target practice).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createKit } from '../../core/materials';
import { ashlar, burlap, pbrMaterialMaps, wood } from '../../core/textures';
import type { AnimState, Model } from '../../types';
import { mulberry } from '../../util';
import { part, joint } from './rig';

const STIFFNESS = 70, DAMPING = 5;
/** how little of a lean and its speed (rad, rad/s) the spring is let go at, standing still */
const AT_REST = 1e-4;
/** the stream its straw is drawn from: every dummy alike */
const STRAW_SEED = 4417;
/** the straw's two geometries (spilling out of the sack and the sleeves, and out of the head), made once and shared by
 *  every dummy (`userData.shared`): made for each, the lobby's dummies held Back out of the hero selection screen up
 *  20 to 26 ms */
let straws: { loose: THREE.BufferGeometry; head: THREE.BufferGeometry } | null = null;

/** The straw's geometries, made the first time they're asked for. */
function strawOnce(): { loose: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  if (straws) return straws;
  const rng = mulberry(STRAW_SEED);
  const loose = [strawBundle(rng, 160, 0.17, [0.08, 0.2], 0.3).rotateX(Math.PI).translate(0, 0.74, 0)];
  for (const s of [1, -1]) {
    loose.push(strawBundle(rng, 90, 0.04, [0.05, 0.12], 0.4).rotateZ(-s * Math.PI / 2).translate(s * 0.67, 1.22, 0));
  }
  straws = { loose: mergeGeometries(loose), head: strawBundle(rng, 50, 0.035, [0.04, 0.1], 0.5) };
  straws.loose.userData.shared = straws.head.userData.shared = true;
  return straws;
}

/**
 * A bundle of `count` straws standing up from a disc `radius` wide at the origin, each `length[0]` to `length[1]` long,
 * leaning out `splay` (rad) the further out it stands, each its own shade. Five smooth cones a bundle before, which
 * read as spikes (#287).
 */
function strawBundle(rng: () => number, count: number, radius: number, length: [number, number],
  splay: number): THREE.BufferGeometry {
  const straws: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0), along = new THREE.Vector3(), turn = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, out = Math.sqrt(rng());
    const len = length[0] + (length[1] - length[0]) * rng();
    const lean = splay * out + (rng() - 0.5) * 0.15;
    along.set(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
    turn.setFromUnitVectors(up, along.normalize());
    const straw = new THREE.CylinderGeometry(0.002, 0.005, len, 3, 1).translate(0, len / 2, 0)
      .applyQuaternion(turn).translate(Math.cos(a) * radius * out, 0, Math.sin(a) * radius * out);
    const shade = 0.6 + 0.45 * rng();
    const colour = new Float32Array(straw.attributes.position.count * 3).fill(shade);
    straw.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    straws.push(straw);
  }
  return mergeGeometries(straws);
}

/**
 * The meshes right under `joint` that share a material and cast alike merged into one, each placed in the joint's
 * space: a dummy was 23 meshes and 12 shadow casters, three of them a third of the lobby's draws (on WebGPU each
 * draw is about 20 µs of the frame's JS), and they move only as their joints do.
 */
function mergeAlike(joint: THREE.Object3D): void {
  const alike = new Map<string, THREE.Mesh[]>();
  for (const child of joint.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.geometry.userData.shared) continue;
    const key = `${(mesh.material as THREE.Material).uuid} ${mesh.castShadow}`;
    alike.set(key, [...alike.get(key) ?? [], mesh]);
  }
  for (const meshes of alike.values()) {
    if (meshes.length < 2) continue;
    const placed = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(placed);
    if (!merged) continue;
    const one = part(merged, meshes[0].material as THREE.Material, joint);
    one.castShadow = meshes[0].castShadow;
    for (const mesh of meshes) {
      joint.remove(mesh);
      mesh.geometry.dispose();
    }
  }
}

/** the geometries of the first dummy built, in the order its meshes are met (`shareGeometries`) */
let sharedGeometries: THREE.BufferGeometry[] | null = null;

/**
 * Every dummy's meshes given the first one's geometries, marked as shared, so all of them are drawn in a crowd as the
 * foes are: each material's parts of all the dummies one instanced draw (models/crowd.ts), where they were 29 of the
 * lobby's scene draws a frame and 21 of its shadow's, at about 20 us of JS a draw on WebGPU.
 */
function shareGeometries(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const first = sharedGeometries === null;
  sharedGeometries ??= meshes.map((mesh) => mesh.geometry);
  meshes.forEach((mesh, i) => {
    if (first) {
      mesh.geometry.userData.shared = true;
      return;
    }
    // (the straw's are made once already)
    if (mesh.geometry !== sharedGeometries![i]) mesh.geometry.dispose();
    mesh.geometry = sharedGeometries![i];
  });
}

export function buildDummy(): Model {
  const kit = createKit(0xf0c860);
  const woodMat = kit.std({ ...pbrMaterialMaps(wood(), 1, 1.2), roughness: 1 });
  const sack = kit.std({ ...pbrMaterialMaps(burlap(), 2, 1.5), roughness: 1 });
  const straw = kit.std({ color: 0xc9a54e, roughness: 0.8, vertexColors: true });
  const rope = kit.std({ color: 0x6e5a3a, roughness: 0.9 });
  const stone = kit.std({ ...pbrMaterialMaps(ashlar(33, 2, 2), 1, 1.2), color: 0x9a9aa2 });
  const iron = kit.std({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.8 });
  const paint = kit.std({ color: 0x1a1210, roughness: 0.9 });
  const rune = kit.glow(0xf0c860, 2.2);

  const root = new THREE.Group();
  // plinth (stays put while the rest wobbles)
  part(new THREE.CylinderGeometry(0.46, 0.52, 0.16, 20), stone, root, 0, 0.08, 0);
  part(new THREE.TorusGeometry(0.2, 0.025, 6, 18).rotateX(Math.PI / 2), iron, root, 0, 0.17, 0);

  const sway = joint(root, 0, 0.16, 0);
  part(new THREE.CylinderGeometry(0.06, 0.075, 1.9, 10), woodMat, sway, 0, 0.95, 0);

  // body: a bulging sack, tied at both ends
  const profile = [
    [0.05, 0], [0.2, 0.02], [0.28, 0.12], [0.31, 0.3], [0.3, 0.48], [0.25, 0.62], [0.14, 0.7], [0.06, 0.72],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  part(new THREE.LatheGeometry(profile, 20), sack, sway, 0, 0.7, 0);
  for (const y of [0.76, 1.3]) part(new THREE.TorusGeometry(y < 1 ? 0.23 : 0.21, 0.018, 6, 20).rotateX(Math.PI / 2), rope, sway, 0, y, 0);
  // straw spilling out below the sack, and out of the sleeves' tied ends
  const spilt = strawOnce();

  // arms: a crossbar through two sleeves, each gathered and tied at its end with the straw bursting out
  part(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8).rotateZ(Math.PI / 2), woodMat, sway, 0, 1.22, 0);
  const sleeve = [[0.06, 0], [0.078, 0.03], [0.09, 0.12], [0.086, 0.2], [0.062, 0.25], [0.045, 0.27], [0.04, 0.28]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  for (const s of [1, -1]) {
    part(new THREE.LatheGeometry(sleeve, 12).rotateZ(-s * Math.PI / 2), sack, sway, s * 0.42, 1.22, 0);
    part(new THREE.TorusGeometry(0.072, 0.012, 5, 12).rotateY(Math.PI / 2), rope, sway, s * 0.45, 1.22, 0);
    part(new THREE.TorusGeometry(0.05, 0.012, 5, 12).rotateY(Math.PI / 2), rope, sway, s * 0.68, 1.22, 0);
  }
  part(spilt.loose, straw, sway).castShadow = false;

  // head: a tied sack with painted eyes
  const head = joint(sway, 0, 1.66, 0);
  part(new THREE.SphereGeometry(0.19, 16, 12).scale(1, 1.08, 0.95), sack, head, 0, 0, 0);
  part(new THREE.TorusGeometry(0.1, 0.02, 6, 16).rotateX(Math.PI / 2), rope, head, 0, -0.17, 0);
  for (const s of [1, -1]) {
    for (const r of [0.7, -0.7]) {
      const bar = part(new THREE.BoxGeometry(0.075, 0.016, 0.01), paint, head, s * 0.07, 0.03, 0.175);
      bar.rotation.set(0, s * 0.3, r);
      bar.castShadow = false;
    }
  }
  part(spilt.head, straw, head, 0, 0.19, 0).castShadow = false;

  // target rune on the chest
  const target = joint(sway, 0, 1.03, 0.3);
  target.rotation.x = -0.12;
  for (const [r0, r1] of [[0.13, 0.15], [0.07, 0.085]]) {
    part(new THREE.RingGeometry(r0, r1, 32), rune, target).castShadow = false;
  }
  part(new THREE.CircleGeometry(0.025, 16), rune, target).castShadow = false;

  for (const joint of [root, sway, head, target]) mergeAlike(joint);

  // spring wobble: lean back when struck, sway a little sideways; at rest it stands still (a sway of 0.01 rad, 2 cm
  // at its head, moved every part each frame: on WebGPU each moved part's draw is refreshed in full)
  let lean = 0, leanV = 0, tilt = 0, tiltV = 0, prevHit = 0;
  function animate(st: AnimState): void {
    const dt = st.dt;
    if (st.hit > prevHit + 0.2) {
      leanV -= 2.2 * (st.hit - prevHit);
      tiltV += (Math.random() - 0.5) * 2.4;
    }
    prevHit = st.hit;
    if (lean === 0 && leanV === 0 && tilt === 0 && tiltV === 0) return;
    leanV += (-STIFFNESS * lean - DAMPING * leanV) * dt; lean += leanV * dt;
    tiltV += (-STIFFNESS * tilt - DAMPING * tiltV) * dt; tilt += tiltV * dt;
    if (Math.abs(lean) + Math.abs(tilt) < AT_REST && Math.abs(leanV) + Math.abs(tiltV) < AT_REST) {
      lean = leanV = tilt = tiltV = 0;
    }
    sway.rotation.set(lean, 0, tilt);
    head.rotation.set(-lean * 0.6, 0, -tilt * 0.8);
  }

  shareGeometries(root);
  root.userData.crowdKind = 'dummy';
  return { root, kit, animate, height: 1.95, dispose() { kit.dispose(); } };
}
