// A house's door walked through (the houses of data/houses.ts: their cottages' doors in the village, world/village.ts,
// and each room's own inside, world/rooms.ts): a frame of timber round it, a leaf of planks on ledges, strapped by
// three iron hinges, a ring to pull and a lock plate. It stays shut: swung open as E was held, the leaf stood out at an
// angle before a dark hole and read as broken (from play, "Don't have the door animation, remove it"); the hold's
// prompt filling is all that moves. Each part merged into a mesh a material, in materials the place already has, so
// nothing compiles. And the sign over a house's door, its name painted on a board hung from an iron arm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasOf, ctx2d, textureFromCanvas } from '../core/textures';
import { mulberry } from '../util';
import { boxWithUV } from './props';
import { paintBoard, paintedFace } from './signPaint';

/** what a door is made of: its frame's timber, its leaf's planks, its iron */
export interface DoorMats { frame: THREE.Material; leaf: THREE.Material; iron: THREE.Material }

/** A door as built: its group (in its wall's frame: x along it, the opening's foot's middle at the origin, the wall's
 *  face at z = 0, facing +z). */
export interface Door {
  group: THREE.Group;
  /** how high its frame's head stands over its foot (m): a sign goes over it */
  top: number;
}

/**
 * How a door is hung: its opening's width and height (m), where its leaf stands in z (its back face), which side its
 * hinges are on (-1 left, 1 right, as seen from +z) and which way its iron and ring face (1 toward +z, -1 away: its
 * ledges are on the other face), and whether its frame stands round it on the wall's face (a room's has one; and its reveal lined, in
 * from the wall's hole by `lining`).
 */
export interface DoorHang {
  wide: number; high: number; leafZ: number; hinge: 1 | -1;
  /** how far its frame stands out from the wall (m): `FRAME.out` by default; deeper, the leaf reads as set into it */
  frameOut?: number;
  /** how tall its frame's head is (m): `FRAME.head` by default */
  head?: number;
  faces: 1 | -1; frame: boolean;
  /** how thick the boards lining the hole through the wall are, and how deep the hole (m): none if 0 */
  lining?: number; deep?: number;
}

/** the leaf: its planks' count, thickness and the gap between, its ledges' heights (shares of its height) */
const LEAF = { planks: 5, thick: 0.045, gap: 0.006, ledges: [0.16, 0.5, 0.84] };
/** the frame round the opening: its jambs' width, how far it stands out from the wall, its head's height and how far
 *  past the jambs it runs; its foot off the wall's face (in one plane with the plaster, it flickered against it) */
const FRAME = { wide: 0.14, out: 0.11, head: 0.18, past: 0.06, off: 0.002 };

/** A box `w` x `h` x `d` with its middle at (x, y, z), its uvs shifted by (u, v) so no two planks show one grain. */
function part(w: number, h: number, d: number, x: number, y: number, z: number, u = 0, v = 0, grained = true): THREE.BufferGeometry {
  const g = boxWithUV(w, h, d, 0.5, grained);
  if (u || v) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + u, uv.getY(i) + v);
  }
  return g.translate(x, y, z);
}

/** A mesh of `parts` merged, in `material`, casting and taking shadows as asked. */
function merged(parts: THREE.BufferGeometry[], material: THREE.Material, cast: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!, material);
  for (const p of parts) p.dispose();
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

