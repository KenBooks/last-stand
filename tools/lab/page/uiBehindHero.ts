// tools/lab `ui --states behindProps`, the heroes' part: a dummy's meter is hidden where the hero, nearer the camera,
// covers it on the screen (`behindHero` in src/ui/floaters.ts). From play: "dummy labels appear on top of the
// character, they should hide" (a meter hung down over the mage's hood). In the view behind him zoomed all the way in,
// as the owner's picture was (from the top-down view's height, or further back, he never covers one), the hero is stood at distances before each dummy along the camera's way and the
// camera let follow him; at each the meter's box as drawn (the overlay's own, `Label.box`, placed seeing no hero) is
// judged against his body on the screen (his meshes' vertices as drawn, projected, but for what he holds: the staff's
// crystal stands over his head; a box round them stood higher than his outline): `EDGE` px into it, the meter must be
// hidden; as far clear of it, shown; between, it isn't judged. Its canary hides the heroes from
// the floaters (none in `G.players` as the labels are placed), which must leave a meter shown over him.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { anchoredLabels, updateFloaters } from '../../../src/ui/floaters';
import { layoutLabels, type Label } from '../../../src/ui/overlay/layer';
import { lookBy, viewMode, zoomBy, type ViewMode } from '../../../src/core/renderer';
import type { Lab } from './lab';

/** the frames the camera is given to glide into the view behind the hero */
const GLIDE_FRAMES = 60;
/** the wheel's notches in for that view (all the way: close behind him, as the owner's picture was) */
const ZOOM_IN = 30;
/** the view judged: behind him, zoomed in, looked up as far as mouse look goes (the horizon, and a dummy's meter far
 *  off, brought down to his head: from the default pitch, and from above, a meter always stood over him) and level */
const VIEW: ViewMode = 'third';
const PITCHES = [-1, 1];
/** mouse look's movement that takes the pitch to its end either way (clamped there) */
const LOOK_ALL_THE_WAY = 100000;

/** how far before a dummy the hero is stood, along the camera's way (m), and the frames the camera follows him there */
const BACKS = [0.8, 1.5, 3, 6, 9, 12];
const SETTLE_FRAMES = 30;
/** how far a meter must reach into his body's box to count as over it, and stand off it to count as clear (css px):
 *  within that of its edge, it's neither */
const EDGE = 10;

/** A box on the screen (css px). */
interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What the heroes' check found. */
export interface HeroCover {
  lines: string[];
  problems: string[];
}

/** The dummies' meters anchored now, each with where. */
function meters(): { label: Label; at: THREE.Vector3 }[] {
  const dummies = G.enemies.filter((enemy) => enemy.def.dummy && enemy.alive);
  const near = (at: { x: number; z: number }) => dummies.some((d) => Math.hypot(d.pos.x - at.x, d.pos.z - at.z) < 1);
  return anchoredLabels()
    .filter(({ at }) => at && near(at))
    .map(({ label, at }) => ({ label, at: new THREE.Vector3(at!.x, at!.y, at!.z) }));
}

/** Whether `object` is held in a hand (under a hand's joint): a staff, a weapon, what isn't his body. */
function held(object: THREE.Object3D): boolean {
  const joints = G.player.model.joints;
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    if (at === joints?.handL || at === joints?.handR) return true;
  }
  return false;
}

/** The hero's body on the screen: his meshes' vertices as drawn (skinned), but for what's in his hands, projected
 *  (the corners of a box round them stood higher on the screen than his outline, from a camera above him). */
function heroBox(): ScreenBox {
  G.player.obj.updateMatrixWorld(true);
  const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const vertex = new THREE.Vector3();
  G.player.obj.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    const positions = mesh.isMesh ? mesh.geometry?.attributes.position : undefined;
    if (!positions || held(mesh)) return;
    for (let index = 0; index < positions.count; index++) {
      mesh.getVertexPosition(index, vertex);
      vertex.applyMatrix4(mesh.matrixWorld).project(G.camera);
      const x = (vertex.x * 0.5 + 0.5) * innerWidth;
      const y = (-vertex.y * 0.5 + 0.5) * innerHeight;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
  });
  return box;
}

/** A box as its corners, whole px. */
const boxText = (box: ScreenBox): string =>
  `${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`;

/** How far `one` reaches into `other`, the lesser of across and down (px; under 0, the gap between them). */
function reach(one: ScreenBox, other: ScreenBox): number {
  const across = Math.min(one.right, other.right) - Math.max(one.left, other.left);
  const down = Math.min(one.bottom, other.bottom) - Math.max(one.top, other.top);
  return Math.min(across, down);
}

/** The labels placed again for where the hero stands now, the camera kept (`hidden`: the floaters see no hero). */
function placeLabels(hidden: boolean): void {
  const players = G.players;
  if (hidden) G.players = [];
  try {
    updateFloaters(0);
  } finally {
    G.players = players;
  }
}

