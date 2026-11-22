// The village's library (data/houses/library.ts, its room found by world/houses.ts with every other house's in this folder): tall cases of
// books down every wall, their spines painted on canvases (each book an instance of one of a few spines, its colour its
// own), some leaning, some stacked flat, a few lying open; a rolling ladder; the Codex of Wardenhollow open on its
// lectern before the back wall between two candle stands (used, it opens the in-game guide); reading desks with candles,
// open books, scrolls and a quill; a globe; a hearth with an armchair before it; rugs; the front windows lit warm from
// outside and dust drifting by them. As every room: 10 point lights, two casting (the hearth and the chandelier).
import * as THREE from 'three';
import { HOUSES, type RoomId } from '../../data/houses';
import type { Obstacle } from '../../types';
import { canvasOf, ctx2d, textureFromCanvas } from '../../core/textures';
import { mulberry, rand } from '../../util';
import { particles, col } from '../../fx/particles';
import { G } from '../../state';
import { buildScholar, type Scholar } from '../../entities/models/scholar';
import { blockGeometry, bookShape, printGeometry, type BookShape } from '../../entities/models/book';
import { SCHOLAR_DESK } from '../../data/houses/library';
import { chairSeat } from '../seats';
import {
  BODY, CANDLE, CROSS_UNDER, DISPLAY, LANTERN, ROOM_LOOK, begin, box, candle, chandelier, drum, finish, framed, hearth, inkedPage, lantern, onWall,
  parchment, rug, stool, table, writing, keepApart, type Build, type Furniture, type Mats, type Room,
} from '../rooms';

/** the library's light: as every room's, its sky's share warmer and fuller, for the books down every wall to read
 *  (at the rooms' own, the cases stood as dark walls) */
const libraryLook = (): typeof ROOM_LOOK =>
  ({ ...ROOM_LOOK, hemi: { sky: 0xa8845a, ground: 0x4a3220, intensity: 0.95 }, envIntensity: 0.18 });
// (made as the room is built, never as this module loads: world/rooms.ts imports it, and its `ROOM_LOOK` isn't made yet
// then)

/** how many spine designs the books share, and each one's canvas (px) */
const SPINES = 5;
const SPINE_PX = { w: 64, h: 256 };
/** the books' colours: leathers and cloths, deep and warm (each a spine's paint is multiplied by) */
const BOOK_COLOURS = [0x7a1e16, 0x2a4a2a, 0x24304e, 0x6a4418, 0x4a1c3a, 0x8a6a2a, 0x3a3030, 0x5a2a10, 0x2a4a4a, 0x8a3a1a];

/** Every book of the room: a matrix and a colour for each of the spine designs (one instanced mesh each). */
type Shelving = { matrices: THREE.Matrix4[]; colours: THREE.Color[] }[];

/** A spine's canvas: a pale leather the book's colour tints, its bands, ribs, label and title, by its design. */
function spineCanvas(design: number, seed: number): HTMLCanvasElement {
  const { w, h } = SPINE_PX;
  const c = canvasOf(w, h), cx = ctx2d(c), rng = mulberry(seed);
  cx.fillStyle = '#d8d0c4';
  cx.fillRect(0, 0, w, h);
  // (leather's grain, and its spine rounded: darker to its edges; the strip at u 0 left plain for the other faces)
  for (let k = 0; k < 500; k++) {
    cx.fillStyle = `rgba(60,40,30,${0.04 + rng() * 0.08})`;
    cx.fillRect(4 + rng() * (w - 4), rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
  const shade = cx.createLinearGradient(4, 0, w, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.35)'); shade.addColorStop(0.5, 'rgba(255,255,255,0.08)'); shade.addColorStop(1, 'rgba(0,0,0,0.35)');
  cx.fillStyle = shade;
  cx.fillRect(4, 0, w - 4, h);
  const gold = '#f4e4b0', dark = 'rgba(30,20,10,0.6)';
  const band = (y: number, t: number) => { cx.fillStyle = gold; cx.fillRect(4, y, w - 4, t); };
  const rib = (y: number) => { cx.fillStyle = dark; cx.fillRect(4, y, w - 4, 3); cx.fillStyle = 'rgba(255,255,255,0.25)'; cx.fillRect(4, y + 3, w - 4, 2); };
  const title = (y: number, rows: number) => {
    cx.fillStyle = gold;
    for (let r = 0; r < rows; r++) cx.fillRect(14 + rng() * 6, y + r * 9, w - 32 - rng() * 10, 3);
  };
  if (design === 0) { band(14, 5); band(24, 2); band(h - 30, 2); band(h - 22, 5); title(60, 3); }
  if (design === 1) { for (const y of [30, 80, 130, 180, 226]) rib(y); title(96, 2); }
  if (design === 2) {
    cx.fillStyle = '#efe4c8'; cx.fillRect(12, 50, w - 20, 60);
    cx.strokeStyle = '#3a2a1a'; cx.lineWidth = 2; cx.strokeRect(14, 52, w - 24, 56);
    cx.fillStyle = '#3a2a1a'; for (let r = 0; r < 3; r++) cx.fillRect(18, 64 + r * 12, w - 34, 3);
    band(h - 18, 4);
  }
  if (design === 3) { band(8, 3); band(h - 12, 3); cx.fillStyle = gold; cx.beginPath(); cx.arc(w / 2 + 2, h / 2, 9, 0, Math.PI * 2); cx.fill(); title(40, 2); }
  if (design === 4) { for (let y = 20; y < h - 10; y += 46) { band(y, 2); band(y + 6, 2); } }
  return c;
}

/** A book: a unit box, its spine (+z) taking the whole canvas up its height, every other face the plain strip. */
function bookGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (n.getZ(i) > 0.5) continue;
    uv.setXY(i, 0.02 + uv.getX(i) * 0.02, 0.4 + uv.getY(i) * 0.2);
  }
  return g;
}

