// The village's signposts (data/signposts.ts says where and what each arm names): a timber post on a stone foot, a cap
// over it, and its arms, pointed boards nailed across it at three heights, each pointing at where its way leads and
// painted on both faces with the name, the paint running on over its point. Every arm's name and its point are
// painted into one picture, so all their faces are one material: a copy of the place's free-standing planks with its
// picture (the same program). It stands free (`prop`: it thins while it hides him), still, and in the obstacles.
//
// Its arms are made to be read from afar, as the player first meets them from the game's view above (from Viktor, of
// the first ones, painted as the houses' dark signs with thin gilt letters: "signs need better visibility at the
// distance... maybe bolder text, different wood grain"): painted boards, ivory, each name lettered plain and heavy in
// dark paint, filling the board, on taller and longer arms, their faces flat (`signPaint.ts`). Their lowest arm hangs
// over a hero's head and his staff (from Viktor: "make signs a little higher so players dont bump into them").
import * as THREE from 'three';
import { SIGNPOSTS, type Signpost } from '../data/signposts';
import { canvasOf, ctx2d, textureFromCanvas } from '../core/textures';
import { boxWithUV } from './props';
import { groundHeight } from './ground';
import { PAINT, boardBand, boardGround, paintBoard, paintedFace } from './signPaint';
import type { Obstacle } from '../types';

/** what a signpost is made of: its post's timber, its arms' planks, its foot's stone, and the material its arms'
 *  faces are painted in (given their picture) */
export interface SignpostMats { post: THREE.Material; board: THREE.Material; foot: THREE.Material; face(map: THREE.Texture): THREE.Material }

/** the post: its width, height and cap, its stone foot's (m) */
const POST = { wide: 0.14, high: 3.45, cap: 0.22, foot: 0.34, footHigh: 0.16 };
/** an arm: its board's height and thickness, the top arm's height, the drop to each next, its point's length, how far
 *  back past the post it starts, its length for a letter of its name and at least (m). The third arm's foot is 2.1 m
 *  up: at 1.5 m (the top at 2.45) a hero walked into it, and the mage's staff passed through it. */
const ARM = { high: 0.4, thick: 0.04, top: 3.2, drop: 0.44, point: 0.22, back: 0.1, perLetter: 0.13, least: 1.2 };
/** the painted face on each side: its height on the board, and the picture's pixels a metre */
const FACE = { high: 0.34, px: 300 };
/** An arm as built: its post, the name it bears, the way it points in the world (rad about y, 0 along +x toward
 *  -z: `atan2(-dz, dx)`), its height, and its group (its +x the way it points, its faces facing ±z). */
export interface BuiltArm { post: Signpost; name: string; way: number; y: number; group: THREE.Object3D; long: number }

/** where an arm's painted face starts along it, clear of the post (m from the post's middle), and the room its name
 *  leaves before the point (from the first: a face from behind the post ran its name under it and up to the point) */
const FACE_FROM = POST.wide / 2 + 0.03, FACE_GAP = 0.05;

/** an arm's painted point, the paint of its face run on over it (from Viktor, of a red point painted apart: "make it
 *  same white, solid with main part of the sign"; and before it the point was the dark planks: "its too dark to see
 *  the >"): how far past the point's base the face runs before it, how far short of the tip it ends, and its half
 *  height (m, inside the board's outline there) */
const TIP = { into: 0.02, short: 0.035, half: FACE.high / 2 };
/** the point's patch in the picture: its width (px), as long as the point's paint is, so its border keeps its width */
const TIP_PX = Math.round((ARM.point - TIP.into - TIP.short) * FACE.px);

/** How long an arm naming `name` is (m). */
const armLong = (name: string): number =>
  Math.max(ARM.least, ARM.back + FACE_FROM + name.length * ARM.perLetter + FACE_GAP + ARM.point);

/** A pointed board, `long` m from its back end at x = -ARM.back to its point, its faces ±z. */
function boardGeometry(long: number): THREE.BufferGeometry {
  const h = ARM.high / 2, x0 = -ARM.back, x1 = long - ARM.back - ARM.point, x2 = long - ARM.back;
  const shape = new THREE.Shape();
  shape.moveTo(x0, -h); shape.lineTo(x1, -h); shape.lineTo(x2, 0); shape.lineTo(x1, h); shape.lineTo(x0, h); shape.lineTo(x0, -h);
  const g = new THREE.ExtrudeGeometry(shape, { depth: ARM.thick, bevelEnabled: false });
  g.translate(0, 0, -ARM.thick / 2);
  return g;
}

/** Every arm's name painted into one picture, a row each (`rows`: each one's place in it, as shares). */
function paintAll(arms: { name: string; wide: number }[]): { map: THREE.CanvasTexture; rows: Row[]; tip: Row } {
  const rowH = Math.round(FACE.high * FACE.px);
  const width = Math.min(2048, Math.max(TIP_PX, ...arms.map((a) => Math.round(a.wide * FACE.px))));
  // (a row a name, and under them the points' patch)
  const canvas = canvasOf(width, rowH * (arms.length + 1));
  const c = ctx2d(canvas);
  const rows = arms.map((arm, i) => {
    const w = Math.min(width, Math.round(arm.wide * FACE.px));
    c.save();
    c.translate(0, i * rowH);
    c.beginPath();
    c.rect(0, 0, w, rowH);
    c.clip();
    paintBoard(c, w, rowH, arm.name, false);
    c.restore();
    // (v up the picture: the first row is its top)
    return { v0: 1 - ((i + 1) * rowH) / canvas.height, v1: 1 - (i * rowH) / canvas.height, u1: w / width };
  });
  c.save();
  c.translate(0, arms.length * rowH);
  paintTip(c, TIP_PX, rowH);
  c.restore();
  const tip = { v0: 0, v1: rowH / canvas.height, u1: TIP_PX / width };
  const map = textureFromCanvas(canvas);
  map.anisotropy = 4;
  return { map, rows, tip };
}

