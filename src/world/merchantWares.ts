// Odo's Wares filled as a busy merchant's shop is (from play: "let's add more items/products around Odo's shop. Some
// higher quality items. Different texture for table vs floor"): world/houses/merchant.ts builds the room and Odo's counter; this
// dresses its walls and corners with goods, and lays out two showpieces of finer make where they're seen at a glance.
// Everything here stands still, so it's merged into a few meshes by material (`mergeChildren`: dozens of pieces, a
// handful of draws), on the room's materials and a few of its own, all shown with the room and so warmed with it. No
// light is added (the room keeps its ten): the hanging lanterns' panes glow by themselves.
import * as THREE from 'three';
import { HOUSES } from '../data/houses';
import { box, drum, type Mats } from './rooms';
import { mergeChildren } from './props';
import type { Obstacle } from '../types';
import { coinGeometry } from '../entities/models/merchant';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** a mesh of `geo` in `m` at `at` in `g`, turned `turn` (Euler, rad), casting a shadow if it's big enough to */
function piece(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3,
  turn: [number, number, number] = [0, 0, 0], cast = false): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.copy(at);
  mesh.rotation.set(...turn);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** The materials of the goods, the showpieces' finer ones among them. */
interface Goods {
  polished: THREE.MeshStandardMaterial; gold: THREE.MeshStandardMaterial; velvet: THREE.MeshStandardMaterial;
  ruby: THREE.MeshStandardMaterial; sapphire: THREE.MeshStandardMaterial; sacking: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial; pane: THREE.MeshStandardMaterial; cloths: THREE.MeshStandardMaterial[];
  potions: THREE.MeshStandardMaterial[]; paint: THREE.MeshStandardMaterial[];
}

function goods(): Goods {
  const stone = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.04, metalness: 0.25, flatShading: true,
    emissive: new THREE.Color(c).multiplyScalar(0.3), envMapIntensity: 2.2 });
  return {
    // (the showpieces' metal: a mirror polish and a rich gold, against the shop's dull iron and brass)
    // (polished, but not a mirror: a mirror in the shop's dim room showed only its dark, a black blade)
    polished: new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 0.72, roughness: 0.2, envMapIntensity: 1.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf0c050, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x3a0e2a, roughness: 1 }),
    ruby: stone(0xd0202c), sapphire: stone(0x2050e0),
    sacking: new THREE.MeshStandardMaterial({ color: 0x9a8058, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.25,
      depthWrite: false, envMapIntensity: 2 }),
    pane: new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.4, emissive: 0xffb050, emissiveIntensity: 0.9 }),
    cloths: [0x7a1a20, 0x1e4a6a, 0x3a6a2a, 0xc8a050, 0x5a2a6a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    potions: [0xd02040, 0x30a0e0, 0x40c060, 0xe0a020, 0x9040d0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.15,
      emissive: new THREE.Color(c).multiplyScalar(0.35) })),
    paint: [0x6a1e16, 0x23304e, 0x2a4a2a, 0x5a4a1a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })),
  };
}

/** A gem cut as a brilliant, `r` across, its table along +y. */
function gem(r: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry([[0, -r * 0.86], [r, -0.02 * r], [r, 0.02 * r], [r * 0.62, r * 0.36], [0, r * 0.36]]
    .map(([x, y]) => new THREE.Vector2(x, y)), 8).toNonIndexed();
}

/**
 * The showpiece behind his desk: a longsword of fine make on a velvet board on the back wall between his shelves, its
 * blade mirror polished with a fuller down it, its gold guard swept into curls with a ruby set in its middle and
 * sapphires at its ends, its grip wound in gold wire, a gold pommel with a ruby; a gold plaque under it.
 */
