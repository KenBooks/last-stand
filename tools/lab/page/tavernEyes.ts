// `lab tavern`'s first person (page/tavern.ts): the tavern as a player through the eyes meets it. From Victor's review
// of the keeper: "no mug in 1st person (did you forget about 1st person view completely?)". Through the eyes, the
// keeper talked to by E (the card within the window), the beer slid across (its mug in the world's view as it comes),
// and the drink: at each of its beats the mug must be shown, on a layer the camera the hands are seen through draws,
// inside that camera's view and not through it (its nearest point past the near plane); and once drunk, the mug set
// down on the bar. Each beat pictured as the player sees it.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { armsCamera, faceCamera, viewMode } from '../../../src/core/renderer';
import { MUG } from '../../../src/entities/models/flask';
import type { TavernKeeper } from '../../../src/world/tavernKeeper';
import type { VillageObject } from '../../../src/data/village';
import { useByE, viewAs } from './houses';

/** the drink's beats checked and pictured through the eyes (shares of it) */
const BEATS = [0.1, 0.25, 0.45, 0.6, 0.75, 0.85];
/** the frames a serving and a drink are given */
const SERVED_IN = 900, DRUNK_IN = 600;

/** What the first-person case is handed: its frame stepper (watched), the drink's share, the room and its keeper. */
export interface EyesCase {
  frames: (most: number, done?: () => boolean) => Promise<number>;
  drinkShare: () => number;
  serve: () => void;
  tv: TavernKeeper;
  keeper: VillageObject;
}

/** How a thing is seen through `camera`: shown (it and every parent), on a layer the camera draws, inside its view,
 *  and its nearest point past the near plane (m: under 0, the camera inside it). */
export interface Seen { shown: boolean; drawn: boolean; inView: boolean; clear: number; x: number; y: number }

export function seenBy(thing: THREE.Object3D, camera: THREE.PerspectiveCamera, radius: number): Seen {
  let shown = true;
  for (let o: THREE.Object3D | null = thing; o; o = o.parent) shown &&= o.visible;
  let drawn = false;
  thing.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.layers.test(camera.layers)) drawn = true; });
  camera.updateMatrixWorld();
  const at = thing.getWorldPosition(new THREE.Vector3());
  const ahead = -at.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const ndc = at.clone().project(camera);
  const inView = ahead > 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  return { shown, drawn, inView, clear: ahead - radius - camera.near, x: ndc.x, y: ndc.y };
}

const said = (s: Seen) => [
  s.shown ? 'shown' : 'hidden', s.drawn ? 'drawn' : 'on no layer drawn',
  `${s.inView ? 'in view' : 'out of view'} at ${s.x.toFixed(2)}, ${s.y.toFixed(2)}`,
  `${(s.clear * 100).toFixed(0)} cm clear of the camera`,
].join(', ');
const fine = (s: Seen) => s.shown && s.drawn && s.inView && s.clear > 0;