/** An arm's point painted `w` by `h` px, its face's paint run on: the board's ivory from the patch's left side to the
 *  middle of its right, its border's dark along its two slanting edges (the triangle `tipGeometry` lays it on; the
 *  side it meets the face on is open, as the face's end is). */
function paintTip(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.fillStyle = boardGround(c, h);
  c.fillRect(0, 0, w, h);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(w, h / 2);
  c.lineTo(0, h);
  // (stroked on the triangle's own edges, twice the border's width: the half inside it shows)
  c.strokeStyle = PAINT.ink;
  c.lineWidth = boardBand(h) * 2;
  c.lineJoin = 'miter';
  c.stroke();
}

/** where a row of the picture lies in it, as shares (v up it, u from its left) */
interface Row { v0: number; v1: number; u1: number }

/** An arm's painted point on its board `long` m long, the picture's `tip` patch on it, facing +z (or -z: `back`). */
function tipGeometry(long: number, tip: Row, back: boolean): THREE.BufferGeometry {
  const base = long - ARM.back - ARM.point + TIP.into, end = long - ARM.back - TIP.short;
  const z = ARM.thick / 2 + 0.002;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([base, TIP.half, z, base, -TIP.half, z, end, 0, z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, tip.v1, 0, tip.v0, tip.u1, (tip.v0 + tip.v1) / 2], 2));
  // (the back's mirrored through the board: mirrored, it faces -z)
  if (back) g.scale(1, 1, -1);
  g.computeVertexNormals();
  return g;
}

/** A face of an arm, its picture's row on it, `wide` m along the board from its back, facing +z (or -z: `back`). */
function faceGeometry(wide: number, row: Row, back: boolean): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(wide, FACE.high);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * row.u1, row.v0 + uv.getY(i) * (row.v1 - row.v0));
  // (the back face turned round about its middle, so its name reads from that side too)
  if (back) g.rotateY(Math.PI);
  return g.translate(FACE_FROM + wide / 2, 0, (back ? -1 : 1) * (ARM.thick / 2 + 0.002));
}

/** The village's signposts built into `scene`, each post's circle into `obstacles`. Returns every arm as built. */
export function buildSignposts(scene: THREE.Object3D, M: SignpostMats, obstacles: Obstacle[]): BuiltArm[] {
  const all = SIGNPOSTS.flatMap((post) => post.arms.map((arm) => ({ post, arm, long: armLong(arm.name) })));
  const faceWide = (long: number): number => long - ARM.back - ARM.point + TIP.into - FACE_FROM;
  const { map, rows, tip } = paintAll(all.map(({ arm, long }) => ({ name: arm.name, wide: faceWide(long) })));
  const faces = paintedFace(M.face(map));
  const built: BuiltArm[] = [];
  let row = 0;
  for (const post of SIGNPOSTS) {
    const [x, z] = post.at;
    const g = new THREE.Group();
    g.position.set(x, groundHeight(x, z), z);
    scene.add(g);
    const solid = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = g): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    solid(boxWithUV(POST.foot, POST.footHigh, POST.foot, 0.5).translate(0, POST.footHigh / 2, 0), M.foot);
    solid(boxWithUV(POST.wide, POST.high, POST.wide, 0.5, true).translate(0, POST.high / 2, 0), M.post);
    // (its cap: a little pyramid, so rain runs off it)
    solid(new THREE.ConeGeometry(POST.cap / Math.SQRT2, 0.12, 4).rotateY(Math.PI / 4).translate(0, POST.high + 0.06, 0), M.post);
    post.arms.forEach((arm, i) => {
      const long = armLong(arm.name);
      const way = Math.atan2(-(arm.to[1] - z), arm.to[0] - x);
      const y = ARM.top - i * ARM.drop;
      const group = new THREE.Group();
      group.position.set(0, y, 0);
      group.rotation.y = way;
      g.add(group);
      // (each arm a hair off the post's middle, alternately, so no two cross in one plane)
      solid(boardGeometry(long).translate(0, 0, (i % 2 ? -1 : 1) * 0.004), M.board, group);
      const wide = faceWide(long);
      const aside = (i % 2 ? -1 : 1) * 0.004;
      for (const back of [false, true]) {
        for (const geometry of [faceGeometry(wide, rows[row], back), tipGeometry(long, tip, back)]) {
          const face = new THREE.Mesh(geometry.translate(0, 0, aside), faces);
          face.receiveShadow = true;
          group.add(face);
        }
      }
      built.push({ post, name: arm.name, way, y, group, long });
      row++;
    });
    obstacles.push({ x, z, r: POST.foot / 2 + 0.05, h: POST.high });
  }
  return built;
}
