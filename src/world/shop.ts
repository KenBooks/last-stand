// The village's merchant's shop, Odo's Wares (data/houses.ts `merchant`, built with the other houses' rooms by
// world/rooms.ts; its trade is loot/merchant.ts and ui/merchant.ts): Odo behind a long counter across the back, a brass
// scale, his ledger and a candle on it, shelves of jars, bottles and boxes behind him under his sign; swords, axes and
// a spear in a rack down one wall, shields and an armour stand by the hearth on the other; a display table of helms and
// rings, a strongbox, crates and barrels by the door, a rug. As every room: 10 point lights, two casting (the hearth and
// the chandelier).
import * as THREE from 'three';
import { HOUSES, type RoomId } from '../data/houses';
import {
  BODY, CANDLE, DISPLAY, LANTERN, barrel, begin, box, candle, chandelier, drum, finish, framed, hearth, lantern, onWall, rug,
  writing, type Build, type Mats, type Room,
} from './rooms';
import { G } from '../state';
import { buildOdo, type Odo } from '../entities/models/merchant';

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

/** A brass balance scale at (x, y, z): a post, a beam and two pans hung on it, one a little lower. */
function scale(g: THREE.Object3D, M: Mats, x: number, y: number, z: number): void {
  drum(g, 0.09, 0.1, 0.02, x, y, z, M.brass, 14);
  drum(g, 0.012, 0.012, 0.34, x, y + 0.02, z, M.brass, 6);
  const beam = box(g, 0.44, 0.015, 0.015, x, y + 0.35, z, M.brass);
  beam.rotation.z = 0.06;
  for (const [sx, drop] of [[-1, 0.2], [1, 0.17]] as const) {
    for (const dz of [-0.03, 0.03]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, drop, 4), M.brass);
      chain.position.set(x + sx * 0.21, y + 0.35 - drop / 2 + sx * 0.013, z + dz);
      g.add(chain);
    }
    const pan = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), M.brass);
    pan.position.set(x + sx * 0.21, y + 0.35 - drop + sx * 0.013 + 0.05, z);
    g.add(pan);
  }
}

/** A shelf of wares on a wall (its frame) at (x, y): jars, bottles and little boxes along it. */
function waresShelf(frame: THREE.Object3D, M: Mats, x: number, y: number, w: number, seed: number): void {
  box(frame, w, 0.04, 0.3, x, y, 0.15, M.oak);
  for (const sx of [-1, 1]) box(frame, 0.04, 0.18, 0.24, x + sx * (w / 2 - 0.1), y - 0.18, 0.12, M.timber);
  const tints = [0x6a2a14, 0x2a5a3a, 0x8a6a2a, 0x3a3a6a, 0xb87a4a];
  let at = x - w / 2 + 0.12, k = seed;
  while (at < x + w / 2 - 0.12) {
    const kind = k % 3, tint = tints[k % tints.length];
    k = (k * 7 + 3) % 97;
    if (kind === 0) {
      const jar = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.065, 0.06], [0.05, 0.14], [0.03, 0.16], [0.035, 0.19], [0, 0.19]]
        .map(([r, yy]) => new THREE.Vector2(r, yy)), 12), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }));
      jar.position.set(at + 0.06, y + 0.04, 0.15);
      jar.castShadow = true;
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

