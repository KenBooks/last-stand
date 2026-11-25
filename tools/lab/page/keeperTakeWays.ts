// The ways a hero takes up the tavern's ale and what comes of carrying it (`lab tavern`; Kenneth's round 4: "there
// should be E to grab it highlighted if mouse, locked cursor is over it, or if you are very low to it. Or you can just
// click on the cup to grab it. Also when you grab a cup, you should be able to walk around with it, but once you exit
// the tavern you lose the cup"): a mug served and waiting, taken by E with the mouse on it, by E standing close with
// the pointer elsewhere, by a click on it within reach and from across the room (he walks to it), each put down again;
// then carried on a walk, and lost at the door, back on the bar with every mug still counted. The crosshair's way (the
// close views) isn't driven here: the lab moves the mouse, not the close views' look.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { leaveRoom } from '../../../src/game/rooms';
import { MUG_COUNT } from '../../../src/data/tavern';
import { KEEPER_TAKE, type TavernKeeper } from '../../../src/world/tavernKeeper';
import type { Frame, Lab } from './lab';
import { choosingAle, pickAle, takeMug, waitingMug, type Stepper } from './takeAle';
import { viewAs } from './houses';

/** the frames a serving, a choice and a walk to a mug may take */
const SERVED_IN = 900, CHOSEN_IN = 90, WALKED_IN = 420, SETTLED = 90;
/** how far the hero must have walked carrying it (m) */
const CARRIED_LEAST = 0.6;

/** What it gives `lab tavern`. */
export interface TakeWays { lines: string[]; problems: string[] }

/** Each way of taking, the carry and the door, run on the room `tv`: `run` steps frames the watch reads, `until`
 *  steps until `done` or `most` frames (the frames it took, or -1). */
