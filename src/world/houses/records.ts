// The house of records' room (data/houses/records.ts: its cottage, its size, what's used in it): a records hall, its
// trophies for the bosses beaten along the back wall, the great ledger and the boards of bests and feats it writes
// (game/rooms.ts `writeRecords`), the Chronicle's lectern. Built of the rooms' kit (world/rooms.ts) and found by
// world/houses.ts with every other house's room in this folder.
import * as THREE from 'three';
import { HOUSES, TROPHIES, type RoomId, type TrophyDef } from '../../data/houses';
import type { EnemyId } from '../../data/enemies';
import { granite, pbrMaterialMaps, wood } from '../../core/textures';
import {
  banner, begin, type Board, BODY, bookcase, box, CANDLE, candle, chandelier, CHANDELIER_DROP, DISPLAY, drum, finish,
  framed, hearth, inkedPage, lantern, LANTERN, type Mats, onWall, parchment, type RecordsShown, RIDGE_UNDER, type Room, rug,
  stool, stoolSeatOf, table, type Writing, writing,
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


/** A trophy's look built on its mount, in its frame (facing +z, its middle at the origin, about 0.9 m across). */
const TROPHY_LOOKS: Record<TrophyDef['look'], (g: THREE.Group, def: TrophyDef, M: Mats) => void> = {
  // a stone face, cracked, its eye sockets deep and a faint glow left in them
  mask(g, def) {
    const stone = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(granite(7), 1, 1.2), color: def.colour, roughness: 0.8 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20, 0, Math.PI), stone);
    face.scale.set(1, 1.3, 0.55);
    face.castShadow = face.receiveShadow = true;
    g.add(face);
    const darkness = new THREE.MeshStandardMaterial({ color: 0x08060a, roughness: 1 });
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.12), stone);
    brow.position.set(0, 0.12, 0.17);
    brow.castShadow = true;
    g.add(brow);
    const eye = new THREE.MeshStandardMaterial({ color: 0x100818, emissive: def.trim, emissiveIntensity: 0.9 });
    for (const sx of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), darkness);
      socket.scale.set(1.3, 0.8, 0.5);
      socket.position.set(sx * 0.12, 0.04, 0.17);
      g.add(socket);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eye);
      glint.position.set(sx * 0.12, 0.04, 0.19);
      g.add(glint);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), stone);
    nose.position.set(0, -0.06, 0.2);
    nose.rotation.x = 0.35;
    g.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.05), darkness);
    mouth.position.set(0, -0.22, 0.16);
    g.add(mouth);
    // (a crack down from the brow, across the cheek)
    for (const [x, y, a, l] of [[0.05, 0.22, 0.2, 0.18], [0.09, 0.07, -0.5, 0.14], [0.17, -0.06, 0.3, 0.16], [-0.2, -0.1, -0.15, 0.12]]) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.012, l, 0.02), darkness);
      crack.position.set(x, y, 0.185 - Math.abs(x) * 0.25);
      crack.rotation.z = a;
      g.add(crack);
    }
    // (two stubs of horn at its temples)
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), stone);
      horn.position.set(sx * 0.3, 0.28, 0.05);
      horn.rotation.z = -sx * 0.7;
      horn.castShadow = true;
      g.add(horn);
    }
  },
  // a heartwood knot and two great thorned antlers branching from it, a green glow in the knot
  antlers(g, def) {
    const bark = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1.2), color: def.colour, roughness: 0.8 });
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), bark);
    knot.scale.set(1.2, 1, 0.7);
    knot.castShadow = true;
    g.add(knot);
    const heart = new THREE.MeshStandardMaterial({ color: 0x0a1a06, emissive: def.trim, emissiveIntensity: 0.8, roughness: 0.4 });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), heart);
    gem.position.set(0, 0, 0.11);
    g.add(gem);
    const limb = (from: THREE.Vector3, to: THREE.Vector3, r: number) => {
      const len = from.distanceTo(to);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, len, 7), bark);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      m.castShadow = true;
      g.add(m);
    };
    const thorn = (at: THREE.Vector3, way: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 5), bark);
      m.position.copy(at).addScaledVector(way, 0.035);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way);
      g.add(m);
    };
    for (const sx of [-1, 1]) {
      const pts = [new THREE.Vector3(sx * 0.12, 0.06, 0), new THREE.Vector3(sx * 0.3, 0.2, 0.03), new THREE.Vector3(sx * 0.42, 0.42, 0.02),
        new THREE.Vector3(sx * 0.46, 0.66, -0.02)];
      for (let k = 0; k < pts.length - 1; k++) limb(pts[k], pts[k + 1], 0.06 - k * 0.012);
      // (tines off it, up and out)
      for (const [k, dx, dy] of [[1, 0.02, 0.2], [2, 0.12, 0.14], [2, -0.1, 0.18]] as const) {
        const at = pts[k], end = at.clone().add(new THREE.Vector3(sx * dx, dy, 0.02));
        limb(at, end, 0.03);
        thorn(end.clone().lerp(at, 0.4), new THREE.Vector3(sx * 0.6, 0.2, 0.3).normalize());
      }
      for (let k = 0; k < 3; k++) thorn(pts[k].clone().lerp(pts[k + 1], 0.5), new THREE.Vector3(-sx * 0.3, 0.5, 0.6).normalize());
    }
  },
  // a heater shield in the boss's colours: needs nothing else of a new boss
  crest(g, def, M) {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0.32); s.lineTo(0.3, 0.32); s.lineTo(0.3, 0.02); s.quadraticCurveTo(0.28, -0.26, 0, -0.42);
    s.quadraticCurveTo(-0.28, -0.26, -0.3, 0.02); s.lineTo(-0.3, 0.32);
    const field = new THREE.MeshStandardMaterial({ color: def.colour, roughness: 0.6, metalness: 0.2 });
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), field);
    shield.castShadow = true;
    g.add(shield);
    const charge = new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: def.trim, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 });
    for (const a of [0.7, -0.7]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), charge);
      bar.position.set(0, -0.02, 0.08);
      bar.rotation.z = a;
      g.add(bar);
    }
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), M.brass);
    boss.position.set(0, -0.02, 0.1);
    g.add(boss);
  },
};

