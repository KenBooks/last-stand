// The tavern's room, the Ember & Oak (data/houses/tavern.ts: its cottage, its size, what's used in it): the hearth, the
// bar with its shelves of bottles and kegs, the party's round table with the village's map on it and the party board.
// Built of the rooms' kit (world/rooms.ts) and found by world/houses.ts with every other house's room in this folder.
import * as THREE from 'three';
import { HOUSES, type RoomId } from '../../data/houses';
import { boards, pbrMaterialMaps, wood } from '../../core/textures';
import {
  banner, barrel, begin, bench, BENCH_SAT, BODY, box, CANDLE, candle, chandelier, CHANDELIER_DROP, DISPLAY, drum, finish,
  framed, hearth, lantern, type Mats, onWall, parchment, RIDGE_UNDER, type Room, rug, sign, stool, stoolSeatOf, table, tankard,
  writing,
} from '../rooms';
import { lengthSeat } from '../seats';

/** Two axes crossed behind a round shield on a wall (its frame, facing +z), centred at (x, y). */
function crossedAxes(g: THREE.Object3D, M: Mats, x: number, y: number): void {
  for (const d of [-1, 1]) {
    const axe = new THREE.Group();
    axe.position.set(x, y, 0.08);
    axe.rotation.z = d * 0.75;
    g.add(axe);
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.1, 8), M.oak);
    haft.castShadow = true;
    axe.add(haft);
    const head = new THREE.Shape();
    head.moveTo(0, -0.06); head.lineTo(0.12, -0.12); head.quadraticCurveTo(0.2, 0, 0.12, 0.12); head.lineTo(0, 0.06);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(head, { depth: 0.02, bevelEnabled: false }), M.iron);
    blade.position.set(d * 0.02, 0.45, -0.01);
    blade.scale.x = d;
    blade.castShadow = true;
    axe.add(blade);
  }
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 24).rotateX(Math.PI / 2), M.panel);
  shield.position.set(x, y, 0.13);
  shield.castShadow = true;
  g.add(shield);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 6, 24), M.iron);
  rim.position.set(x, y, 0.16);
  g.add(rim);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.brass);
  boss.position.set(x, y, 0.16);
  g.add(boss);
}

/** A shelf on a wall (its frame) at (x, y), `w` long: plates stood on edge against the wall, jugs and cups between. */
function plateShelf(g: THREE.Object3D, M: Mats, x: number, y: number, w: number, rng: () => number): void {
  box(g, w, 0.04, 0.24, x, y, 0.12, M.oak);
  for (const sx of [-1, 1]) box(g, 0.04, 0.16, 0.2, x + sx * (w / 2 - 0.1), y - 0.16, 0.1, M.timber);
  const clay = new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.7 });
  const pewter = new THREE.MeshStandardMaterial({ color: 0x9a9890, metalness: 0.7, roughness: 0.45 });
  for (let at = x - w / 2 + 0.16; at < x + w / 2 - 0.12;) {
    if (rng() < 0.55) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.02, 20).rotateX(Math.PI / 2 - 0.15), rng() < 0.5 ? pewter : clay);
      plate.position.set(at + 0.07, y + 0.17, 0.05);
      plate.castShadow = true;
      g.add(plate);
      at += 0.3;
    } else {
      const outline = [[0.0, 0], [0.06, 0], [0.075, 0.06], [0.065, 0.14], [0.035, 0.19], [0.04, 0.22], [0, 0.22]].map(([r, h]) => new THREE.Vector2(r, h));
      const jug = new THREE.Mesh(new THREE.LatheGeometry(outline, 12), clay);
      jug.position.set(at + 0.06, y + 0.04, 0.12);
      jug.castShadow = true;
      g.add(jug);
      at += 0.2;
    }
  }
}

/** Bunches of dried herbs hung from a beam at (x, y, z), `n` of them along x. */
function herbs(g: THREE.Object3D, x: number, y: number, z: number, n: number, rng: () => number): void {
  const greens = [0x5a6a30, 0x7a7a3a, 0x6a5a30, 0x8a6a4a];
  for (let k = 0; k < n; k++) {
    const m = new THREE.MeshStandardMaterial({ color: greens[k % greens.length], roughness: 0.95 });
    const bunch = new THREE.Mesh(new THREE.ConeGeometry(0.07 + rng() * 0.03, 0.32 + rng() * 0.12, 7).rotateX(Math.PI), m);
    bunch.position.set(x + k * 0.32 + (rng() - 0.5) * 0.06, y - 0.32, z + (rng() - 0.5) * 0.1);
    bunch.rotation.z = (rng() - 0.5) * 0.2;
    bunch.castShadow = true;
    g.add(bunch);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4), m);
    tie.position.set(bunch.position.x, y - 0.08, bunch.position.z);
    g.add(tie);
  }
}

