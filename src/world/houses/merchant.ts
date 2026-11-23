// The village's merchant's shop, Odo's Wares (data/houses/merchant.ts, its room found by world/houses.ts with
// every other house's in this folder; its trade is loot/merchant.ts and ui/merchant.ts): Odo behind a long counter across the back, a brass
// scale, his ledger and a candle on it, shelves of jars, bottles and boxes behind him under his sign; swords, axes and
// a spear in a rack down one wall, shields and an armour stand by the hearth on the other; a display table of helms and
// rings, a strongbox, crates and barrels by the door, a rug. Behind the counter, what Odo handles as he works
// (entities/models/odoLife.ts): jars on a crate for the lowest shelf's bare end, a duster in a pot, a dagger. Its goods
// round the walls and its two showpieces are merchantWares.ts; its counter and display tops an oiled wood apart from the
// floor's planks (`oiledWood`). As every
// room: 10 point lights, two casting (the hearth and the chandelier).
import * as THREE from 'three';
import { HOUSES, type RoomId } from '../../data/houses';
import {
  BODY, CANDLE, CROSS_UNDER, DISPLAY, LANTERN, barrel, begin, box, candle, chandelier, drum, finish, framed, hearth, lantern, onWall, rug,
  writing, keepApart, type Build, type Mats, type Room,
} from '../rooms';
import { G } from '../../state';
import { blockGeometry, bookShape, pageHeight, printGeometry } from '../../entities/models/book';
import { odoSteps, coinGeometry, odoTrading, ODO_FAR, type Odo } from '../../entities/models/merchant';
import { gripOf, type OdoShop, type Thing } from '../../entities/models/odoLife';
import { particles, col } from '../../fx/particles';
import { rand } from '../../util';
import { pbrMaterialMaps, wood } from '../../core/textures';
import { dressWares } from '../merchantWares';

/** how much of the lowest left shelf is left bare for Odo to stock (m) */
const STOCK_GAP = 0.4;

/** The counter's and the display table's tops: oiled, planed oak, a dark stain with a sheen, its grain finer and laid
 *  along the boards, against the floor's worn, matt, paler planks (from play: "different texture for table vs floor"):
 *  the oak's maps and program, another colour, repeat and finish. */
const oiledWood = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), [2.4, 1], 0.45), color: 0x4a2612, roughness: 0.32, envMapIntensity: 1.3 });

/** bright steel for what's for sale (the rooms' iron is dark, for brackets and hoops) */
const steelMat = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.35 });

/** A sword standing on its point at (x, z) in `g`, leaning back `lean`: blade, guard, grip and pommel. */
function sword(g: THREE.Object3D, M: Mats, steel: THREE.Material, x: number, y: number, z: number, lean: number, long = 0.8): void {
  const s = new THREE.Group();
  s.position.set(x, y, z);
  s.rotation.x = -lean;
  g.add(s);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, long, 0.008), steel);
  blade.position.y = long / 2;
  blade.castShadow = true;
  s.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.06, 4).rotateY(Math.PI / 4), steel);
  tip.scale.z = 0.25;
  tip.position.y = -0.03;
  tip.rotation.z = Math.PI;
  s.add(tip);
  box(s, 0.18, 0.025, 0.03, 0, long, 0, M.brass);
  box(s, 0.03, 0.16, 0.03, 0, long + 0.025, 0, M.leather);
  drum(s, 0.025, 0.025, 0.035, 0, long + 0.185, 0, M.brass, 8);
}

/** An axe standing on its haft's foot at (x, z), leaning back: the haft and a bearded head. */
function axe(g: THREE.Object3D, M: Mats, steel: THREE.Material, x: number, y: number, z: number, lean: number): void {
  const a = new THREE.Group();
  a.position.set(x, y, z);
  a.rotation.x = -lean;
  g.add(a);
  drum(a, 0.02, 0.024, 0.95, 0, 0, 0, M.oak, 8);
  const head = new THREE.Shape();
  head.moveTo(0, -0.05); head.lineTo(0.14, -0.13); head.quadraticCurveTo(0.21, 0, 0.14, 0.11); head.lineTo(0, 0.05);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(head, { depth: 0.015, bevelEnabled: false }).rotateY(Math.PI / 2), steel);
  blade.position.set(0, 0.84, 0.01);
  blade.castShadow = true;
  a.add(blade);
}

/** The weapon rack against a wall (its frame, facing +z) at x: a frame of two rails and a foot board with notches,
 *  four swords, two axes and a spear standing in it. */
function weaponRack(frame: THREE.Object3D, M: Mats, steel: THREE.Material, x: number): void {
  const W = 1.9;
  box(frame, W, 0.08, 0.36, x, 0, 0.2, M.timber);
  for (const sx of [-1, 1]) box(frame, 0.08, 1.4, 0.08, x + sx * (W / 2 - 0.04), 0, 0.33, M.timber);
  for (const y of [0.7, 1.15]) box(frame, W, 0.07, 0.06, x, y, 0.33, M.panel);
  const lean = 0.12;
  [-0.7, -0.45, -0.2, 0.05].forEach((dx, i) => sword(frame, M, steel, x + dx, 0.09, 0.26, lean, 0.75 + (i % 2) * 0.12));
  for (const dx of [0.35, 0.6]) axe(frame, M, steel, x + dx, 0.09, 0.26, lean);
  const spear = new THREE.Group();
  spear.position.set(x + 0.82, 0.09, 0.26);
  spear.rotation.x = -lean;
  frame.add(spear);
  drum(spear, 0.018, 0.02, 1.9, 0, 0, 0, M.oak, 8);
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), steel);
  point.position.y = 2.0;
  spear.add(point);
}

/** A round shield hung on a wall (its frame) at (x, y): painted boards, an iron rim and a brass boss. */
function roundShield(frame: THREE.Object3D, M: Mats, x: number, y: number, paint: number, r = 0.32): void {
  const face = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 28).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: paint, roughness: 0.75 }));
  face.position.set(x, y, 0.04);
  face.castShadow = true;
  frame.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 28), M.iron);
  rim.position.set(x, y, 0.06);
  frame.add(rim);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.brass);
  boss.position.set(x, y, 0.06);
  frame.add(boss);
}