/** The room's books drawn: an instanced mesh for each spine, every book its own matrix and colour. */
function shelve(g: THREE.Object3D, shelving: Shelving): void {
  const geometry = bookGeometry();
  shelving.forEach(({ matrices, colours }, design) => {
    if (!matrices.length) return;
    const map = textureFromCanvas(spineCanvas(design, 300 + design));
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.75 });
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, colours[i]); });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `library books ${design}`;
    g.add(mesh);
  });
}

/** A book put on the room's shelving: in `frame`'s space at `at`, sized `size` (thick, tall, deep), turned by `turn`. */
function addBook(shelving: Shelving, frame: THREE.Object3D, at: THREE.Vector3, size: THREE.Vector3, turn: THREE.Euler,
  rng: () => number): void {
  frame.updateMatrix();
  const local = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(turn), size);
  const design = (rng() * SPINES) | 0;
  shelving[design].matrices.push(local.premultiply(frame.matrix));
  shelving[design].colours.push(new THREE.Color(BOOK_COLOURS[(rng() * BOOK_COLOURS.length) | 0]).multiplyScalar(0.75 + rng() * 0.45));
}

/** A shelf's books from `from` to `to` along it (the case's frame, its shelf's top at `y`, `space` m clear over it):
 *  rows standing, now and then one leaning on the last, a stack laid flat, a gap, or a jar. */
function shelfOfBooks(g: THREE.Object3D, M: Mats, shelving: Shelving, frame: THREE.Object3D, from: number, to: number,
  y: number, space: number, rng: () => number): void {
  let at = from;
  while (at < to - 0.05) {
    const roll = rng();
    if (roll < 0.07 && to - at > 0.3) {
      // (a stack laid flat, spines out)
      const n = 2 + ((rng() * 4) | 0);
      const wide = 0.2 + rng() * 0.08;
      let h = y;
      for (let k = 0; k < n; k++) {
        const thick = 0.035 + rng() * 0.03;
        addBook(shelving, frame, new THREE.Vector3(at + wide / 2 + (rng() - 0.5) * 0.02, h + thick / 2, 0.16),
          new THREE.Vector3(thick, wide, 0.2 + rng() * 0.05), new THREE.Euler(0, (rng() - 0.5) * 0.15, Math.PI / 2), rng);
        h += thick;
      }
      at += wide + 0.03;
      continue;
    }
    if (roll < 0.1) {
      // (a little clay jar, or nothing)
      if (rng() < 0.5) {
        const jar = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.04, 0], [0.05, 0.05], [0.04, 0.11], [0.025, 0.13], [0.03, 0.15], [0, 0.15]]
          .map(([r, yy]) => new THREE.Vector2(r, yy)), 10), M.oak);
        jar.position.set(at + 0.06, y, 0.18);
        frame.add(jar);
      }
      at += 0.14;
      continue;
    }
    const thick = 0.03 + rng() * 0.045, tall = Math.min(space - 0.03, 0.17 + rng() * 0.16), deep = 0.17 + rng() * 0.08;
    const lean = rng() < 0.06 ? (0.18 + rng() * 0.22) : 0;
    addBook(shelving, frame, new THREE.Vector3(at + thick / 2 + lean * tall * 0.5, y + tall / 2 * Math.cos(lean), deep / 2 + 0.04),
      new THREE.Vector3(thick, tall, deep), new THREE.Euler(0, 0, -lean), rng);
    at += thick + 0.003 + lean * tall;
  }
  void g;
}

/** A tall bookcase against a wall (its frame, facing +z) at x, `w` wide and `high`: a plinth, a carved crown, its
 *  carcass and back, shelves every 36 cm, filled. */
