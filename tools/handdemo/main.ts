// The hand demo: the game's own hand alone on a page, every joint of every digit on a slider held to a real joint's
// range, its fist's sculpt switched in and out, turned with the mouse. Served by the dev server (`npm run dev`, then
// /tools/handdemo/), so a change to the hand's code shows as it's saved. No game, no sound: only the hand's modules
// are loaded.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bare, buildHand, closeFist, poseHand, shut, type Hand } from '../../src/entities/models/hands';
import { HEAVY, PLAIN } from '../../src/entities/models/build';

const DEGREES = Math.PI / 180;
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
/** a finger's joints' ranges, degrees (a hand surgeon's tables: the knuckle bends 90 and straightens 20 past flat,
 *  the middle joint bends 110, the last 80; the fingers part some 15 either way at the knuckle) */
const FINGER_RANGES = [
  { name: 'knuckle', from: -20, to: 90, joint: 0, axis: 'x' },
  { name: 'middle', from: 0, to: 110, joint: 1, axis: 'x' },
  { name: 'last', from: 0, to: 80, joint: 2, axis: 'x' },
  { name: 'spread', from: -15, to: 15, joint: 0, axis: 'z' },
] as const;
/** the thumb's root from where a pose put it (degrees): across the palm and back, out from the palm and in */
const THUMB_ROOT = { across: [-20, 45], out: [-25, 30] } as const;
/** the thumb's two joints' ranges, degrees */
const THUMB_RANGES = [
  { name: 'knuckle', from: -5, to: 55, joint: 1 },
  { name: 'last', from: -10, to: 80, joint: 2 },
] as const;
/** where the camera stands for each view (the hand's forearm up, its fingers down) */
const VIEWS: Record<string, [number, number, number]> = {
  Back: [0, -0.07, 0.62],
  Palm: [0, -0.07, -0.62],
  'Thumb side': [0.62, -0.07, 0],
  'Little side': [-0.62, -0.07, 0],
  Knuckles: [0, -0.62, 0.02],
  'Own eyes': [0.12, 0.36, -0.42],
};

/** a slider: set to where its joint is by `show` */
interface Slider { show: () => void }

const view = document.getElementById('view')!;
const panel = document.getElementById('panel')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6f7378);
scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x4a443c, 1.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(0.4, 0.8, 0.6);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd0ff, 0.7);
fill.position.set(-0.6, 0.2, -0.7);
scene.add(fill);
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.07, 0);

const skin = new THREE.MeshStandardMaterial({ color: 0xd8a184, roughness: 0.62 });
const glove = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.85 });
const wrist = new THREE.Group();
scene.add(wrist);
const poses: Record<string, () => void> = {
  Flat: () => poseHand(hand, 0, 0),
  Relaxed: () => poseHand(hand, 0.75, 0.12),
  'Bent shut': () => { poseHand(hand, 0, 0); curlAll(1); },
  Fist: () => closeFist(hand, new THREE.Vector3(-hand.s, 0, 0)),
};
let hand: Hand;
let sliders: Slider[] = [];
/** the pose last chosen, which Reset puts back */
let posed = 'Relaxed';
/** the thumb's root as the pose put it, and how far its sliders have turned it from there (degrees) */
const thumbRoot = { base: new THREE.Quaternion(), across: 0, out: 0 };
/** the box that says whether the fist's own sculpt is the one drawn */
let shutBox: HTMLInputElement | null = null;

/** The hand built afresh on the wrist: `heavy` the fighter's build (with a fist's sculpt), or the plain one. */
function build(heavy: boolean): void {
  wrist.clear();
  hand = buildHand(wrist, -1, glove, skin.clone(), 1, skin.clone(), heavy ? HEAVY : PLAIN);
  bare(hand, true);
}

/** A pose taken by its name: every slider then stands where it left the joints. */
function pose(name: string): void {
  posed = name;
  poses[name]();
  thumbRoot.base.copy(hand.thumb.j[0].quaternion);
  thumbRoot.across = 0;
  thumbRoot.out = 0;
  for (const each of sliders) each.show();
  if (shutBox) shutBox.checked = Boolean(hand.shut?.on);
}

/** The thumb's root turned from where the pose put it by its two sliders. */
function turnThumbRoot(): void {
  const across = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), thumbRoot.across * DEGREES);
  const out = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -hand.s * thumbRoot.out * DEGREES);
  hand.thumb.j[0].quaternion.copy(thumbRoot.base).multiply(across).multiply(out);
}