function showSword(g: THREE.Object3D, M: Mats, G: Goods, hz: number): void {
  const z = -hz + 0.03, x = 0;
  box(g, 0.46, 1.08, 0.03, x, 1.2, z, M.timber);
  box(g, 0.4, 1.02, 0.012, x, 1.23, z + 0.02, G.velvet);
  const front = z + 0.04;
  // (the blade, point down, its fuller a groove of darker steel down its middle)
  piece(g, new THREE.BoxGeometry(0.05, 0.62, 0.008), G.polished, V(x, 1.53, front), [0, 0, 0], true);
  piece(g, new THREE.BoxGeometry(0.012, 0.5, 0.004), M.iron, V(x, 1.57, front + 0.005));
  piece(g, new THREE.ConeGeometry(0.025, 0.1, 4).rotateY(Math.PI / 4).scale(1, 1, 0.16), G.polished, V(x, 1.17, front), [Math.PI, 0, 0]);
  // (the guard: a gold bar swept up into curls at its ends, a ruby in its middle, sapphires in the curls)
  piece(g, new THREE.BoxGeometry(0.24, 0.028, 0.02), G.gold, V(x, 1.855, front));
  for (const sx of [-1, 1]) {
    piece(g, new THREE.TorusGeometry(0.022, 0.007, 6, 12, Math.PI * 1.4), G.gold, V(x + sx * 0.13, 1.875, front), [0, 0, sx > 0 ? 0 : Math.PI]);
    piece(g, gem(0.008), G.sapphire, V(x + sx * 0.135, 1.9, front + 0.012), [Math.PI / 2, 0, 0]);
  }
  piece(g, gem(0.013), G.ruby, V(x, 1.855, front + 0.014), [Math.PI / 2, 0, 0]);
  // (the grip wound in gold wire, the pommel a gold ball with a ruby)
  piece(g, new THREE.CylinderGeometry(0.014, 0.016, 0.15, 10), M.leather, V(x, 1.945, front));
  for (let k = 0; k < 6; k++) piece(g, new THREE.TorusGeometry(0.0155, 0.002, 4, 12).rotateX(Math.PI / 2), G.gold, V(x, 1.885 + k * 0.024, front));
  piece(g, new THREE.SphereGeometry(0.026, 14, 10), G.gold, V(x, 2.045, front));
  piece(g, gem(0.011), G.ruby, V(x, 2.045, front + 0.024), [Math.PI / 2, 0, 0]);
  // (a gold plaque under it, and gold tacks at the board's corners)
  box(g, 0.2, 0.05, 0.008, x, 1.27, front - 0.012, G.gold);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) piece(g, new THREE.SphereGeometry(0.008, 8, 6), G.gold, V(x + sx * 0.19, 1.74 + sy * 0.49, z + 0.03));
}

/** The showpiece at his counter's end: a gold circlet set with gems, on a velvet cushion on a turned stand. */
function showCirclet(g: THREE.Object3D, M: Mats, G: Goods, at: THREE.Vector3): void {
  drum(g, 0.07, 0.08, 0.02, at.x, at.y, at.z, M.timber, 16);
  drum(g, 0.03, 0.045, 0.09, at.x, at.y + 0.02, at.z, M.timber, 12);
  drum(g, 0.08, 0.06, 0.02, at.x, at.y + 0.11, at.z, M.timber, 16);
  piece(g, new THREE.SphereGeometry(0.075, 18, 10).scale(1, 0.32, 1), G.velvet, V(at.x, at.y + 0.135, at.z));
  const top = at.y + 0.17;
  piece(g, new THREE.TorusGeometry(0.06, 0.006, 8, 36).rotateX(Math.PI / 2), G.gold, V(at.x, top, at.z), [0.18, 0, 0], true);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, tall = k % 2 ? 0.024 : 0.04;
    const p = V(at.x + Math.sin(a) * 0.06, top + tall / 2 + Math.cos(a) * 0.01, at.z + Math.cos(a) * 0.06);
    piece(g, new THREE.ConeGeometry(0.007, tall, 5), G.gold, p, [0.18, a, 0]);
    if (k % 2 === 0) piece(g, gem(0.007), k % 4 ? G.sapphire : G.ruby, p.clone().add(V(0, -tall / 2 + 0.004, 0)).addScaledVector(V(Math.sin(a), 0, Math.cos(a)), 0.006), [Math.PI / 2, a, 0]);
  }
}

