// The house of records' room (data/houses/records.ts: its cottage, its size, what's used in it, its trophies' places): a
// records hall, its trophies for the bosses beaten on carved shields along the back wall and in a trophy cabinet against
// the east wall (each boss's model its own, world/trophies/; an empty shield or stand where its boss still stands), the great ledger and the boards of bests and feats it writes
// (game/rooms.ts `writeRecords`), the Chronicle's lectern. Built of the rooms' kit (world/rooms.ts) and found by
// world/houses.ts with every other house's room in this folder.
import * as THREE from 'three';
import { HOUSES, TROPHIES, TROPHY_AT, type RoomId, type TrophyDef, type TrophyKind, type TrophyPlace } from '../../data/houses';
import { TROPHY_PLACES } from '../../data/houses/records';
import { glowOf, part, type TrophyModel } from '../trophyKit';
import type { EnemyId } from '../../data/enemies';
import {
  banner, begin, keepApart, type Board, BODY, bookcase, box, CANDLE, candle, chandelier, CHANDELIER_DROP, DISPLAY, drum, finish,
  framed, hearth, inkedPage, lantern, LANTERN, type Mats, onWall, parchment, type RecordsShown, RIDGE_UNDER, type Room, rug,
  stool, stoolSeatOf, table, type TrophyPlaceShown, writing,
} from '../rooms';

/** The Chronicle's lectern, in its frame (its reader at +z): a stepped octagonal base, a turned column with a brass
 *  name plate, carved brackets under a slanted desk with a lip and cheeks, a thick book open on it (its pages inked, a
 *  red initial, a ribbon, brass corners), an inkwell and a quill on a ledge, and a candle on a brass arm (its light one
 *  of the room's ten). */