/** An armour stand at (x, z), turned `turn`: a post on a foot, a cuirass of steel on its shoulders, a helm on top. */
function armourStand(g: THREE.Object3D, M: Mats, steel: THREE.Material, x: number, z: number, turn: number): void {
  const a = new THREE.Group();
  a.position.set(x, 0, z);
  a.rotation.y = turn;
  g.add(a);
  box(a, 0.5, 0.05, 0.5, 0, 0, 0, M.timber);
  drum(a, 0.03, 0.035, 1.3, 0, 0.05, 0, M.timber, 8);
  box(a, 0.5, 0.05, 0.05, 0, 1.25, 0, M.timber);
  const cuirass = new THREE.Mesh(new THREE.LatheGeometry([[0.16, 0], [0.2, 0.08], [0.22, 0.3], [0.21, 0.45], [0.12, 0.52], [0.06, 0.54]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 18), steel);
  cuirass.scale.z = 0.7;
  cuirass.position.y = 0.78;
  cuirass.castShadow = true;
  a.add(cuirass);
  for (const sx of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    pauldron.position.set(sx * 0.22, 1.24, 0);
    a.add(pauldron);
  }
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), steel);
  helm.position.y = 1.42;
  helm.castShadow = true;
  a.add(helm);
  box(a, 0.03, 0.14, 0.03, 0, 1.36, 0.12, steel);
}

/** A brass balance scale at (x, y, z): a stepped, weighted base on four feet, a post ringed twice under a finial, a
 *  beam with ball finials at its ends over a pivot ring, its pointer against a plate, and at each end a dished pan hung
 *  on three cords from a hook, the near one (+x) a little higher with a few coins in it. Returns where a coin lies on
 *  the near pan's floor. (A post, a bar and two sphere caps on sticks read as very plain: from play.) */
function scale(g: THREE.Object3D, M: Mats, x: number, y: number, z: number): THREE.Vector3 {
  drum(g, 0.1, 0.11, 0.02, x, y, z, M.brass, 18);
  drum(g, 0.072, 0.09, 0.025, x, y + 0.02, z, M.brass, 18);
  drum(g, 0.03, 0.045, 0.02, x, y + 0.045, z, M.brass, 12);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.brass);
    foot.position.set(x + Math.cos(a) * 0.095, y + 0.004, z + Math.sin(a) * 0.095);
    g.add(foot);
  }
  drum(g, 0.011, 0.013, 0.3, x, y + 0.065, z, M.brass, 8);
  for (const ry of [0.13, 0.25]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 14).rotateX(Math.PI / 2), M.brass);
    band.position.set(x, y + ry, z);
    g.add(band);
  }
  const beamY = y + 0.35, tilt = 0.06;
  const beam = new THREE.Group();
  beam.position.set(x, beamY, z);
  beam.rotation.z = tilt;
  g.add(beam);
  box(beam, 0.46, 0.014, 0.012, 0, -0.007, 0, M.brass);
  box(beam, 0.16, 0.022, 0.008, 0, -0.011, 0, M.brass);
  for (const sx of [-1, 1]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), M.brass);
    ball.position.set(sx * 0.235, 0, 0);
    beam.add(ball);
  }
  const pivot = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 16), M.brass);
  pivot.position.set(x, beamY, z + 0.008);
  g.add(pivot);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.035, 8), M.brass);
  finial.position.set(x, beamY + 0.04, z);
  g.add(finial);
  // (its pointer up from the beam's middle, against a plate on the post)
  box(g, 0.005, 0.11, 0.004, x, beamY, z + 0.014, M.brass).rotation.z = tilt;
  box(g, 0.07, 0.06, 0.004, x, beamY + 0.01, z + 0.008, M.brass);
  // (each pan a shallow dish, its rim rolled, hung on three cords from a hook at the beam's end)
  const pans = new THREE.MeshStandardMaterial({ color: 0xd0a850, metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
  const dish = new THREE.LatheGeometry([[0, 0], [0.045, 0.002], [0.062, 0.012], [0.069, 0.022]]
    .map(([r, yy]) => new THREE.Vector2(r, yy)), 24);
  let nearFloor = new THREE.Vector3();
  for (const [sx, drop] of [[-1, 0.2], [1, 0.17]] as const) {
    const end = new THREE.Vector3(x + sx * 0.235 * Math.cos(tilt), beamY + sx * 0.235 * Math.sin(tilt), z);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0018, 5, 10), M.brass);
    hook.position.copy(end).add(new THREE.Vector3(0, -0.012, 0));
    g.add(hook);
    const floor = new THREE.Vector3(end.x, end.y - drop, z);
    const pan = new THREE.Mesh(dish, pans);
    pan.position.copy(floor);
    pan.castShadow = true;
    g.add(pan);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.069, 0.0025, 5, 28).rotateX(Math.PI / 2), M.brass);
    rim.position.copy(floor).add(new THREE.Vector3(0, 0.022, 0));
    g.add(rim);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      const from = hook.position.clone().add(new THREE.Vector3(0, -0.006, 0));
      const to = floor.clone().add(new THREE.Vector3(Math.cos(a) * 0.066, 0.022, Math.sin(a) * 0.066));
      const cordMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 1, 0.0013, 4, false), M.brass);
      g.add(cordMesh);
    }
    if (sx > 0) nearFloor = floor;
  }
  // (a few struck coins on the near pan's floor, the one he weighs among them)
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(coinGeometry(), M.brass);
    c.position.set(nearFloor.x + Math.sin(k * 2.1) * 0.014, nearFloor.y + 0.003 + k * 0.0031, nearFloor.z + Math.cos(k * 2.1) * 0.014);
    c.rotation.set(Math.sin(k) * 0.08, k, Math.cos(k) * 0.08);
    g.add(c);
  }
  return nearFloor.clone().add(new THREE.Vector3(0, 0.003 + 4 * 0.0031, 0));
}

/** A jar of the shelves' (its foot at its origin, 0.19 tall). */
const jarGeo = (): THREE.LatheGeometry => new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.065, 0.06], [0.05, 0.14], [0.03, 0.16], [0.035, 0.19], [0, 0.19]]
  .map(([r, yy]) => new THREE.Vector2(r, yy)), 12);

/** A cut gem `r` across its girdle (its table up): a brilliant's crown of facets over a deeper pavilion to a point,
 *  each facet its own face. (Plain octahedra read as flat-shaded dice, from play.) */