/** `label`'s box as the overlay draws it, laid out with the hero away. */
function drawnBox(label: Label): ScreenBox {
  layoutLabels();
  const { x, y, w, h } = label.box;
  return { left: x, top: y, right: x + w, bottom: y + h };
}

/** Each dummy's meter with the hero stood before it, the camera following behind him as play had it (third person,
 *  zoomed in, at each end of mouse look's pitch): hidden where he covers it, shown where he doesn't. */
export async function metersBehindHero(lab: Lab, canary: boolean): Promise<HeroCover> {
  const view = viewMode();
  await pressInto(lab, VIEW);
  zoomBy(-ZOOM_IN);
  const tally = newTally();
  try {
    for (const pitch of PITCHES) {
      lookBy(0, pitch * LOOK_ALL_THE_WAY);
      await lab.step(GLIDE_FRAMES);
      await judgeMeters(lab, canary, tally);
    }
  } finally {
    zoomBy(ZOOM_IN);
    await pressInto(lab, view);
  }
  return verdict(tally);
}

/** V pressed, as a player switches views, until the camera is in `view`, and its glide played. */
async function pressInto(lab: Lab, view: ViewMode): Promise<void> {
  for (let press = 0; press < 3 && viewMode() !== view; press++) {
    await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(1);
  }
  if (viewMode() !== view) throw new Error(`lab: ui: behindProps: V never brought the ${view} view`);
  await lab.step(GLIDE_FRAMES);
}

/** One placement's meter and body on the screen, and whether the meter showed. */
interface Placement {
  meter: ScreenBox;
  body: ScreenBox;
  shown: boolean;
}

/** The hero stood `back` m before `at` along the camera's way, the camera settled behind him; the meter's box as drawn
 *  (placed seeing no hero), his body's, and whether the meter showed as the game placed it. */
async function placeBefore(lab: Lab, label: Label, at: THREE.Vector3, back: number, canary: boolean): Promise<Placement> {
  const way = G.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  G.player.pos.set(at.x - way.x * back, G.player.pos.y, at.z - way.z * back);
  await lab.step(SETTLE_FRAMES);
  placeLabels(true);
  const meter = drawnBox(label);
  const body = heroBox();
  placeLabels(canary);
  return { meter, body, shown: label.shown };
}

/** What the placements found: those where he covered the meter and it hid, those clear of him where it showed. */
interface Tally {
  covered: number;
  hiddenOver: number;
  clear: number;
  shownClear: number;
  shownOver: string[];
  hiddenClear: string[];
}

const newTally = (): Tally => ({ covered: 0, hiddenOver: 0, clear: 0, shownClear: 0, shownOver: [], hiddenClear: [] });

/** Each dummy's meter with the hero stood before it at each of `BACKS`, added to `tally`. */
async function judgeMeters(lab: Lab, canary: boolean, tally: Tally): Promise<void> {
  const home = G.player.pos.clone();
  try {
    for (const { label, at } of meters()) {
      for (const back of BACKS) {
        const { meter, body, shown } = await placeBefore(lab, label, at, back, canary);
        if (!Number.isFinite(body.top) || meter.right <= meter.left) continue;
        // (a meter off the screen's top or left is judged by nothing: stood that far before a dummy in the village,
        // he's out of its yard, where the meters are put away and their boxes lie off the screen)
        if (meter.bottom < 0 || meter.right < 0) continue;
        const into = reach(meter, body);
        const where = `${back} m before it: the meter ${boxText(meter)}, his body ${boxText(body)}`;
        if (into >= EDGE) {
          tally.covered++;
          if (!shown) tally.hiddenOver++;
          else tally.shownOver.push(where);
        } else if (into <= -EDGE) {
          tally.clear++;
          if (shown) tally.shownClear++;
          else tally.hiddenClear.push(where);
        }
      }
    }
  } finally {
    G.player.pos.copy(home);
    await lab.step(SETTLE_FRAMES);
  }
}

/** The tally's line and problems. */
function verdict(tally: Tally): HeroCover {
  const { covered, hiddenOver, clear, shownClear } = tally;
  const lines = [`  the dummies' meters with the hero before them: ${hiddenOver} of ${covered} hidden where he covers `
    + `them, ${shownClear} of ${clear} shown where he doesn't`];
  const problems: string[] = [];
  if (!covered) problems.push('behindProps: the hero covered no meter at any step');
  if (hiddenOver < covered) {
    problems.push(`behindProps: ${covered - hiddenOver} meters shown over the hero (${tally.shownOver.join('; ')})`);
  }
  if (shownClear < clear) {
    const cases = tally.hiddenClear.join('; ');
    problems.push(`behindProps: ${clear - shownClear} meters hidden with the hero clear of them (${cases})`);
  }
  return { lines, problems };
}