function bookcase(g: THREE.Object3D, M: Mats, shelving: Shelving, frame: THREE.Object3D, x: number, w: number, high: number,
  rng: () => number, obstacles: Obstacle[]): void {
  const D = 0.4;
  // (circles along its front, where they stand in the room: a body is kept off the shelves, the wall behind them
  // being the room's own)
  frame.updateMatrix();
  for (let t = -w / 2 + 0.25; t <= w / 2 - 0.25 + 1e-6; t += 0.45) {
    const at = new THREE.Vector3(x + t, 0, 0.2).applyMatrix4(frame.matrix);
    obstacles.push({ x: at.x, z: at.z, r: 0.28, h: high });
  }
  box(frame, w + 0.06, 0.12, D + 0.04, x, 0, D / 2, M.timber);
  for (const sx of [-1, 1]) box(frame, 0.06, high, D, x + sx * (w / 2 - 0.03), 0, D / 2, M.panel);
  box(frame, w - 0.08, high, 0.02, x, 0, 0.012, M.timber);
  box(frame, w + 0.14, 0.08, D + 0.1, x, high, D / 2 + 0.02, M.timber);
  box(frame, w + 0.08, 0.06, D + 0.06, x, high - 0.06, D / 2 + 0.01, M.panel);
  const shelves = Math.floor((high - 0.2) / 0.36);
  for (let k = 0; k < shelves; k++) {
    const y = 0.12 + k * ((high - 0.18) / shelves);
    box(frame, w - 0.1, 0.03, D - 0.02, x, y, D / 2, M.panel);
    // (the shelf's lip, a hair proud)
    box(frame, w - 0.1, 0.035, 0.02, x, y, D - 0.005, M.timber);
    shelfOfBooks(g, M, shelving, frame, x - w / 2 + 0.07, x + w / 2 - 0.07, y + 0.03, (high - 0.18) / shelves - 0.04, rng);
  }
}

/** A rolling ladder leaning on a case (the case's frame), its foot `out` from the wall: two rails and rungs, a rail
 *  along the case's top it hangs from. */
function ladder(frame: THREE.Object3D, M: Mats, x: number, high: number, out: number): void {
  const l = new THREE.Group();
  l.position.set(x, 0, out);
  const lean = Math.atan2(out - 0.42, high);
  l.rotation.x = -lean;
  frame.add(l);
  const length = Math.hypot(high, out - 0.42);
  for (const sx of [-1, 1]) box(l, 0.05, length, 0.06, sx * 0.22, 0, 0, M.oak);
  for (let y = 0.3; y < length - 0.1; y += 0.32) box(l, 0.4, 0.035, 0.04, 0, y, 0, M.oak);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.2, 8).rotateZ(Math.PI / 2), M.brass);
  rail.position.set(x, high - 0.15, 0.46);
  frame.add(rail);
}

/** A globe on a turned wooden stand at (x, z): its sphere a map of seas and lands drawn on a canvas, a brass
 *  meridian round it, tilted. */
function globe(g: THREE.Object3D, M: Mats, x: number, z: number): void {
  const c = canvasOf(512, 256), cx = ctx2d(c), rng = mulberry(77);
  cx.fillStyle = '#2a4a5a'; cx.fillRect(0, 0, 512, 256);
  for (let k = 0; k < 2200; k++) { cx.fillStyle = `rgba(255,255,255,${rng() * 0.04})`; cx.fillRect(rng() * 512, rng() * 256, 2, 2); }
  // (lands: blobs of overlapping rings, parchment brown, inked round)
  for (let land = 0; land < 7; land++) {
    const lx = rng() * 512, ly = 50 + rng() * 156;
    for (let k = 0; k < 14; k++) {
      cx.fillStyle = '#c8a870';
      cx.beginPath(); cx.arc(lx + (rng() - 0.5) * 80, ly + (rng() - 0.5) * 40, 8 + rng() * 22, 0, Math.PI * 2); cx.fill();
    }
  }
  cx.strokeStyle = 'rgba(240,220,170,0.35)'; cx.lineWidth = 1;
  for (let y = 32; y < 256; y += 32) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(512, y); cx.stroke(); }
  for (let xx = 0; xx < 512; xx += 43) { cx.beginPath(); cx.moveTo(xx, 0); cx.lineTo(xx, 256); cx.stroke(); }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 20), new THREE.MeshStandardMaterial({ map: textureFromCanvas(c), roughness: 0.45 }));
  ball.position.set(x, 1.05, z);
  ball.rotation.set(0.41, 0.8, 0);
  ball.castShadow = true;
  g.add(ball);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.012, 6, 32), M.brass);
  ring.position.copy(ball.position);
  ring.rotation.set(0, 0.8, 0.41);
  g.add(ring);
  const profile = [[0, 0], [0.2, 0], [0.2, 0.04], [0.08, 0.08], [0.05, 0.2], [0.07, 0.4], [0.04, 0.6], [0.06, 0.7], [0.05, 0.75], [0, 0.75]];
  const stand = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 14), M.oak);
  stand.position.set(x, 0, z);
  stand.castShadow = true;
  g.add(stand);
}

/** how thick an open book's cover is (m): its pages lie on it */
const COVER = 0.012;

/** An open book as built: its two halves' blocks of pages (each in its own frame, x from the spine to its outer edge:
 *  models/book.ts), their printed pages, and its shape. */
interface OpenBook { blocks: THREE.Mesh[]; prints: THREE.Mesh[]; shape: BookShape }

/** A book lying open at (x, y, z) turned `turn`, `size` across: its cover, and each half a block of pages from its outer
 *  edge to the spine, curving down into the gutter, its printed page over it edge to spine (models/book.ts). (Two
 *  boxes with a print laid on each left a plain strip and a dark gap at the spine, from play.) */
