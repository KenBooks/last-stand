// The village's weapons rack (data/village.ts `RACK`; built by world/village.ts): a sturdy timber rack, two posts on
// skids and a heavy beam across them, four long swords stood in it point down, their tips in a trough at its foot and
// their blades leant on the beam: a flame-bladed two-hander, a sabre, a longsword with a ring on its guard, an arming
// sword. Where a party sets up a duel (from play: "Item you come up to to interact (open menu), is a weapons rack").
import * as THREE from 'three';
import { RACK } from '../data/village';
import { boxWithUV } from './props';
import type { Obstacle } from '../types';

/** The rack's materials, the village's own (world/village.ts `Mats`): all of what stands free, thinned as one. */
export interface RackMats {
  timber: THREE.Material; planks: THREE.Material; iron: THREE.Material; steel: THREE.Material; hilt: THREE.Material;
  grip: THREE.Material;
}

/** The rack's frame (m): its posts' place either side and their height, the beam the blades lean on (its foot, height
 *  and depth), the trough the tips stand in (its middle before the posts, its floor's top). */
const FRAME = { post: 1.08, high: 1.5, beamFoot: 0.98, beamHigh: 0.2, beamDeep: 0.12, trough: 0.24, floor: 0.07 };

/** A sword of the rack: where it stands along it (m), its blade (length, half width at the guard, thickness), how its
 *  blade runs (`wave`: a flame blade's bends, how far each swings; `curve`: how far a sabre's tip sweeps aside), its
 *  grip's length, its guard (half width, and what it carries) and its pommel, and how it leans aside (rad). Broader
 *  than a smith makes them: true to size, each was a dark line from the square. */
interface Sword {
  x: number; blade: number; half: number; thick: number; wave?: number; curve?: number;
  grip: number; guard: number; carries: 'lugs' | 'bow' | 'ring' | 'none'; pommel: 'pear' | 'cap' | 'ball' | 'wheel';
  roll: number;
}
const SWORDS: readonly Sword[] = [
  { x: -0.68, blade: 1.3, half: 0.043, thick: 0.014, wave: 0.013, grip: 0.36, guard: 0.17, carries: 'lugs', pommel: 'pear', roll: 0.025 },
  { x: -0.22, blade: 0.95, half: 0.034, thick: 0.012, curve: 0.13, grip: 0.13, guard: 0.055, carries: 'bow', pommel: 'cap', roll: -0.05 },
  { x: 0.24, blade: 1.14, half: 0.037, thick: 0.013, grip: 0.24, guard: 0.13, carries: 'ring', pommel: 'ball', roll: -0.02 },
  { x: 0.68, blade: 0.86, half: 0.044, thick: 0.013, grip: 0.12, guard: 0.095, carries: 'none', pommel: 'wheel', roll: 0.04 },
];

/** A blade standing on its point (y up from the tip, its flats to +z and -z): a diamond across, each face flat, its
 *  middle swung aside by `aside(t)` and its half width `half(t)`, t from the tip (0) to the guard (1). */