/** A bow on pegs on the west wall, a quiver of arrows beside it, and two swords crossed over a round shield. */
function bowWall(g: THREE.Object3D, M: Mats, G: Goods, steel: THREE.Material, hx: number, z: number): void {
  const wx = -hx + 0.05;
  // (the bow: a recurved limb drawn as a curve, its string)
  const curve = new THREE.CatmullRomCurve3([V(0, -0.65, 0.05), V(0, -0.35, 0.0), V(0, 0, -0.04), V(0, 0.35, 0.0), V(0, 0.65, 0.05)]);
  piece(g, new THREE.TubeGeometry(curve, 24, 0.012, 6), M.timber, V(wx + 0.06, 1.55, z), [0, -Math.PI / 2, 0]);
  piece(g, new THREE.CylinderGeometry(0.0015, 0.0015, 1.28, 4), M.paper, V(wx + 0.06, 1.55, z + 0.05));
  for (const dy of [-0.3, 0.3]) piece(g, new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6).rotateZ(Math.PI / 2), M.timber, V(wx + 0.03, 1.55 + dy, z));
  // (a leather quiver of arrows hung beside it)
  piece(g, new THREE.CylinderGeometry(0.045, 0.04, 0.5, 10), M.leather, V(wx + 0.06, 1.25, z + 0.35), [0, 0, 0.15], true);
  for (let k = 0; k < 6; k++) {
    const shaft = piece(g, new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), M.oak, V(wx + 0.07 + (k % 3 - 1) * 0.015, 1.55, z + 0.33 + (k - 2.5) * 0.008), [0, 0, 0.15]);
    void shaft;
    piece(g, new THREE.PlaneGeometry(0.02, 0.05), M.paper, V(wx + 0.07 + (k % 3 - 1) * 0.015, 1.63, z + 0.33 + (k - 2.5) * 0.008), [0, Math.PI / 2 + k, 0.15]);
  }
  // (a round shield with two swords crossed over it)
  const sz = z - 0.55;
  piece(g, new THREE.CylinderGeometry(0.3, 0.3, 0.035, 24).rotateZ(Math.PI / 2), G.paint[1], V(wx + 0.03, 1.6, sz), [0, 0, 0], true);
  piece(g, new THREE.TorusGeometry(0.3, 0.014, 6, 28).rotateY(Math.PI / 2), M.iron, V(wx + 0.05, 1.6, sz));
  piece(g, new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), M.brass, V(wx + 0.05, 1.6, sz));
  for (const s of [-1, 1]) {
    const blade = piece(g, new THREE.BoxGeometry(0.008, 0.85, 0.04), steel, V(wx + 0.09, 1.6, sz), [s * 0.7, 0, 0], true);
    void blade;
    piece(g, new THREE.BoxGeometry(0.02, 0.03, 0.16), M.brass, V(wx + 0.09, 1.6 + 0.36 * Math.cos(0.7), sz + s * -0.36 * Math.sin(0.7)), [s * 0.7, 0, 0]);
  }
}

/** Shields hung on the front wall, either side of the door between it and the windows and one past the east window,
 *  each painted, rimmed and bossed. In the front wall's own group (`front`, its frame: x along the wall from the
 *  room's east, +z into the room), so they're cut away with it: hung in the room's, they floated over the floor where
 *  the camera cut the wall away, and two stood over a window. */
function doorShields(front: THREE.Object3D, M: Mats, G: Goods): void {
  ([[-1.35, 1.7, 0.3, 0], [1.35, 1.7, 0.3, 3], [-3.65, 1.6, 0.26, 2]] as const).forEach(([x, y, r, paint]) => {
    piece(front, new THREE.CylinderGeometry(r, r, 0.035, 24).rotateX(Math.PI / 2), G.paint[paint], V(x, y, 0.04), [0, 0, 0], true);
    piece(front, new THREE.TorusGeometry(r, 0.013, 6, 28), M.iron, V(x, y, 0.06));
    piece(front, new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.brass, V(x, y, 0.06));
    for (const a of [0, Math.PI / 2]) piece(front, new THREE.BoxGeometry(0.03, r * 2, 0.008), M.iron, V(x, y, 0.06), [0, 0, a + 0.3]);
  });
}

/** A rack of scrolls by the door: a cabinet of square cubbies, a few scrolls in each, some tied in red. */
function scrollRack(g: THREE.Object3D, M: Mats, hx: number, hz: number, obstacles: Obstacle[]): void {
  const x = -hx + 1.2, z = hz - 0.22, W = 0.8, H = 0.9, D = 0.34, y0 = 0.7;
  box(g, W, 0.03, D, x, y0, z, M.panel);
  box(g, W, 0.03, D, x, y0 + H, z, M.panel);
  for (let i = 0; i <= 3; i++) box(g, 0.025, H, D, x - W / 2 + (i * W) / 3, y0, z, M.panel);
  for (let r = 1; r < 3; r++) box(g, W, 0.02, D, x, y0 + (r * H) / 3, z, M.panel);
  for (const sx of [-1, 1]) box(g, 0.05, y0, 0.05, x + sx * (W / 2 - 0.03), 0, z, M.timber);
  const tie = new THREE.MeshStandardMaterial({ color: 0x8a1a14, roughness: 0.9 });
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        const px = x - W / 2 + (c + 0.5) * (W / 3) + (k - 1) * 0.06, py = y0 + 0.05 + (r * H) / 3 + (k % 2) * 0.04;
        piece(g, new THREE.CylinderGeometry(0.022, 0.022, D - 0.04, 10).rotateX(Math.PI / 2), M.paper, V(px, py, z));
        if ((c + r + k) % 3 === 0) piece(g, new THREE.CylinderGeometry(0.024, 0.024, 0.012, 10).rotateX(Math.PI / 2), tie, V(px, py, z - 0.05));
      }
    }
  }
  obstacles.push({ x, z, r: 0.45, h: 1.6 });
}