/** A door hung as `hang` says, in `M`. `seed` varies its planks' grain. */
export function buildDoor(M: DoorMats, hang: DoorHang, seed = 1): Door {
  const { wide, high, leafZ, hinge, faces } = hang;
  const rng = mulberry(seed);
  const group = new THREE.Group();
  const lining = hang.lining ?? 0, deep = hang.deep ?? 0;
  const inW = wide - lining * 2, inH = high - lining, head = hang.head ?? FRAME.head;
  // the frame: two jambs and a head over them, a hair off the wall's face, and the hole's reveal lined
  if (hang.frame) {
    const out = hang.frameOut ?? FRAME.out;
    const z = FRAME.off + out / 2, left = inW / 2;
    const frame = [
      ...[-1, 1].map((s) => part(FRAME.wide, inH, out, s * (left + FRAME.wide / 2), inH / 2, z, rng(), rng())),
      part(inW + (FRAME.wide + FRAME.past) * 2, head, out + 0.02, 0, inH + head / 2, z + 0.01, rng(), rng()),
    ];
    if (lining > 0) {
      // (each board a millimetre off the hole's faces, and stopped short of the frame: in one plane, they fought)
      const d = deep - FRAME.off * 2, zc = -deep / 2;
      const tall = high - 0.002;
      for (const s of [-1, 1]) frame.push(part(lining - 0.002, tall, d, s * (wide / 2 - lining / 2 - 0.001), tall / 2, zc, rng(), rng()));
      frame.push(part(inW, lining - 0.002, d, 0, inH + lining / 2 - 0.001, zc, rng(), rng()));
    }
    group.add(merged(frame, M.frame, true));
  }
  // the leaf, on its hinges' line at the hinge side's edge, its planks across from it
  const pivot = new THREE.Group();
  const leafW = inW - 0.012, leafH = inH - 0.008;
  pivot.position.set(hinge * leafW / 2, 0.004, leafZ + LEAF.thick / 2);
  group.add(pivot);
  const fromHinge = (x: number): number => -hinge * x;
  const planks: THREE.BufferGeometry[] = [];
  const each = (leafW - LEAF.gap * (LEAF.planks - 1)) / LEAF.planks;
  for (let k = 0; k < LEAF.planks; k++) {
    const x = each / 2 + k * (each + LEAF.gap);
    // (each a little proud or sunk of the next, as hand-split boards are: never in one plane where they meet)
    const z = (rng() - 0.5) * 0.006;
    planks.push(part(each, leafH, LEAF.thick, fromHinge(x), leafH / 2, z, rng() * 3, rng() * 3));
  }
  // its ledges across its back, the face its iron isn't on
  const back = -faces * (LEAF.thick / 2 + 0.014);
  for (const share of LEAF.ledges) planks.push(part(leafW - 0.08, 0.11, 0.028, fromHinge(leafW / 2), leafH * share, back, rng(), rng()));
  pivot.add(merged(planks, M.leaf, true));
  // its iron: three strap hinges from the hinge edge most of the way across, each ending in a spade, riveted; a ring
  // to pull on a round plate, and a lock plate under it, on the face seen from where he stands to go through it
  const face = faces * (LEAF.thick / 2 + 0.004 + 0.003);
  const iron: THREE.BufferGeometry[] = [];
  for (const share of LEAF.ledges) {
    const y = leafH * share, long = leafW * 0.72;
    iron.push(part(long, 0.05, 0.008, fromHinge(long / 2), y, face, 0, 0, false));
    // (its spade: a wider square turned on its corner, a hair prouder than the strap: in one plane, they fought)
    const spade = part(0.075, 0.075, 0.011, 0, 0, 0, 0, 0, false).rotateZ(Math.PI / 4).translate(fromHinge(long), y, face);
    iron.push(spade);
    for (let r = 0.08; r < long - 0.04; r += 0.16) iron.push(part(0.018, 0.018, 0.012, fromHinge(r), y, face + 0.004, 0, 0, false));
    // (the hinge's knuckle round the pin, at the edge)
    iron.push(new THREE.CylinderGeometry(0.017, 0.017, 0.09, 8).translate(0, y, 0));
  }
  const handleX = fromHinge(leafW - 0.13), handleY = Math.min(1.02, leafH * 0.52);
  iron.push(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 14).rotateX(Math.PI / 2).translate(handleX, handleY, face));
  iron.push(new THREE.TorusGeometry(0.055, 0.009, 6, 16).translate(handleX, handleY - 0.05, face + faces * 0.012));
  iron.push(part(0.07, 0.12, 0.008, handleX, handleY - 0.2, face, 0, 0, false));
  pivot.add(merged(iron, M.iron, true));
  return { group, top: inH + (hang.frame ? head : 0) };
}

/** the sign's board (m), its canvas (px a metre), how far off the wall it hangs (m: a cottage's timber plate stands
 *  0.06 out, and in one plane with it the board's back fought it), and its length for a letter of its name (m: its
 *  heavy capitals are wider than the gilt serif's were) */
const SIGN = { wide: 1.4, high: 0.3, thick: 0.05, px: 400, off: 0.075, perLetter: 0.11 };

/** The sign hung over a house's door: `name` painted on a board as the signposts' arms are (`signPaint.ts`; from
 *  Viktor: "labels on houses should be high contrast as well": they were dark boards, the name carved in gilt), in the wall's frame its foot's middle at (0, y) on
 *  the wall's face, held off it by iron brackets. In materials of the place's own (`face` gives the material its
 *  picture is painted in: a copy of a mapped one, the same program). */
export function doorSign(name: string, board: THREE.Material, iron: THREE.Material, face: (map: THREE.Texture) => THREE.Material,
  y: number): THREE.Group {
  const g = new THREE.Group();
  const w = Math.max(SIGN.wide, 0.16 + name.length * SIGN.perLetter), h = SIGN.high;
  const canvas = canvasOf(Math.round(w * SIGN.px), Math.round(h * SIGN.px));
  paintBoard(ctx2d(canvas), canvas.width, canvas.height, name);
  const map = textureFromCanvas(canvas);
  map.anisotropy = 4;
  const painted = paintedFace(face(map));
  // (the board itself, its face the picture, its edges the wood)
  const body = new THREE.Mesh(boxWithUV(w, h, SIGN.thick, 0.5, true), board);
  body.position.set(0, y + h / 2, SIGN.off + SIGN.thick / 2);
  body.castShadow = body.receiveShadow = true;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), painted);
  front.position.set(0, y + h / 2, SIGN.off + SIGN.thick + 0.002);
  front.receiveShadow = true;
  // (its iron: two short brackets from the wall to its back, a bar along its top)
  const bits = [-1, 1].map((s) => boxWithUV(0.03, 0.03, 0.08, 0.5).translate(s * (w / 2 - 0.15), y + h - 0.06, 0.04));
  bits.push(boxWithUV(w + 0.04, 0.025, 0.012, 0.5).translate(0, y + h + 0.0125, SIGN.off + SIGN.thick / 2));
  const ironMesh = merged(bits, iron, true);
  g.add(body, front, ironMesh);
  return g;
}

