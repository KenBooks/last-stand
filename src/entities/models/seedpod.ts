// The Rootmother's seed pod (entities/rootmother.ts): a husk the size of a child, its ribs split along their seams and
// sap glowing in the splits, rooted to the floor where it fell, a few leaves at its foot. As it ripens (its `ripen`
// action, `ActionState.t` from 0 to the moment it bursts) it swells and its splits glow brighter, at a slow beat that
// quickens towards the end but never past the flash rule's pace; popped or burst, its husk splits open in four.
// Drawn in its crowd (models/crowd.ts): its husk's quarters are joints, its glow a strength.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { joint } from './rig';
import { Sculpt, leaf, organic, skipping, taperTube } from './shapes';
import { mulberry } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** the husk's profile bottom to top ([radius, height], m): a teardrop on a short neck into the floor */
const HUSK: [number, number][] = [[0.12, 0], [0.3, 0.12], [0.42, 0.34], [0.44, 0.52], [0.36, 0.74], [0.2, 0.92], [0.05, 1.02], [0.01, 1.05]];
/** the quarters' turn as it bursts open (rad), and the split between each two (rad of the husk's round) */
const BURST = 1.3;
const SPLIT = 0.05;

export function buildSeedPod(): Model {
  const kit = createKit(0xc8ff60);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const husk = kit.rim({ color: 0x7a6a30, roughness: 0.7, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.5, 1.5) }, 0xb8c060, 0.35);
  const leafMat = kit.rim({ color: 0x3a6a26, roughness: 0.65, side: THREE.DoubleSide }, 0x80c050, 0.25);
  const sap = kit.glow(0xc8ff60, 1.2);

  const root = new THREE.Group();
  const S = new Sculpt('seedpod').glow(sap).glow(leafMat);
  const r = mulberry(61);
  // the glowing heart showing through the splits, a little inside the husk
  S.add(made(() => organic(new THREE.SphereGeometry(1, 14, 10), 0.08, 3, 2)), sap, root, [0, 0.5, 0], [0, 0, 0], [0.34, 0.42, 0.34]);
  // four quarters of husk, each a wedge of the lathe on a joint at its foot (its middle along the joint's +z, so it
  // opens outward about its own x), a narrow split between each and the next where the glow shows
  const quarters: THREE.Group[] = [];
  const profile = HUSK.map(([rr, y]) => new THREE.Vector2(rr, y - 0.08));
  for (let i = 0; i < 4; i++) {
    const q = joint(root, 0, 0.08, 0);
    q.rotation.order = 'YXZ';
    q.rotation.y = (i / 4) * Math.PI * 2;
    S.add(made(() => organic(new THREE.LatheGeometry(profile, 6, -Math.PI / 4 + SPLIT, Math.PI / 2 - SPLIT * 2), 0.02, 5, i)), husk, q);
    // its rib, raised along one of its edges
    const a = Math.PI / 4 - SPLIT * 1.5;
    const pts = HUSK.slice(1, -1).map(([rr, y]) => V(Math.sin(a) * (rr - 0.015), y - 0.08, Math.cos(a) * (rr - 0.015)));
    S.add(made(() => taperTube(pts, (t) => 0.032 * (1 - t * 0.6), 12, 5)), husk, q);
    quarters.push(q);
  }
  // roots into the floor, leaves at its foot
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    S.add(made(() => taperTube([V(0, 0.1, 0), V(Math.sin(a) * 0.25, 0.04, Math.cos(a) * 0.25), V(Math.sin(a) * 0.5, -0.03, Math.cos(a) * 0.5)], (t) => 0.05 * (1 - t * 0.8), 6, 5)), husk, root);
    S.add(made(() => leaf(0.32, 0.12)), leafMat, root, [Math.sin(a + 0.6) * 0.2, 0.05, Math.cos(a + 0.6) * 0.2], [-0.9, a + 0.6, 0]);
  }
  S.build();

  function animate(st: AnimState): void {
    const a = st.action, ripe = a?.name === 'ripen' ? a.t : 0;
    const dead = st.dead >= 0 ? st.dead : 0;
    // (its beat from once every 1.4 s to 1.4 a second as it ripens: never faster than the flash rule allows)
    const rate = 0.7 + 0.7 * ripe, beat = 0.5 + 0.5 * Math.sin(st.t * Math.PI * 2 * rate);
    root.scale.setScalar(1 + 0.12 * ripe + 0.03 * beat * ripe);
    sap.emissiveIntensity = (1.2 + ripe * (1.2 + 1.2 * beat)) * (1 - dead * 0.8);
    const burst = Math.min(1, dead * 3);
    quarters.forEach((q) => { q.rotation.x = BURST * burst; });
    if (st.hit > 0) root.scale.multiplyScalar(1 - 0.06 * st.hit);
  }

  return { root, kit, animate, height: 1.1, dispose() { kit.dispose(); } };
}
