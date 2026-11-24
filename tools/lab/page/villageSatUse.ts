// `lab village --only campfireUsedSat` (#721, from play: "No way to interact with campfire while sitting, can't start
// a party"): sat on a log of the campfire's, by the game's own idle sit, E must open Play together and leave him sat
// (`useWhileSatBy` in `entities/sitting.ts`, `usedWhileSat` in `game/village.ts`); Esc then closes it and he still
// sits; and a step of the stick still gets him up. Said: the log sat on, its distance from the campfire, and what E
// and the stick did. `canary` leaves E to the sit while he's sat, as it was: E must get him up and open nothing.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { usedWhileSat, villageObject } from '../../../src/game/village';
import { SIT, useWhileSatBy } from '../../../src/entities/sitting';
import { coopOpen } from '../../../src/ui/coop';
import type { Seat } from '../../../src/world/seats';
import type { VillageObject } from '../../../src/data/village';
import { satWhole, startOff } from './sit';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the most frames for him to walk to the log and sit whole, and for a key's effect */
const SITS_BY = 1000;
const REACT = 10;
/** the frames for the campfire's name to come over it once he's sat */
const NAME_SHOWS = 40;
/** the frames the stick is held forward, and the most for him to be up after it */
const STEP = 20;
const UP_BY = 120;

/** What one sit and its keys did. */
interface Sat {
  line: string;
  /** E opened Play together */
  opened: boolean;
  /** still sat after E, and after Esc */
  satAfterE: boolean;
  satAfterEsc: boolean;
  /** up after the stick */
  upAfterStick: boolean;
  moments: Pictured[];
}

/** The seat that isn't the fire's floor nearest the campfire's middle: one of its logs. */
function campfireLog(fire: VillageObject): Seat {
  let best: Seat | null = null;
  let bestD = Infinity;
  for (const seat of G.arena.seats) {
    if (seat.ground) continue;
    const d = Math.hypot((seat.ax + seat.bx) / 2 - fire.at[0], (seat.az + seat.bz) / 2 - fire.at[1]);
    if (d < bestD) {
      best = seat;
      bestD = d;
    }
  }
  if (!best) throw new Error('lab: village: no log by the campfire to sit on');
  return best;
}

/** Whether he sits whole. */
const satNow = (): boolean => satWhole(G.player.sitting.pose);

/** He stands off `log` as `lab sit` stands him and goes to sit on it by the game's idle sit. */
async function sitOnLog(lab: Lab, log: Seat): Promise<void> {
  const { at, facing } = startOff(log);
  G.player.sitting.clear();
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(at[0], groundHeight(at[0], at[1]), at[1]), facing);
  SIT.auto = true;
  G.player.sitting.only = log;
  G.player.sits = true;
  await lab.until(satNow, SITS_BY, 'him sat on the campfire\'s log');
}

/** Sat on the log: E, then Esc, then the stick, each read. */
async function sitAndUse(lab: Lab): Promise<Sat> {
  const fire = villageObject('campfire');
  if (!fire) throw new Error('lab: village: no campfire to sit by');
  const log = campfireLog(fire);
  const logX = (log.ax + log.bx) / 2;
  const logZ = (log.az + log.bz) / 2;
  await sitOnLog(lab, log);
  const off = Math.hypot(G.player.pos.x - fire.at[0], G.player.pos.z - fire.at[1]);
  // (the campfire's name fades in as he sits whole: on his way down E was the sit's, and nothing was named)
  await lab.step(NAME_SHOWS);
  const offered = usedWhileSat();
  const moments = [await lab.screen('sat on the campfire\'s log', [offered ? 'E is the campfire\'s' : 'E is the sit\'s'])];
  await lab.press('KeyE');
  await lab.step(REACT);
  const opened = coopOpen();
  const satAfterE = satNow();
  if (opened) moments.push(await lab.screen('sat on the log, E pressed: Play together'));
  // (Esc with nothing open would pause the game)
  if (opened) {
    await lab.press('Escape');
    await lab.step(REACT);
  }
  const satAfterEsc = satNow();
  await lab.step(STEP, () => ({ keys: ['w'] }));
  await lab.step(UP_BY);
  const upAfterStick = G.player.sitting.pose === null;
  const line = `sat on the log at ${logX.toFixed(1)}, ${logZ.toFixed(1)}, ${off.toFixed(2)} m from the campfire: `
    + `E ${opened ? 'opened Play together' : 'opened nothing'}, ${satAfterE ? 'still sat' : 'got up'}; `
    + `Esc: ${satAfterEsc ? 'still sat' : 'up'}; W: ${upAfterStick ? 'up' : 'still sat'}`;
  return { line, opened, satAfterE, satAfterEsc, upAfterStick, moments };
}

/** The problems with what a sit and its keys did, as the fix asks. */
function problemsOf(sat: Sat): string[] {
  const problems: string[] = [];
  if (!sat.opened) problems.push('campfire sat: E opened no Play together');
  if (!sat.satAfterE) problems.push('campfire sat: E got him up');
  if (!sat.satAfterEsc) problems.push('campfire sat: Esc closing Play together got him up');
  if (!sat.upAfterStick) problems.push('campfire sat: the stick didn\'t get him up');
  return problems;
}

/** Sat on the campfire's log, E opens Play together and leaves him sat; the stick gets him up. */
export async function campfireUsedSat(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (canary) useWhileSatBy(() => false);
  const address = location.href;
  // (the lab's own link, `?net=local`: the dialog asks no server for its health, as `campfireUsedUpClose` has it)
  history.replaceState(null, '', `${location.pathname}?net=local`);
  try {
    await viewBy(lab, 'third');
    const sat = await sitAndUse(lab);
    const problems = problemsOf(sat);
    if (canary) return { lines: [sat.line], problems: [], caught: problems.length > 0, moments: sat.moments };
    return { lines: [sat.line], problems, caught: null, moments: sat.moments };
  } finally {
    useWhileSatBy(usedWhileSat);
    SIT.auto = false;
    G.player.sitting.only = null;
    G.player.sits = false;
    history.replaceState(null, '', address);
    if (coopOpen()) {
      await lab.press('Escape');
      await lab.step(REACT);
    }
    if (G.player.sitting.pose) {
      await lab.step(STEP, () => ({ keys: ['w'] }));
      await lab.step(UP_BY);
    }
    await viewBy(lab, 'top');
  }
}
