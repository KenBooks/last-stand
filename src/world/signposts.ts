// The village's signposts (data/signposts.ts says where and what each arm names): a timber post on a stone foot, a cap
// over it, and its arms, pointed boards nailed across it at three heights, each pointing at where its way leads and
// painted on both faces with the name (`paintArm`). Every arm's name is painted into one picture, so all their faces are
// one material: a copy of the place's free-standing planks with its picture (the same program). It stands free (`prop`:
// it thins while it hides him), still, and in the obstacles.
//
// Its arms are made to be read from afar, as the player first meets them from the game's view above (from Viktor, of
// the first ones, painted as the houses' dark signs with thin gilt letters: "signs need better visibility at the
// distance... maybe bolder text, different wood grain"): painted boards, ivory, each name lettered plain and heavy in
// dark paint, filling the board, on taller and longer arms, their faces flat (`paintArm`, `flatFace`).
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
/** the arms' paint: the board's ivory at its top and foot, its brush streaks, and the dark its border and letters are
 *  painted in */
const PAINT = { top: '#d8cbac', foot: '#c4b592', streak: '90,70,40', ink: '#1c140c' };
/** the most light an arm's face gives back (a luminance): well under the bloom's threshold, 0.9 (`UnrealBloomPass` in
 *  core/renderer.ts, `bloom` in core/webgpu.ts). From Kenneth's look at night: the pale arm a hand's width from a
 *  street lamp was lit past it, bloomed into a white bar its name couldn't be read on, and the arm beside it nearly so;
 *  the dark boards before never reached it. Capped, the board is lit as bright as it may be and its cut letters, dark,
 *  stay dark on it; the lamp is as it was. At 0.78 it no longer bloomed, but the night's adaptation still lit it near
 *  white and thinned its letters; at 0.35 it reads at midnight, and the sun at noon never lights a board that far (its
 *  pictures at 0.35 and 0.5 alike), so only a lamp's near side is held. */
const FACE_MOST = 0.35;
/** the painted face's roughness: a dull, weathered paint, no sheen to catch a lamp */
const FACE_ROUGH = 0.92;

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

/** An arm's face `w` by `h` px painted with `name`, as a street sign is: a flat painted board, ivory, with faint brush
 *  streaks along it and a dark painted border, and the name lettered plain and heavy in the game's own sans (Alegreya
 *  Sans, bold capitals, a little apart), in dark paint. From Kenneth, of the boards before (pale wood of an open grain
 *  with knots, the names cut in Cinzel's heaviest): "try a different texture or something, the text is not easy to
 *  read": the grain and the knots ran through the letters, and the serifs blurred at a distance. */
function paintArm(c: CanvasRenderingContext2D, w: number, h: number, name: string): void {
  const rng = mulberry(name.length * 53 + name.charCodeAt(0));
  const ground = c.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, PAINT.top);
  ground.addColorStop(1, PAINT.foot);
  c.fillStyle = ground;
  c.fillRect(0, 0, w, h);
  // (its brush streaks: faint, along it, none strong enough to cross a letter)
  for (let k = 0; k < 24; k++) {
    c.strokeStyle = `rgba(${PAINT.streak},${0.04 + rng() * 0.05})`;
    c.lineWidth = 2 + rng() * 4;
    const y = rng() * h;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y + (rng() - 0.5) * 3);
    c.stroke();
  }
  // its border, painted dark, and a thin line inside it
  const band = Math.max(3, h * 0.07);
  c.strokeStyle = PAINT.ink;
  c.lineWidth = band;
  c.strokeRect(band / 2, band / 2, w - band, h - band);
  c.lineWidth = Math.max(1, h * 0.015);
  c.strokeRect(band * 1.9, band * 1.9, w - band * 3.8, h - band * 3.8);
  // the name, plain and heavy, as large as the board takes
  const text = name.toUpperCase();
  let size = h * 0.6;
  const font = (px: number): string => `700 ${px}px 'Alegreya Sans', 'Trebuchet MS', sans-serif`;
  const spaced = (px: number): void => {
    c.font = font(px);
    (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(px * 0.06).toFixed(1)}px`;
  };
  spaced(size);
  const room = w - band * 6;
  while (c.measureText(text).width > room && size > 8) spaced(size -= 2);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = PAINT.ink;
  c.fillText(text, w / 2, h / 2 + size * 0.05);
}

/** `m` painted flat: none of the planks' relief or roughness maps it was copied with, so the light lies even over the
 *  paint (the planks' grooves, at its picture's scale, rippled the light across the letters). */
function flatFace<M extends THREE.Material>(m: M): M {
  const standard = m as unknown as THREE.MeshStandardMaterial;
  if (standard.isMeshStandardMaterial) {
    standard.normalMap = null;
    standard.bumpMap = null;
    standard.roughnessMap = null;
    standard.roughness = FACE_ROUGH;
  }
  return m;
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
  const faces = underBloom(flatFace(M.face(map)));
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