export async function takeWays(lab: Lab, tv: TavernKeeper, run: Stepper,
  until: (most: number, done: () => boolean, input?: () => Frame) => Promise<number>, canary = false,
  view: (view: 'top') => Promise<void> = (to) => viewAs(lab, to)): Promise<TakeWays> {
  // (the canary's plants, each set for its own way alone: set for the whole run, the drink taken by standing close
  // never came)
  const plant = (way: 'near' | 'click' | 'door', on: boolean) => { if (canary) KEEPER_TAKE[way] = !on; };
  const lines: string[] = [], problems: string[] = [];
  const room = G.arena.rooms!.tavern;
  const mugAt = (id: number) => tv.mugAt(id);
  const placeAt = (x: number, z: number, facing: number) => {
    G.player.walkTo = null;
    G.player.place(room.group.localToWorld(new THREE.Vector3(x, 0, z)), facing);
  };
  const away = () => G.player.pos.clone().add(new THREE.Vector3(-3, 0, 2));
  const onPage = (id: number) => {
    G.camera.updateMatrixWorld();
    const at = mugAt(id).project(G.camera as THREE.Camera), box = G.renderer.domElement.getBoundingClientRect();
    return { x: Math.round(box.left + ((at.x + 1) / 2) * box.width), y: Math.round(box.top + ((1 - at.y) / 2) * box.height) };
  };
  /** the choice up, then put down again (F): whether it came */
  const chosenThenDown = async (way: string): Promise<boolean> => {
    const chosen = await until(CHOSEN_IN, choosingAle);
    lines.push(`taken ${way}: ${chosen < 0 ? `NOT taken (offered ${tv.doing().offered}; talk ${document.querySelector('#talk:not(.hidden)') ? 'open' : 'shut'}; casting ${G.player.casting?.skill.def.name ?? 'nothing'})` : `the choice up in ${chosen} frames`}`);
    if (chosen < 0) {
      problems.push(`the mug was never taken ${way}`);
      return false;
    }
    await pickAle(lab, 'down', run);
    await until(CHOSEN_IN, () => !choosingAle());
    return true;
  };

  // (from above, where the mouse is the pointer: over the shoulder and through the eyes the crosshair is, which the lab
  // doesn't turn)
  await view('top');
  // --- a mug served and waiting before the keeper's stand ---
  const stand = villageObject('keeper')!.stand;
  placeAt(stand[0], stand[1], Math.PI / 2);
  room.serveAle?.(G.player);
  if (await until(SERVED_IN, () => waitingMug(tv) >= 0) < 0) return { lines: ['taking it every way: never served'], problems: ['taking it every way: no mug served'] };
  const id = waitingMug(tv), place = () => tv.mugs.get(id).place as { at: string; x: number; z: number };

  // (by E, the mouse on it)
  await takeMug(lab, tv, id, run);
  await chosenThenDown('by E with the mouse on it');

  // (by E, stood very close, the pointer on the floor away from it)
  placeAt(place().x - 0.55, place().z, Math.PI / 2);
  plant('near', true);
  await run(20, () => ({ aim: away() }));
  await run(1, () => ({ keys: ['e'], aim: away() }));
  await chosenThenDown('by E standing close, the pointer elsewhere');
  plant('near', false);

  // (by a click on it within reach, from beside the bar a step along from the keeper's stand)
  plant('click', true);
  placeAt(place().x - 0.9, place().z + 0.3, Math.PI / 2);
  await run(20, () => ({ aim: away() }));
  // (his talk with Bertram put away first, as a player does: open, its card takes the click)
  document.querySelector<HTMLButtonElement>('#talk:not(.hidden) .tk-close')?.click();
  // (the camera settled back from the talk's view before the mug's place on the page is read)
  await run(SETTLED, () => ({ aim: away() }));
  await lab.click(onPage(id));
  await run(1, () => ({ aim: mugAt(id) }));
  await chosenThenDown('by a click within reach');

  // (by a click from across the room: walked to it, then taken)
  placeAt(place().x - 3.2, place().z + 0.4, Math.PI / 2);
  const from = G.player.pos.clone();
  await run(20, () => ({ aim: away() }));
  await lab.click(onPage(id));
  const walked = await until(WALKED_IN, choosingAle, () => ({ aim: mugAt(id) }));
  lines.push(`taken by a click from ${(G.player.pos.distanceTo(from) + 0).toFixed(1)} m walked: ${walked < 0 ? 'NOT taken' : `in ${(walked / 60).toFixed(1)} s`}`);
  plant('click', false);
  if (walked < 0) {
    problems.push('the mug was never taken by a click from across the room');
    // (taken up by E with the mouse on it instead, stood close, for the walk and the door)
    placeAt(place().x - 0.9, place().z + 0.3, Math.PI / 2);
    await takeMug(lab, tv, id, run);
    if (await until(CHOSEN_IN, choosingAle) < 0) return { lines, problems };
  }

  // --- carried on a walk round the room ---
  const carriedFrom = G.player.pos.clone();
  await run(60, () => ({ keys: ['s'], aim: away() }));
  await run(40, () => ({ keys: ['a'], aim: away() }));
  const carried = G.player.pos.distanceTo(carriedFrom), inHand = tv.mugs.get(id).place.at === 'hero';
  lines.push(`carried: walked ${carried.toFixed(2)} m with it, ${inHand && choosingAle() ? 'still in his hand' : 'NOT in his hand'}`);
  if (carried < CARRIED_LEAST) problems.push(`with the mug in his hand he couldn't walk (${carried.toFixed(2)} m)`);
  if (!inHand || !choosingAle()) problems.push('walking with the mug, he lost it');

  // --- lost at the door: back where he took it, every mug still counted ---
  plant('door', true);
  leaveRoom(true);
  await run(30, () => ({}));
  const back = tv.mugs.get(id), counts = tv.mugs.counts();
  const lost = back.place.at !== 'hero' && !choosingAle() && !G.player.casting?.skill.def.ale;
  lines.push(`out of the door: the mug ${lost ? `back on the ${back.place.at}, ${back.full > 0.5 ? 'full' : 'empty'}` : 'STILL in his hand'}, `
    + `${counts.total} of ${MUG_COUNT} mugs counted`);
  if (!lost) problems.push('leaving the tavern, he kept the mug (lost at the door)');
  plant('door', false);
  if (counts.total !== MUG_COUNT) problems.push(`leaving the tavern with a mug, the mugs counted ${counts.total}, not ${MUG_COUNT}`);
  return { lines, problems };
}