function chronicleStand(g: THREE.Object3D, M: Mats): void {
  // (the base: two octagonal steps, a brass band between)
  drum(g, 0.3, 0.33, 0.07, 0, 0, 0, M.timber, 8);
  drum(g, 0.23, 0.26, 0.06, 0, 0.07, 0, M.panel, 8);
  drum(g, 0.235, 0.235, 0.012, 0, 0.13, 0, M.brass, 8).castShadow = false;
  // (the column, turned: a foot, a long belly, rings, a neck under the capital)
  const profile = [[0.0, 0.0], [0.12, 0.0], [0.12, 0.03], [0.085, 0.06], [0.07, 0.12], [0.08, 0.2], [0.09, 0.3], [0.075, 0.42],
    [0.055, 0.5], [0.07, 0.53], [0.07, 0.56], [0.05, 0.6], [0.05, 0.7], [0.075, 0.73], [0.075, 0.76], [0.05, 0.79], [0.0, 0.79]];
  const column = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16), M.panel);
  column.position.y = 0.142;
  column.castShadow = column.receiveShadow = true;
  g.add(column);
  for (const y of [0.142 + 0.545, 0.142 + 0.745]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.008, 6, 20).rotateX(Math.PI / 2), M.brass);
    ring.position.y = y;
    g.add(ring);
  }
  // (a brass plate on its front, the Chronicle's name)
  const plate = writing(M, 256, 96, 0.13, 0.05);
  const brass = plate.mesh.material as THREE.MeshStandardMaterial;
  brass.metalness = 0.6;
  brass.roughness = 0.4;
  plate.write((cx, w, h) => {
    cx.fillStyle = '#c89a4a'; cx.fillRect(0, 0, w, h);
    cx.strokeStyle = '#6a4a14'; cx.lineWidth = 6; cx.strokeRect(5, 5, w - 10, h - 10);
    cx.fillStyle = '#3a2408'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `700 40px ${DISPLAY}`;
    cx.fillText('CHRONICLE', w / 2, h / 2 + 2, w - 24);
  });
  plate.mesh.position.set(0, 0.48, 0.093);
  g.add(plate.mesh);
  // (the capital and two carved brackets under the desk)
  box(g, 0.34, 0.05, 0.26, 0, 0.93, 0, M.timber);
  for (const sx of [-1, 1]) {
    const bracket = box(g, 0.04, 0.16, 0.18, sx * 0.13, 0.86, 0, M.timber);
    bracket.rotation.z = sx * 0.35;
  }
  // (the desk, slanted to its reader: a board, a lip along its foot, cheeks either side)
  const desk = new THREE.Group();
  desk.position.y = 1.03;
  desk.rotation.x = 0.33;
  g.add(desk);
  box(desk, 0.66, 0.035, 0.48, 0, -0.035, 0, M.panel);
  box(desk, 0.66, 0.06, 0.035, 0, -0.035, 0.24, M.timber);
  for (const sx of [-1, 1]) box(desk, 0.03, 0.05, 0.48, sx * 0.345, -0.035, 0, M.timber);
  // (the book: its cover, two thick stacks of pages bowed to the spine, its pages inked)
  const cover = new THREE.MeshStandardMaterial({ color: 0x5a1814, roughness: 0.6 });
  box(desk, 0.6, 0.014, 0.4, 0, 0, 0, cover);
  for (const [sx, cx] of [[-1, -0.3], [1, 0.3]] as const) {
    for (const cz of [-0.2, 0.2]) box(desk, 0.035, 0.016, 0.035, cx - sx * 0.015, 0.004, cz - Math.sign(cz) * 0.015, M.brass).castShadow = false;
  }
  const pageTint = new THREE.MeshStandardMaterial({ color: 0xe6d6b0, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const stack = box(desk, 0.27, 0.04, 0.36, sx * 0.142, 0.012, 0, pageTint);
    stack.rotation.z = -sx * 0.07;
    const page = writing(M, 256, 340, 0.265, 0.355);
    page.mesh.rotation.set(-Math.PI / 2, 0, 0);
    page.mesh.rotation.y = -sx * 0.07;
    page.mesh.position.set(sx * 0.142, 0.054 + 0.004, 0);
    page.write((cx, w, h) => inkedPage(cx, w, h, sx < 0, sx < 0 ? 41 : 43));
    desk.add(page.mesh);
  }
  // (the spine's hollow, and a red ribbon from it down over the lip)
  box(desk, 0.02, 0.03, 0.36, 0, 0.012, 0, cover);
  const ribbon = new THREE.MeshStandardMaterial({ color: 0x9a1a1a, roughness: 0.7, side: THREE.DoubleSide });
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.2), ribbon);
  tail.position.set(0.02, 0.02, 0.24);
  tail.rotation.set(-0.5, 0, 0.05);
  desk.add(tail);
  // (a ledge on its left with an inkwell and a quill)
  box(g, 0.14, 0.025, 0.14, -0.48, 0.98, -0.02, M.timber);
  box(g, 0.03, 0.08, 0.03, -0.44, 0.9, -0.02, M.timber).rotation.z = 0.6;
  drum(g, 0.03, 0.035, 0.05, -0.48, 1.005, -0.02, M.dark, 10);
  drum(g, 0.012, 0.012, 0.012, -0.48, 1.055, -0.02, M.brass, 8);
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.8 }));
  quill.position.set(-0.51, 1.16, -0.04);
  quill.rotation.set(0.25, 0, 0.35);
  quill.castShadow = true;
  g.add(quill);
  // (the candle on a brass arm out of the column's right, out past the desk's cheek so its flame stands clear of the
  // book (under the desk's edge it stood through the pages), wax run down it)
  const ARM = { x: 0.5, y: 0.8, up: 0.2 };
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, ARM.x - 0.05, 8).rotateZ(Math.PI / 2), M.brass);
  bar.position.set((ARM.x + 0.05) / 2, ARM.y, 0);
  g.add(bar);
  drum(g, 0.012, 0.012, ARM.up, ARM.x, ARM.y, 0, M.brass, 8);
  const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), M.brass);
  scroll.position.set(ARM.x - 0.05, ARM.y, 0);
  scroll.rotation.z = Math.PI;
  g.add(scroll);
  const dish = ARM.y + ARM.up;
  drum(g, 0.055, 0.03, 0.025, ARM.x, dish, 0, M.brass, 12);
  candle(g, M, ARM.x, dish + 0.025, 0, 0.17, CANDLE);
  for (const [dx, dz, len] of [[0.02, 0.01, 0.06], [-0.018, 0.012, 0.04], [0.004, -0.022, 0.08]]) {
    drum(g, 0.006, 0.008, len, ARM.x + dx, dish + 0.025 + 0.17 - len - 0.01, dz, M.wax, 6).castShadow = false;
  }
}

/** A board's rows written on parchment: its title, a rule, each row's words left and figure right over a dotted
 *  leader, shrunk to fit. */
