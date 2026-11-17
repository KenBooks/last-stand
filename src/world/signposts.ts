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
import { tsl } from '../core/webgpu';
import type { OwnLooks } from '../core/shaderPorts';
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
const CUT = { fill: '#1e120a', shade: 'rgba(30,18,8,.5)' };
/** the most light an arm's face gives back (a luminance): well under the bloom's threshold, 0.9 (`UnrealBloomPass` in
 *  core/renderer.ts, `bloom` in core/webgpu.ts). From Kenneth's look at night: the pale arm a hand's width from a
 *  street lamp was lit past it, bloomed into a white bar its name couldn't be read on, and the arm beside it nearly so;
 *  the dark boards before never reached it. Capped, the board is lit as bright as it may be and its cut letters, dark,
 *  stay dark on it; the lamp is as it was. At 0.78 it no longer bloomed, but the night's adaptation still lit it near
 *  white and thinned its letters; at 0.35 it reads at midnight, and the sun at noon never lights a board that far (its
 *  pictures at 0.35 and 0.5 alike), so only a lamp's near side is held. */
const FACE_MOST = 0.35;

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
 *  edge, and the name cut deep in Cinzel's heaviest weight, filling the board, dark in the pale wood, its strokes
 *  thickened. Made to be read from afar (the houses' signs, `paintSign` in door.ts,
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
  // the name cut in, its strokes thickened by an outline of the same dark (a pale lip round each letter, lit as bright
  // as the board, thinned the letters to hairlines by a lamp at night), its shadow under it
  let size = h * 0.64;
  const font = (px: number): string => `900 ${px}px 'Cinzel', Georgia, serif`;
  c.font = font(size);
  const room = w - h * 0.5;
  while (c.measureText(name).width > room && size > 8) c.font = font(size -= 2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const x = w / 2, y = h / 2 + size * 0.04;
  c.lineJoin = 'round';
  c.fillStyle = CUT.shade;
  c.fillText(name, x + size * 0.03, y + size * 0.04);
  c.strokeStyle = CUT.fill;
  c.lineWidth = Math.max(2, size * 0.07);
  c.strokeText(name, x, y);
  c.fillStyle = CUT.fill;
  c.fillText(name, x, y);
}

/** `m` lit no brighter than `FACE_MOST`: what it gives back scaled down to that luminance where it would be more (its
 *  hue kept), on WebGL by a line after its output (its program's key told), on WebGPU by its output node. */
function underBloom<M extends THREE.Material>(m: M): M {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  const most = FACE_MOST.toFixed(3);
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      { float faceLit = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        if (faceLit > ${most}) gl_FragColor.rgb *= ${most} / faceLit; }`);
  };
  m.customProgramCacheKey = () => `${key}|underBloom`;
  (m as unknown as OwnLooks).webgpuLooks = (converted) => {
    const out = tsl.output, lit = tsl.dot(out.rgb, tsl.vec3(0.2126, 0.7152, 0.0722));
    converted.outputNode = tsl.vec4(out.rgb.mul(tsl.min(1, tsl.float(FACE_MOST).div(tsl.max(lit, 1e-4)))), out.a);
  };
  return m;
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
  const faces = underBloom(M.face(map));
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
