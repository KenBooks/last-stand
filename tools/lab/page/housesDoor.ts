// `lab houses`' doors (`src/world/door.ts`, `src/game/village.ts`'s hold): a house's door is held, not pressed (a tap
// at it takes no one through; held, its prompt names the house and fills, the door staying shut, and once
// held through he goes). The faces round its door are `housesFaces.ts`'.
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { HOUSES, type RoomId } from '../../../src/data/houses';
import { holdShare, labelSays, objectNear, setHoldToUse, HOLD_TO_USE } from '../../../src/game/village';
import type { VillageObject } from '../../../src/data/village';

/** the frames of a tap of E, and those let pass after it */
const TAP = 3;
const AFTER_TAP = 12;
/** the share of the hold at which the prompt and the door are read, and pictured */
const READ_AT = 0.6;
/** the most frames a hold may take past its own time to take him through (the room's warm-up behind it) */
const HOLD_SPARE = 600;

/** the lab's frames a second */
const FRAMES_A_SECOND = 60;
/** The frames a hold of `share` of the door's time takes. */
const framesFor = (share: number): number => Math.ceil(HOLD_TO_USE * share * FRAMES_A_SECOND) + 1;

/**
 * Door `o` (a house's door outside, or its room's inside) used as a player uses it: a tap first, which must take him
 * nowhere, then E held, read and pictured partway (`picture`), and held on until he's through. Returns the problems.
 * `canary`: the hold made a press (0 s), which the tap must be found taking him through.
 */
export async function holdThroughDoor(lab: Lab, o: VillageObject, moments: Pictured[], picture: string | null,
  canary = false): Promise<string[]> {
  const problems: string[] = [];
  const near = objectNear();
  if (near !== o) problems.push(`at ${o.id}'s stand the object near is ${near?.id ?? 'none'}`);
  const from = G.arena.room;
  if (canary) setHoldToUse(0);
  try {
    await lab.step(TAP, () => ({ keys: ['e'] }));
    await lab.step(AFTER_TAP);
  } finally {
    if (canary) setHoldToUse(HOLD_TO_USE);
  }
  if (G.arena.room !== from) {
    problems.push(`a tap of E at ${o.id} took him through it`);
    return problems;
  }
  await lab.step(framesFor(READ_AT), () => ({ keys: ['e'] }));
  const house = (o.into ?? o.room) as RoomId;
  const said = labelSays(o);
  const share = holdShare();
  if (share < READ_AT * 0.8) problems.push(`${o.id}: E held ${READ_AT} of its time, the hold read ${share.toFixed(2)}`);
  if (o.use === 'enter' && !said.says.includes(HOUSES[house].name)) {
    problems.push(`${o.id}'s prompt says "${said.says}", not its house's name`);
  }
  if (picture) moments.push(await lab.screen(picture, [`${o.id}: held ${share.toFixed(2)}`]));
  await lab.until(() => G.arena.room !== from, framesFor(1) + HOLD_SPARE, `${o.id}: held, he never went through`,
    () => ({ keys: ['e'] }));
  await lab.step(1);
  return problems;
}