function writeBoard(cx: CanvasRenderingContext2D, w: number, h: number, b: Board, seed: number, edge = true): void {
  parchment(cx, w, h, seed);
  if (edge) { cx.strokeStyle = '#5a3a1a'; cx.lineWidth = 6; cx.strokeRect(10, 10, w - 20, h - 20); }
  const pad = w * 0.08;
  cx.fillStyle = '#3a200c';
  cx.textAlign = 'center';
  cx.textBaseline = 'top';
  cx.font = `700 ${Math.round(w * 0.075)}px ${DISPLAY}`;
  cx.fillText(b.title, w / 2, h * 0.05, w - pad * 2);
  const top = h * 0.05 + w * 0.1;
  cx.fillStyle = '#7a4a1a';
  cx.fillRect(pad, top, w - pad * 2, 3);
  const rows = Math.max(1, b.rows.length);
  const step = Math.min((h - top - h * 0.05) / rows, w * 0.085);
  const size = Math.round(step * 0.62);
  b.rows.forEach(([words, figure], i) => {
    const y = top + step * (i + 0.6);
    cx.textBaseline = 'middle';
    cx.font = `500 ${size}px ${BODY}`;
    cx.fillStyle = '#2e1a0a';
    cx.textAlign = 'left';
    cx.fillText(words, pad, y, w * 0.62);
    cx.font = `700 ${size}px ${DISPLAY}`;
    cx.textAlign = 'right';
    cx.fillStyle = '#5a1a0a';
    cx.fillText(figure, w - pad, y, w * 0.3);
    const left = pad + Math.min(cx.measureText(words).width, w * 0.62) + 8;
    const right = w - pad - Math.min(cx.measureText(figure).width, w * 0.3) - 8;
    cx.fillStyle = 'rgba(90,50,20,0.45)';
    for (let x = left; x < right; x += 9) cx.fillRect(x, y + size * 0.25, 2, 2);
  });
}


/** each trophy's model, by its boss's id (world/trophies/<boss id>.ts, its `model`): a boss with none is shown by its
 *  kind's plain one (`PLAIN`) */
const MODELS = import.meta.glob<TrophyModel>('../trophies/*.ts', { eager: true, import: 'model' });

/** A wall trophy for a boss with no model of its own: a heater shield in its colours, its bend in its second. */
function plainCrest(g: THREE.Group, def: TrophyDef, M: Mats): void {
  const s = new THREE.Shape();
  s.moveTo(-0.24, 0.26); s.lineTo(0.24, 0.26); s.lineTo(0.24, 0.02); s.quadraticCurveTo(0.22, -0.2, 0, -0.34);
  s.quadraticCurveTo(-0.22, -0.2, -0.24, 0.02); s.lineTo(-0.24, 0.26);
  const field = new THREE.MeshStandardMaterial({ color: def.colour, roughness: 0.6, metalness: 0.2 });
  const shield = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  part(g, shield, field);
  const charge = new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: def.trim, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 });
  for (const a of [0.7, -0.7]) part(g, new THREE.BoxGeometry(0.05, 0.48, 0.025), charge, [0, -0.02, 0.07], [0, 0, a]);
  part(g, new THREE.SphereGeometry(0.05, 12, 8), M.brass, [0, -0.02, 0.08]);
}

/** A cabinet trophy for a boss with no model of its own: a small casket in its colours, a seal in its second. */
function plainRelic(g: THREE.Group, def: TrophyDef, M: Mats): void {
  const body = new THREE.MeshStandardMaterial({ color: def.colour, roughness: 0.55, metalness: 0.3 });
  part(g, new THREE.BoxGeometry(0.3, 0.14, 0.18).translate(0, 0.07, 0), body);
  part(g, new THREE.CylinderGeometry(0.09, 0.09, 0.3, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.14, 0), body);
  for (const x of [-0.11, 0.11]) part(g, new THREE.BoxGeometry(0.025, 0.24, 0.19).translate(x, 0.11, 0), M.brass);
  part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12).rotateX(Math.PI / 2), glowOf(def.trim, 1.1), [0, 0.1, 0.095]);
}

const PLAIN: Record<TrophyKind, TrophyModel> = { wall: plainCrest, cabinet: plainRelic };

/** the back wall's shields' middles (x, in its frame), their height, and their plates' (m) */
const WALL_AT: Record<(typeof TROPHY_PLACES)['wall'][number], number> = {
  'wall-inner-left': -1.55, 'wall-inner-right': 1.55, 'wall-outer-left': -2.95, 'wall-outer-right': 2.95,
};
const WALL_Y = 1.8;
const WALL_PLATE_Y = WALL_Y - 0.8;
/** how far out from the wall a wall trophy's back is set: on its shield's raised field */
const WALL_OUT = 0.125;
/** the trophy cabinet along the east wall: its middle (x in that wall's frame), width, depth and height, its shelves'
 *  tops (m), and each place's stand: its shelf, and which side of the middle. It stands `back` off the wall's face,
 *  clear of the wainscot and its skirting: against the face, its velvet back was hidden behind the panels */