function gemGeometry(r: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry([[0, -r * 0.86], [r, -0.02 * r], [r, 0.02 * r], [r * 0.62, r * 0.36], [0, r * 0.36]]
    .map(([x, y]) => new THREE.Vector2(x, y)), 8);
  return g.toNonIndexed();
}

/** a gem's stone: its colour deep in it, a glint off its facets, a little of its own glow so it reads in the shadow */
function gemMaterial(colour: number): THREE.MeshStandardMaterial {
  const deep = new THREE.Color(colour);
  return new THREE.MeshStandardMaterial({
    color: deep, roughness: 0.04, metalness: 0.25, flatShading: true,
    emissive: deep.clone().multiplyScalar(0.28), envMapIntensity: 2.2,
  });
}

/** A jar's paper label round its belly and its stopper, on `jar` (its foot at its origin). */
function dressJar(jar: THREE.Object3D, M: Mats): void {
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0655, 0.066, 0.045, 14, 1, true), M.paper);
  label.position.y = 0.085;
  jar.add(label);
  const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.027, 0.024, 10), M.oak);
  stopper.position.y = 0.198;
  jar.add(stopper);
}

/** A crate of slats on four corner posts at (x, y, z), `w` by `h` by `d`, turned `turn`: three slats a side with gaps
 *  between them, its lid of boards. */
function crate(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, w: number, h: number, d: number, turn: number): THREE.Group {
  const c = new THREE.Group();
  c.position.set(x, y, z);
  c.rotation.y = turn;
  g.add(c);
  const post = 0.045, slat = 0.016, lid = 0.02;
  // (each post up to under the lid: as tall as the crate, its top lay in the lid's top at every corner, two faces in
  // one plane, which flicker from above; `lab houses` found the stack by the door once it ran again)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(c, post, h - lid, post, sx * (w / 2 - post / 2), 0, sz * (d / 2 - post / 2), M.timber);
  const rows = 3, tall = (h - 0.02) / rows - 0.025;
  for (let k = 0; k < rows; k++) {
    const yy = 0.01 + k * (tall + 0.025);
    for (const sz of [-1, 1]) box(c, w - 0.01, tall, slat, 0, yy, sz * (d / 2 - slat / 2), M.oak);
    for (const sx of [-1, 1]) box(c, slat, tall, d - 0.01, sx * (w / 2 - slat / 2), yy, 0, M.oak);
  }
  for (let k = 0; k < 4; k++) box(c, w, lid, d / 4 - 0.006, 0, h - lid, -d / 2 + d / 8 + (k * d) / 4, M.oak);
  return c;
}

/** The ledger: an open book at (x, y, z) turned `turn`, `size` across, its pages written in his hand (dates, wares
 *  in and out, what was given for them, ruled off). Returns the middle of the page on his left, where he writes. */
function ledgerBook(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, turn: number, size: number): THREE.Vector3 {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.y = turn;
  g.add(b);
  const COVER = 0.012;
  box(b, size * 1.04, COVER, size * 0.72, 0, 0, 0, M.leather);
  const shape = bookShape(size), block = blockGeometry(shape), print = printGeometry(shape);
  const entries = [
    ['iron helm, dented', 'two commons'], ['3 daggers', 'a rare'], ['ring of the fen', 'four magic'],
    ['boots, worn', 'one common'], ['bow, yew', 'three commons'], ['amulet', 'a rare, two magic'],
    ['shield, oak', 'two commons'], ['axe, bearded', 'a magic'],
  ];
  for (const sx of [1, -1]) {
    const half = new THREE.Mesh(block, M.paper);
    half.position.y = COVER;
    half.rotation.y = sx > 0 ? 0 : Math.PI;
    half.castShadow = half.receiveShadow = true;
    b.add(half);
    const page = writing(M, 192, 256, 1, 1);
    page.write((cx, w, h) => {
      cx.fillStyle = '#ead9b2'; cx.fillRect(0, 0, w, h);
      cx.strokeStyle = 'rgba(120, 90, 60, 0.35)'; cx.lineWidth = 1;
      for (let yy = 34; yy < h - 8; yy += 20) { cx.beginPath(); cx.moveTo(10, yy); cx.lineTo(w - 10, yy); cx.stroke(); }
      cx.strokeStyle = 'rgba(140, 40, 30, 0.45)';
      cx.beginPath(); cx.moveTo(w * 0.62, 18); cx.lineTo(w * 0.62, h - 8); cx.stroke();
      cx.fillStyle = 'rgba(38, 24, 12, 0.88)';
      cx.font = `italic 600 13px ${BODY}`;
      cx.fillText(sx > 0 ? 'Thornwood road' : 'at the campfire', 12, 22);
      cx.font = `italic 500 11px ${BODY}`;
      entries.slice(sx > 0 ? 0 : 4, sx > 0 ? 6 : 8).forEach(([what, given], i) => {
        const yy = 50 + i * 40;
        cx.fillText(what, 12, yy, w * 0.58);
        cx.fillText(given, w * 0.65, yy, w * 0.33);
        cx.fillText('—', 12, yy + 20);
      });
    });
    const geo = sx > 0 ? print : print.clone();
    if (sx < 0) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i)); }
    page.mesh.geometry.dispose();
    page.mesh.geometry = geo;
    half.add(page.mesh);
  }
  // (the page on his left: the book is turned to read from behind the counter, so it's the book's -x half)
  b.updateMatrixWorld(true);
  return new THREE.Vector3(-shape.half / 2, COVER + pageHeight(shape, 0.5) + shape.printed, 0)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(b.position);
}

/** A shelf of wares on a wall (its frame) at (x, y): jars, bottles and little boxes along it, `gap` left bare at its
 *  left end (where Odo stocks it). */