/** Bolts of cloth on a low bench against the west wall: rolled, in five dyes, stacked two high. */
function clothBench(g: THREE.Object3D, M: Mats, G: Goods, hx: number, obstacles: Obstacle[]): void {
  const x = -hx + 0.32, z = 1.45, L = 1.0;
  box(g, 0.42, 0.05, L, x, 0.4, z, M.oak);
  for (const sz of [-1, 1]) box(g, 0.38, 0.4, 0.05, x, 0, z + sz * (L / 2 - 0.04), M.timber);
  for (let k = 0; k < 5; k++) {
    const up = k > 2, at = V(x + (up ? (k - 3.5) * 0.15 : (k - 1) * 0.13), 0.45 + 0.065 + (up ? 0.12 : 0), z);
    piece(g, new THREE.CylinderGeometry(0.065, 0.065, 0.9, 14).rotateX(Math.PI / 2), G.cloths[k], at, [0, 0.03 * k, 0], true);
  }
  obstacles.push({ x, z, r: 0.5, h: 0.75 });
}

/** Sacks of grain and goods slumped by the crates at the door. */
function sacks(g: THREE.Object3D, G: Goods, hx: number, hz: number, obstacles: Obstacle[]): void {
  ([[-hx + 1.2, hz - 0.95, 0.24], [-hx + 1.55, hz - 0.8, 0.2], [-hx + 1.35, hz - 0.55, 0.22]] as const).forEach(([x, z, r], i) => {
    const geo = new THREE.SphereGeometry(r, 14, 10);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      // (slumped: wide at the foot, tied at the neck)
      const neck = y > r * 0.6 ? 0.5 + 0.5 * (1 - (y - r * 0.6) / (r * 0.4)) : 1 + 0.18 * Math.max(0, -y / r);
      p.setXYZ(k, p.getX(k) * neck, y * 1.15 + r * 1.1, p.getZ(k) * neck);
    }
    geo.computeVertexNormals();
    piece(g, geo, G.sacking, V(x, 0, z), [0, i, 0.08 * (i - 1)], true);
  });
  obstacles.push({ x: -hx + 1.35, z: hz - 0.75, r: 0.45, h: 0.6 });
}

/** A shelf of potions in coloured glass on the east wall between the hearth and the door: each a bottle of its own shape,
 *  its colour glowing a little in the glass. */
function potionShelf(g: THREE.Object3D, M: Mats, G: Goods, hx: number): void {
  const wx = hx - 0.15;
  const shapes = [
    [[0, 0], [0.032, 0], [0.036, 0.06], [0.014, 0.1], [0.012, 0.13], [0, 0.13]],
    [[0, 0], [0.04, 0], [0.042, 0.035], [0.012, 0.075], [0.011, 0.1], [0, 0.1]],
    [[0, 0], [0.026, 0], [0.026, 0.12], [0.01, 0.15], [0.009, 0.17], [0, 0.17]],
  ].map((profile) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 12));
  for (const [y, n] of [[1.15, 0], [1.55, 1]] as const) {
    box(g, 0.24, 0.03, 1.0, wx, y, 2.6, M.oak);
    for (const sz of [-1, 1]) box(g, 0.2, 0.12, 0.03, wx + 0.02, y - 0.12, 2.6 + sz * 0.45, M.timber);
    for (let k = 0; k < 7; k++) {
      const shape = (k + n) % 3, at = V(wx - 0.02, y + 0.03, 2.2 + k * 0.13);
      piece(g, shapes[shape], G.potions[(k + n * 2) % G.potions.length], at);
      piece(g, new THREE.CylinderGeometry(0.01, 0.009, 0.018, 8), M.oak, at.clone().add(V(0, [0.13, 0.1, 0.17][shape], 0)));
    }
  }
}

/** A mannequin by the hearth wearing a suit of plate: a post on a foot, a torso form, a cuirass, pauldrons, a gorget and
 *  a helm with a visor, all in the shop's steel. */