const CABINET = { x: -2.25, w: 1.8, d: 0.46, high: 2.16, foot: 0.12, back: 0.1 };
const SHELVES = { low: 0.2, middle: 0.8, top: 1.4 } as const;
const CABINET_AT: Record<(typeof TROPHY_PLACES)['cabinet'][number], { shelf: keyof typeof SHELVES; side: number }> = {
  'shelf-middle-left': { shelf: 'middle', side: -1 }, 'shelf-middle-right': { shelf: 'middle', side: 1 },
  'shelf-top-left': { shelf: 'top', side: -1 }, 'shelf-top-right': { shelf: 'top', side: 1 },
  'shelf-low-left': { shelf: 'low', side: -1 }, 'shelf-low-right': { shelf: 'low', side: 1 },
};
/** a stand's offset from the cabinet's middle (m), its height, and how far out from the wall its middle is */
const STAND = { apart: 0.42, high: 0.035, out: 0.24 };

/** A place where a trophy is shown, and what's there: its boss's trophy (hidden until it's slain), or none. */
interface Place {
  id: TrophyPlace; kind: TrophyKind; frame: THREE.Group; at: THREE.Vector3;
  boss?: EnemyId; def?: TrophyDef; trophy?: THREE.Group; slain: number;
}

/** A row of brass plates drawn on one canvas (each plate its cell of it), so every plate of the row is one draw: each
 *  added to `frame` at its place, and written again all at once. */
interface Plates { add(frame: THREE.Object3D, x: number, y: number, z: number): number; write(cells: Plate[]): void }
type Plate = { title: string; line: string } | null;
function plates(M: Mats, cells: number, cellW: number, cellH: number, pw: number, ph: number): Plates {
  const w = writing(M, cellW, cellH * cells, pw, ph);
  const brass = w.mesh.material as THREE.MeshStandardMaterial;
  brass.metalness = 0.6;
  brass.roughness = 0.45;
  let used = 0;
  return {
    add(frame, x, y, z) {
      const cell = used++;
      const geo = new THREE.PlaneGeometry(pw, ph);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (cell + 1 - uv.getY(i)) / cells);
      const mesh = new THREE.Mesh(geo, brass);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      frame.add(mesh);
      return cell;
    },
    write(rows) {
      w.write((cx, cw, ch) => {
        const h = ch / cells;
        rows.forEach((row, i) => writePlate(cx, 0, i * h, cw, h, row));
      });
    },
  };
}

/** A plate's words in its cell: the trophy's name and how often its boss fell, its boss still standing, or none. */
function writePlate(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, row: Plate): void {
  const g = cx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#e6c070'); g.addColorStop(0.5, '#b88a3a'); g.addColorStop(1, '#8a6224');
  cx.fillStyle = g; cx.fillRect(x, y, w, h);
  cx.strokeStyle = '#5a3a10'; cx.lineWidth = Math.max(2, h * 0.04); cx.strokeRect(x + h * 0.05, y + h * 0.05, w - h * 0.1, h * 0.9);
  if (!row) return;
  cx.fillStyle = '#2a1806';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.font = `700 ${Math.round(h * 0.26)}px ${DISPLAY}`;
  cx.fillText(row.title, x + w / 2, y + h * 0.38, w * 0.9);
  cx.font = `600 ${Math.round(h * 0.22)}px ${BODY}`;
  cx.fillText(row.line, x + w / 2, y + h * 0.72, w * 0.9);
}

/** A carved shield on the back wall (its frame) at `x`, `WALL_Y`, a trophy's mount: an arched heater of dark timber
 *  edged in brass, a raised field, brass studs round it and an iron ring it hangs by. */
function wallMount(back: THREE.Group, M: Mats, x: number, field: THREE.ExtrudeGeometry, shield: THREE.ExtrudeGeometry,
  studs: THREE.Vector2[]): void {
  const mount = new THREE.Mesh(shield, M.timber);
  mount.position.set(x, WALL_Y, 0.02);
  mount.castShadow = mount.receiveShadow = true;
  back.add(mount);
  const rim = new THREE.Mesh(shield, M.brass);
  rim.scale.set(1.05, 1.04, 0.4);
  rim.position.set(x, WALL_Y + 0.004, 0.006);
  back.add(rim);
  const raised = new THREE.Mesh(field, M.oak);
  raised.position.set(x, WALL_Y, 0.095);
  raised.castShadow = raised.receiveShadow = true;
  back.add(raised);
  for (const p of studs) {
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.brass);
    stud.position.set(x + p.x, WALL_Y + p.y, 0.093);
    back.add(stud);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 16), M.iron);
  ring.position.set(x, WALL_Y + 0.66, 0.03);
  back.add(ring);
  // (its plate's backing board under its point)
  box(back, 0.5, 0.15, 0.03, x, WALL_PLATE_Y - 0.075, 0.015, M.timber);
}

