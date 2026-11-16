// The Ossuary Cantor (entities/cantor.ts): a skeletal priest of the ossuary about seven metres tall, floating over the
// floor in rotted vestments. Its upper body is bare bone: a long skull under a crown of bone spikes and guttering
// candles, a halo of nine skulls turning behind it, a ribcage with a bronze bell for a heart, its grave light seeping
// through the ribs. Its right hand holds a crozier of bone, a small bell-lantern hung from its crook; its left is a
// spread claw. For grave hands it raises both arms and drives them down on the hit; for a dirge it sweeps the crozier
// out; its jaw opens with the chant (`ActionState.hit`). What its fight shows (`AnimState.boss`): with its weak-spot
// window open its ribs swing apart and the bell-heart beats at a pulse a second; its candles flare from its second
// phase, its halo turns faster in its last. Drawn in its crowd (models/crowd.ts): every change is a joint's place or a
// glow's strength, nothing hidden.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { joint, ramp } from './rig';
import { Sculpt, lathe, limb, organic, skipping, taperTube } from './shapes';
import { mulberry } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const NONE = new THREE.BufferGeometry();
/** a geometry made only where the kind's pieces aren't replayed (models/shapes.ts) */
const made = (f: () => THREE.BufferGeometry): THREE.BufferGeometry => (skipping() ? NONE : f());

/** its measures (m): the hem's height, the waist's, the heart's, the shoulders', the skull's; the arm's two bones */
const HEM_Y = 0.55, WAIST_Y = 3.0, HEART_Y = 3.95, SHOULDER_Y = 4.75, SKULL_Y = 5.35, UPPER = 1.35, FORE = 1.3;
/** how far it rises and falls as it floats (m), and its ribs' swing open with its heart bared (rad) */
const BOB = 0.16, RIBS_OPEN = 0.5;
const GRAVE = 0x5fe8a8;

