// The village's signposts (data/signposts.ts says where and what each arm names): a timber post on a stone foot, a cap
// over it, and its arms, pointed boards nailed across it at three heights, each pointing at where its way leads and
// painted on both faces with the name (`paintArm`). Every arm's name is painted into one picture, so all their faces are
// one material: a copy of the place's free-standing planks with its picture (the same program). It stands free (`prop`:
// it thins while it hides him), still, and in the obstacles.
//
// Its arms are made to be read from afar, as the player first meets them from the game's view above (from Viktor, of
// the first ones, painted as the houses' dark signs with thin gilt letters: "signs need better visibility at the
// distance... maybe bolder text, different wood grain"): pale weathered boards of an open grain, and each name cut in
// deep, in Cinzel's heaviest weight, dark into the pale wood, filling the board, on taller and longer arms.
import * as THREE from 'three';
import { SIGNPOSTS, type Signpost } from '../data/signposts';
import { canvasOf, ctx2d, textureFromCanvas } from '../core/textures';
import { boxWithUV } from './props';
import { groundHeight } from './ground';
import { mulberry } from '../util';
import type { Obstacle } from '../types';

/** what a signpost is made of: its post's timber, its arms' planks, its foot's stone, and the material its arms'
 *  faces are painted in (given their picture) */
export interface SignpostMats { post: THREE.Material; board: THREE.Material; foot: THREE.Material; face(map: THREE.Texture): THREE.Material }

/** the post: its width, height and cap, its stone foot's (m) */
const POST = { wide: 0.14, high: 2.75, cap: 0.22, foot: 0.34, footHigh: 0.16 };
/** an arm: its board's height and thickness, the top arm's height, the drop to each next, its point's length, how far
 *  back past the post it starts, its length for a letter of its name and at least (m) */
const ARM = { high: 0.4, thick: 0.04, top: 2.45, drop: 0.46, point: 0.22, back: 0.1, perLetter: 0.13, least: 1.2 };
/** the painted face on each side: its height on the board, and the picture's pixels a metre */
const FACE = { high: 0.34, px: 300 };
/** the arms' wood: its pale ground at its top and foot, its grain's dark and light streaks, its knots; the letters'
 *  cut and the edge round them */
// (a step under white: paler, the arm beside a lamp was lit past its letters at night)
const WOOD = { top: '#b09468', foot: '#92774e', dark: '64,44,24', light: '214,194,156', knot: '#4e3420' };
const CUT = { fill: '#1e120a', edge: 'rgba(250,236,204,.9)', shade: 'rgba(30,18,8,.55)' };

/** An arm as built: its post, the name it bears, the way it points in the world (rad about y, 0 along +x toward
 *  -z: `atan2(-dz, dx)`), its height, and its group (its +x the way it points, its faces facing ±z). */
export interface BuiltArm { post: Signpost; name: string; way: number; y: number; group: THREE.Object3D; long: number }

/** where an arm's painted face starts along it, clear of the post (m from the post's middle), and the gap it leaves
 *  before the point (from the first: a face from behind the post ran its name under it and up to the point) */
const FACE_FROM = POST.wide / 2 + 0.03, FACE_GAP = 0.05;

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
    paintArm(c, w, rowH, arm.name);
    c.restore();
    // (v up the picture: the first row is its top)
    return { v0: 1 - ((i + 1) * rowH) / canvas.height, v1: 1 - (i * rowH) / canvas.height, u1: w / width };
  });
  const map = textureFromCanvas(canvas);
  map.anisotropy = 4;
  return { map, rows };
}

/** An arm's face `w` by `h` px painted with `name`: pale weathered wood of an open grain, with a knot or two, a dark
 *  edge, and the name cut deep in Cinzel's heaviest weight, filling the board: dark in the pale wood, a pale lip round
 *  each letter where the cut catches the light. Made to be read from afar (the houses' signs, `paintSign` in door.ts,
 *  are dark boards with thin gilt letters, read up close). */
function paintArm(c: CanvasRenderingContext2D, w: number, h: number, name: string): void {
  const rng = mulberry(name.length * 53 + name.charCodeAt(0));
  const ground = c.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, WOOD.top);
  ground.addColorStop(1, WOOD.foot);
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  // (its grain: long streaks along it, wavering round its knots)
  const knots = Array.from({ length: 1 + Math.floor(rng() * 2) }, () => ({ x: w * (0.1 + rng() * 0.8), y: h * (0.25 + rng() * 0.5) }));
  for (let k = 0; k < 60; k++) {
    c.strokeStyle = `rgba(${rng() < 0.6 ? WOOD.dark : WOOD.light},${0.18 + rng() * 0.3})`;
    c.lineWidth = 1 + rng() * 2.5;
    const y = rng() * h, bow = (rng() - 0.5) * h * 0.12;
    c.beginPath();
    c.moveTo(0, y);
    for (const knot of knots) {
      const off = Math.sign(y - knot.y || 1) * Math.max(0, h * 0.18 - Math.abs(y - knot.y)) * 0.6;
      c.quadraticCurveTo(knot.x - h * 0.3, y + bow, knot.x, y + off);
    }
    c.quadraticCurveTo(w * 0.8, y - bow, w, y + (rng() - 0.5) * 4);
    c.stroke();
  }
  for (const knot of knots) {
    c.fillStyle = WOOD.knot;
    c.beginPath();
    c.ellipse(knot.x, knot.y, h * 0.07, h * 0.04, 0, 0, Math.PI * 2);
    c.fill();
  }
  // its edge, worn dark
  c.strokeStyle = CUT.fill;
  c.lineWidth = Math.max(3, h * 0.05);
  c.strokeRect(0, 0, w, h);
  // the name cut in: a pale lip round it, its shadow, then the cut itself, dark
  let size = h * 0.64;
  const font = (px: number): string => `900 ${px}px 'Cinzel', Georgia, serif`;
  c.font = font(size);
  const room = w - h * 0.5;
  while (c.measureText(name).width > room && size > 8) c.font = font(size -= 2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const x = w / 2, y = h / 2 + size * 0.04;
  c.lineJoin = 'round';
  c.strokeStyle = CUT.edge;
  c.lineWidth = Math.max(2, size * 0.12);
  c.strokeText(name, x, y);
  c.fillStyle = CUT.shade;
  c.fillText(name, x + size * 0.03, y + size * 0.04);
  c.fillStyle = CUT.fill;
  c.fillText(name, x, y);
}

/** A face of an arm, its picture's row on it, `wide` m along the board from its back, facing +z (or -z: `back`). */
function faceGeometry(wide: number, row: { v0: number; v1: number; u1: number }, back: boolean): THREE.BufferGeometry {
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
  const faceWide = (long: number): number => long - ARM.back - FACE_FROM - FACE_GAP - ARM.point;
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