/** A mount's outline: a heater shield, its top arched, `s` its scale. */
function mountShape(s: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.45 * s, 0.5 * s);
  shape.quadraticCurveTo(0, 0.62 * s, 0.45 * s, 0.5 * s);
  shape.lineTo(0.45 * s, 0.05 * s);
  shape.quadraticCurveTo(0.42 * s, -0.38 * s, 0, -0.6 * s);
  shape.quadraticCurveTo(-0.42 * s, -0.38 * s, -0.45 * s, 0.05 * s);
  shape.lineTo(-0.45 * s, 0.5 * s);
  return shape;
}

/** The trophy cabinet against the east wall (its frame): a plinth on carved feet, its sides and a back of deep red
 *  velvet, three shelves of oak with a stand at each place, a cornice over it with a brass roundel, and pilasters
 *  either side of its open front. */
function trophyCabinet(wall: THREE.Group, M: Mats): void {
  const { x, w, d, high, foot } = CABINET;
  const east = new THREE.Group();
  east.position.z = CABINET.back;
  wall.add(east);
  const velvet = new THREE.MeshStandardMaterial({ color: 0x501420, roughness: 0.95 });
  for (const sx of [-1, 1]) for (const sz of [0.06, d - 0.06]) box(east, 0.08, 0.05, 0.08, x + sx * (w / 2 - 0.06), 0, sz, M.timber);
  box(east, w, foot - 0.05, d, x, 0.05, d / 2, M.timber);
  for (const sx of [-1, 1]) box(east, 0.05, high - foot, d, x + sx * (w / 2 - 0.025), foot, d / 2, M.panel);
  box(east, w - 0.1, high - foot, 0.02, x, foot, 0.012, velvet);
  for (const y of Object.values(SHELVES)) {
    box(east, w - 0.1, 0.035, d - 0.04, x, y - 0.035, d / 2, M.oak);
    // (a brass strip along its front edge, the plates on it)
    box(east, w - 0.1, 0.006, 0.006, x, y - 0.006, d - 0.017, M.brass).castShadow = false;
  }
  box(east, w, 0.05, d, x, high, d / 2, M.timber);
  box(east, w + 0.1, 0.07, d + 0.05, x, high + 0.05, (d + 0.05) / 2, M.panel);
  box(east, w + 0.16, 0.03, d + 0.08, x, high + 0.12, (d + 0.08) / 2, M.timber);
  // (a carved crest over the cornice, a brass roundel on it)
  box(east, 0.6, 0.16, 0.05, x, high + 0.15, d - 0.02, M.panel);
  const roundel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 18).rotateX(Math.PI / 2), M.brass);
  roundel.position.set(x, high + 0.23, d + 0.01);
  east.add(roundel);
  for (const sx of [-1, 1]) {
    const pilaster = box(east, 0.06, high - foot - 0.06, 0.04, x + sx * (w / 2 - 0.03), foot, d - 0.02, M.timber);
    pilaster.castShadow = false;
  }
}

/** Every trophy place built in the room, each place's mount or stand whether a trophy takes it or not, and the boss's
 *  trophy (`TROPHY_AT`) set on it, hidden until its boss is slain. The plates of each kind are a row of their own. */