function openBook(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, turn: number, size: number, seed: number): OpenBook {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = turn;
  g.add(b);
  const cover = new THREE.MeshStandardMaterial({ color: [0x5a1814, 0x1e3a24, 0x23304e][seed % 3], roughness: 0.6 });
  box(b, size * 1.02, COVER, size * 0.7, 0, 0, 0, cover);
  const shape = bookShape(size), block = blockGeometry(shape), print = printGeometry(shape);
  const blocks: THREE.Mesh[] = [], prints: THREE.Mesh[] = [];
  for (const sx of [1, -1]) {
    // (the -x half is the +x half turned round the spine: its print's uv turned round with it, so it reads the same way)
    const half = new THREE.Mesh(block, M.paper);
    half.position.y = COVER;
    half.rotation.y = sx > 0 ? 0 : Math.PI;
    half.castShadow = half.receiveShadow = true;
    b.add(half);
    const page = writing(M, 192, 256, 1, 1);
    page.write((cx, w, h) => inkedPage(cx, w, h, sx < 0, seed * 7 + sx));
    const geo = sx > 0 ? print : print.clone();
    if (sx < 0) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i)); }
    page.mesh.geometry.dispose();
    page.mesh.geometry = geo;
    half.add(page.mesh);
    blocks.push(half);
    prints.push(page.mesh);
  }
  return { blocks, prints, shape };
}

/** A reading desk at (x, z), turned `turn`: its top, legs and a drawer front; an open book, a stack, a quill in its
 *  inkwell, scrolls, and a candle (its light one of the room's ten); a stool at it. */
function readingDesk(g: THREE.Group, M: Mats, b: Build, x: number, z: number, turn: number, seed: number): void {
  const d = new THREE.Group();
  d.position.set(x, 0, z);
  d.rotation.y = turn;
  g.add(d);
  const temp = { obstacles: [] as typeof b.obstacles };
  table(d, M, 0, 0, 1.4, 0.8, temp.obstacles, 0.78);
  box(d, 0.5, 0.12, 0.02, 0, 0.6, 0.41, M.timber);
  drum(d, 0.015, 0.015, 0.02, 0, 0.66, 0.43, M.brass, 6);
  openBook(d, M, -0.15, 0.78, 0.02, 0.1, 0.42, seed);
  for (let k = 0; k < 4; k++) box(d, 0.26 - k * 0.01, 0.05, 0.19, 0.5, 0.78 + k * 0.05, -0.18, M.leather).rotation.y = (k % 2 ? 0.2 : -0.1);
  drum(d, 0.03, 0.035, 0.05, 0.35, 0.78, 0.22, M.dark, 10);
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.8 }));
  quill.position.set(0.32, 0.92, 0.2);
  quill.rotation.set(0.3, 0, 0.35);
  d.add(quill);
  for (const [dx, r] of [[-0.55, 0.03], [-0.5, 0.035]]) {
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 10).rotateX(Math.PI / 2), M.paper);
    scroll.position.set(dx, 0.78 + r, -0.12 + dx * 0.1);
    scroll.rotation.y = 0.3;
    d.add(scroll);
  }
  drum(d, 0.05, 0.06, 0.02, -0.5, 0.78, 0.22, M.brass, 10);
  candle(d, M, -0.5, 0.8, 0.22, 0.2, CANDLE);
  stool(d, M, 0, 0.75, 0.5);
  // (its circles where they stand in the room)
  d.updateMatrix();
  for (const o of temp.obstacles) {
    const at = new THREE.Vector3(o.x, 0, o.z).applyMatrix4(d.matrix);
    b.obstacles.push({ x: at.x, z: at.z, r: o.r, h: o.h });
  }
}

/** an armchair's width (m): wide enough for a hero sat in it to rest a weapon or a shield beside his thigh within its
 *  arms (at 0.8 m, from review, every one he set down went through an arm) */
const CHAIR_WIDE = 1.0;

/** An armchair at (x, z) turned `turn`: a deep seat, a high back, rolled arms, all in red cloth on dark legs. */
function armchair(g: THREE.Group, M: Mats, x: number, z: number, turn: number): Furniture {
  const a = new THREE.Group();
  a.position.set(x, 0, z);
  a.rotation.y = turn;
  g.add(a);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6a1a14, roughness: 0.9 });
  const half = CHAIR_WIDE / 2, arm = half - 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(a, 0.06, 0.18, 0.06, sx * (half - 0.06), 0, sz * 0.3, M.timber);
  box(a, CHAIR_WIDE, 0.22, 0.72, 0, 0.18, 0, cloth);
  const top = box(a, CHAIR_WIDE - 0.16, 0.12, 0.6, 0, 0.4, 0.04, cloth);
  box(a, CHAIR_WIDE, 0.75, 0.16, 0, 0.4, -0.32, cloth);
  for (const sx of [-1, 1]) {
    box(a, 0.14, 0.26, 0.7, sx * arm, 0.4, 0, cloth);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 12).rotateX(Math.PI / 2), cloth);
    roll.position.set(sx * arm, 0.68, 0);
    roll.castShadow = true;
    a.add(roll);
  }
  return { group: a, top };
}

