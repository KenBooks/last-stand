// The hand demo: the game's own hand alone on a page, every joint of every digit on a slider, its fist's sculpt
// switched in and out, turned with the mouse. Served by the dev server (`npm run dev`, then /tools/handdemo/), so a
// change to the hand's code shows as it's saved. No game, no sound: only the hand's modules are loaded.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bare, buildHand, closeFist, poseHand, shut, type Hand } from '../../src/entities/models/hands';
import { HEAVY, PLAIN } from '../../src/entities/models/build';

const DEGREES = Math.PI / 180;
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
/** each finger's sliders: its name, its range (degrees) and the joint and axis it turns */
const FINGER_SLIDERS = [
  { name: 'knuckle', from: -20, to: 100, joint: 0, axis: 'x' },
  { name: 'middle', from: 0, to: 115, joint: 1, axis: 'x' },
  { name: 'last', from: 0, to: 85, joint: 2, axis: 'x' },
  { name: 'spread', from: -20, to: 20, joint: 0, axis: 'z' },
] as const;
/** the thumb's: its root turned three ways, then its two joints' bends */
const THUMB_SLIDERS = [
  { name: 'root bend', from: -40, to: 90, joint: 0, axis: 'x' },
  { name: 'root swing', from: -120, to: 120, joint: 0, axis: 'y' },
  { name: 'root side', from: -90, to: 90, joint: 0, axis: 'z' },
  { name: 'knuckle', from: -20, to: 80, joint: 1, axis: 'x' },
  { name: 'last', from: -20, to: 90, joint: 2, axis: 'x' },
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
let hand: Hand;
let sliders: { input: HTMLInputElement; read: () => number }[] = [];
/** the box that says whether the fist's own sculpt is the one drawn */
let shutBox: HTMLInputElement | null = null;

/** The hand built afresh on the wrist: `heavy` the fighter's build (with a fist's sculpt), or the plain one. */
function build(heavy: boolean): void {
  wrist.clear();
  hand = buildHand(wrist, -1, glove, skin.clone(), 1, skin.clone(), heavy ? HEAVY : PLAIN);
  bare(hand, true);
  poseHand(hand, 0.1, 0.2);
}

/** A slider on a joint's turn about one axis, in degrees. */
function slider(label: string, joint: THREE.Object3D, axis: 'x' | 'y' | 'z', from: number, to: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(from);
  input.max = String(to);
  const shown = document.createElement('output');
  const read = () => joint.rotation[axis] / DEGREES;
  const show = () => {
    input.value = String(Math.round(read()));
    shown.textContent = `${Math.round(read())}°`;
  };
  input.addEventListener('input', () => {
    joint.rotation[axis] = Number(input.value) * DEGREES;
    shown.textContent = `${input.value}°`;
  });
  sliders.push({ input, read: () => { show(); return read(); } });
  show();
  row.append(name, input, shown);
  return row;
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
    button.addEventListener('click', () => { action(); refresh(); });
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

/** Every slider set to where its joint is now (after a pose set them all at once). */
function refresh(): void {
  for (const each of sliders) each.read();
  if (shutBox) shutBox.checked = Boolean(hand.shut?.on);
}

/** The camera stood at a view's place, looking at the hand. */
function look(name: string): void {
  camera.position.set(...VIEWS[name]);
  camera.up.set(0, name === 'Knuckles' ? 0 : 1, name === 'Knuckles' ? 1 : 0);
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
  panel.append(heading('Pose'), buttons({
    Flat: () => poseHand(hand, 0, 0),
    Relaxed: () => poseHand(hand, 0.75, 0.12),
    'Bent shut': () => { poseHand(hand, 0, 0); curlAll(1); },
    Fist: () => closeFist(hand, new THREE.Vector3(-hand.s, 0, 0)),
  }));
  const shutRow = check('Fist\'s own sculpt (when shut)', false, (on) => shut(hand, on));
  shutBox = shutRow.querySelector('input');
  panel.append(shutRow);
  panel.append(check('Fighter\'s build', heavy, (on) => { build(on); controlsFor(on); }));
  panel.append(check('Wireframe', false, (on) => {
    hand.vis.traverse((part) => {
      const material = (part as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material) material.wireframe = on;
    });
  }));
  panel.append(heading('View'), buttons(Object.fromEntries(Object.keys(VIEWS).map((name) => [name, () => look(name)]))));
  hand.f.forEach((finger, i) => {
    panel.append(heading(FINGERS[i]));
    for (const each of FINGER_SLIDERS) panel.append(slider(each.name, finger.j[each.joint], each.axis, each.from, each.to));
  });
  panel.append(heading('Thumb'));
  for (const each of THUMB_SLIDERS) panel.append(slider(each.name, hand.thumb.j[each.joint], each.axis, each.from, each.to));
  const note = document.createElement('div');
  note.id = 'note';
  note.textContent = 'Drag to turn, wheel to zoom, right-drag to move. Fist shows the fighter\'s fist as the game draws it.';
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
look('Palm');
fit();
window.addEventListener('resize', fit);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