function waresShelf(frame: THREE.Object3D, M: Mats, x: number, y: number, w: number, seed: number, gap = 0): void {
  box(frame, w, 0.04, 0.3, x, y, 0.15, M.oak);
  for (const sx of [-1, 1]) box(frame, 0.04, 0.18, 0.24, x + sx * (w / 2 - 0.1), y - 0.18, 0.12, M.timber);
  const tints = [0x6a2a14, 0x2a5a3a, 0x8a6a2a, 0x3a3a6a, 0xb87a4a];
  let at = x - w / 2 + 0.12 + gap, k = seed;
  while (at < x + w / 2 - 0.12) {
    const kind = k % 3, tint = tints[k % tints.length];
    k = (k * 7 + 3) % 97;
    if (kind === 0) {
      const jar = new THREE.Mesh(jarGeo(), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }));
      jar.position.set(at + 0.06, y + 0.04, 0.15);
      jar.castShadow = true;
      dressJar(jar, M);
      frame.add(jar);
      at += 0.16;
    } else if (kind === 1) {
      const bottle = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.04, 0.12], [0.014, 0.18], [0.012, 0.23], [0, 0.23]]
        .map(([r, yy]) => new THREE.Vector2(r, yy)), 10), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.15, metalness: 0.2 }));
      bottle.position.set(at + 0.04, y + 0.04, 0.15);
      frame.add(bottle);
      at += 0.11;
    } else {
      box(frame, 0.16, 0.12, 0.16, at + 0.08, y + 0.04, 0.15, M.panel).rotation.y = 0.2;
      at += 0.2;
    }
  }
}

/** The shop's sign over the shelves behind the counter. */
function shopSign(frame: THREE.Object3D, M: Mats, y: number): void {
  const sign = writing(M, 768, 192, 2.2, 0.55);
  sign.write((cx, w, h) => {
    const wood = cx.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, '#3a2414'); wood.addColorStop(1, '#22140a');
    cx.fillStyle = wood; cx.fillRect(0, 0, w, h);
    cx.strokeStyle = '#c99a48'; cx.lineWidth = 6; cx.strokeRect(10, 10, w - 20, h - 20);
    cx.fillStyle = '#e8c070'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `700 ${Math.round(h * 0.42)}px ${DISPLAY}`;
    cx.fillText("ODO'S WARES", w / 2, h * 0.42, w - 60);
    cx.font = `italic 500 ${Math.round(h * 0.17)}px ${BODY}`;
    cx.fillStyle = '#c8a060';
    cx.fillText('Fine gear, fairly traded · No coin, gear for gear', w / 2, h * 0.78, w - 60);
  });
  framed(frame, M, sign, 0, y, 2.2, 0.55);
}

/** A thing Odo handles (entities/models/odoLife.ts): `obj` lying at `pos` turned `turn` in the shop's frame, held in
 *  his hand as `grip` has it, set down on the counter turned `laid`. */
function thing(g: THREE.Object3D, obj: THREE.Object3D, pos: THREE.Vector3, turn: THREE.Quaternion, grip: Thing['grip'],
  laid = new THREE.Quaternion(), curl = 0.85): Thing {
  obj.position.copy(pos);
  obj.quaternion.copy(turn);
  g.add(obj);
  // (it moves in his hands)
  keepApart(obj);
  return { obj, home: { pos: pos.clone(), turn: turn.clone() }, at: { pos: pos.clone(), turn: turn.clone() }, grip, laid, curl, held: null };
}

const V3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
/** a turn about the vertical, and one laying a thing's length (+y) along his left (+x) */
const yawQ = (a: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), a);
const LAID = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), -Math.PI / 2);

/** A feather duster: a turned handle (its foot at its origin, along +y), a fan of brown feathers round its top. */
function duster(M: Mats): THREE.Group {
  const d = new THREE.Group();
  drum(d, 0.011, 0.013, 0.3, 0, 0, 0, M.oak, 8).castShadow = false;
  const plume = new THREE.MeshStandardMaterial({ color: 0xa8845e, roughness: 0.95, side: THREE.DoubleSide });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, tilt = 0.18 + (k % 3) * 0.06;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(0.03, 0.09, 0.006, 0.22); shape.lineTo(-0.006, 0.22); shape.quadraticCurveTo(-0.03, 0.09, 0, 0);
    const f = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), plume);
    f.position.set(0, 0.27, 0);
    f.rotation.set(0, a, 0);
    f.rotateX(tilt);
    d.add(f);
  }
  return d;
}

/** A dagger (its pommel at its origin, the blade along +y, its flat facing ±x): pommel, wrapped grip, guard, blade. */
function dagger(M: Mats, steel: THREE.Material): THREE.Group {
  const d = new THREE.Group();
  drum(d, 0.013, 0.013, 0.02, 0, -0.01, 0, M.brass, 10);
  drum(d, 0.011, 0.011, 0.09, 0, 0.01, 0, M.leather, 8);
  box(d, 0.016, 0.014, 0.085, 0, 0.1, 0, M.brass);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.17, 0.03), steel);
  blade.position.y = 0.199;
  d.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 4).rotateY(Math.PI / 4), steel);
  tip.scale.x = 0.25;
  tip.position.y = 0.309;
  d.add(tip);
  return d;
}

/**
 * The display table by the door (from play: "We need more detail on this table", a plain table with a flat runner, a
 * steel dome, flat rings and a candle): turned legs joined by an apron with a moulding and low stretchers, an oak top
 * with a rounded edge; an embroidered runner draped over its ends to a fringe; a helm on a stand, a glass cloche over an
 * amulet on a cushion, rings with their stones set, cut gems on a velvet tray, a few struck coins, two price tags, and
 * the candle in a brass holder, run with drips of wax. All of it still: a few dozen meshes, none moving, on materials
 * the room already has (and the glass's and the velvet's, warmed with the room).
 */