/** the armchair's turn, and where on it a body sits: his hips behind its middle, back on the cushion (m: 8 cm ahead
 *  of it, from review, he sat perched on its front edge, his back well off its back), and how near its circle (round
 *  its arms and back) he comes to sit (m: at `SEAT.near` his feet stood 0.7 m out) */
const CHAIR_TURN = -Math.PI / 2 - 0.5;
const CHAIR = { sit: -0.06, near: -0.04 };

/** A cabinet of pigeonholes against a wall (its frame) at x, each holding a rolled scroll or two. */
function scrollRack(frame: THREE.Object3D, M: Mats, x: number, rng: () => number): void {
  const W = 1.0, H = 1.2, D = 0.36, cols = 5, rows = 5;
  box(frame, W, H, 0.02, x, 0, 0.01, M.timber);
  for (let c = 0; c <= cols; c++) box(frame, 0.025, H, D, x - W / 2 + (c * W) / cols, 0, D / 2, M.panel);
  for (let r = 0; r <= rows; r++) box(frame, W, 0.025, D, x, (r * H) / rows - (r === rows ? 0.025 : 0), D / 2, M.panel);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const n = rng() < 0.2 ? 0 : rng() < 0.6 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const rad = 0.03 + rng() * 0.015;
        const scroll = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, D - 0.02, 8).rotateX(Math.PI / 2), M.paper);
        scroll.position.set(x - W / 2 + ((c + 0.5) * W) / cols + (k - (n - 1) / 2) * 0.07, (r * H) / rows + 0.025 + rad, D / 2 + 0.02);
        frame.add(scroll);
      }
    }
  }
}

/** The library's sign over the back wall's alcove: its name in gold on dark boards. */
function nameBoard(frame: THREE.Object3D, M: Mats, y: number): void {
  const board = writing(M, 768, 160, 2.0, 0.42);
  board.write((cx, w, h) => {
    const wood = cx.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, '#3a2414'); wood.addColorStop(1, '#22140a');
    cx.fillStyle = wood; cx.fillRect(0, 0, w, h);
    cx.strokeStyle = '#c99a48'; cx.lineWidth = 6; cx.strokeRect(10, 10, w - 20, h - 20);
    cx.fillStyle = '#e8c070'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `700 ${Math.round(h * 0.42)}px ${DISPLAY}`;
    cx.fillText('THE LIBRARY', w / 2, h * 0.44, w - 60);
    cx.font = `italic 500 ${Math.round(h * 0.17)}px ${BODY}`;
    cx.fillStyle = '#c8a060';
    cx.fillText('All that is known of foes, heroes and the ways of war', w / 2, h * 0.78, w - 60);
  });
  framed(frame, M, board, 0, y, 2.0, 0.42);
}

/** The Codex of Wardenhollow: a great book open on a carved lectern on a dais of two steps, brass clasps on its
 *  boards, its pages inked; a tall candle stand either side (each light one of the room's ten). Its circles. */
function codex(g: THREE.Group, M: Mats, b: Build, x: number, z: number): void {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  g.add(c);
  drum(c, 0.85, 0.9, 0.06, 0, 0, 0, M.hearthStone, 24);
  const profile = [[0, 0], [0.22, 0], [0.22, 0.05], [0.12, 0.1], [0.09, 0.3], [0.11, 0.5], [0.08, 0.7], [0.12, 0.85], [0.16, 0.92], [0, 0.92]];
  const column = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16), M.panel);
  column.position.y = 0.06;
  column.castShadow = true;
  c.add(column);
  for (const sx of [-1, 1]) box(c, 0.05, 0.2, 0.3, sx * 0.2, 0.86, 0, M.timber).rotation.z = sx * 0.4;
  const desk = new THREE.Group();
  desk.position.y = 1.05;
  desk.rotation.x = 0.3;
  c.add(desk);
  box(desk, 0.95, 0.04, 0.62, 0, -0.04, 0, M.timber);
  box(desk, 0.95, 0.07, 0.04, 0, -0.04, 0.31, M.panel);
  const boards = new THREE.MeshStandardMaterial({ color: 0x3a1410, roughness: 0.55 });
  box(desk, 0.86, 0.02, 0.56, 0, 0, 0, boards);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(desk, 0.06, 0.024, 0.06, sx * 0.41, 0.002, sz * 0.26, M.brass).castShadow = false;
  for (const sx of [-1, 1]) {
    const stack = box(desk, 0.4, 0.07, 0.52, sx * 0.205, 0.015, 0, M.paper);
    stack.rotation.z = -sx * 0.08;
    const page = writing(M, 256, 340, 0.39, 0.51);
    page.mesh.rotation.set(-Math.PI / 2, 0, 0);
    page.mesh.rotation.y = -sx * 0.08;
    page.mesh.position.set(sx * 0.205, 0.088 + 0.012, 0);
    page.write((cx, w, h) => inkedPage(cx, w, h, sx < 0, sx < 0 ? 91 : 93));
    desk.add(page.mesh);
  }
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.28), new THREE.MeshStandardMaterial({ color: 0x9a1a1a, side: THREE.DoubleSide }));
  ribbon.position.set(0.02, 0.04, 0.33);
  ribbon.rotation.set(-0.6, 0, 0);
  desk.add(ribbon);
  for (const sx of [-1, 1]) {
    drum(c, 0.14, 0.17, 0.05, sx * 0.85, 0.06, 0.2, M.brass, 12);
    drum(c, 0.022, 0.026, 1.35, sx * 0.85, 0.11, 0.2, M.brass, 8);
    drum(c, 0.08, 0.04, 0.04, sx * 0.85, 1.46, 0.2, M.brass, 12);
    candle(c, M, sx * 0.85, 1.5, 0.2, 0.22, CANDLE);
  }
  b.obstacles.push({ x, z, r: 0.55, h: 1.3 });
  for (const sx of [-1, 1]) b.obstacles.push({ x: x + sx * 0.85, z: z + 0.2, r: 0.16, h: 1.6 });
}

