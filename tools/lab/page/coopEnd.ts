// `lab coop`'s run's end, as players meet it (tools/lab/node/coopEnd.mjs drives it): a hero out of the run while
// another plays on (from play: a banked ranger still drew and aimed, his bow's sight drawn), the game going back to
// the lobby by itself once nobody is left in the run ("once the run ends and no one is playing any wave it should
// automatically spawn you back with the others"; the "You Have Fallen" panel stayed up after it), watching the rest of
// it (LMB the next partner, RMB the one before, F a free camera, Q/E and a middle drag turning, each with the watching
// bar's button: "in spectate mode, need to click LMB to spectate next, RMB previous..."), the lobby's floor while the
// hall of heroes stands in its place, and the camera turned by a middle drag in the lobby.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { cameraYaw } from '../../../src/core/renderer';
import { project } from '../../../src/ui/floaters';
import { groundDrops, throwItem } from '../../../src/game/groundItems';
import { groundHeight } from '../../../src/world/ground';
import { labelAt } from '../../../src/ui/overlay/layer';
import { rollDrop } from '../../../src/loot/items';
import type { Frame, Lab, MouseButton, Screen } from './lab';

/** the game's spectating, where the tree has it (an older one's watching follows the first partner alone) */
type Spectate = typeof import('../../../src/game/spectate');
const spectating = Object.values(import.meta.glob<Spectate>('../../../src/game/spectate.ts', { eager: true }))[0];

/** the input every frame holds until let go (`coopHold`), or none */
let held: Frame | null = null;

/** Every frame from now holds `frame`'s input (null: none, the frames' own again). */
export function coopHold(_lab: Lab, { frame }: { frame: Frame | null }): void {
  held = frame;
}

/** The input held (`coopHold`), or null. */
export function endInput(): Frame | null {
  return held;
}

/** The world point `ahead` metres before this game's hero, on the floor: where a held shot aims. */
export function aheadOfHero(ahead: number): THREE.Vector3 {
  const hero = G.player;
  return new THREE.Vector3(hero.pos.x + Math.sin(hero.facing) * ahead, 0, hero.pos.z + Math.cos(hero.facing) * ahead);
}

/** Each frame its hero is out of the run: what he still did (casting, channelling or aiming) and the bow's sight
 *  drawn (a ranger's), counted from `coopOutWatch`. */
export interface OutSeen {
  frames: number;
  acting: number;
  sight: number;
  first: string;
}

const outSeen: OutSeen = { frames: 0, acting: 0, sight: 0, first: '' };

/** Counts from here on what this game's hero does out of the run (`watchOut`). */
export function coopOutWatch(): void {
  Object.assign(outSeen, { frames: 0, acting: 0, sight: 0, first: '' });
}

/** Notes, a frame, what an out hero still does and shows. */
export function watchOut(): void {
  const hero = G.player;
  if (G.mode !== 'run' || !hero.out) return;
  outSeen.frames++;
  const acting = hero.casting?.skill.def.impl ?? hero.channel?.skill.def.impl ?? hero.aiming?.skill.def.impl;
  if (acting) {
    outSeen.acting++;
    outSeen.first ||= `${acting} at frame ${outSeen.frames}`;
  }
  if (sightDrawn()) outSeen.sight++;
}

