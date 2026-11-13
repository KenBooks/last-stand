// `lab village`'s how to play closed by Esc from a close view, the pointer locked as he walked up (from play, "exiting
// from how to play should be possible with escape, it should not reopen another escape menu"). The game asked for the
// lock back with Esc still down, and the browser lets a lock go for an Esc as it's let go; the page plays that here, as
// the lab's lock is the page's own. `canary` asks for the lock with Esc down, as it was: the pause menu must open.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdLockOffByEsc, pointerLocked } from '../../../src/core/input';
import { groundHeight } from '../../../src/world/ground';
import { villageObject } from '../../../src/game/village';
import { helpOpen, hideHelp } from '../../../src/ui/menus';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given for a key's effect, the most for the lock to come, and how long Esc is held (frames) */
const REACT = 4;
const LOCK_COMES = 60;
const ESC_HELD = 6;
const READING = 60;

/** The browser's part as Esc is let go: a lock held then is let go. */
function browserLetsGoOfLock(): void {
  if (pointerLocked()) document.exitPointerLock();
}

/** He stands at the notice board with the pointer locked; how to play opened by E, closed by Esc. */
async function escapeFromHelp(lab: Lab): Promise<{ opened: boolean; closed: boolean; paused: boolean }> {
  const stand = villageObject('notice')?.stand;
  if (!stand) throw new Error('lab: village: no notice board to stand by');
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand[0], groundHeight(stand[0], stand[1]), stand[1]), 0);
  await viewBy(lab, 'third');
  lab.pointerLock(true);
  // (a key the game doesn't use, the gesture the lock is taken on)
  await lab.press('KeyJ');
  await lab.until(() => pointerLocked(), LOCK_COMES, 'the pointer locked');
  await lab.press('KeyE');
  // (a player's while reading: past the wait between two asks for the lock, which would hide the fault)
  await lab.step(READING);
  const opened = helpOpen();
  await lab.keyDown('Escape');
  // (a frame holds a key only if its input does)
  await lab.step(ESC_HELD, () => ({ keys: ['escape'] }));
  browserLetsGoOfLock();
  await lab.keyUp('Escape');
  await lab.step(REACT);
  return { opened, closed: !helpOpen(), paused: G.menuOpen };
}

/** Esc takes how to play away and opens nothing else. */
export async function escClosesHelp(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdLockOffByEsc(!canary);
  try {
    const { opened, closed, paused } = await escapeFromHelp(lab);
    const line = `how to play by E ${opened ? 'opened' : 'never opened'}, by Esc ${closed ? 'closed' : 'stayed'}, `
      + `the pause menu ${paused ? 'opened' : 'shut'}`;
    if (canary) return { lines: [line], problems: [], caught: paused, moments: [] };
    const fine = opened && closed && !paused;
    return { lines: [line], problems: fine ? [] : [line], caught: null, moments: [] };
  } finally {
    holdLockOffByEsc(true);
    hideHelp();
    if (G.menuOpen) {
      // (past the moment an Esc is taken for the one that let the lock go)
      await lab.step(READING);
      await lab.press('Escape');
      await lab.step(REACT);
    }
    await viewBy(lab, 'top');
    lab.pointerLock(false);
  }
}