function bladeGeometry(length: number, thick: number, half: (t: number) => number, aside: (t: number) => number): THREE.BufferGeometry {
  const stations = 40;
  const at: number[] = [], uv: number[] = [], index: number[] = [];
  const corner = (k: number, c: number): [number, number, number] => {
    const t = k / stations, w = half(t), mid = aside(t), d = (thick / 2) * Math.min(1, t * 8 + 0.15);
    const [x, z] = [[-w, 0], [0, d], [w, 0], [0, -d]][c % 4];
    return [mid + x, t * length, z];
  };
  for (let k = 0; k < stations; k++) {
    for (let c = 0; c < 4; c++) {
      // (each face's four corners its own: a flat face, a hard edge and a hard ridge)
      const from = at.length / 3;
      for (const [kk, cc] of [[k, c], [k, c + 1], [k + 1, c + 1], [k + 1, c]]) {
        const p = corner(kk, cc);
        at.push(...p);
        uv.push(p[0] * 6, p[1] * 2);
      }
      index.push(from, from + 2, from + 1, from, from + 3, from + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(at, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A mesh casting and taking shadows, added to `group` at (x, y, z). */
function part(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A timber of size (w, h, d) standing on y0, its middle at (x, z). */
function timber(group: THREE.Object3D, w: number, h: number, d: number, x: number, y0: number, z: number, material: THREE.Material): THREE.Mesh {
  return part(group, boxWithUV(w, h, d, 0.5, material.userData.grained === true), material, x, y0 + h / 2, z);
}

/** A solid turned on a lathe from `profile` (radius, height). */
const turned = (profile: [number, number][], around = 12): THREE.BufferGeometry =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), around);

/** One sword standing on its point at the group's origin: its blade, its guard and what it carries, its grip bound in
 *  leather, its pommel. */
function buildSword(s: Sword, M: RackMats): THREE.Group {
  const sword = new THREE.Group();
  // (a flame blade's bends die out toward its point and its guard; a sabre's sweep grows toward its point)
  const aside = (t: number): number =>
    (s.wave ? s.wave * Math.sin(t * Math.PI * 9) * Math.min(1, t * 5) * Math.min(1, (1 - t) * 7) : 0)
    + (s.curve ? s.curve * (1 - t) ** 2 : 0);
  // (its width: to a point over its last sixth, a sabre's over its last quarter)
  const point = s.curve ? 0.26 : 0.16;
  const half = (t: number): number => s.half * (0.72 + 0.28 * t) * Math.min(1, Math.max(0.02, t / point) ** 0.7);
  part(sword, bladeGeometry(s.blade, s.thick, half, aside), M.steel);
  const top = s.blade;
  // the guard: a bar across, thicker at its middle, a knob at each end
  const bar = part(sword, new THREE.CylinderGeometry(0.009, 0.009, s.guard * 2, 8).rotateZ(Math.PI / 2), M.hilt, 0, top + 0.012, 0);
  bar.scale.set(1, 1.3, 1.3);
  part(sword, boxWithUV(0.05, 0.03, 0.03, 4), M.hilt, 0, top + 0.012, 0);
  for (const side of [-1, 1]) part(sword, new THREE.SphereGeometry(0.013, 8, 6), M.hilt, side * s.guard, top + 0.012, 0);
  if (s.carries === 'lugs') {
    // (a two-hander's: a bare length of blade under its guard to grip, bound in leather, two lugs below it)
    part(sword, new THREE.CylinderGeometry(0.016, 0.019, 0.15, 8), M.grip, 0, top - 0.09, 0).scale.z = 0.6;
    for (const side of [-1, 1]) {
      const lug = part(sword, new THREE.ConeGeometry(0.012, 0.07, 6).rotateZ(-side * Math.PI / 2), M.steel, side * 0.05, top - 0.19, 0);
      lug.rotation.z = side * 0.35;
    }
  } else if (s.carries === 'ring') {
    // (a ring off the guard's front, over the hand)
    part(sword, new THREE.TorusGeometry(0.038, 0.005, 6, 18).rotateX(Math.PI / 2), M.hilt, 0, top + 0.012, 0.04);
  } else if (s.carries === 'bow') {
    // (a sabre's knuckle bow, from the guard's end round to its pommel)
    const high = s.grip + 0.03;
    const bow = part(sword, new THREE.TorusGeometry(high / 2, 0.005, 6, 16, Math.PI).rotateZ(-Math.PI / 2), M.hilt, s.guard * 0.2, top + 0.012 + high / 2, 0);
    bow.scale.x = 0.9;
  }
  // the grip, swelling at its middle, bound in leather; a two-hander's with a band round its middle
  part(sword, turned([[0.0125, 0], [0.0155, s.grip * 0.45], [0.0115, s.grip]], 10), M.grip, 0, top + 0.024, 0);
  if (s.grip > 0.3) part(sword, new THREE.TorusGeometry(0.0165, 0.004, 6, 12).rotateX(Math.PI / 2), M.iron, 0, top + 0.024 + s.grip * 0.45, 0);
  const pommelAt = top + 0.024 + s.grip;
  const pommel: Record<Sword['pommel'], () => THREE.BufferGeometry> = {
    pear: () => turned([[0.011, 0], [0.024, 0.02], [0.026, 0.036], [0.016, 0.056], [0.006, 0.062], [0.001, 0.064]]),
    cap: () => turned([[0.014, 0], [0.018, 0.012], [0.012, 0.026], [0.001, 0.03]]),
    ball: () => new THREE.SphereGeometry(0.023, 12, 9).translate(0, 0.02, 0),
    wheel: () => new THREE.CylinderGeometry(0.027, 0.027, 0.016, 16).rotateX(Math.PI / 2).translate(0, 0.024, 0),
  };
  part(sword, pommel[s.pommel](), M.hilt, 0, pommelAt, 0);
  return sword;
}

/** The rack built under `scene` where the plan has it, and what a body is kept off there. */
export function buildWeaponsRack(scene: THREE.Object3D, M: RackMats, obstacles: Obstacle[]): void {
  // (laid out with its swords to +z, turned to its facing)
  const rack = new THREE.Group();
  rack.name = 'weapons rack';
  rack.position.set(RACK.x, 0, RACK.z);
  rack.rotation.y = RACK.facing;
  const { post, high, beamFoot, beamHigh, beamDeep, trough, floor } = FRAME;
  for (const side of [-1, 1]) {
    // each post on a skid running front to back, a brace from the skid's back up to the post
    timber(rack, 0.17, high, 0.17, side * post, 0.1, 0, M.timber);
    timber(rack, 0.2, 0.12, 1.05, side * post, 0, 0.08, M.timber);
    const brace = timber(rack, 0.09, 0.78, 0.09, side * post, 0, 0, M.timber);
    brace.position.set(side * post, 0.42, -0.24);
    brace.rotation.x = 0.62;
    // (its top cut to shed the rain, an iron band under it)
    timber(rack, 0.2, 0.035, 0.2, side * post, high + 0.02, 0, M.iron);
  }
  // the beam the blades lean on, pegged through each post; a lighter rail behind it, low
  timber(rack, post * 2 + 0.5, beamHigh, beamDeep, 0, beamFoot, 0.02, M.timber);
  for (const side of [-1, 1]) {
    part(rack, new THREE.CylinderGeometry(0.022, 0.022, 0.07, 8).rotateX(Math.PI / 2), M.iron, side * post, beamFoot + beamHigh / 2, 0.1);
  }
  timber(rack, post * 2, 0.1, 0.07, 0, 0.42, -0.02, M.planks);
  // the trough the points stand in: a plank on the skids, a lip along its front and its back
  timber(rack, post * 2 + 0.2, floor - 0.02, 0.3, 0, 0.12, trough, M.planks);
  for (const edge of [-0.15, 0.15]) timber(rack, post * 2 + 0.2, 0.05, 0.035, 0, 0.12 + floor - 0.02, trough + edge, M.timber);
  // the swords: each on its point in the trough, leant back on the beam's face, an iron staple over its blade there
  const tipY = 0.12 + floor - 0.02, restY = beamFoot + beamHigh / 2, restZ = 0.02 + beamDeep / 2 + 0.012;
  const lean = -Math.atan2(trough - restZ, restY - tipY);
  for (const s of SWORDS) {
    const sword = buildSword(s, M);
    sword.position.set(s.x, tipY, trough);
    sword.rotation.set(lean, 0, s.roll, 'XZY');
    rack.add(sword);
    // (where its blade crosses the beam: aside by its roll, and a sabre's sweep there)
    const along = (restY - tipY) / s.blade;
    const crossX = s.x - Math.sin(s.roll) * (restY - tipY) + (s.curve ? s.curve * (1 - along) ** 2 : 0);
    const staple = part(rack, new THREE.TorusGeometry(0.05, 0.006, 6, 12, Math.PI).rotateX(-Math.PI / 2), M.iron, crossX, restY, restZ - 0.012);
    staple.scale.z = 0.7;
  }
  scene.add(rack);
  const cos = Math.cos(RACK.facing), sin = Math.sin(RACK.facing);
  for (const x of [-0.85, 0, 0.85]) obstacles.push({ x: RACK.x + x * cos, z: RACK.z - x * sin, r: 0.48, h: high });
}