/** A trophy's place on the back wall: its mount, the trophy (shown once its boss is slain), its plaque. */
interface Hung { boss: EnemyId; def: TrophyDef; trophy: THREE.Group; plaque: Writing; slain: number }

/** Every trophy in `TROPHIES` hung along the back wall (its frame) between `from` and `to`, each on a shield of dark
 *  timber, a brass plaque under it, a light over the row. */
function trophies(g: THREE.Group, M: Mats, from: number, to: number, y: number): Hung[] {
  const entries = Object.entries(TROPHIES) as [EnemyId, TrophyDef][];
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.5); s.lineTo(0.5, 0.5); s.lineTo(0.5, 0); s.quadraticCurveTo(0.45, -0.45, 0, -0.62);
  s.quadraticCurveTo(-0.45, -0.45, -0.5, 0); s.lineTo(-0.5, 0.5);
  const mountGeo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2 });
  return entries.map(([boss, def], i) => {
    const x = entries.length === 1 ? (from + to) / 2 : from + ((to - from) * i) / (entries.length - 1);
    const mount = new THREE.Mesh(mountGeo, M.timber);
    mount.position.set(x, y, 0.02);
    mount.castShadow = mount.receiveShadow = true;
    g.add(mount);
    // (a brass edge round it, a shield a little larger behind)
    const rim = new THREE.Mesh(mountGeo, M.brass);
    rim.scale.set(1.07, 1.06, 0.5);
    rim.position.set(x, y + 0.004, 0.005);
    g.add(rim);
    const trophy = new THREE.Group();
    trophy.position.set(x, y + 0.02, 0.16);
    TROPHY_LOOKS[def.look](trophy, def, M);
    g.add(trophy);
    const plaque = writing(M, 384, 128, 0.62, 0.21);
    (plaque.mesh.material as THREE.MeshStandardMaterial).metalness = 0.6;
    (plaque.mesh.material as THREE.MeshStandardMaterial).roughness = 0.45;
    box(g, 0.68, 0.27, 0.03, x, y - 0.98, 0.015, M.timber);
    plaque.mesh.position.set(x, y - 0.845, 0.035);
    g.add(plaque.mesh);
    return { boss, def, trophy, plaque, slain: -1 };
  });
}

/** A plaque's words: the trophy's name and how often its boss fell, or the mount still waiting. */
function writePlaque(h: Hung): void {
  h.plaque.write((cx, w, hh) => {
    const g = cx.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, '#e6c070'); g.addColorStop(0.5, '#b88a3a'); g.addColorStop(1, '#8a6224');
    cx.fillStyle = g; cx.fillRect(0, 0, w, hh);
    cx.strokeStyle = '#5a3a10'; cx.lineWidth = 5; cx.strokeRect(6, 6, w - 12, hh - 12);
    cx.fillStyle = '#2a1806';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = `700 30px ${DISPLAY}`;
    cx.fillText(h.slain > 0 ? h.def.name : 'Awaiting a Trophy', w / 2, hh * 0.38, w - 30);
    cx.font = `600 26px ${BODY}`;
    cx.fillText(h.slain > 0 ? `Slain ${h.slain} ${h.slain === 1 ? 'time' : 'times'}` : 'This foe still stands', w / 2, hh * 0.72, w - 30);
  });
}