function displayTable(g: THREE.Group, M: Mats, steel: THREE.Material, tx: number, tz: number): void {
  const t = new THREE.Group();
  t.position.set(tx, 0, tz);
  g.add(t);
  const W = 1.0, D = 0.6, TOP = 0.74;
  // --- the table: turned legs, an apron with a moulding under the top, stretchers low between the legs ---
  const leg = new THREE.LatheGeometry([[0, 0], [0.026, 0], [0.03, 0.02], [0.022, 0.06], [0.026, 0.14], [0.036, 0.24],
    [0.024, 0.34], [0.02, 0.45], [0.03, 0.52], [0.022, 0.56], [0.03, 0.6], [0.03, TOP - 0.1], [0.032, TOP - 0.1], [0, TOP - 0.1]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(leg, M.timber);
      m.position.set(sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08));
      m.castShadow = true;
      t.add(m);
      box(t, 0.064, 0.1, 0.064, sx * (W / 2 - 0.08), TOP - 0.1, sz * (D / 2 - 0.08), M.timber);
    }
  }
  for (const sz of [-1, 1]) {
    box(t, W - 0.16, 0.08, 0.024, 0, TOP - 0.09, sz * (D / 2 - 0.08), M.panel);
    box(t, W - 0.16, 0.014, 0.034, 0, TOP - 0.1, sz * (D / 2 - 0.08), M.oak);
    box(t, W - 0.16, 0.03, 0.03, 0, 0.12, sz * (D / 2 - 0.08), M.timber);
  }
  for (const sx of [-1, 1]) {
    box(t, 0.024, 0.08, D - 0.16, sx * (W / 2 - 0.08), TOP - 0.09, 0, M.panel);
    box(t, 0.034, 0.014, D - 0.16, sx * (W / 2 - 0.08), TOP - 0.1, 0, M.oak);
  }
  box(t, 0.03, 0.03, D - 0.16, 0, 0.12, 0, M.timber);
  // (the top: a slab with its edge rounded and worn, a darker band under it)
  const edge = new THREE.Shape();
  edge.moveTo(-W / 2, -D / 2); edge.lineTo(W / 2, -D / 2); edge.lineTo(W / 2, D / 2); edge.lineTo(-W / 2, D / 2); edge.lineTo(-W / 2, -D / 2);
  const slab = new THREE.ExtrudeGeometry(edge, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012,
    bevelSegments: 3, curveSegments: 1 }).rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(slab, oiledWood());
  topMesh.position.y = TOP + 0.01;
  topMesh.castShadow = topMesh.receiveShadow = true;
  t.add(topMesh);
  // (the top's face: its slab and bevel from TOP to TOP + 0.055)
  const ON = TOP + 0.057;
  // --- the runner: red wool, a gold border embroidered with a running vine, its ends draped over to a fringe ---
  const RL = 0.92, RW = 0.36, DROP = 0.16;
  const cloth = writing(M, 512, 192, RL, RW);
  const embroider = (cx: CanvasRenderingContext2D, w: number, h: number) => {
    cx.fillStyle = '#6a1c1c'; cx.fillRect(0, 0, w, h);
    cx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < w; x += 3) cx.fillRect(x, 0, 1, h);
    cx.strokeStyle = '#c99a48'; cx.lineWidth = 5;
    cx.strokeRect(10, 10, w - 20, h - 20);
    cx.lineWidth = 2;
    cx.strokeRect(20, 20, w - 40, h - 40);
    // (a vine running round inside the border, its leaves in pairs)
    cx.beginPath();
    for (let x = 30; x < w - 30; x += 2) cx.lineTo(x, 32 + 5 * Math.sin(x * 0.08));
    cx.stroke();
    cx.beginPath();
    for (let x = 30; x < w - 30; x += 2) cx.lineTo(x, h - 32 + 5 * Math.sin(x * 0.08 + Math.PI));
    cx.stroke();
    cx.fillStyle = '#d8ac58';
    for (let x = 40; x < w - 40; x += 24) {
      for (const y of [32, h - 32]) { cx.beginPath(); cx.ellipse(x, y + 7 * Math.sin(x * 0.08), 4, 2, 0.6, 0, Math.PI * 2); cx.fill(); }
    }
    // (a diamond in its middle)
    cx.save(); cx.translate(w / 2, h / 2); cx.rotate(Math.PI / 4);
    cx.strokeRect(-20, -20, 40, 40); cx.fillRect(-6, -6, 12, 12);
    cx.restore();
  };
  cloth.write(embroider);
  cloth.mesh.rotation.x = -Math.PI / 2;
  cloth.mesh.position.set(0, ON - 0.0005, 0);
  cloth.mesh.receiveShadow = true;
  t.add(cloth.mesh);
  for (const sx of [-1, 1]) {
    // (the drape over each end, curving from the top's edge down, and a fringe of gold threads under it)
    const drape = writing(M, 192, 96, RW, DROP);
    drape.write((cx, w, h) => {
      cx.fillStyle = '#6a1c1c'; cx.fillRect(0, 0, w, h);
      cx.strokeStyle = '#c99a48'; cx.lineWidth = 4; cx.strokeRect(6, -10, w - 12, h - 2);
    });
    drape.mesh.position.set(sx * (W / 2 + 0.016), ON - 0.003 - DROP / 2, 0);
    drape.mesh.rotation.y = sx * Math.PI / 2;
    t.add(drape.mesh);
    const fringe = writing(M, 192, 32, RW, 0.045);
    fringe.write((cx, w, h) => {
      cx.fillStyle = '#3a1210'; cx.fillRect(0, 0, w, h);
      for (let x = 2; x < w; x += 4) { cx.fillStyle = x % 8 ? '#d8ac58' : '#b08038'; cx.fillRect(x, 0, 2, h - (x % 12 ? 2 : 6)); }
    });
    fringe.mesh.position.set(sx * (W / 2 + 0.017), ON - 0.003 - DROP - 0.022, 0);
    fringe.mesh.rotation.y = sx * Math.PI / 2;
    t.add(fringe.mesh);
  }
  // --- a helm on its stand: a steel bowl, a rim riveted round it, a nasal and cheek guards, a wooden head under it ---
  {
    const hx = -0.3, at = ON;
    drum(t, 0.05, 0.06, 0.03, hx, at, 0.02, M.oak, 12);
    drum(t, 0.018, 0.02, 0.12, hx, at + 0.03, 0.02, M.oak, 8);
    // (a carved wooden head the helm sits on: under it the bowl's inside showed pale)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 10).scale(0.95, 1.1, 1), M.oak);
    head.position.set(hx, at + 0.15, 0.02);
    t.add(head);
    // (forged steel, dull and hammered: its facets catch the light. Smooth and bright, it read as a chrome dome)
    const forged = new THREE.MeshStandardMaterial({ color: 0x7c8088, metalness: 0.7, roughness: 0.55, flatShading: true });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), forged);
    bowl.scale.set(1, 1.15, 1.1);
    bowl.position.set(hx, at + 0.16, 0.02);
    bowl.castShadow = true;
    t.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.008, 6, 28).rotateX(Math.PI / 2), M.brass);
    rim.scale.set(1, 1, 1.1);
    rim.position.set(hx, at + 0.17, 0.02);
    t.add(rim);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), M.brass);
      rivet.position.set(hx + Math.sin(a) * 0.116, at + 0.172, 0.02 + Math.cos(a) * 0.127);
      t.add(rivet);
    }
    // (the crest down its middle, the nasal in front, the cheek guards either side)
    box(t, 0.014, 0.02, 0.2, hx, at + 0.26, 0.02, M.brass).scale.y = 1;
    box(t, 0.02, 0.1, 0.008, hx, at + 0.08, 0.142, forged);
    for (const sx of [-1, 1]) {
      const guard = box(t, 0.008, 0.09, 0.07, hx + sx * 0.108, at + 0.08, 0.06, forged);
      guard.rotation.z = sx * 0.12;
    }
  }
  // --- a glass cloche over an amulet on a cushion, on a turned base ---
  {
    const cx0 = -0.02, cz0 = -0.1;
    drum(t, 0.07, 0.075, 0.016, cx0, ON, cz0, M.oak, 18);
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 8).scale(1, 0.35, 1), velvet(0x1e2a5a));
    cushion.position.set(cx0, ON + 0.026, cz0);
    t.add(cushion);
    const amulet = new THREE.Mesh(gemGeometry(0.02), gemMaterial(0x3f9fff));
    amulet.position.set(cx0, ON + 0.05, cz0);
    amulet.rotation.set(-1.1, 0, 0);
    t.add(amulet);
    const mount = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0028, 6, 20), M.brass);
    mount.position.copy(amulet.position);
    mount.rotation.x = -1.1 + Math.PI / 2;
    t.add(mount);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0012, 4, 24).rotateX(Math.PI / 2), M.brass);
    chain.position.set(cx0, ON + 0.04, cz0 - 0.01);
    t.add(chain);
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 0.04, metalness: 0.1, transparent: true,
      opacity: 0.22, depthWrite: false, envMapIntensity: 2 });
    const dome = new THREE.Mesh(new THREE.LatheGeometry([[0.066, 0], [0.066, 0.08], [0.06, 0.12], [0.04, 0.15], [0.014, 0.162],
      [0.012, 0.175], [0.018, 0.185], [0, 0.19]].map(([r, y]) => new THREE.Vector2(r, y)), 28), glass);
    dome.position.set(cx0, ON + 0.016, cz0);
    t.add(dome);
  }
  // --- rings: each a gold band with a setting of four claws and its stone ---
  const stones = [0xb070ff, 0x46de5c, 0xe8443a];
  stones.forEach((colour, i) => {
    const r = new THREE.Group();
    r.position.set(0.12 + i * 0.07, ON + 0.004, 0.12);
    r.rotation.set(0.1, i * 0.7, 0);
    t.add(r);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0035, 8, 20), M.brass);
    band.position.y = 0.016;
    r.add(band);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.004, 0.006, 8), M.brass);
    seat.position.y = 0.035;
    r.add(seat);
    const stone = new THREE.Mesh(gemGeometry(0.007), gemMaterial(colour));
    stone.position.y = 0.04;
    r.add(stone);
  });
  // --- a velvet tray of cut gems ---
  {
    const tray = new THREE.Group();
    tray.position.set(0.3, ON, -0.12);
    tray.rotation.y = -0.15;
    t.add(tray);
    box(tray, 0.2, 0.02, 0.13, 0, 0, 0, M.oak);
    box(tray, 0.184, 0.004, 0.114, 0, 0.02, 0, velvet(0x14301e));
    [0xb070ff, 0x3f9fff, 0x46de5c, 0xf2da55, 0xe8443a, 0xffffff].forEach((colour, i) => {
      const gem = new THREE.Mesh(gemGeometry(0.011), gemMaterial(colour));
      gem.position.set(-0.06 + (i % 3) * 0.06, 0.03, -0.025 + Math.floor(i / 3) * 0.05);
      gem.rotation.set(0.2 * i, i, 0.1);
      tray.add(gem);
    });
  }
  // --- a few struck coins: a little stack and two laid by it ---
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(coinGeometry(), M.brass);
    const stacked = k < 3;
    c.position.set(stacked ? 0.36 : 0.32 + k * 0.03, ON + 0.0016 + (stacked ? k * 0.0031 : 0), stacked ? 0.13 : 0.18);
    c.rotation.y = k * 1.3;
    t.add(c);
  }
  // --- two price tags on strings, one by the cloche, one by the rings ---
  ([[0.06, -0.02, '3 rares'], [0.24, 0.2, '2 magic']] as const).forEach(([x, z, text]) => {
    const tag = writing(M, 96, 48, 0.05, 0.025);
    tag.write((cx, w, h) => {
      cx.fillStyle = '#e8d8b0'; cx.fillRect(0, 0, w, h);
      cx.strokeStyle = '#6a4a2a'; cx.lineWidth = 2; cx.strokeRect(2, 2, w - 4, h - 4);
      cx.fillStyle = '#3a2210'; cx.font = `italic 600 18px ${BODY}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(text, w / 2, h / 2 + 1, w - 8);
    });
    tag.mesh.rotation.set(-Math.PI / 2 + 0.25, 0, 0.3);
    tag.mesh.position.set(x, ON + 0.006, z);
    t.add(tag.mesh);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.05, 4), M.leather);
    string.rotation.set(Math.PI / 2, 0, 0.6);
    string.position.set(x - 0.03, ON + 0.002, z - 0.012);
    t.add(string);
  });
  // --- the candle in a brass holder, wax run down it and pooled on the holder ---
  {
    const cxc = 0.38, czc = -0.2;
    drum(t, 0.045, 0.05, 0.008, cxc, ON, czc, M.brass, 16);
    drum(t, 0.03, 0.026, 0.02, cxc, ON + 0.008, czc, M.brass, 12);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 5, 12), M.brass);
    loop.position.set(cxc + 0.055, ON + 0.012, czc);
    t.add(loop);
    candle(t, M, cxc, ON + 0.028, czc, 0.12, CANDLE);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.02 + (k % 3) * 0.012, 3, 6), M.wax);
      drip.position.set(cxc + Math.cos(a) * 0.022, ON + 0.028 + 0.1 - k * 0.012, czc + Math.sin(a) * 0.022);
      t.add(drip);
    }
    const pool = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1), M.wax);
    pool.position.set(cxc, ON + 0.028, czc);
    t.add(pool);
  }
}

/** a velvet: soft and matt, its colour deep */
function velvet(colour: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: colour, roughness: 1, metalness: 0 });
}

/** The shop: built into `group`. */
export function build(group: THREE.Group): Room {
  const id: RoomId = 'merchant', b: Build = begin(id, group, 1618), { g, M } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  const steel = steelMat();
  // --- the back wall: his shelves of wares under his sign, lanterns over them ---
  const back = onWall(g, id, 'back');
  for (const [y, seed] of [[1.15, 3], [1.6, 11], [2.05, 23]] as const) {
    // (the lowest's left end bare: Odo stocks it from his crate)
    waresShelf(back, M, -1.25, y, 1.7, seed, y === 1.15 ? STOCK_GAP : 0);
    waresShelf(back, M, 1.25, y, 1.7, seed + 5);
  }
  shopSign(back, M, 2.75);
  for (const sx of [-1, 1]) lantern(back, M, sx * 2.6, 2.6, 0, 0, 1, { ...LANTERN, intensity: 6 });
  // --- the counter across the back, Odo behind it: his scale, his ledger, a candle, a bowl of gems ---
  const cz = -hz + 1.55, cw = 4.2;
  box(g, cw, 1.0, 0.6, 0, 0, cz, M.panel);
  box(g, cw + 0.1, 0.06, 0.7, 0, 1.0, cz, oiledWood());
  for (let x = -cw / 2 + 0.3; x < cw / 2; x += 0.7) box(g, 0.05, 0.9, 0.04, x, 0.06, cz + 0.31, M.timber);
  // (raised panels between its posts, a plinth at its foot and a moulding under its top)
  for (let x = -cw / 2 + 0.65; x < cw / 2 - 0.3; x += 0.7) {
    box(g, 0.56, 0.62, 0.02, x, 0.2, cz + 0.305, M.oak);
    box(g, 0.48, 0.54, 0.012, x, 0.24, cz + 0.318, M.panel);
  }
  box(g, cw + 0.04, 0.08, 0.64, 0, 0, cz, M.timber);
  box(g, cw + 0.06, 0.03, 0.66, 0, 0.97, cz, M.timber);
  for (let x = -cw / 2 + 0.3; x <= cw / 2 - 0.3 + 1e-6; x += 0.6) b.obstacles.push({ x, z: cz, r: 0.38, h: 1.06 });
  // (his scale at his right hand, his ledger at his left, both within his reach)
  const ox = 0.1, oz = -hz + 0.85;
  const panAt = scale(g, M, ox - 0.55, 1.06, cz - 0.15);
  const ledgerPage = ledgerBook(g, M, ox + 0.3, 1.06, cz - 0.2, Math.PI - 0.15, 0.4);
  drum(g, 0.06, 0.07, 0.02, 1.5, 1.06, cz - 0.1, M.brass, 10);
  candle(g, M, 1.5, 1.08, cz - 0.1, 0.18, CANDLE);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M.oak);
  bowl.position.set(-0.3, 1.13, cz);
  g.add(bowl);
  [0xb070ff, 0x3f9fff, 0x46de5c, 0xf2da55].forEach((c, i) => {
    const gem = new THREE.Mesh(gemGeometry(0.018), gemMaterial(c));
    gem.position.set(-0.3 + (i - 1.5) * 0.034, 1.085 + (i % 2) * 0.006, cz + (i % 2) * 0.03 - 0.012);
    gem.rotation.set(0.5 + i * 0.4, i * 1.3, 0.3 - i * 0.2);
    g.add(gem);
  });
  // --- what Odo handles behind his counter (entities/models/odoLife.ts): jars on a crate to stock the shelf with, a
  // feather duster in a pot at the counter's end, a dagger on the counter to look over ---
  const top = 1.06, near = cz - 0.35;
  const [kx, kz] = [-2.5, -hz + 0.45];
  crate(g, M, kx, 0, kz, 0.56, 0.42, 0.46, 0.05);
  crate(g, M, kx, 0.42, kz, 0.5, 0.38, 0.42, -0.08);
  b.obstacles.push({ x: kx, z: kz, r: 0.36, h: 0.8 });
  // (a jar held round its belly from the side, his left hand's palm against it and his fingers round its front: its
  // foot 0.16 under his wrist. Held from above by its neck, his wrist rode high before his shoulder and his forearm
  // crossed his chest, from the lab)
  const jarGrip = gripOf(V3(0, -0.3, 1), V3(-1, 0, 0.1), V3(-0.05, -0.16, 0.075), new THREE.Quaternion());
  const jars = ([[-2.62, -0.08], [-2.44, -0.2], [-2.36, -0.02]] as const).map(([x, dz], i) => {
    const mesh = new THREE.Mesh(jarGeo(), new THREE.MeshStandardMaterial({ color: [0x2a5a3a, 0x8a6a2a, 0x6a2a14][i], roughness: 0.6 }));
    mesh.castShadow = true;
    dressJar(mesh, M);
    return thing(g, mesh, V3(x, 0.8, kz + dz), new THREE.Quaternion(), jarGrip);
  });
  // (the shelf's bare places, on the lowest shelf's left end over the crate's side of the counter)
  const slots = [0, 1].map((n) => V3(-1.25 - 1.7 / 2 + 0.18 + n * 0.16, 1.19, -hz + 0.15));
  // (a duster held as a hand is shaken, its thumb up the handle: its foot 0.1 under his fist)
  drum(g, 0.05, 0.042, 0.12, 1.95, top, near + 0.18, new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.85 }), 12);
  const dusterGrip = gripOf(V3(0, -0.1, 1), V3(1, 0, 0), V3(0.03, -0.1, 0.05), new THREE.Quaternion());
  const theDuster = thing(g, duster(M), V3(1.95, top + 0.03, near + 0.18), yawQ(0.4), dusterGrip, LAID, 1.3);
  // (a dagger held in his fist, palm down, the blade out from his thumb along his left)
  const daggerGrip = gripOf(V3(0, -0.2, 1), V3(0, -1, 0), V3(-0.055, -0.035, 0.05), LAID);
  const theDagger = thing(g, dagger(M, steel), V3(0.92, top + 0.012, near + 0.18), LAID, daggerGrip, LAID, 1.3);
  const plan: OdoShop = {
    counter: { top, near, far: cz + 0.35, front: V3(0, 0, cz + 1.0) },
    desk: { x: ox, z: oz, yaw: 0 },
    // (the top of the coins on the scale's near pan, as the scale reports it: worked out here, it was the other pan's
    // drop, 3 cm under the pan's floor)
    pan: panAt,
    ledger: ledgerPage,
    stock: { stand: { x: -2.05, z: oz - 0.1, yaw: Math.PI }, jars, slots },
    aisle: -hz + 0.72,
    dust: {
      duster: theDuster, take: { x: 2.02, z: oz, yaw: 0 },
      spots: [1.85, 1.25, 0.65].map((x) => ({ x, z: -hz + 0.76, yaw: Math.PI })),
      front: -hz + 0.3, rows: [2.2, 1.75, 1.3],
    },
    blade: { dagger: theDagger, stand: { x: 0.92, z: oz, yaw: 0 } },
  };
  // (Odo, stood once the heroes' heads and hands are made; told who is in his shop, each a customer: the hero, and any
  // partner shown in it)
  let odo: Odo | undefined;
  const customers: THREE.Vector3[] = [], spots = [V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0)];
  const odoAt = new THREE.Vector3(), dust = new THREE.Vector3();
  b.updaters.push((dt, t) => {
    if (!odo) return;
    customers.length = 0;
    for (const p of new Set([G.player, ...G.players])) {
      if (!p || (p !== G.player && p.away) || customers.length >= spots.length) continue;
      customers.push(g.worldToLocal(spots[customers.length].copy(p.pos)));
    }
    const far = !!G.camera && G.camera.position.distanceTo(odo.root.getWorldPosition(odoAt)) > ODO_FAR;
    odo.update(dt, { customers, trading: odoTrading(), t }, far);
    // (the dust his duster raises off the shelves)
    const brushed = odo.life.doing.dusting;
    if (brushed && Math.random() < dt * 9) {
      g.localToWorld(dust.copy(brushed));
      particles.glow.spawn({
        x: dust.x + rand(-0.06, 0.06), y: dust.y + rand(-0.03, 0.05), z: dust.z + rand(-0.06, 0.06),
        vx: rand(-0.08, 0.08), vy: rand(0, 0.06), vz: rand(-0.02, 0.1),
        life: rand(1.5, 3), size: rand(0.008, 0.016), sizeEnd: 0.004,
        color: col(0xe8d0b0, 0.5), colorEnd: col(0xc0a080, 0.05), gravity: -0.01, drag: 0.8,
      });
    }
  });
  // --- the west wall: the weapon rack, a lantern over it; crates by the front ---
  const west = onWall(g, id, 'west');
  weaponRack(west, M, steel, 0.2);
  lantern(west, M, 0.2, 2.45, 0, 0, 1, { ...LANTERN, intensity: 5.5 });
  for (const z of [-0.9, 0, 0.9]) b.obstacles.push({ x: -hx + 0.3, z, r: 0.35, h: 1.4 });
  lantern(west, M, -(hz - 0.5), 2.3, 0, 0, 1);
  // --- the east wall: the hearth, shields over by the back, the armour stand ---
  hearth(g, M, new THREE.Vector3(hx, 0, 1.1), -Math.PI / 2, high, b.updaters, b.obstacles);
  const east = onWall(g, id, 'east');
  roundShield(east, M, -1.1, 1.9, 0x6a1e16);
  roundShield(east, M, -1.95, 1.75, 0x23304e, 0.28);
  roundShield(east, M, -1.5, 1.2, 0x2a4a2a, 0.26);
  lantern(east, M, -1.5, 2.6, 0, 0, 1, { ...LANTERN, intensity: 5 });
  lantern(east, M, hz - 0.5, 2.3, 0, 0, 1);
  armourStand(g, M, steel, hx - 0.9, -0.75, -Math.PI / 2 - 0.4);
  b.obstacles.push({ x: hx - 0.9, z: -0.75, r: 0.35, h: 1.6 });
  // --- the floor: a rug, a display table of helms and rings, a strongbox, crates and barrels by the door ---
  rug(g, M, 0, 0.9, 3.0, 2.0, ['#3a1a2a', '#c09a50', '#1e3a2a'], 59);
  const [tx, tz] = [-1.6, 1.4];
  displayTable(g, M, steel, tx, tz);
  // (the shop's goods round its walls and corners, and its two showpieces: merchantWares.ts)
  dressWares(g, M, steel, V3(-1.75, top, cz), b.obstacles, b.sides[1].group);
  b.obstacles.push({ x: tx, z: tz, r: 0.52, h: 0.8 });
  // (a strongbox, iron-bound)
  box(g, 0.8, 0.45, 0.5, 1.7, 0, 2.0, M.panel).rotation.y = -0.2;
  box(g, 0.84, 0.06, 0.54, 1.7, 0.45, 2.0, M.iron).rotation.y = -0.2;
  b.obstacles.push({ x: 1.7, z: 2.0, r: 0.45, h: 0.5 });
  for (const [x, z, s] of [[-hx + 0.5, hz - 0.6, 0.6], [-hx + 0.5, hz - 1.25, 0.5], [-hx + 0.5, hz - 0.6, 0.45]] as const) {
    crate(g, M, x, z === hz - 0.6 && s < 0.5 ? 0.6 : 0, z, s, s, s, s * 2);
  }
  b.obstacles.push({ x: -hx + 0.5, z: hz - 0.9, r: 0.55, h: 1.0 });
  barrel(g, M, hx - 0.5, 0, hz - 0.5);
  barrel(g, M, hx - 1.15, 0, hz - 0.45);
  b.obstacles.push({ x: hx - 0.8, z: hz - 0.5, r: 0.6, h: 0.8 });
  // (over the rug, short of the counter: over it, from above it hid Odo; centred under the cross beam there and hung
  // from it, as the library's is: between two beams, 0.2 over the ceiling's height, its wheel and candles ran into
  // the one at -0.5, `lab houses`)
  chandelier(g, M, -0.5, high, 1.5, high - CROSS_UNDER);
  return finish(id, b, {
    *seatFolk() {
      if (odo) return;
      odo = yield* odoSteps(plan);
      g.add(odo.root);
    },
    odo: () => odo,
  });
}