/** Whether Brother Hollis is talked to now (main.ts sets it as his dialogue opens and closes, ui/talk.ts): he looks up
 *  and holds the hero's eye. */
export const scholarTalk = { talking: false };

/** Brother Hollis's reading table (data/houses.ts `SCHOLAR_DESK`, turned to face the room): a chair with a high back
 *  where he sits, the table before it, his book open on it facing him, a candle (its light one of the room's ten, the
 *  reading desk's he took the place of), a stack of books, his inkwell and quill, a scroll. He himself is seated later
 *  (`seat`): his head and hands are the heroes', made in workers as the game loads, after the rooms are built. */
function scholarDesk(g: THREE.Group, M: Mats, b: Build): () => Scholar {
  const { x, z, turn } = SCHOLAR_DESK;
  const d = new THREE.Group();
  d.position.set(x, 0, z);
  d.rotation.y = turn;
  g.add(d);
  // (its things are read by name, `lab scholar`, and he sits in it)
  keepApart(d);
  const temp: typeof b.obstacles = [];
  /** his table (in the desk's frame: its middle ahead of the chair, its size, its top's height), and where he sits */
  const TABLE = { z: 0.62, w: 1.2, d: 0.72, top: 0.76 }, SAT = -0.03;
  table(d, M, 0, TABLE.z, TABLE.w, TABLE.d, temp, TABLE.top);
  // (his chair: a seat, legs, a high back of slats under a carved rail)
  box(d, 0.48, 0.05, 0.46, 0, 0.41, -0.04, M.oak);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(d, 0.05, 0.41, 0.05, sx * 0.2, 0, -0.04 + sz * 0.19, M.timber);
  for (const sx of [-1, 1]) box(d, 0.055, 0.72, 0.05, sx * 0.21, 0.46, -0.25, M.timber);
  for (let k = -2; k <= 2; k++) box(d, 0.04, 0.5, 0.02, k * 0.07, 0.52, -0.255, M.panel);
  box(d, 0.5, 0.08, 0.06, 0, 1.12, -0.25, M.oak);
  // (his book, open towards him: turned half round, its first page on his left; out on the table a forearm's length
  // from its edge, where his elbows rest)
  const SIZE = 0.44, BOOK = { y: 0.76, z: 0.62 };
  const book = openBook(d, M, 0, BOOK.y, BOOK.z, Math.PI, SIZE, 5);
  // (beside it, his things: a stack of books, the candle on its dish, the inkwell and quill, a scroll)
  for (let k = 0; k < 4; k++) {
    const stacked = box(d, 0.26 - k * 0.015, 0.05, 0.19, 0.42, 0.76 + k * 0.05, 0.72, M.leather);
    stacked.rotation.y = (k % 2 ? 0.25 : -0.1);
    stacked.name = 'scholar desk books';
  }
  drum(d, 0.05, 0.06, 0.02, -0.4, 0.76, 0.78, M.brass, 10).name = 'scholar desk candle dish';
  candle(d, M, -0.4, 0.78, 0.78, 0.18, CANDLE);
  // (his inkwell and its quill in the table's far corner on his left, past his books, the quill leant away from him: by
  // his book, under where his left forearm rests and his hand goes as he turns a page, the quill stood up through his
  // sleeve, from play: "fix weird spike sticking through his arm")
  drum(d, 0.028, 0.032, 0.045, 0.48, 0.76, 0.9, M.dark, 10).name = 'scholar desk inkwell';
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.8 }));
  quill.position.set(0.51, 0.9, 0.94);
  quill.rotation.set(0.35, 0, -0.3);
  quill.name = 'scholar desk quill';
  d.add(quill);
  const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 10).rotateZ(Math.PI / 2), M.paper);
  scroll.position.set(-0.12, 0.79, 0.86);
  scroll.rotation.y = 0.2;
  scroll.name = 'scholar desk scroll';
  d.add(scroll);
  // (its circles where they stand in the room, and his chair's)
  d.updateMatrix();
  for (const o of [...temp, { x: 0, z: -0.05, r: 0.42, h: 1.2 }]) {
    const at = new THREE.Vector3(o.x, 0, o.z).applyMatrix4(d.matrix);
    b.obstacles.push({ x: at.x, z: at.z, r: o.r, h: o.h });
  }
  return () => {
    const table = { x0: -TABLE.w / 2, x1: TABLE.w / 2, z0: TABLE.z - TABLE.d / 2 - SAT, z1: TABLE.z + TABLE.d / 2 - SAT, top: TABLE.top };
    // (the page he turns turns about the spine's foot in the gutter, the top page of the half on his right: its blocks
    // in their frames, the book's shape)
    const shape = book.shape, spine = new THREE.Vector3(0, BOOK.y + COVER + shape.gutter, BOOK.z - SAT);
    const s = buildScholar({ spine, shape, table, blocks: book.blocks, prints: book.prints,
      printTop: BOOK.y + COVER + shape.edge + shape.printed });
    s.root.position.set(0, 0, SAT);
    d.add(s.root);
    return s;
  };
}