/** the height of the tavern's table tops, where its cups and candles stand (m), and how thick their worn top is */
const TOP = 0.76, WORN = 0.012;

/** The tavern: the hearth in the back wall, the bar down the east wall with its shelves of bottles and kegs, the party's
 *  round table by the hearth with its map, a long table and benches, barrels by the door, the party board beside it. */
export function build(group: THREE.Group): Room {
  const id: RoomId = 'tavern', b = begin(id, group, 4711), { g, M, obstacles, rng } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  // (its tables and seats in a wood of their own: in the floor's dark oak they read as one with it, from play, "tables
  // should stand out from the floor"; a ruddy rim and legs nearly black, a pale top worn by the tankards, its grain
  // finer: the oak's and the floor's maps and programs, other colours and repeats)
  const legs = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x1c100a });
  const rim = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0xa8461a });
  const worn = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(boards(), [1, 2], 0.5), color: 0xfff0d8, roughness: 0.6 });
  const T: Mats = { ...M, oak: rim, timber: legs };
  /** a table in the tavern's wood: its top a hair over the rim, at the height the cups stand */
  const inn = (x: number, z: number, w: number, d: number, round = false): void => {
    table(g, T, x, z, w, d, obstacles, TOP - WORN, round);
    if (round) drum(g, w / 2 - 0.05, w / 2 - 0.05, WORN, x, TOP - WORN, z, worn, 24).castShadow = false;
    else box(g, w - 0.08, WORN, d - 0.08, x, TOP - WORN, z, worn).castShadow = false;
  };
  hearth(g, M, new THREE.Vector3(0.6, 0, -hz), 0, high, b.updaters, obstacles);
  // (tankards and a pot on the mantel)
  for (const x of [-0.3, 0.1, 0.55, 1.2, 1.5]) tankard(g, M, x, 1.46, -hz + 0.78, x > 1);
  // --- the bar: a counter down the east wall, a shelf of bottles behind it, kegs on a rack ---
  const barX = hx - 1.3, barFrom = -hz + 0.9, barTo = 1.0, barLong = barTo - barFrom;
  box(g, 0.55, 1.0, barLong, barX, 0, (barFrom + barTo) / 2, M.panel);
  box(g, 0.7, 0.07, barLong + 0.1, barX, 1.0, (barFrom + barTo) / 2, M.oak);
  box(g, 0.6, 0.08, 0.06, barX, 0.08, barTo + 0.05, M.timber);
  for (let z = barFrom + 0.4; z < barTo; z += 0.75) box(g, 0.04, 0.85, 0.08, barX - 0.29, 0.08, z, M.timber);
  for (let z = barFrom + 0.3; z < barTo - 0.2; z += 0.8) obstacles.push({ x: barX, z, r: 0.42, h: 1.07 });
  obstacles.push({ x: barX, z: barTo - 0.2, r: 0.42, h: 1.07 });
  for (const [z, metal] of [[-1.9, false], [-1.2, true], [-0.1, false], [0.6, false]] as const) tankard(g, M, barX - 0.1, 1.07, z, metal);
  // (no seats: at 0.72 m his feet reached the floor only with his legs near straight, as a man stood, from review; a
  // bar stool's sit wants a rung for his feet)
  for (const z of [-2.2, -1.2, -0.2, 0.7]) stool(g, T, barX - 0.75, z, 0.72);
  const east = onWall(g, id, 'east');
  const bottles: THREE.Matrix4[] = [], tints: THREE.Color[] = [];
  const glassTints = [0x2a5a2a, 0x6a2a14, 0x1a3a5a, 0x8a6a2a, 0x3a1a3a];
  for (const y of [1.35, 1.85]) {
    box(east, 2.6, 0.05, 0.3, -1.0, y - 0.05, 0.15, M.oak);
    for (const sx of [-1, 1]) box(east, 0.04, 0.12, 0.24, -1.0 + sx * 1.2, y - 0.17, 0.12, M.iron);
    for (let x = -2.2; x < 0.2; x += 0.11 + rng() * 0.05) {
      const tall = 0.2 + rng() * 0.12;
      bottles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + tall / 2, 0.15), new THREE.Quaternion(), new THREE.Vector3(1, tall / 0.3, 1)));
      tints.push(new THREE.Color(glassTints[(rng() * glassTints.length) | 0]));
    }
  }
  const bottleGeo = new THREE.LatheGeometry([[0, -0.15], [0.04, -0.15], [0.045, -0.13], [0.045, 0.05], [0.016, 0.1], [0.014, 0.15], [0, 0.15]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.2 });
  const bottleMesh = new THREE.InstancedMesh(bottleGeo, bottleMat, bottles.length);
  bottles.forEach((m, i) => { bottleMesh.setMatrixAt(i, m); bottleMesh.setColorAt(i, tints[i]); });
  bottleMesh.castShadow = true;
  east.add(bottleMesh);
  // (kegs on a rack behind the bar, at its far end)
  box(g, 0.7, 0.4, 1.5, hx - 0.4, 0, -hz + 1.1, M.timber);
  for (const z of [-hz + 0.7, -hz + 1.45]) barrel(g, M, hx - 0.4, 0.4, z, true, Math.PI / 2);
  obstacles.push({ x: hx - 0.4, z: -hz + 1.1, r: 0.6, h: 1.0 });
  // (lanterns over the bar)
  lantern(east, M, -2.6, 2.6, 0, 0, 1);
  lantern(east, M, 0.6, 2.6, 0, 0, 1);
  // --- the party's round table by the hearth, a map spread on it, stools round ---
  const [px, pz] = [-hx + 2.2, -hz + 2.4];
  inn(px, pz, 1.5, 1.5, true);
  const map = writing(M, 512, 384, 0.9, 0.66);
  map.mesh.rotation.set(-Math.PI / 2, 0, 0.2);
  map.mesh.position.set(px, 0.765, pz);
  g.add(map.mesh);
  map.write((cx, w, h) => drawMap(cx, w, h));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const [sx, sz] = [px + Math.cos(a) * 1.05, pz + Math.sin(a) * 1.05];
    b.seats.push(stoolSeatOf(stool(g, T, sx, sz), sx, sz));
  }
  candle(g, M, px + 0.45, 0.76, pz - 0.3, 0.18, CANDLE);
  tankard(g, M, px - 0.5, 0.76, pz + 0.2);
  tankard(g, M, px - 0.2, 0.76, pz - 0.5, true);
  // --- a long table with benches, west by the front ---
  const [lx, lz] = [-hx + 1.6, 1.4];
  inn(lx, lz, 0.9, 2.2);
  for (const sx of [-1, 1]) {
    const seat = bench(g, T, lx + sx * 0.75, lz, 2.0, Math.PI / 2), o = { x: lx + sx * 0.75, z: lz, r: 0.2, h: 0.45 };
    obstacles.push(o);
    // (along its length, its ends' legs left out)
    b.seats.push(lengthSeat(o.x, o.z, Math.PI / 2, BENCH_SAT, 0.02, [o], [seat.top], [{ root: seat.group }]));
  }
  candle(g, M, lx, 0.76, lz - 0.2, 0.2, CANDLE);
  for (const [dx, dz] of [[-0.25, 0.6], [0.2, -0.7], [0.25, 0.3]]) tankard(g, M, lx + dx, 0.76, lz + dz, dz < 0);
  // --- a small table in the middle ---
  inn(0.3, -0.2, 0.9, 0.9, true);
  for (const a of [0.6, 2.2, 3.9]) {
    const [sx, sz] = [0.3 + Math.cos(a) * 0.75, -0.2 + Math.sin(a) * 0.75];
    b.seats.push(stoolSeatOf(stool(g, T, sx, sz), sx, sz));
  }
  candle(g, M, 0.3, 0.76, -0.2, 0.16, CANDLE);
  // --- barrels by the door, the party board beside it ---
  barrel(g, M, -hx + 0.5, 0, hz - 0.5);
  barrel(g, M, -hx + 1.15, 0, hz - 0.45);
  barrel(g, M, -hx + 0.75, 0.8, hz - 0.5, false, 0.4);
  obstacles.push({ x: -hx + 0.8, z: hz - 0.5, r: 0.7, h: 1.6 });
  barrel(g, M, hx - 0.45, 0, hz - 0.5);
  obstacles.push({ x: hx - 0.45, z: hz - 0.5, r: 0.35, h: 0.8 });
  const board = writing(M, 512, 640, 0.9, 1.12);
  framed(east, M, board, hz - 1.7, 1.6, 0.9, 1.12);
  board.write((cx, w, h) => drawPartyBoard(cx, w, h));
  const west = onWall(g, id, 'west');
  lantern(west, M, -0.6, 2.4, 0, 0, 1);
  banner(west, M, 2.9, high - 0.35, [0.36, 0.18, 0.04], rng, 0.7);
  sign(west, M, 1.0, 2.55, 'THE EMBER & OAK', 'Hearth, ale and good company');
  // (the back wall: crossed axes and a shield beside the hearth, a shelf of plates and jugs the other side)
  const back = onWall(g, id, 'back');
  crossedAxes(back, M, -2.6, 2.0);
  plateShelf(back, M, -4.3, 1.75, 1.4, rng);
  plateShelf(back, M, -4.3, 2.35, 1.4, rng);
  plateShelf(back, M, 3.0, 1.95, 1.6, rng);
  // (dried herbs from the beams)
  // (over the bar alone: over the long table they hung before the sign)
  herbs(g, barX - 0.5, high - 0.26, -2.2, 6, rng);
  // (a pair of antlers over the west wall, and sacks of grain)
  lantern(west, M, -(hz - 0.6), 2.3, 0, 0, 1);
  lantern(east, M, hz - 0.4, 2.4, 0, 0, 1);
  // (under the ridge beam and hung from it, as the house of records' is: at 0.4 off it, the beam ran through its wheel)
  chandelier(g, M, -0.4, high - CHANDELIER_DROP, 0.05, high - RIDGE_UNDER);
  rug(g, M, 0.2, 2.2, 2.0, 1.4, ['#3a2414', '#a07030', '#5a1a14'], 77);
  return finish(id, b);
}