function trophyPlaces(back: THREE.Group, east: THREE.Group, M: Mats): { places: Place[]; wall: Plates; cabinet: Plates } {
  const places: Place[] = [];
  const shield = new THREE.ExtrudeGeometry(mountShape(1), { depth: 0.05, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2 });
  const field = new THREE.ExtrudeGeometry(mountShape(0.84), { depth: 0.012, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.008, bevelSegments: 1 });
  const studs = mountShape(0.93).getSpacedPoints(18).slice(0, 18);
  const wall = plates(M, TROPHY_PLACES.wall.length, 384, 112, 0.44, 0.128);
  const cabinet = plates(M, TROPHY_PLACES.cabinet.length, 256, 80, 0.22, 0.069);
  const bossAt = new Map(Object.entries(TROPHY_AT).map(([boss, place]) => [place, boss as EnemyId]));
  for (const id of TROPHY_PLACES.wall) {
    const x = WALL_AT[id];
    wallMount(back, M, x, field, shield, studs);
    wall.add(back, x, WALL_PLATE_Y, 0.032);
    places.push({ id, kind: 'wall', frame: back, at: new THREE.Vector3(x, WALL_Y, WALL_OUT), slain: -1 });
  }
  trophyCabinet(east, M);
  for (const id of TROPHY_PLACES.cabinet) {
    const { shelf, side } = CABINET_AT[id];
    const x = CABINET.x + side * STAND.apart, y = SHELVES[shelf];
    const out = CABINET.back + STAND.out;
    drum(east, 0.11, 0.12, STAND.high, x, y, out, M.timber, 18);
    const ring = drum(east, 0.112, 0.112, 0.008, x, y + STAND.high - 0.012, out, M.brass, 18);
    ring.castShadow = false;
    cabinet.add(east, x, y - 0.035 / 2, CABINET.back + CABINET.d - 0.0185);
    places.push({ id, kind: 'cabinet', frame: east, at: new THREE.Vector3(x, y + STAND.high, out), slain: -1 });
  }
  for (const place of places) {
    const boss = bossAt.get(place.id);
    if (!boss) continue;
    const def = TROPHIES[boss]!;
    const trophy = new THREE.Group();
    trophy.name = `trophy ${boss}`;
    trophy.position.copy(place.at);
    (MODELS[`../trophies/${boss}.ts`] ?? PLAIN[def.kind])(trophy, def, M);
    place.frame.add(trophy);
    keepApart(trophy, true);
    Object.assign(place, { boss, def, trophy });
  }
  return { places, wall, cabinet };
}

/** A place's plate: its trophy's name and how often its boss fell, its boss still to be beaten, or nothing (no boss
 *  takes the place yet). */
function plateOf(place: Place): Plate {
  if (!place.def) return null;
  if (place.slain > 0) {
    return { title: place.def.name, line: `Slain ${place.slain} ${place.slain === 1 ? 'time' : 'times'}` };
  }
  return { title: 'Awaiting a Trophy', line: 'This foe still stands' };
}

/** The house of records: a records hall. Its trophies on carved shields along the back wall, banners at its ends, and in a
 *  cabinet against the east wall;
 *  the great ledger open on its lectern before them on a rug; tall bookcases down the west wall round the board of bests,
 *  the Chronicle's lectern by the door; the hearth on the east wall, the board of feats beside it, a reading desk. */