/** The library: built into `group`. */
export function build(group: THREE.Group): Room {
  const id: RoomId = 'library', b = begin(id, group, 2718), { g, M, rng } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  // (its windows lit warm from outside, as an evening's sun)
  M.glass.color.setHex(0x2a1a0a);
  M.glass.emissive.setHex(0xffb060);
  M.glass.emissiveIntensity = 0.55;
  const shelving: Shelving = Array.from({ length: SPINES }, () => ({ matrices: [], colours: [] }));
  const caseHigh = high - 0.35;
  // --- the back wall: cases either side of an alcove with the Codex before it, its name over it, sconces ---
  const back = onWall(g, id, 'back');
  for (const [x, w] of [[-4.5, 1.6], [-2.55, 2.0], [2.55, 2.0], [4.5, 1.6]] as const) bookcase(g, M, shelving, back, x, w, caseHigh, rng, b.obstacles);
  nameBoard(back, M, 2.95);
  const banner = writing(M, 256, 384, 1.1, 1.6);
  banner.write((cx, w, h) => {
    parchment(cx, w, h, 61);
    cx.strokeStyle = '#5a3a1a'; cx.lineWidth = 6; cx.strokeRect(10, 10, w - 20, h - 20);
    cx.fillStyle = '#3a200c'; cx.textAlign = 'center'; cx.textBaseline = 'top';
    cx.font = `700 28px ${DISPLAY}`;
    cx.fillText('Of the Foes', w / 2, 30, w - 30);
    cx.fillText('and the Heroes', w / 2, 62, w - 30);
    cx.fillStyle = '#8a1a14';
    cx.beginPath(); cx.arc(w / 2, 170, 46, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#e8c070';
    cx.font = `700 54px ${DISPLAY}`;
    cx.textBaseline = 'middle';
    cx.fillText('W', w / 2, 172);
    cx.fillStyle = '#3a200c';
    cx.font = `500 18px ${BODY}`;
    cx.textBaseline = 'top';
    ['Read here what the village', 'has learnt of every foe,', 'every boss and every hero.'].forEach((l, i) => cx.fillText(l, w / 2, 240 + i * 26, w - 30));
  });
  framed(back, M, banner, 0, 1.75, 1.1, 1.6);
  for (const sx of [-1, 1]) lantern(back, M, sx * 1.15, 2.55, 0, 0, 1, { ...LANTERN, intensity: 7, reach: 7 });
  // --- the west wall: two cases, the ladder on the first, a scroll rack by the front, a lantern ---
  const west = onWall(g, id, 'west');
  bookcase(g, M, shelving, west, -1.4, 2.2, caseHigh, rng, b.obstacles);
  bookcase(g, M, shelving, west, 1.05, 2.2, caseHigh, rng, b.obstacles);
  bookcase(g, M, shelving, west, 3.2, 1.0, caseHigh, rng, b.obstacles);
  ladder(west, M, -0.9, caseHigh, 1.15);
  scrollRack(west, M, -3.1, rng);
  lantern(west, M, -(hz - 0.45), 2.4, 0, 0, 1, { ...LANTERN, intensity: 8, reach: 8 });
  // --- the east wall: the hearth between two cases, an armchair before it, a lantern by the front ---
  hearth(g, M, new THREE.Vector3(hx, 0, -0.6), -Math.PI / 2, high, b.updaters, b.obstacles);
  const east = onWall(g, id, 'east');
  bookcase(g, M, shelving, east, 2.25, 1.7, caseHigh, rng, b.obstacles);
  bookcase(g, M, shelving, east, -2.95, 1.6, caseHigh, rng, b.obstacles);
  lantern(east, M, hz - 0.45, 2.4, 0, 0, 1, { ...LANTERN, intensity: 8, reach: 8 });
  // (a framed chart of the lands between the hearth and the case by the front)
  const chart = writing(M, 320, 400, 0.8, 1.0);
  chart.write((cx, w, h) => {
    parchment(cx, w, h, 71);
    const rngChart = mulberry(72);
    cx.strokeStyle = '#5a3a1a'; cx.lineWidth = 5; cx.strokeRect(10, 10, w - 20, h - 20);
    for (let land = 0; land < 4; land++) {
      const lx = 60 + rngChart() * (w - 120), ly = 80 + rngChart() * (h - 160);
      cx.fillStyle = 'rgba(120,90,40,0.35)';
      for (let k = 0; k < 10; k++) { cx.beginPath(); cx.arc(lx + (rngChart() - 0.5) * 90, ly + (rngChart() - 0.5) * 70, 10 + rngChart() * 24, 0, Math.PI * 2); cx.fill(); }
    }
    cx.strokeStyle = '#6a3a14'; cx.lineWidth = 2; cx.setLineDash([8, 6]);
    cx.beginPath(); cx.moveTo(40, h - 60); cx.bezierCurveTo(w * 0.4, h * 0.6, w * 0.5, h * 0.3, w - 50, 60); cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle = '#3a200c'; cx.textAlign = 'center'; cx.font = `700 24px ${DISPLAY}`;
    cx.fillText('Known Lands', w / 2, 44, w - 40);
  });
  framed(east, M, chart, 0.9, 1.75, 0.8, 1.0);
  const chair = armchair(g, M, hx - 1.9, 0.9, CHAIR_TURN), chairAt = { x: hx - 1.9, z: 0.9, r: 0.58, h: 1.1 };
  b.obstacles.push(chairAt);
  b.seats.push(chairSeat(chairAt, CHAIR_TURN, CHAIR.sit, CHAIR.near, [chair.top], [{ root: chair.group }]));
  // --- the floor: rugs, the Codex, two reading desks, the globe, stacks of books, the chandelier ---
  rug(g, M, 0, -2.4, 3.2, 2.0, ['#4a1414', '#c09a50', '#1e2a40'], 41);
  rug(g, M, 0, 1.2, 3.6, 2.4, ['#1e2a3a', '#b08a40', '#5a1a14'], 43);
  codex(g, M, b, 0, -hz + 1.6);
  const seat = scholarDesk(g, M, b);
  readingDesk(g, M, b, 1.9, 2.2, -0.2, 2);
  globe(g, M, 3.1, -2.2);
  b.obstacles.push({ x: 3.1, z: -2.2, r: 0.35, h: 1.3 });
  for (const [x, z, n] of [[-1.3, -3.3, 6], [4.6, 3.2, 4], [-4.6, -0.2, 3]] as const) {
    for (let k = 0; k < n; k++) {
      const book = box(g, 0.32 - k * 0.012, 0.055, 0.24, x + (rng() - 0.5) * 0.04, k * 0.055, z + (rng() - 0.5) * 0.04, M.leather);
      book.rotation.y = (rng() - 0.5) * 0.7;
    }
  }
  openBook(g, M, -1.0, 0.012, -3.0, 0.6, 0.36, 3);
  // (over the middle rug, short of the Codex: over it, from above it hid the book; under the cross beam there (x 0.1),
  // hung from it, its candles 0.18 under it: a hair west of it and 0.4 higher, the beam ran through its candles and
  // chains, from play "light fixture, it goes through a beam")
  chandelier(g, M, 0.1, high, 1.3, high - CROSS_UNDER);
  // (dust drifting in the warm light by the front windows)
  shelve(g, shelving);
  let due = 0;
  b.updaters.push((dt) => {
    due += dt * 6;
    for (; due >= 1; due--) {
      const sx = Math.random() < 0.5 ? -1 : 1, wx = sx * hx * 0.55;
      particles.glow.spawn({
        x: wx * 0.85 + rand(-0.4, 0.4), y: rand(0.4, 1.8), z: hz - rand(0.6, 2.2),
        vx: rand(-0.02, 0.02), vy: rand(-0.01, 0.03), vz: rand(-0.02, 0.02),
        life: rand(4, 7), size: rand(0.008, 0.014), sizeEnd: 0.005,
        color: col(0xffe0b0, 0.6), colorEnd: col(0xffc080, 0.1), gravity: 0, drag: 0.2,
      });
    }
  });
  // (Brother Hollis, seated once the heroes' heads and hands are made: he reads, glances up at a hero come near, and
  // looks up from his book while he's talked to)
  let scholar: Scholar | undefined;
  const hero = new THREE.Vector3();
  b.updaters.push((dt) => {
    if (!scholar) return;
    const me = G.player;
    scholar.update(dt, me ? hero.copy(me.pos) : null, scholarTalk.talking);
  });
  const room = finish(id, b, {
    look: libraryLook(),
    seatFolk() {
      if (scholar) return;
      scholar = seat();
      // (posed once now: its first frame drawn, a warm-up's, is as he reads)
      scholar.update(0, null, false);
    },
    folk: () => scholar,
  });
  // (the warm-up's draw shows the page he turns too, hidden but while he turns it: a hidden mesh compiles nothing, and
  // its back's program would have been compiled at his first turn; his next pose hides it again)
  const shell = room.showAll;
  room.showAll = () => {
    shell();
    if (scholar) scholar.page.visible = true;
  };
  return room;
}