export function buildCantor(): Model {
  // (its edge as it dissolves its grave light's green, dimmed: a pale edge blew its fall out white, as the bell's did)
  const kit = createKit(0x2fb878);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // old bone, yellowed and stained, the grave light faint in its cracks
  const bone = kit.std({
    color: 0xcfc4a4, roughness: 0.78, map: g.map, roughnessMap: g.roughnessMap, normalMap: g.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2), emissive: new THREE.Color(GRAVE), emissiveMap: veins(41, 5), emissiveIntensity: 0.18,
  });
  const darkBone = kit.std({ color: 0x8a7e66, roughness: 0.85, map: g.map, normalMap: g.normalMap });
  // vestments rotted black-violet, a grave-green rim of light along their folds (in the crypt's night a black robe
  // read as a hole in the floor), a stole of mouldered green stitched with runes that glow faintly
  const robe = kit.rim({
    color: 0x2a2230, roughness: 0.95, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.6, 1.6), side: THREE.DoubleSide,
  }, 0x3f8a6e, 0.45);
  const stole = kit.std({
    color: 0x3a5c46, roughness: 0.9, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide,
    emissive: new THREE.Color(GRAVE), emissiveMap: veins(37, 4), emissiveIntensity: 0.5,
  });
  const bronze = kit.std({
    color: 0x9a6a2a, metalness: 0.55, roughness: 0.45, map: g.map, normalMap: g.normalMap,
    emissive: new THREE.Color(GRAVE), emissiveMap: veins(29, 6), emissiveIntensity: 0.6,
  });
  const iron = kit.std({ color: 0x3a3836, metalness: 0.8, roughness: 0.6, normalMap: g.normalMap });
  const wax = kit.std({ color: 0xd8ceb0, roughness: 0.6 });
  const heartGlow = kit.glow(0xb8ffd8, 5);
  // (the grave light filling its chest behind the bell, the ribs dark against it)
  const chestGlow = kit.glow(GRAVE, 1.6);
  const eye = kit.glow(0x9dffc4, 7);
  const flame = kit.glow(0xc8ffd0, 4);
  const lantern = kit.glow(0xa8ffd0, 5);

  const root = new THREE.Group();
  const S = new Sculpt('cantor').glow(heartGlow).glow(chestGlow).glow(eye).glow(flame).glow(lantern);
  const r = mulberry(53);

  const body = joint(root, 0, 0, 0);

  // --- its vestments: a robe from the waist to the hem, tattered strips under it, a mantle over its back -------------
  // (bottom to top: faces out)
  const robeProfile: [number, number][] = [[1.75, HEM_Y], [1.62, 0.95], [1.38, 1.6], [1.1, 2.3], [0.82, 2.8], [0.6, WAIST_Y + 0.1]];
  // (its folds: the noise strong and long, running down it)
  S.add(made(() => organic(lathe(robeProfile, 48), 0.11, 1.7, 3)), robe, body);
  // a band of runes round the hem, another round the knees, in tarnished bronze lit from within
  for (const [y, rr] of [[HEM_Y + 0.14, 1.74], [1.25, 1.5]] as const) {
    S.add(made(() => organic(new THREE.TorusGeometry(rr, 0.045, 6, 64).rotateX(Math.PI / 2), 0.03, 6, 5)), bronze, body, [0, y, 0], [0, 0, 0], [1, 1.6, 1]);
  }
  // (a string of small skulls hung from the belt at the front, swinging with it)
  for (let i = 0; i < 5; i++) {
    const a = -0.5 + i * 0.25, y = WAIST_Y - 0.25 - Math.sin((i / 4) * Math.PI) * 0.25;
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.07, 5, 90 + i)), bone, body, [Math.sin(a) * 0.86, y, Math.cos(a) * 0.86], [0, a, 0], [0.09, 0.1, 0.1]);
  }
  // its rope belt and the cord's knot hanging from it
  S.add(made(() => organic(new THREE.TorusGeometry(0.64, 0.07, 8, 32).rotateX(Math.PI / 2), 0.02, 9, 4)), darkBone, body, [0, WAIST_Y - 0.05, 0]);
  for (const x of [-0.2, 0.12]) {
    S.add(made(() => taperTube([V(0, 0, 0), V(0.03, -0.5, 0.06), V(-0.02, -1.1, 0.04)], (t) => 0.045 * (1 - t * 0.3), 8, 5)), darkBone, body, [x, WAIST_Y - 0.1, 0.62]);
  }
  // the hem's tatters: strips hung round it, each its own length, drifting with the hem (`hem`)
  const hem = joint(body, 0, HEM_Y + 0.05, 0);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.12, len = 0.35 + r() * 0.55, w = 0.16 + r() * 0.12;
    S.add(made(() => organic(new THREE.PlaneGeometry(w, len, 1, 3).translate(0, -len / 2, 0), 0.03, 6, i)), robe, hem,
      [Math.sin(a) * 1.72, 0, Math.cos(a) * 1.72], [0.12, a, 0]);
  }
  // the mantle: a half cylinder of cloth from the shoulders down its back to below the knees, open at the front
  S.add(made(() => organic(new THREE.LatheGeometry([
    new THREE.Vector2(1.5, 1.2), new THREE.Vector2(1.22, 2.2), new THREE.Vector2(0.95, 3.4), new THREE.Vector2(0.78, SHOULDER_Y - 0.05),
    new THREE.Vector2(0.3, SHOULDER_Y + 0.22),
  ], 24, Math.PI * 0.62, Math.PI * 0.76), 0.04, 3, 7)), robe, body);
  // its hood fallen back behind the skull
  S.add(made(() => organic(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0.06, 4, 8)), robe, body, [0, SHOULDER_Y + 0.12, -0.42], [-1.2, 0, 0], [1, 0.8, 1]);
  // the stole: a strip down each side of the chest from the neck, its ends fringed with small bronze bells
  for (const s of [1, -1]) {
    S.add(made(() => taperTube([V(s * 0.22, SHOULDER_Y + 0.1, -0.05), V(s * 0.42, SHOULDER_Y - 0.15, 0.3), V(s * 0.46, 3.6, 0.42), V(s * 0.44, 2.4, 0.78), V(s * 0.42, 1.7, 0.98)],
      () => 0.07, 16, 4)), stole, body, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
    for (const dx of [-0.07, 0.07]) S.add(made(() => lathe([[0.06, -0.1], [0.055, -0.06], [0.035, 0], [0.005, 0.02]], 10)), bronze, body, [s * 0.42 + dx, 1.62, 1.0]);
  }

  // --- its spine and ribs: the bare bone above the robe, its bell-heart inside ---------------------------------
  for (let i = 0; i < 9; i++) {
    const y = WAIST_Y - 0.3 + i * 0.2;
    S.add(made(() => organic(new THREE.CylinderGeometry(0.1, 0.11, 0.13, 10), 0.02, 8, 10 + i)), bone, body, [0, y, -0.32]);
    // (each vertebra's spine behind it)
    S.add(made(() => taperTube([V(0, 0, 0), V(0, -0.06, -0.16)], (t) => 0.04 * (1 - t * 0.6), 3, 5)), darkBone, body, [0, y, -0.38]);
  }
  // the breastbone, fixed down the middle
  S.add(made(() => organic(new THREE.BoxGeometry(0.14, 0.95, 0.06), 0.02, 6, 21)), bone, body, [0, HEART_Y + 0.2, 0.4], [0.12, 0, 0]);
  // each side's ribs on a joint at the spine, swinging open from the back like a door (`ribs`)
  const ribs: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const side = joint(body, s * 0.06, 0, -0.32);
    ribs.push(side);
    for (let i = 0; i < 7; i++) {
      // (each rib from the spine back and out, round the side and in to the breastbone, the lower ones shorter and
      // dropping more)
      const y = HEART_Y + 0.65 - i * 0.19, w = 0.55 + Math.sin((i / 6) * Math.PI) * 0.12 - i * 0.015, drop = 0.06 + i * 0.03;
      const reach = i < 5 ? 0.66 : 0.5;
      S.add(made(() => taperTube([V(0, y, 0), V(s * w * 0.6, y - drop * 0.3, -0.05), V(s * w, y - drop * 0.7, 0.3), V(s * w * 0.7, y - drop, reach), V(s * 0.1, y - drop * 0.9, reach + 0.05)],
        (t) => 0.045 * (1 - t * 0.35), 16, 6)), bone, side);
    }
  }
  // the collarbones and the shoulder blades
  for (const s of [1, -1]) {
    S.add(made(() => taperTube([V(s * 0.05, SHOULDER_Y + 0.05, 0.3), V(s * 0.35, SHOULDER_Y + 0.12, 0.2), V(s * 0.62, SHOULDER_Y + 0.08, 0.0)], () => 0.045, 10, 6)), bone, body);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 4, 30)), bone, body, [s * 0.38, SHOULDER_Y - 0.25, -0.38], [0, s * 0.3, 0], [0.24, 0.3, 0.05]);
  }
  // the bell-heart: a small bronze bell hung in the ribcage, its light inside it (`heart`)
  const heart = joint(body, 0, HEART_Y + 0.25, 0.02);
  S.add(made(() => organic(lathe([[0.3, -0.5], [0.32, -0.47], [0.24, -0.38], [0.19, -0.25], [0.18, -0.1], [0.14, -0.03], [0.06, 0], [0.01, 0.01]], 24), 0.01, 4, 31)), bronze, heart);
  S.add(made(() => new THREE.SphereGeometry(0.19, 12, 10)), heartGlow, heart, [0, -0.38, 0]);
  S.add(made(() => new THREE.SphereGeometry(1, 16, 12)), chestGlow, body, [0, HEART_Y + 0.1, -0.08], [0, 0, 0], [0.36, 0.55, 0.2]);
  S.add(made(() => new THREE.TorusGeometry(0.06, 0.02, 5, 10)), iron, heart, [0, 0.04, 0], [0, Math.PI / 2, 0]);

  // --- its skull, its crown of spikes and candles, its halo of skulls ----------------------------------------
  const neck = joint(body, 0, SHOULDER_Y + 0.1, -0.12);
  for (let i = 0; i < 3; i++) S.add(made(() => new THREE.CylinderGeometry(0.08, 0.09, 0.1, 8)), bone, neck, [0, 0.07 + i * 0.13, 0]);
  const skull = joint(neck, 0, SKULL_Y - SHOULDER_Y - 0.1, 0.06);
  // (a long skull, larger than a man's in scale with its body: a small one read as a hood)
  skull.scale.setScalar(1.25);
  // the cranium, long and high, the brow ridge over deep sockets, the cheekbones
  S.add(made(() => organic(new THREE.SphereGeometry(1, 20, 16), 0.04, 5, 41)), bone, skull, [0, 0.22, -0.04], [0, 0, 0], [0.3, 0.38, 0.36]);
  S.add(made(() => organic(new THREE.SphereGeometry(1, 14, 8), 0.05, 6, 42)), bone, skull, [0, 0.12, 0.22], [0, 0, 0], [0.28, 0.08, 0.14]);
  for (const s of [1, -1]) {
    S.add(made(() => new THREE.SphereGeometry(0.075, 10, 8)), iron, skull, [s * 0.11, 0.05, 0.27]);
    S.add(made(() => new THREE.SphereGeometry(0.035, 8, 6)), eye, skull, [s * 0.11, 0.05, 0.31]);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.08, 5, 43)), bone, skull, [s * 0.2, -0.04, 0.18], [0, 0, 0], [0.08, 0.06, 0.12]);
  }
  // the nose's hollow and the upper teeth
  S.add(made(() => new THREE.ConeGeometry(0.04, 0.1, 3).rotateX(Math.PI)), iron, skull, [0, -0.04, 0.32]);
  for (let i = 0; i < 8; i++) S.add(made(() => new THREE.BoxGeometry(0.03, 0.06, 0.03)), bone, skull, [(i - 3.5) * 0.034, -0.15, 0.27 - Math.abs(i - 3.5) * 0.012]);
  // the jaw on a joint of its own, falling open with the chant (`jaw`)
  const jaw = joint(skull, 0, -0.1, 0.02);
  S.add(made(() => organic(new THREE.TorusGeometry(0.17, 0.045, 6, 14, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), 0.05, 6, 44)), bone, jaw, [0, -0.08, 0.1], [0, 0, 0], [1, 1, 1.1]);
  for (let i = 0; i < 8; i++) S.add(made(() => new THREE.BoxGeometry(0.03, 0.05, 0.03)), bone, jaw, [(i - 3.5) * 0.034, -0.05, 0.26 - Math.abs(i - 3.5) * 0.012]);
  // the crown: a band of bone, spikes rising from it, five candles among them, each a flame
  S.add(made(() => organic(new THREE.TorusGeometry(0.31, 0.04, 6, 28).rotateX(Math.PI / 2), 0.03, 8, 45)), darkBone, skull, [0, 0.42, -0.04]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, h = i % 2 ? 0.28 : 0.46 + r() * 0.12;
    S.add(made(() => taperTube([V(0, 0, 0), V(Math.sin(a) * 0.05, h * 0.6, Math.cos(a) * 0.05), V(Math.sin(a) * 0.12, h, Math.cos(a) * 0.12)], (t) => 0.035 * (1 - t), 6, 5)),
      bone, skull, [Math.sin(a) * 0.31, 0.42, Math.cos(a) * 0.31 - 0.04]);
  }
  for (let i = 0; i < 5; i++) {
    const a = ((i - 2) / 5) * Math.PI * 1.3, h = 0.16 + r() * 0.12;
    const at: [number, number, number] = [Math.sin(a) * 0.31, 0.44, Math.cos(a) * 0.31 - 0.04];
    S.add(made(() => organic(new THREE.CylinderGeometry(0.035, 0.04, h, 8).translate(0, h / 2, 0), 0.008, 12, 46 + i)), wax, skull, at);
    S.add(made(() => new THREE.SphereGeometry(1, 8, 6)), flame, skull, [at[0], at[1] + h + 0.05, at[2]], [0, 0, 0], [0.025, 0.06, 0.025]);
  }
  // the halo behind it: a ring of bone and iron, nine skulls on it, turning (`halo`)
  const halo = joint(neck, 0, SKULL_Y - SHOULDER_Y + 0.15, -0.55);
  S.add(made(() => organic(new THREE.TorusGeometry(1.15, 0.035, 6, 64), 0.01, 10, 50)), iron, halo);
  S.add(made(() => organic(new THREE.TorusGeometry(1.0, 0.025, 6, 64), 0.01, 10, 51)), darkBone, halo);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, x = Math.sin(a) * 1.15, y = Math.cos(a) * 1.15;
    S.add(made(() => organic(new THREE.SphereGeometry(1, 12, 10), 0.06, 5, 52 + i)), bone, halo, [x, y, 0.02], [0, 0, 0], [0.14, 0.16, 0.15]);
    S.add(made(() => organic(new THREE.SphereGeometry(1, 8, 6), 0.08, 6, 62 + i)), bone, halo, [x, y - 0.1, 0.06], [0, 0, 0], [0.09, 0.06, 0.08]);
    for (const s of [1, -1]) S.add(made(() => new THREE.SphereGeometry(0.022, 6, 5)), eye, halo, [x + s * 0.05, y + 0.0, 0.16]);
    // (spokes from each skull in towards the inner ring)
    S.add(made(() => taperTube([V(x * 0.97, y * 0.97, 0), V(x * 0.87, y * 0.87, 0)], () => 0.02, 2, 4)), darkBone, halo);
  }

  // --- its arms: long bones in tattered sleeves, the right with its crozier, the left a claw ----------------
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const sh = joint(body, s * 0.64, SHOULDER_Y, -0.02);
    S.add(made(() => organic(new THREE.SphereGeometry(0.12, 10, 8), 0.04, 6, 70)), bone, sh);
    S.add(made(() => organic(limb(UPPER, 0.07, 0.055, 0.1, 0.3, 10), 0.01, 10, 71)), bone, sh);
    // the sleeve: a ragged bell of cloth from the shoulder to below the elbow, open at its foot
    S.add(made(() => organic(lathe([[0.42, -UPPER - 0.25], [0.32, -UPPER * 0.6], [0.2, -0.2], [0.14, 0.12]], 18), 0.05, 4, 72)), robe, sh);
    const el = joint(sh, 0, -UPPER, 0);
    S.add(made(() => new THREE.SphereGeometry(0.07, 8, 6)), bone, el);
    // (the forearm's two bones side by side)
    for (const dx of [-0.035, 0.035]) S.add(made(() => organic(limb(FORE, 0.04, 0.032, 0, 0.3, 8), 0.008, 12, 73)), bone, el, [dx, 0, 0]);
    const hd = joint(el, 0, -FORE, 0);
    S.add(made(() => organic(new THREE.BoxGeometry(0.16, 0.2, 0.06), 0.02, 8, 74)), bone, hd, [0, -0.1, 0]);
    // four long fingers and a thumb, each three bones in a curl
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4, fx = thumb ? s * -0.09 : (f - 1.5) * 0.045, len = thumb ? 0.22 : 0.34 - Math.abs(f - 1.5) * 0.04;
      S.add(made(() => taperTube([V(0, 0, 0), V(fx * 0.3, -len * 0.45, 0.04), V(fx * 0.4, -len * 0.8, 0.12), V(fx * 0.4, -len, 0.22)], (t) => 0.022 * (1 - t * 0.7), 10, 5)),
        bone, hd, [fx, -0.2, thumb ? 0.04 : 0]);
    }
    shoulder.push(sh); elbow.push(el); hand.push(hd);
  }
  // the crozier in the right hand: a shaft of bound bone, its crook a curl of vertebrae, a bell-lantern hung from it
  const crozier = joint(hand[0], 0, -0.25, 0.08);
  S.add(made(() => organic(new THREE.CylinderGeometry(0.05, 0.06, 6.2, 10).translate(0, 0.9, 0), 0.008, 14, 80)), darkBone, crozier);
  for (let i = 0; i < 7; i++) S.add(made(() => new THREE.TorusGeometry(0.065, 0.018, 5, 12).rotateX(Math.PI / 2)), iron, crozier, [0, -1.4 + i * 0.75, 0]);
  const crook: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 1.45;
    crook.push(V(Math.sin(a) * 0.42 - 0.0, 4.0 + (1 - Math.cos(a)) * 0.42 + i * 0.008, 0));
  }
  crook.unshift(V(0, 3.9, 0));
  S.add(made(() => taperTube(crook, (t) => 0.07 * (1 - t * 0.5), 26, 7)), bone, crozier);
  // (knobs of vertebrae along the crook's back)
  for (let i = 2; i < crook.length; i += 2) S.add(made(() => organic(new THREE.SphereGeometry(0.06, 8, 6), 0.1, 5, 81 + i)), bone, crozier, [crook[i].x * 1.08, crook[i].y + 0.02, 0]);
  const lamp = joint(crozier, crook[crook.length - 1].x, crook[crook.length - 1].y - 0.05, 0);
  for (let i = 0; i < 3; i++) S.add(made(() => new THREE.TorusGeometry(0.035, 0.012, 4, 8)), iron, lamp, [0, -0.05 - i * 0.08, 0], [0, i % 2 ? Math.PI / 2 : 0, 0]);
  S.add(made(() => organic(lathe([[0.17, -0.55], [0.18, -0.52], [0.13, -0.44], [0.11, -0.34], [0.09, -0.28], [0.03, -0.25], [0.005, -0.24]], 18), 0.01, 4, 90)), bronze, lamp);
  S.add(made(() => new THREE.SphereGeometry(0.09, 10, 8)), lantern, lamp, [0, -0.45, 0]);
  S.build();

  let open = 0, flare = 0, spin = 0;

  function animate(st: AnimState): void {
    const { t, dt } = st, look = st.boss, a = st.action;
    const dead = st.dead >= 0 ? st.dead : 0;
    const k = 1 - Math.exp(-dt * 3);
    // (floating: risen and falling slowly, leaning a little with its glide; sinking and tipping forward as it falls)
    body.position.y = 0.35 + Math.sin(t * 0.9) * BOB - dead * 1.2;
    body.rotation.x = st.move * 0.08 + dead * 0.5;
    body.rotation.z = Math.sin(t * 0.6) * 0.025;
    hem.rotation.x = Math.sin(t * 1.1) * 0.05 + st.move * 0.12;
    hem.rotation.z = Math.sin(t * 0.8 + 1) * 0.04;

    // its arms at rest: hanging forward a little, the crozier planted ahead, the claw half open
    let raise = 0, slam = 0, sweep = 0, chant = 0;
    if (a && (a.name === 'graveHands' || a.name === 'dirge')) {
      const h = a.hit ?? 0.5;
      chant = ramp(a.t, 0, h * 0.6) * (1 - ramp(a.t, h, Math.min(1, h + 0.25)));
      if (a.name === 'graveHands') {
        // (both arms raised over the warning, driven down on the hit, lowered after)
        raise = ramp(a.t, 0, h * 0.85) * (1 - ramp(a.t, h * 0.85, h));
        slam = ramp(a.t, h * 0.85, h) * (1 - ramp(a.t, h + 0.05, 1));
      } else {
        // (the crozier drawn back over the warning, swept out along the dirge on the hit)
        raise = ramp(a.t, 0, h * 0.9) * 0.5 * (1 - ramp(a.t, h * 0.9, h));
        sweep = ramp(a.t, h * 0.8, h) * (1 - ramp(a.t, h + 0.1, 1));
      }
    }
    const idle = Math.sin(t * 0.7) * 0.05;
    // right arm (the crozier's)
    shoulder[0].rotation.set(-0.35 - raise * 2.3 - slam * 1.0 - sweep * 1.3 + idle, 0, 0.18 + raise * 0.35 - sweep * 0.2);
    elbow[0].rotation.x = -0.75 + raise * 0.5 + slam * 0.4 + sweep * 0.55;
    hand[0].rotation.x = 0.6 - sweep * 0.4;
    // left arm (the claw)
    // (held up before it at rest, its claw spread towards the hero)
    shoulder[1].rotation.set(-0.65 - raise * 2.0 - slam * 0.7 + idle * 0.8, 0, -0.18 - raise * 0.35 - sweep * 0.4);
    elbow[1].rotation.x = -1.25 + raise * 1.1 + slam * 0.9;
    hand[1].rotation.x = 0.55 - raise * 0.3 + slam * 0.2;
    jaw.rotation.x = 0.06 + chant * (0.4 + 0.08 * Math.sin(t * 7)) + dead * 0.4;
    skull.rotation.x = -0.1 - raise * 0.25 + slam * 0.2 + dead * 0.3;
    neck.rotation.y = Math.sin(t * 0.35) * 0.08;

    // its ribs swing open with its heart bared, eased; its heart beats a pulse a second then
    const bared = !!look && look.weak > 0;
    open += ((bared ? 1 : 0) - open) * (1 - Math.exp(-dt * 5));
    ribs[0].rotation.y = open * RIBS_OPEN;
    ribs[1].rotation.y = -open * RIBS_OPEN;
    heart.position.z = 0.02 + open * 0.18;
    heart.rotation.z = Math.sin(t * 2.2) * (0.06 + 0.12 * chant);
    const beat = bared ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2) : 0;
    heartGlow.emissiveIntensity = 4 + chant * 4 + beat * 6;
    bronze.emissiveIntensity = 0.5 + chant * 1.2 + beat * 1.6;
    bone.emissiveIntensity = 0.15 + chant * 0.35 + open * 0.2;

    // its candles flare from its second phase, its halo turns faster in its last (eased, never a flash)
    const phase = look?.phase ?? 0;
    flare += ((phase >= 1 ? 1 : 0) - flare) * k;
    flame.emissiveIntensity = 3 + flare * 3 + Math.sin(t * 5.3) * 0.4;
    eye.emissiveIntensity = 5 + chant * 3 + (look?.warded ? 2 : 0);
    lantern.emissiveIntensity = 4 + chant * 3 + sweep * 3;
    spin += dt * (phase >= 2 ? 0.75 : 0.25);
    // (tipped back, so the view from above sees its ring and its skulls, turning in its own plane)
    halo.rotation.set(-0.5, 0, spin);
    halo.position.y = SKULL_Y - SHOULDER_Y + 0.15 + Math.sin(t * 1.3) * 0.04;
    // the lantern swinging under the crook
    lamp.rotation.z = Math.sin(t * 1.4) * 0.15 - sweep * 0.5;
    lamp.rotation.x = Math.sin(t * 1.1) * 0.1;
  }

  return {
    root, kit, animate, height: 6.2,
    reset() { open = flare = spin = 0; },
    dispose() { kit.dispose(); },
  };
}