export function build(group: THREE.Group): Room {
  const id: RoomId = 'records', b = begin(id, group, 917), { g, M, obstacles, rng } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  // --- the back wall: trophies, banners, a light over each end of the row; the trophy cabinet on the east wall ---
  const back = onWall(g, id, 'back');
  const east = onWall(g, id, 'east');
  const { places, wall: wallPlates, cabinet: cabinetPlates } = trophyPlaces(back, east, M);
  for (const sx of [-1, 1]) banner(back, M, sx * (hx - 0.55), high - 0.4, sx < 0 ? [0.42, 0.08, 0.06] : [0.08, 0.16, 0.36], rng, 0.72);
  // (on the posts between each side's two shields, lighting both)
  for (const sx of [-1, 1]) lantern(back, M, sx * 2.25, 3.0, 0, 0, 1, { ...LANTERN, intensity: 7, reach: 5 });
  // (between them, a tapestry of the village's crest)
  const tapestry = writing(M, 384, 448, 1.3, 1.52);
  (tapestry.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
  tapestry.mesh.position.set(0, 1.95, 0.04);
  back.add(tapestry.mesh);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 8).rotateZ(Math.PI / 2), M.iron);
  rod.position.set(0, 2.74, 0.06);
  back.add(rod);
  tapestry.write((cx, w, h) => drawCrest(cx, w, h));
  // --- the great ledger on its lectern, on a rug ---
  rug(g, M, 0, -0.6, 3.2, 2.2, ['#5a1a16', '#c09a50', '#1e2a40'], 31);
  const lectern = new THREE.Group();
  lectern.position.set(0, 0, -0.9);
  g.add(lectern);
  box(lectern, 0.5, 0.06, 0.4, 0, 0, 0, M.timber);
  drum(lectern, 0.06, 0.08, 1.0, 0, 0.06, 0, M.panel, 8);
  const desk = new THREE.Group();
  desk.position.set(0, 1.1, 0);
  desk.rotation.x = 0.35;
  lectern.add(desk);
  box(desk, 0.8, 0.05, 0.55, 0, -0.03, 0, M.panel);
  box(desk, 0.8, 0.05, 0.03, 0, 0.02, 0.28, M.timber);
  box(desk, 0.76, 0.03, 0.5, 0, 0.01, 0, M.leather);
  const left = writing(M, 384, 512, 0.36, 0.46), right = writing(M, 384, 512, 0.36, 0.46);
  for (const [page, x, tilt] of [[left, -0.185, 0.06], [right, 0.185, -0.06]] as const) {
    page.mesh.rotation.set(-Math.PI / 2, tilt, 0);
    page.mesh.position.set(x, 0.035, 0);
    desk.add(page.mesh);
  }
  // (a brass candlestand beside it, its candle at the book's height)
  drum(g, 0.12, 0.15, 0.04, 0.6, 0, -0.75, M.brass, 12);
  drum(g, 0.018, 0.022, 1.12, 0.6, 0.04, -0.75, M.brass, 8);
  drum(g, 0.06, 0.03, 0.04, 0.6, 1.16, -0.75, M.brass, 10);
  candle(g, M, 0.6, 1.2, -0.75, 0.16, CANDLE);
  obstacles.push({ x: 0.6, z: -0.75, r: 0.16, h: 1.3 });
  obstacles.push({ x: 0, z: -0.9, r: 0.42, h: 1.2 });
  // --- the west wall: bookcases round the board of bests; the Chronicle's lectern by the door ---
  const west = onWall(g, id, 'west');
  bookcase(west, M, -1.9, 1.5, 2.6, rng);
  bookcase(west, M, 1.7, 1.2, 2.6, rng);
  const bests = writing(M, 512, 640, 1.1, 1.38);
  framed(west, M, bests, -0.1, 1.75, 1.1, 1.38);
  lantern(west, M, -0.1, 2.75, 0, 0, 1, { ...LANTERN, intensity: 3.2 });
  for (const z of [-1.9, 1.7]) obstacles.push({ x: -hx + 0.25, z: -z, r: 0.45, h: 2.6 });
  obstacles.push({ x: -hx + 0.3, z: 1.2, r: 0.35, h: 2.6 });
  const chron = new THREE.Group();
  chron.position.set(-hx + 0.9, 0, hz - 1.6);
  chron.rotation.y = Math.PI / 2;
  g.add(chron);
  chronicleStand(chron, M);
  obstacles.push({ x: -hx + 0.9, z: hz - 1.6, r: 0.32, h: 1.2 });
  // --- the east wall: the hearth, the board of feats, a reading desk with scrolls ---
  // (the hearth along the wall from the trophy cabinet, the desk after it: with the hearth's breast between the room
  // and a cabinet in the corner, the cabinet was hidden from most of the room)
  hearth(g, M, new THREE.Vector3(hx, 0, 0.25), -Math.PI / 2, high, b.updaters, obstacles);
  for (const dz of [-0.6, 0, 0.6]) obstacles.push({ x: hx - 0.35, z: CABINET.x + dz, r: 0.33, h: CABINET.high });
  const DESK = 2.2;
  const feats = writing(M, 512, 640, 1.0, 1.25);
  framed(east, M, feats, DESK, 1.8, 1.0, 1.25);
  table(g, M, hx - 0.65, DESK, 0.7, 1.1, obstacles, 0.76);
  b.seats.push(stoolSeatOf(stool(g, M, hx - 1.35, DESK, 0.5), hx - 1.35, DESK));
  for (const [dz, r] of [[-0.3, 0.035], [0.1, 0.03], [0.32, 0.04]]) {
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.42, 10).rotateX(Math.PI / 2), M.paper);
    scroll.position.set(hx - 0.6 + dz * 0.3, 0.76 + r, DESK + dz);
    scroll.rotation.y = dz;
    scroll.castShadow = true;
    g.add(scroll);
  }
  drum(g, 0.03, 0.04, 0.06, hx - 0.85, 0.76, DESK + 0.35, M.dark, 8);
  candle(g, M, hx - 0.5, 0.76, DESK + 0.4, 0.14, CANDLE);
  // (the lights by the front: on the side walls by it, as the front wall is cut away from above and a lantern on it
  // would hang in the air)
  lantern(west, M, -(hz - 0.7), 2.3, 0, 0, 1);
  // (the east wall's over the trophy cabinet, between it and the hearth: by the door, the cabinet stood dark)
  lantern(east, M, CABINET.x + CABINET.w / 2 + 0.12, 3.0, 0, 0, 1);
  // (off the middle: over the door's way it hung in the camera's from over the shoulder, over the ledger it hid it from above;
  // under the ridge beam, hung from it, its candles' tops clear of it: at the ceiling's height, the beam ran through its
  // wheel and candles, from play "light fixture, it goes through a beam")
  chandelier(g, M, 1.6, high - CHANDELIER_DROP, 0.1, high - RIDGE_UNDER);
  // (stacks of ledgers on the floor by the bookcases)
  for (const [x, z, n] of [[-hx + 0.55, 0.6, 5], [-hx + 0.6, -2.9, 3]] as const) {
    for (let k = 0; k < n; k++) {
      const book = box(g, 0.3, 0.06, 0.22, x + (rng() - 0.5) * 0.05, k * 0.06, z + (rng() - 0.5) * 0.05, M.leather);
      book.rotation.y = (rng() - 0.5) * 0.6;
    }
  }
  const shown = (s: RecordsShown): void => {
    bests.write((cx, w, h) => writeBoard(cx, w, h, s.bests, 3));
    feats.write((cx, w, h) => writeBoard(cx, w, h, s.feats, 5));
    left.write((cx, w, h) => writeBoard(cx, w, h, s.left, 7, false));
    right.write((cx, w, h) => writeBoard(cx, w, h, s.right, 9, false));
    let changed = false;
    for (const place of places) {
      if (!place.trophy || !place.boss) continue;
      const slain = s.slain[place.boss] ?? 0;
      place.trophy.visible = slain > 0;
      if (slain !== place.slain) { place.slain = slain; changed = true; }
    }
    if (!changed && written) return;
    written = true;
    wallPlates.write(places.filter((p) => p.kind === 'wall').map(plateOf));
    cabinetPlates.write(places.filter((p) => p.kind === 'cabinet').map(plateOf));
  };
  let written = false;
  const trophyPlacesShown = (): TrophyPlaceShown[] => places.map((p) => ({
    place: p.id, kind: p.kind, boss: p.boss, shown: p.trophy?.visible ?? false,
    at: p.frame.localToWorld(p.at.clone()), out: new THREE.Vector3(0, 0, 1).transformDirection(p.frame.matrixWorld),
    trophy: p.trophy,
  }));
  const room = finish(id, b, { showRecords: shown, trophyPlaces: trophyPlacesShown });
  const showAll = room.showAll;
  room.showAll = () => { showAll(); for (const p of places) if (p.trophy) p.trophy.visible = true; };
  return room;
}