/** The map spread on the party's table: the village, its two ways out, the roads, inked on parchment. */
function drawMap(cx: CanvasRenderingContext2D, w: number, h: number): void {
  parchment(cx, w, h, 13);
  cx.strokeStyle = '#4a2a10'; cx.lineWidth = 4; cx.strokeRect(12, 12, w - 24, h - 24);
  cx.strokeStyle = '#6a3a14'; cx.lineWidth = 3;
  cx.beginPath(); cx.ellipse(w / 2, h / 2, w * 0.3, h * 0.32, 0.2, 0, Math.PI * 2); cx.stroke();
  cx.setLineDash([10, 8]);
  cx.beginPath(); cx.moveTo(w / 2, h / 2); cx.quadraticCurveTo(w * 0.7, h * 0.35, w * 0.86, h * 0.2); cx.stroke();
  cx.beginPath(); cx.moveTo(w / 2, h / 2); cx.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.14, h * 0.8); cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle = '#5a1a0a';
  cx.font = `700 26px ${DISPLAY}`;
  cx.textAlign = 'center';
  cx.fillText('Crypt', w * 0.84, h * 0.14);
  cx.fillText('Thornwood', w * 0.2, h * 0.9);
  // (the party's marks: a cross on each way out, a ring round the village)
  cx.lineWidth = 5;
  for (const [x, y] of [[w * 0.86, h * 0.2], [w * 0.14, h * 0.8]]) {
    cx.beginPath(); cx.moveTo(x - 12, y - 12); cx.lineTo(x + 12, y + 12); cx.moveTo(x + 12, y - 12); cx.lineTo(x - 12, y + 12); cx.stroke();
  }
  cx.fillStyle = '#3a200c';
  cx.beginPath(); cx.arc(w / 2, h / 2, 9, 0, Math.PI * 2); cx.fill();
}