function mannequin(g: THREE.Object3D, M: Mats, steel: THREE.Material, at: THREE.Vector3, obstacles: Obstacle[]): void {
  const x = at.x, z = at.z;
  drum(g, 0.24, 0.26, 0.05, x, 0, z, M.timber, 16);
  drum(g, 0.03, 0.035, 1.0, x, 0.05, z, M.timber, 8);
  piece(g, new THREE.LatheGeometry([[0.13, 0], [0.18, 0.1], [0.21, 0.32], [0.2, 0.46], [0.12, 0.54], [0.05, 0.56]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 20).scale(1, 1, 0.72), steel, V(x, 0.92, z), [0, 0, 0], true);
  // (the plate's ridge down its middle, a belt at its waist)
  piece(g, new THREE.BoxGeometry(0.014, 0.42, 0.02), steel, V(x, 1.16, z + 0.15));
  piece(g, new THREE.TorusGeometry(0.19, 0.012, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.72), M.leather, V(x, 0.96, z));
  for (const sx of [-1, 1]) {
    piece(g, new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, V(x + sx * 0.22, 1.4, z), [0, 0, sx * -0.4], true);
  }
  drum(g, 0.08, 0.1, 0.06, x, 1.47, z, steel, 14);
  const helm = piece(g, new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, V(x, 1.58, z), [0, 0, 0], true);
  helm.scale.set(1, 1.1, 1.08);
  piece(g, new THREE.BoxGeometry(0.2, 0.03, 0.02), M.iron, V(x, 1.6, z + 0.12));
  piece(g, new THREE.BoxGeometry(0.02, 0.06, 0.02), steel, V(x, 1.75, z));
  obstacles.push({ x, z, r: 0.32, h: 1.8 });
}

/** Two lanterns hung on chains over the room, their panes glowing (no light of their own: the room keeps its ten). */
function hangingLanterns(g: THREE.Object3D, M: Mats, G: Goods, high: number): void {
  for (const x of [-2.6, 2.6]) {
    const top = high - 0.02, y = high - 0.75;
    piece(g, new THREE.CylinderGeometry(0.006, 0.006, top - y - 0.15, 4), M.iron, V(x, (top + y + 0.15) / 2, 0.6));
    piece(g, new THREE.ConeGeometry(0.1, 0.1, 6), M.iron, V(x, y + 0.14, 0.6), [0, 0, 0], true);
    piece(g, new THREE.CylinderGeometry(0.07, 0.07, 0.18, 6, 1, true), G.pane, V(x, y, 0.6));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      piece(g, new THREE.BoxGeometry(0.01, 0.2, 0.01), M.iron, V(x + Math.cos(a) * 0.072, y, 0.6 + Math.sin(a) * 0.072));
    }
    piece(g, new THREE.CylinderGeometry(0.085, 0.085, 0.02, 6), M.iron, V(x, y - 0.1, 0.6));
  }
}

/** A sack of coin spilled open on the strongbox: struck coins out of its mouth. */
function spilledCoin(g: THREE.Object3D, M: Mats, G: Goods): void {
  const at = V(1.6, 0.51, 1.95);
  piece(g, new THREE.SphereGeometry(0.09, 12, 8).scale(1.1, 0.75, 1), G.sacking, at.clone().add(V(0, 0.06, 0)), [0, 0, 0], true);
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, d = 0.1 + (k % 3) * 0.03;
    piece(g, coinGeometry(), M.brass, at.clone().add(V(Math.cos(a) * d, 0.003 + (k % 2) * 0.003, Math.sin(a) * d * 0.7 + 0.06)), [0.1 * (k % 3), a, 0]);
  }
}

/**
 * The shop's goods and showpieces, built into a group of their own in `g` and merged by material. `counterEnd` is
 * where the circlet's stand sits on the counter; `steel` the shop's steel for what's for sale.
 */
export function dressWares(g: THREE.Group, M: Mats, steel: THREE.Material, counterEnd: THREE.Vector3, obstacles: Obstacle[],
  front: THREE.Object3D): void {
  const [hx, hz] = HOUSES.merchant.half, high = HOUSES.merchant.high;
  const wares = new THREE.Group();
  wares.name = 'shop wares';
  g.add(wares);
  const G = goods();
  showSword(wares, M, G, hz);
  showCirclet(wares, M, G, counterEnd);
  bowWall(wares, M, G, steel, hx, 1.6);
  doorShields(front, M, G);
  scrollRack(wares, M, hx, hz, obstacles);
  clothBench(wares, M, G, hx, obstacles);
  sacks(wares, G, hx, hz, obstacles);
  potionShelf(wares, M, G, hx);
  mannequin(wares, M, steel, V(3.25, 0, 2.45), obstacles);
  hangingLanterns(wares, M, G, high);
  spilledCoin(wares, M, G);
  mergeChildren(wares);
}