/** The house of records: a records hall. Its trophies along the back wall over a dado of carved panels, banners between;
 *  the great ledger open on its lectern before them on a rug; tall bookcases down the west wall round the board of bests,
 *  the Chronicle's lectern by the door; the hearth on the east wall, the board of feats beside it, a reading desk. */
export function build(group: THREE.Group): Room {
  const id: RoomId = 'records', b = begin(id, group, 917), { g, M, obstacles, rng } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  // --- the back wall: trophies, banners, a light over each end of the row ---
  const back = onWall(g, id, 'back');
  const hung = trophies(back, M, -hx + 1.7, hx - 1.7, 1.95);
  for (const sx of [-1, 1]) banner(back, M, sx * (hx - 0.55), high - 0.4, sx < 0 ? [0.42, 0.08, 0.06] : [0.08, 0.16, 0.36], rng, 0.72);
  for (const sx of [-1, 1]) lantern(back, M, sx * (hx - 1.7), 3.0, 0, 0, 1, { ...LANTERN, intensity: 7, reach: 5 });
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
  hearth(g, M, new THREE.Vector3(hx, 0, -1.2), -Math.PI / 2, high, b.updaters, obstacles);
  const east = onWall(g, id, 'east');
  const feats = writing(M, 512, 640, 1.0, 1.25);
  framed(east, M, feats, 1.95, 1.8, 1.0, 1.25);
  table(g, M, hx - 0.65, 1.95, 0.7, 1.1, obstacles, 0.76);
  b.seats.push(stoolSeatOf(stool(g, M, hx - 1.35, 1.95, 0.5), hx - 1.35, 1.95));
  for (const [dz, r] of [[-0.3, 0.035], [0.1, 0.03], [0.32, 0.04]]) {
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.42, 10).rotateX(Math.PI / 2), M.paper);
    scroll.position.set(hx - 0.6 + dz * 0.3, 0.76 + r, 1.95 + dz);
    scroll.rotation.y = dz;
    scroll.castShadow = true;
    g.add(scroll);
  }
  drum(g, 0.03, 0.04, 0.06, hx - 0.85, 0.76, 2.3, M.dark, 8);
  candle(g, M, hx - 0.5, 0.76, 2.35, 0.14, CANDLE);
  // (the lights by the front: on the side walls by it, as the front wall is cut away from above and a lantern on it
  // would hang in the air)
  lantern(west, M, -(hz - 0.7), 2.3, 0, 0, 1);
  lantern(east, M, hz - 0.7, 2.3, 0, 0, 1);
  // (off the middle: over the door's way it hung in the camera's from over the shoulder, over the ledger it hid it from above;
  // under the ridge beam, hung from it, its candles' tops clear of it: at the ceiling's height, the beam ran through its
  // wheel and candles, from play "light fixture, it goes through a beam")
  chandelier(g, M, 1.6, high - CHANDELIER_DROP, 0.1, high - RIDGE_UNDER);
  // (a chest of old records by the hearth, and stacks of ledgers on the floor by the bookcases)
  box(g, 0.9, 0.5, 0.5, hx - 0.4, 0, -2.85, M.panel).rotation.y = -0.1;
  box(g, 0.94, 0.06, 0.54, hx - 0.4, 0.5, -2.85, M.timber).rotation.y = -0.1;
  obstacles.push({ x: hx - 0.4, z: -2.85, r: 0.42, h: 0.56 });
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
    for (const t of hung) {
      const slain = s.slain[t.boss] ?? 0;
      t.trophy.visible = slain > 0;
      if (slain !== t.slain) { t.slain = slain; writePlaque(t); }
    }
  };
  const trophiesShown = (): Partial<Record<EnemyId, boolean>> =>
    Object.fromEntries(hung.map((t) => [t.boss, t.trophy.visible]));
  const room = finish(id, b, { showRecords: shown, trophiesShown });
  const showAll = room.showAll;
  room.showAll = () => { showAll(); for (const t of hung) t.trophy.visible = true; };
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
