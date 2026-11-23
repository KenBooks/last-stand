// `lab village`'s campfire used from a close view (from play: "you are in a specific view where mouse is locked you
// hover over campfire and it says sit instead of being able to interact with play together"). Over the shoulder the
// crosshair rests on the fire as he faces it, and the fire's floor is a seat: outlined, it took E, so the campfire by
// him was never named and Play together never opened. The fire's floor is left to the campfire while he stands at it
// in a close view (`fireInUse` in `game/village.ts`). `canary` leaves no seat alone, as it was: the seat must take E.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { pointerLocked } from '../../../src/core/input';
import { groundHeight } from '../../../src/world/ground';
import { fireLeftToItsObject, villageObject } from '../../../src/game/village';
import { leaveSeatsTo } from '../../../src/entities/sitting';
import { coopOpen } from '../../../src/ui/coop';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given for the crosshair to come over the fire and its seat to be outlined, for a key's effect, and
 *  the most for the lock to come */
const LOOKING = 30;
const REACT = 8;
const LOCK_COMES = 60;
/** how high over the floor at the fire's middle the crosshair is turned to (m: its logs and flames) */
const FIRE_HIGH = 0.3;

/** He stands where the campfire is used, over the shoulder with the pointer locked, the crosshair on the fire: whether
 *  the fire's floor was outlined to sit on, and whether E opened Play together. */
async function useFacingFire(lab: Lab): Promise<{ seatLit: boolean; opened: boolean; sat: boolean; prompt: Pictured }> {
  const fire = villageObject('campfire');
  if (!fire) throw new Error('lab: village: no campfire to stand by');
  const [sx, sz] = fire.stand;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(sx, groundHeight(sx, sz), sz), 0);
  await viewBy(lab, 'third');
  lab.pointerLock(true);
  // (a key the game doesn't use, the gesture the lock is taken on)
  await lab.press('KeyJ');
  await lab.until(() => pointerLocked(), LOCK_COMES, 'the pointer locked');
  const sight = new THREE.Vector3(fire.at[0], groundHeight(fire.at[0], fire.at[1]) + FIRE_HIGH, fire.at[1]);
  await lab.step(LOOKING, () => ({ sight }));
  const seatLit = G.player.sitting.pointed;
  const says = seatLit ? 'the prompt is E Sit' : 'the prompt is Play together';
  const prompt = await lab.screen('facing the campfire, over the shoulder', [says]);
  await lab.press('KeyE');
  await lab.step(REACT, () => ({ sight }));
  return { seatLit, opened: coopOpen(), sat: G.player.sitting.takesKey, prompt };
}

/** Facing the campfire in a close view, E opens Play together and the fire's floor isn't offered to sit on. */
export async function campfireUsedUpClose(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (canary) leaveSeatsTo(() => false);
  const address = location.href;
  // (the lab's own link, `?net=local`: the dialog asks no server for its health, which production's refuses a page of
  // the lab's)
  history.replaceState(null, '', `${location.pathname}?net=local`);
  try {
    const { seatLit, opened, sat, prompt } = await useFacingFire(lab);
    const line = `over the shoulder, the crosshair on the fire: its floor ${seatLit ? 'outlined to sit on' : 'left alone'}, `
      + `E ${opened ? 'opened Play together' : sat ? 'sat him down' : 'did nothing'}`;
    if (canary) return { lines: [line], problems: [], caught: seatLit && !opened, moments: [prompt] };
    const fine = !seatLit && opened;
    return { lines: [line], problems: fine ? [] : [line], caught: null, moments: [prompt] };
  } finally {
    leaveSeatsTo(fireLeftToItsObject);
    history.replaceState(null, '', address);
    if (coopOpen()) {
      await lab.press('Escape');
      await lab.step(REACT);
    }
    // (a canary's sit: any key gets him up, and the frames until he's up are the sit's)
    if (G.player.sitting.takesKey) {
      await lab.press('KeyJ');
      await lab.step(90);
    }
    await viewBy(lab, 'top');
    lab.pointerLock(false);
  }
}