/** The case run: its lines and problems added, its pictures returned. The hero stands at the keeper's stand. */
export async function throughTheEyes(lab: Lab, c: EyesCase, lines: string[], problems: string[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  await viewAs(lab, 'first');
  if (viewMode() !== 'first') problems.push('the view never came through the eyes');
  // (looking at the keeper over his bar, as a player who's come up to it does: the view turned his way, and round if
  // the camera's heading came out the other way)
  const keeperAt = c.tv.keeper()!.root.getWorldPosition(new THREE.Vector3());
  const looksAtHim = () => {
    const cam = G.camera as THREE.PerspectiveCamera, ahead = cam.getWorldDirection(new THREE.Vector3());
    return ahead.dot(keeperAt.clone().sub(cam.getWorldPosition(new THREE.Vector3())).setY(0).normalize()) > 0.7;
  };
  // (held there before every frame of the case, as a player keeps looking: the lab's own aiming turned it away)
  const toHim = Math.atan2(keeperAt.x - G.player.pos.x, keeperAt.z - G.player.pos.z);
  const hold = () => faceCamera(toHim);
  lab.beforeFrame.push(hold);
  await c.frames(20);
  if (!looksAtHim()) problems.push('through the eyes, the view never turned to the keeper');

  // --- the talk card by E, within the window ---
  await useByE(lab, c.keeper, problems);
  await c.frames(12);
  const card = document.getElementById('talk');
  const box = card?.querySelector('.tk-box')?.getBoundingClientRect();
  const within = !!box && box.left >= -1 && box.top >= -1
    && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1;
  const open = !!card && !card.classList.contains('hidden');
  const cardSaid = !open ? 'never opened' : within ? 'open within the window' : 'leaves the window';
  lines.push(`through the eyes: the talk card ${cardSaid}`);
  if (!open || !within) problems.push('through the eyes, the talk card by E never opened within the window');
  moments.push(await lab.screen('eyes-talk'));
  await lab.step(1, () => ({ keys: ['Escape'] }));
  await c.frames(10);

  // --- the beer slid across: its mug in the world's view as it comes ---
  c.serve();
  // (the best it was seen at any frame of its slide: in view for some of the way, as the player looks at the keeper)
  let slid: Seen | null = null;
  const served = await c.frames(SERVED_IN, () => {
    const mug = c.tv.mugs.mugs.find((m) => m.place.at === 'bar' && m.full > 0.5);
    if (mug && c.drinkShare() < 0) {
      const seen = seenBy(c.tv.mugMesh(mug.id), G.camera as THREE.PerspectiveCamera, MUG.rimR);
      if (!slid || (fine(seen) && !fine(slid)) || seen.clear > slid.clear) slid = seen;
    }
    return c.drinkShare() >= 0;
  });
  lines.push(`through the eyes: the slide's mug ${slid ? said(slid) : 'never seen sliding'}`);
  const slidSeen = slid as Seen | null;
  if (!slidSeen?.shown || !slidSeen.inView) problems.push('through the eyes, the mug slid across was out of view');
  if (served < 0) {
    problems.push('through the eyes, he never got his beer');
    lab.beforeFrame.splice(lab.beforeFrame.indexOf(hold), 1);
    await viewAs(lab, 'third');
    return moments;
  }

  // --- the drink: the mug in hand at every beat ---
  const mug = G.player.model.root.getObjectByName('flask')?.getObjectByName('mug');
  const worst: string[] = [];
  for (const beat of BEATS) {
    await c.frames(DRUNK_IN, () => c.drinkShare() >= beat || c.drinkShare() < 0);
    if (!mug) break;
    const seen = seenBy(mug, armsCamera(), MUG.rimR + 0.02);
    lines.push(`  at ${Math.round(beat * 100)}%: the mug ${said(seen)}`);
    if (!fine(seen)) worst.push(`${Math.round(beat * 100)}%: ${said(seen)}`);
    const share = Math.round(beat * 100);
    moments.push(lab.picture(`eyes-drink-${share}`, ['eyes'], [`${share}% of the drink, through the eyes`]));
  }
  if (!mug) problems.push('through the eyes, the hero has no mug to drink from');
  if (worst.length) problems.push(`through the eyes, the mug wasn't seen in his hand: ${worst.join('; ')}`);

  // --- set down: on the bar, in view ---
  await c.frames(DRUNK_IN, () => c.drinkShare() < 0);
  await c.frames(30);
  const down = c.tv.mugs.mugs.find((m) => m.place.at === 'bar' && m.dirty);
  const downSeen = down ? seenBy(c.tv.mugMesh(down.id), G.camera as THREE.PerspectiveCamera, MUG.rimR) : null;
  lines.push(`through the eyes: set down ${downSeen ? said(downSeen) : 'nowhere on the bar'}`);
  if (!downSeen?.shown) problems.push('through the eyes, the mug was never set down on the bar');
  moments.push(lab.picture('eyes-set-down', ['eyes'], ['the mug set down, through the eyes']));
  lab.beforeFrame.splice(lab.beforeFrame.indexOf(hold), 1);
  await viewAs(lab, 'third');
  return moments;
}
