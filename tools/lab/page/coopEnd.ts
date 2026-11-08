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
import type { Frame, Lab, MouseButton } from './lab';

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

/** The finger that holds the bar's turn button (the move stick's is 0) */
const TURN_FINGER = 1;

/** The watching bar's button `name` (`prev`, `next`, `free`) tapped by a finger, its touch path. Returns whether the
 *  bar had it. */
export async function coopTapBar(lab: Lab, { name }: { name: string }): Promise<boolean> {
  const at = barButton(name);
  if (at) await lab.tap(at);
  return at !== null;
}

/** The watching bar's turn-left button put down by a finger and held (`coopLiftTurn` lifts it). Returns whether the
 *  bar had it. */
export async function coopHoldTurn(lab: Lab): Promise<boolean> {
  const at = barButton('turn');
  if (at) await lab.touchDown(at, TURN_FINGER);
  return at !== null;
}

/** The finger on the turn button lifted. */
export async function coopLiftTurn(lab: Lab): Promise<void> {
  await lab.touchUp(TURN_FINGER);
}

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