/** Whether the bow's sight (fx/aimLaser.ts: its line and dots, by their uniforms) is in the scene and drawn. */
function sightDrawn(): boolean {
  let drawn = false;
  G.scene.traverseVisible((object) => {
    const uniforms = ((object as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (uniforms?.uNear0 && uniforms.uAlpha?.value > 0) drawn = true;
  });
  return drawn;
}

/** What this game's hero did out of the run. */
export function coopOutSeen(): OutSeen {
  return { ...outSeen };
}

/** The canary: this game's hero, out of the run, begins his basic attack's cast as if its key had done it. */
export function coopOutCanary(): void {
  const skill = G.player.skillAt('mouse0');
  if (skill) G.player.tryCast(skill, 'mouse0', aheadOfHero(4));
}

/** The middle of the game's canvas on the page (css px): where a click or a drag on the game lands. */
function middle(): { x: number; y: number } {
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** A click of `button` on the game's middle, as a mouse clicks it. */
export async function coopClick(lab: Lab, { button }: { button: MouseButton }): Promise<void> {
  await lab.clickWith(middle(), button);
}

/** Where a drag begins: the game's middle, or (`onName`) the name of the first drop on the floor, null if none
 *  shows. */
function dragFrom(onName: boolean): { x: number; y: number } | null {
  if (!onName) return middle();
  const drop = groundDrops()[0];
  if (!drop) return null;
  const at = project(drop.x, groundHeight(drop.x, drop.z) + 0.5, drop.z);
  const from = { x: at.x, y: at.y - NAME_PROBE_PX };
  return labelAt(from.x, from.y) ? from : null;
}

/** where the drag began, for `coopDragEnd` */
let dragAt = { x: 0, y: 0 };

/** The middle button pressed on the game's middle (`onName`: on a floor drop's name) and moved `px` to the right,
 *  held (`coopDragEnd` lets it go). Returns whether it could begin there. */
export async function coopDrag(lab: Lab, { px, onName = false }: { px: number; onName?: boolean }): Promise<boolean> {
  const at = dragFrom(onName);
  if (!at) return false;
  dragAt = at;
  await lab.mouseDown(at, 'middle');
  await lab.mouseTo({ x: at.x + px, y: at.y });
  return true;
}

/** The middle button let go where the drag left it, and the mouse back where it began. */
export async function coopDragEnd(lab: Lab): Promise<void> {
  await lab.mouseUp(dragAt, 'middle');
  await lab.mouseTo(dragAt);
}

/** The middle of the watching bar's first button of class `sp-<name>`, or null where the bar has none. */
function barButton(name: string): { x: number; y: number } | null {
  const button = document.querySelector(`#spectate .sp-${name}`);
  if (!button) return null;
  const box = button.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** the fingers that twist (the move stick's is 0), how far apart they start (css px) and the steps of their twist */
const TWIST_FINGERS = [1, 2];
const TWIST_SPREAD = 160;
const TWIST_STEPS = 12;

/** The watching bar's button `name` (`prev`, `next`, `free`) tapped by a finger, its touch path. Returns whether the
 *  bar had it. */
export async function coopTapBar(lab: Lab, { name }: { name: string }): Promise<boolean> {
  const at = barButton(name);
  if (at) await lab.tap(at);
  return at !== null;
}

/** Two fingers put down either side of the screen's middle, below it, twisted by `rad` (clockwise on the screen
 *  for more than 0) a step at a time, and lifted, as a player turns the camera on touch. */
export async function coopTwist(lab: Lab, { rad }: { rad: number }): Promise<void> {
  const middle = { x: window.innerWidth / 2, y: window.innerHeight * 0.6 };
  const fingerAt = (finger: number, turn: number) => {
    const side = finger === TWIST_FINGERS[0] ? Math.PI : 0;
    const radius = TWIST_SPREAD / 2;
    return { x: middle.x + Math.cos(side + turn) * radius, y: middle.y + Math.sin(side + turn) * radius };
  };
  for (const finger of TWIST_FINGERS) await lab.touchDown(fingerAt(finger, 0), finger);
  for (let step = 1; step <= TWIST_STEPS; step++) {
    for (const finger of TWIST_FINGERS) await lab.touchMove(fingerAt(finger, (rad * step) / TWIST_STEPS), finger);
    await lab.step(1);
  }
  for (const finger of TWIST_FINGERS) await lab.touchUp(finger);
}

/** Where a point of the world east of what the camera follows shows round the screen's middle (rad, clockwise from
 *  the right): the world's turn on the screen, against the fingers'. */
export function coopWorldAngle(): number {
  const followed = spectating?.watchedPlayer()?.pos ?? G.player.pos;
  const at = project(followed.x + WORLD_MARK_M, followed.y, followed.z);
  const centre = project(followed.x, followed.y, followed.z);
  return Math.atan2(at.y - centre.y, at.x - centre.x);
}
/** how far east of what the camera follows the world's mark stands (m) */
const WORLD_MARK_M = 3;

/** What the camera shows as this game watches: the partner its spectating follows (slot; -1 none) and whether it
 *  flies free, the hero nearest the screen's middle (slot; -1 none within a fifth of the screen), where the camera
 *  stands and which way it turns, and the watching bar shown with its words. */
export interface Watching {
  spectating: boolean;
  watched: number;
  free: boolean;
  centred: number;
  camera: [number, number];
  yaw: number;
  bar: boolean;
  said: string;
  /** "You are down" shown (out of the run, it must not be) */
  downNote: boolean;
}

/** The hero drawn nearest the screen's middle, within a fifth of its height: its slot, or -1. */
function centredHero(): number {
  let best = -1;
  let nearest = window.innerHeight / 5;
  for (const p of G.players) {
    if (p.local || !p.inRun) continue;
    const at = project(p.pos.x, p.pos.y + p.model.height / 2, p.pos.z);
    const off = Math.hypot(at.x - window.innerWidth / 2, at.y - window.innerHeight / 2);
    if (!at.behind && off < nearest) {
      nearest = off;
      best = p.slot;
    }
  }
  return best;
}

/** What this game's camera shows as it watches the run. */
export function coopWatching(): Watching {
  const bar = document.getElementById('spectate');
  const shown = !!bar && !bar.classList.contains('hidden');
  return {
    spectating: spectating?.spectating() ?? false,
    watched: spectating?.watchedPlayer()?.slot ?? -1,
    free: spectating?.flyingFree() ?? false,
    centred: centredHero(),
    camera: [G.camera.position.x, G.camera.position.z],
    yaw: cameraYaw(),
    bar: shown,
    said: shown ? (bar.textContent ?? '').replace(/\s+/g, ' ').trim() : '',
    downNote: !document.getElementById('down-note')?.classList.contains('hidden'),
  };
}

/** What the floor shows: its pieces' meshes drawn (the drops' shards, an instanced octahedron, the floor's own),
 *  and the drops' names drawn where each stands on the screen (a label there that a click picks). */
export function coopFloor(): { meshes: number; labels: number } {
  let meshes = 0;
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh && mesh.count > 0 && mesh.geometry.type === 'OctahedronGeometry') meshes++;
  });
  let labels = 0;
  for (const drop of groundDrops()) {
    const at = project(drop.x, groundHeight(drop.x, drop.z) + 0.5, drop.z);
    if (!at.behind && labelAt(at.x, at.y - NAME_PROBE_PX)) labels++;
  }
  return { meshes, labels };
}
/** how far over a drop's point on the screen its name is looked for (css px: the name stands on it) */
const NAME_PROBE_PX = 4;

/** An item of this game's hero's class thrown on the lobby's floor, as a player throws one. */
export function coopThrowItem(): void {
  throwItem(rollDrop(G.player.cls, 1, 0));
}

/** The canary: this game's summary shown again over its lobby (as a summary left up there). */
export function coopSummaryCanary(): void {
  document.getElementById('summary')?.classList.remove('hidden');
}

/** the screens the watching bar is fitted on (css px): a desktop, phones held sideways (the shortest, #381's, at its
 *  panel's zoom) and tablets each way */
export const BAR_SCREENS: Screen[] = [
  { width: 1366, height: 768, ratio: 1 },
  { width: 844, height: 390, ratio: 3 },
  { width: 751, height: 298, ratio: 3.75 },
  { width: 1024, height: 768, ratio: 2 },
  { width: 768, height: 1024, ratio: 2 },
];
/** a finger's button is this tall at the least (css px), as the touch HUD's are held to (`ui --states hudTouch`) */
const FINGER_PX = 28;
/** a part of the HUD as large as this share of the window is a layer over all of it (the hurt vignette), not a part */
const LAYER_SHARE = 0.4;
/** the watching bar reaches no further down the window than this share: the hero it follows stands at its middle,
 *  his name tag over him */
const BAR_LOWEST = 0.4;

/** The watching bar's fit on one screen: the problems with it, and its box in a line. */
export interface BarFit {
  line: string;
  problems: string[];
}

/** Whether `inner` lies within `outer`, a pixel's rounding allowed. */
function within(inner: DOMRect, outer: { left: number; top: number; right: number; bottom: number }): boolean {
  const slack = 1;
  return inner.left >= outer.left - slack && inner.top >= outer.top - slack
    && inner.right <= outer.right + slack && inner.bottom <= outer.bottom + slack;
}

/** Whether two boxes overlap by more than a pixel each way. */
function overlap(a: DOMRect, b: DOMRect): boolean {
  const slack = 1;
  return a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;
}

/** An element's name in a problem: its id, else its tag and first class. */
function nameOf(element: Element): string {
  if (element.id) return `#${element.id}`;
  const first = element.classList[0];
  return first ? `${element.tagName.toLowerCase()}.${first}` : element.tagName.toLowerCase();
}

/** Whether an element shows on the page: laid out with an area, visible and not see-through. */
function showing(element: Element): boolean {
  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && Number(style.opacity) > 0;
}

/** The parts of the HUD and the touch controls shown under the watching bar (the outermost of each, not a layer over
 *  the whole window). */
function partsUnder(bar: HTMLElement): string[] {
  const barBox = bar.getBoundingClientRect();
  const window_ = window.innerWidth * window.innerHeight;
  const found: Element[] = [];
  for (const element of document.querySelectorAll('#hud *, #touch *')) {
    if (bar.contains(element) || element.contains(bar)) continue;
    if (found.some((outer) => outer.contains(element)) || !showing(element)) continue;
    const box = element.getBoundingClientRect();
    if (box.width * box.height > window_ * LAYER_SHARE) continue;
    if (overlap(box, barBox)) found.push(element);
  }
  return found.map(nameOf);
}

/** The watching bar's fit on the screen the page is on now. */
function barFitHere(): BarFit {
  const bar = document.getElementById('spectate');
  const screen = `${window.innerWidth}x${window.innerHeight}`;
  if (!bar || !showing(bar)) return { line: `${screen}: no watching bar`, problems: [`${screen}: no watching bar`] };
  const box = bar.getBoundingClientRect();
  const problems: string[] = [];
  const edges = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  if (!within(box, edges)) problems.push(`${screen}: the watching bar runs past the window`);
  const touch = document.body.classList.contains('touch');
  for (const button of bar.querySelectorAll('.sp-btn')) {
    const at = button.getBoundingClientRect();
    if (!within(at, box)) problems.push(`${screen}: the bar's ${nameOf(button)} runs out of it`);
    if (touch && at.height < FINGER_PX) problems.push(`${screen}: the bar's ${nameOf(button)} is ${at.height} px tall`);
  }
  const under = partsUnder(bar);
  if (under.length) problems.push(`${screen}: the watching bar lies over ${under.join(', ')}`);
  if (box.bottom > window.innerHeight * BAR_LOWEST) {
    const down = Math.round((box.bottom / window.innerHeight) * 100);
    problems.push(`${screen}: the watching bar reaches ${down}% down the window, over the hero it follows`);
  }
  const share = (value: number, of: number) => `${Math.round((value / of) * 100)}%`;
  const place = `${share(box.top, window.innerHeight)} to ${share(box.bottom, window.innerHeight)} down`;
  const line = `${screen}: ${Math.round(box.width)}x${Math.round(box.height)} px, ${place}${touch ? ', touch' : ''}`;
  return { line, problems };
}

/** the screen the page was on before the bar was fitted on others, to put it back on */
let ownScreen: Screen | null = null;

/** The watching bar fitted on `BAR_SCREENS[index]`, the page put on it (`coopBarBack` puts it back), with `canary` its
 *  padding made a window tall, which must be found past the window. */
export async function coopBarFit(lab: Lab, { index, canary = false }: { index: number; canary?: boolean }):
  Promise<BarFit> {
  ownScreen ??= { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio };
  const bar = document.getElementById('spectate');
  if (canary && bar) bar.style.paddingBottom = '100vh';
  try {
    await lab.showOn(BAR_SCREENS[index]);
    await lab.step(2);
    return barFitHere();
  } finally {
    if (bar) bar.style.paddingBottom = '';
  }
}

/** The page put back on the screen it was on before the bar was fitted on others. */
export async function coopBarBack(lab: Lab): Promise<void> {
  if (ownScreen) await lab.showOn(ownScreen);
  ownScreen = null;
}

/** How many screens the watching bar is fitted on. */
export function coopBarScreens(): number {
  return BAR_SCREENS.length;
}

/** the grid of points the canvas's cover is read at, across and down */
const COVER_GRID = { across: 32, down: 18 };

/** What lies over the game's canvas where a middle press would turn the camera: each element the press would reach
 *  instead (named by its nearest ancestor with an id), with its share of the window. */
export function coopCanvasCover(): { name: string; share: number }[] {
  const canvas = G.renderer.domElement;
  const counts = new Map<string, number>();
  const { across, down } = COVER_GRID;
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      const x = ((column + 0.5) / across) * window.innerWidth;
      const y = ((row + 0.5) / down) * window.innerHeight;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === canvas) continue;
      const named = hit.closest('[id]') ?? hit;
      const name = nameOf(named);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const all = across * down;
  return [...counts].map(([name, count]) => ({ name, share: count / all })).sort((a, b) => b.share - a.share);
}