/** The party board's notices: a call to arms, and how to raise or join a party. */
function drawPartyBoard(cx: CanvasRenderingContext2D, w: number, h: number): void {
  cx.fillStyle = '#4a3020'; cx.fillRect(0, 0, w, h);
  const notice = (x: number, y: number, nw: number, nh: number, turn: number, title: string, lines: string[], seed: number) => {
    cx.save();
    cx.translate(x, y); cx.rotate(turn);
    cx.save(); cx.translate(-nw / 2, -nh / 2);
    parchment(cx, nw, nh, seed);
    cx.restore();
    cx.fillStyle = '#3a200c'; cx.textAlign = 'center'; cx.textBaseline = 'top';
    cx.font = `700 ${Math.round(nw * 0.11)}px ${DISPLAY}`;
    cx.fillText(title, 0, -nh / 2 + nh * 0.08, nw * 0.9);
    cx.font = `500 ${Math.round(nw * 0.085)}px ${BODY}`;
    lines.forEach((l, i) => cx.fillText(l, 0, -nh / 2 + nh * 0.3 + i * nw * 0.11, nw * 0.88));
    cx.fillStyle = '#7a1a10';
    cx.beginPath(); cx.arc(0, -nh / 2 + 10, 8, 0, Math.PI * 2); cx.fill();
    cx.restore();
  };
  notice(w * 0.5, h * 0.3, w * 0.8, h * 0.42, -0.03, 'Companions Wanted', ['Raise a party here', 'and share its code,', 'or join a friend\'s.'], 21);
  notice(w * 0.3, h * 0.74, w * 0.46, h * 0.36, 0.06, 'Up to Four', ['Fall together,', 'rise together.'], 22);
  notice(w * 0.74, h * 0.76, w * 0.42, h * 0.32, -0.08, 'Spoils', ['Each keeps', 'their own.'], 23);
}