/** The shop: built into `group`. */
export function buildShop(group: THREE.Group): Room {
  const id: RoomId = 'merchant', b: Build = begin(id, group, 1618), { g, M } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  const steel = steelMat();
  // --- the back wall: his shelves of wares under his sign, lanterns over them ---
  const back = onWall(g, id, 'back');
  for (const [y, seed] of [[1.15, 3], [1.6, 11], [2.05, 23]] as const) {
    waresShelf(back, M, -1.25, y, 1.7, seed);
    waresShelf(back, M, 1.25, y, 1.7, seed + 5);
  }
  shopSign(back, M, 2.75);
  for (const sx of [-1, 1]) lantern(back, M, sx * 2.6, 2.6, 0, 0, 1, { ...LANTERN, intensity: 6 });
  // --- the counter across the back, Odo behind it: his scale, his ledger, a candle, a bowl of gems ---
  const cz = -hz + 1.55, cw = 4.2;
  box(g, cw, 1.0, 0.6, 0, 0, cz, M.panel);
  box(g, cw + 0.1, 0.06, 0.7, 0, 1.0, cz, M.oak);
  for (let x = -cw / 2 + 0.3; x < cw / 2; x += 0.7) box(g, 0.05, 0.9, 0.04, x, 0.06, cz + 0.31, M.timber);
  for (let x = -cw / 2 + 0.3; x <= cw / 2 - 0.3 + 1e-6; x += 0.6) b.obstacles.push({ x, z: cz, r: 0.38, h: 1.06 });
  // (his scale at his right hand, his ledger at his left, both within his reach)
  const ox = 0.1, oz = -hz + 0.85;
  scale(g, M, ox - 0.55, 1.06, cz - 0.15);
  const ledger = writing(M, 256, 192, 0.42, 0.3);
  ledger.write((cx, w, h) => {
    cx.fillStyle = '#e8d8b0'; cx.fillRect(0, 0, w, h);
    cx.fillStyle = 'rgba(40,24,10,0.8)';
    for (let y = 20; y < h - 10; y += 14) cx.fillRect(14, y, w * (0.4 + ((y * 7) % 5) / 10), 2);
    cx.fillRect(w / 2 - 1, 0, 2, h);
  });
  ledger.mesh.rotation.set(-Math.PI / 2, 0, 0.15);
  ledger.mesh.position.set(ox + 0.32, 1.066, cz - 0.2);
  g.add(ledger.mesh);
  box(g, 0.46, 0.02, 0.34, ox + 0.32, 1.04, cz - 0.2, M.leather).rotation.y = 0.15;
  drum(g, 0.06, 0.07, 0.02, 1.5, 1.06, cz - 0.1, M.brass, 10);
  candle(g, M, 1.5, 1.08, cz - 0.1, 0.18, CANDLE);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M.oak);
  bowl.position.set(-0.3, 1.13, cz);
  g.add(bowl);
  [0xb070ff, 0x3f9fff, 0x46de5c, 0xf2da55].forEach((c, i) => {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.025), new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.3 }));
    gem.position.set(-0.3 + (i - 1.5) * 0.035, 1.08, cz + (i % 2) * 0.03);
    g.add(gem);
  });
  // (Odo, stood once the heroes' heads and hands are made: he idles behind the counter, glances at a hero come near)
  let odo: Odo | undefined;
  const hero = new THREE.Vector3();
  b.updaters.push((dt) => {
    if (!odo) return;
    const me = G.player;
    odo.update(dt, me ? hero.copy(me.pos) : null);
  });
  /** where the counter and what he uses on it stand, in his frame */
  const counter = {
    top: 1.06, near: cz - 0.35 - oz,
    // (the scale's near pan: its post 0.55 to his right, 0.15 nearer him than the counter's middle, the pan 0.21 in)
    pan: new THREE.Vector3(-0.55 + 0.21, 1.06 + 0.35 - 0.2 + 0.013 + 0.05, cz - 0.15 - oz),
    ledger: new THREE.Vector3(0.32, 1.066, cz - 0.2 - oz),
  };
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
  box(g, 1.0, 0.06, 0.6, tx, 0.74, tz, M.oak);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 0.74, 0.06, tx + sx * 0.42, 0, tz + sz * 0.24, M.timber);
  b.obstacles.push({ x: tx, z: tz, r: 0.52, h: 0.8 });
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), steel);
  helm.position.set(tx - 0.25, 0.8, tz);
  helm.castShadow = true;
  g.add(helm);
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14).rotateX(Math.PI / 2), M.brass);
    ring.position.set(tx + 0.1 + k * 0.09, 0.808, tz + 0.1);
    g.add(ring);
  }
  const amulet = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), new THREE.MeshStandardMaterial({ color: 0x3f9fff, roughness: 0.2 }));
  amulet.position.set(tx + 0.2, 0.83, tz - 0.12);
  g.add(amulet);
  candle(g, M, tx + 0.38, 0.8, tz - 0.18, 0.14, CANDLE);
  // (a strongbox, iron-bound)
  box(g, 0.8, 0.45, 0.5, 1.7, 0, 2.0, M.panel).rotation.y = -0.2;
  box(g, 0.84, 0.06, 0.54, 1.7, 0.45, 2.0, M.iron).rotation.y = -0.2;
  b.obstacles.push({ x: 1.7, z: 2.0, r: 0.45, h: 0.5 });
  for (const [x, z, s] of [[-hx + 0.5, hz - 0.6, 0.6], [-hx + 0.5, hz - 1.25, 0.5], [-hx + 0.5, hz - 0.6, 0.45]] as const) {
    box(g, s, s, s, x, z === hz - 0.6 && s < 0.5 ? 0.6 : 0, z, M.oak).rotation.y = s * 2;
  }
  b.obstacles.push({ x: -hx + 0.5, z: hz - 0.9, r: 0.55, h: 1.0 });
  barrel(g, M, hx - 0.5, 0, hz - 0.5);
  barrel(g, M, hx - 1.15, 0, hz - 0.45);
  b.obstacles.push({ x: hx - 0.8, z: hz - 0.5, r: 0.6, h: 0.8 });
  // (over the rug, short of the counter: over it, from above it hid Odo)
  chandelier(g, M, 0, high + 0.2, 1.5);
  return finish(id, b, {
    seatFolk() {
      if (odo) return;
      odo = buildOdo(counter);
      odo.root.position.set(ox, 0, oz);
      g.add(odo.root);
    },
  });
}
