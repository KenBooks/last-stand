// The village's signposts (data/signposts.ts says where and what each arm names): a timber post on a stone foot, a cap
// over it, and its arms, pointed boards nailed across it at three heights, each pointing at where its way leads and
// painted on both faces with the name, as the houses' signs are (`paintSign` in door.ts). Every arm's name is painted
// into one picture, so all their faces are one material: a copy of the place's free-standing planks with its picture
// (the same program). It stands free (`prop`: it thins while it hides him), still, and in the obstacles.
import * as THREE from 'three';
import { SIGNPOSTS, type Signpost } from '../data/signposts';
import { canvasOf, ctx2d, textureFromCanvas } from '../core/textures';
import { boxWithUV } from './props';
import { groundHeight } from './ground';
import { paintSign } from './door';
import type { Obstacle } from '../types';

/** what a signpost is made of: its post's timber, its arms' planks, its foot's stone, and the material its arms'
 *  faces are painted in (given their picture) */
export interface SignpostMats { post: THREE.Material; board: THREE.Material; foot: THREE.Material; face(map: THREE.Texture): THREE.Material }

/** the post: its width, height and cap, its stone foot's (m) */
const POST = { wide: 0.14, high: 2.75, cap: 0.22, foot: 0.34, footHigh: 0.16 };
/** an arm: its board's height and thickness, the top arm's height, the drop to each next, its point's length, how far
 *  back past the post it starts, its length for a letter of its name and at least (m) */
const ARM = { high: 0.3, thick: 0.035, top: 2.4, drop: 0.36, point: 0.18, back: 0.1, perLetter: 0.085, least: 1.0 };
/** the painted face on each side: its height on the board, and the picture's pixels a metre */
const FACE = { high: 0.24, px: 300 };

/** An arm as built: its post, the name it bears, the way it points in the world (rad about y, 0 along +x toward
 *  -z: `atan2(-dz, dx)`), its height, and its group (its +x the way it points, its faces facing ±z). */
export interface BuiltArm { post: Signpost; name: string; way: number; y: number; group: THREE.Object3D; long: number }

/** How long an arm naming `name` is (m). */
const armLong = (name: string): number => Math.max(ARM.least, ARM.back + name.length * ARM.perLetter + ARM.point + 0.1);

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
function paintAll(arms: { name: string; wide: number }[]): { map: THREE.CanvasTexture; rows: { v0: number; v1: number; u1: number }[] } {
  const rowH = Math.round(FACE.high * FACE.px);
  const width = Math.min(2048, Math.max(...arms.map((a) => Math.round(a.wide * FACE.px))));
  const canvas = canvasOf(width, rowH * arms.length);
  const c = ctx2d(canvas);
  const rows = arms.map((arm, i) => {
    const w = Math.min(width, Math.round(arm.wide * FACE.px));
    c.save();
    c.translate(0, i * rowH);
    c.beginPath();
    c.rect(0, 0, w, rowH);
    c.clip();
    paintSign(c, w, rowH, arm.name);
    c.restore();
    // (v up the picture: the first row is its top)
    return { v0: 1 - ((i + 1) * rowH) / canvas.height, v1: 1 - (i * rowH) / canvas.height, u1: w / width };
  });
  const map = textureFromCanvas(canvas);
  map.anisotropy = 4;
  return { map, rows };
}

/** A face of an arm, its picture's row on it, `wide` m along the board from its back, facing +z (or -z: `back`). */
function faceGeometry(wide: number, row: { v0: number; v1: number; u1: number }, back: boolean): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(wide, FACE.high);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * row.u1, row.v0 + uv.getY(i) * (row.v1 - row.v0));
  // (the back face turned round about its middle, so its name reads from that side too)
  if (back) g.rotateY(Math.PI);
  return g.translate(-ARM.back + 0.06 + wide / 2, 0, (back ? -1 : 1) * (ARM.thick / 2 + 0.002));
}

/** The village's signposts built into `scene`, each post's circle into `obstacles`. Returns every arm as built. */
export function buildSignposts(scene: THREE.Object3D, M: SignpostMats, obstacles: Obstacle[]): BuiltArm[] {
  const all = SIGNPOSTS.flatMap((post) => post.arms.map((arm) => ({ post, arm, long: armLong(arm.name) })));
  const faceWide = (long: number): number => long - ARM.back - ARM.point - 0.12;
  const { map, rows } = paintAll(all.map(({ arm, long }) => ({ name: arm.name, wide: faceWide(long) })));
  const faces = M.face(map);
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
      for (const back of [false, true]) {
        const face = new THREE.Mesh(faceGeometry(wide, rows[row], back).translate(0, 0, (i % 2 ? -1 : 1) * 0.004), faces);
        face.receiveShadow = true;
        group.add(face);
      }
      built.push({ post, name: arm.name, way, y, group, long });
      row++;
    });
    obstacles.push({ x, z, r: POST.foot / 2 + 0.05, h: POST.high });
  }
  return built;
}