/** A slider row over a range of degrees: `get` where its joint is, `set` it there (held within the range). */
function slider(label: string, from: number, to: number, get: () => number, set: (degrees: number) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(from);
  input.max = String(to);
  const shown = document.createElement('output');
  const show = () => {
    const at = Math.round(get());
    input.value = String(at);
    shown.textContent = `${at}°`;
  };
  input.addEventListener('input', () => {
    set(Number(input.value));
    shown.textContent = `${input.value}°`;
  });
  sliders.push({ show });
  show();
  row.append(name, input, shown);
  return row;
}

/** A slider on a joint's turn about one of its own axes. */
function jointSlider(label: string, joint: THREE.Object3D, axis: 'x' | 'z', from: number, to: number): HTMLElement {
  return slider(label, from, to, () => joint.rotation[axis] / DEGREES, (degrees) => {
    joint.rotation[axis] = degrees * DEGREES;
  });
}

/** A heading in the panel. */
function heading(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

/** A row of buttons, each with what it does. */
function buttons(actions: Record<string, () => void>): HTMLElement {
  const row = document.createElement('div');
  row.className = 'buttons';
  for (const [label, action] of Object.entries(actions)) {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', action);
    row.append(button);
  }
  return row;
}

/** A checkbox with its label. */
function check(label: string, on: boolean, changed: (on: boolean) => void): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = on;
  box.addEventListener('change', () => changed(box.checked));
  row.append(box, label);
  return row;
}

/** The camera stood at a view's place, looking at the hand. */
function look(name: string): void {
  camera.position.set(...VIEWS[name]);
  camera.up.set(0, name === 'Knuckles' ? 0 : 1, name === 'Knuckles' ? 1 : 0);
  controls.target.set(0, -0.07, 0);
  controls.update();
}

/** Every finger's three joints bent by one share of a fist (0 flat, 1 shut), the thumb left. */
function curlAll(share: number): void {
  for (const finger of hand.f) {
    finger.j[0].rotation.x = 86 * DEGREES * share;
    finger.j[1].rotation.x = 105 * DEGREES * share;
    finger.j[2].rotation.x = 70 * DEGREES * share;
  }
}

/** The panel built for the hand as it stands. */
function controlsFor(heavy: boolean): void {
  panel.replaceChildren();
  sliders = [];
  const posing = Object.fromEntries(Object.keys(poses).map((name) => [name, () => pose(name)]));
  panel.append(heading('Pose'), buttons({ ...posing, Reset: () => pose(posed) }));
  const shutRow = check('Fist\'s own sculpt (when shut)', false, (on) => shut(hand, on));
  shutBox = shutRow.querySelector('input');
  panel.append(shutRow);
  panel.append(check('Fighter\'s build', heavy, (on) => {
    build(on);
    controlsFor(on);
    pose(posed);
  }));
  panel.append(check('Wireframe', false, (on) => {
    hand.vis.traverse((part) => {
      const material = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material) material.wireframe = on;
    });
  }));
  const views = Object.fromEntries(Object.keys(VIEWS).map((name) => [name, () => look(name)]));
  panel.append(heading('View'), buttons(views));
  hand.f.forEach((finger, i) => {
    panel.append(heading(FINGERS[i]));
    for (const each of FINGER_RANGES) {
      panel.append(jointSlider(each.name, finger.j[each.joint], each.axis, each.from, each.to));
    }
  });
  panel.append(heading('Thumb'));
  panel.append(slider('across', ...THUMB_ROOT.across, () => thumbRoot.across, (degrees) => {
    thumbRoot.across = degrees;
    turnThumbRoot();
  }));
  panel.append(slider('out', ...THUMB_ROOT.out, () => thumbRoot.out, (degrees) => {
    thumbRoot.out = degrees;
    turnThumbRoot();
  }));
  for (const each of THUMB_RANGES) {
    panel.append(jointSlider(each.name, hand.thumb.j[each.joint], 'x', each.from, each.to));
  }
  const note = document.createElement('div');
  note.id = 'note';
  note.textContent = 'Drag to turn, wheel to zoom, right-drag to move. Each slider keeps to a real joint\'s range; '
    + 'the thumb\'s first two move its root from where the pose put it. Reset puts the last pose back.';
  panel.append(note);
}

/** The picture sized to its place on the page. */
function fit(): void {
  const { clientWidth, clientHeight } = view;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(1, clientHeight);
  camera.updateProjectionMatrix();
}

build(true);
controlsFor(true);
pose(posed);
look('Palm');
fit();
window.addEventListener('resize', fit);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