/** The house of records' tapestry: the village's crest woven on deep red, a tree over two crossed blades in a shield,
 *  a border of gold, a tasselled foot. */
function drawCrest(cx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = cx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5a1414'); g.addColorStop(1, '#3a0c0c');
  cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  // (its weave: fine rows lighter and darker)
  for (let y = 0; y < h; y += 3) { cx.fillStyle = y % 6 ? 'rgba(0,0,0,0.08)' : 'rgba(255,200,160,0.05)'; cx.fillRect(0, y, w, 1); }
  cx.strokeStyle = '#c99a48'; cx.lineWidth = 10; cx.strokeRect(14, 14, w - 28, h - 60);
  cx.lineWidth = 3; cx.strokeRect(30, 30, w - 60, h - 92);
  const sx = w / 2, sy = h * 0.46, sw = w * 0.3;
  cx.beginPath();
  cx.moveTo(sx - sw, sy - sw); cx.lineTo(sx + sw, sy - sw); cx.lineTo(sx + sw, sy);
  cx.quadraticCurveTo(sx + sw, sy + sw * 0.9, sx, sy + sw * 1.3); cx.quadraticCurveTo(sx - sw, sy + sw * 0.9, sx - sw, sy);
  cx.closePath();
  cx.fillStyle = '#1e2a40'; cx.fill();
  cx.strokeStyle = '#c99a48'; cx.lineWidth = 6; cx.stroke();
  // (two blades crossed)
  cx.strokeStyle = '#d8d0c0'; cx.lineWidth = 9; cx.lineCap = 'round';
  for (const d of [-1, 1]) { cx.beginPath(); cx.moveTo(sx - d * sw * 0.7, sy + sw * 0.75); cx.lineTo(sx + d * sw * 0.7, sy - sw * 0.7); cx.stroke(); }
  // (a tree over them: a trunk and a round crown)
  cx.fillStyle = '#c99a48';
  cx.fillRect(sx - 7, sy - sw * 0.1, 14, sw * 0.6);
  cx.beginPath(); cx.arc(sx, sy - sw * 0.25, sw * 0.42, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#e8c870';
  cx.font = `700 ${Math.round(w * 0.08)}px ${DISPLAY}`;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('WARDENHOLLOW', sx, h * 0.12, w - 80);
  // (the tassels along its foot)
  for (let x = 24; x < w - 20; x += 18) { cx.fillStyle = '#c99a48'; cx.fillRect(x, h - 46, 6, 40); }
}
