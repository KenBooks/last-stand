// `lab houses`' zoom in a room (`ROOM_ZOOM` in `src/game/rooms.ts`, `holdZoom` in `src/core/renderer.ts`): from above,
// the wheel turned out as far as a player turns it, and in as far, keeps the room filling the screen; and the zoom he
// had outside comes back as it was once he's out (from play: "zoom when inside a room should be locked, shouldn't be
// able to zoom out that much").
import type { Lab, Pictured } from './lab';
import { ROOM_ZOOM } from '../../../src/game/rooms';
import { cameraTargetZoom, cameraZoom, holdZoom, setZoom } from '../../../src/core/renderer';
import type { RoomId } from '../../../src/data/houses';

/** the zoom he's given outside before going in: out past the room's range, as Kenneth had it */
export const OWN_ZOOM = 0.8;
/** the wheel's turns each way (a notch each, at the window's middle), and the frames each is let take */
const TURNS = 12;
const NOTCH = 120;
const TURN_FRAMES = 4;
/** the frames the zoom is let settle after the turns */
const SETTLE = 60;
/** how far past the room's range the zoom may read (the camera eases into it) */
const SLACK = 0.005;

/** What the zoom did in a room: its lines and problems, and whether the canary's fault was caught. */
export interface RoomZoom { line: string; problems: string[]; caught: boolean }

/** The wheel turned `turns` notches out (or in, negative) at the window's middle, a turn every few frames. */
async function wheel(lab: Lab, turns: number): Promise<void> {
  const middle = { x: innerWidth / 2, y: innerHeight / 2 };
  for (let turn = 0; turn < Math.abs(turns); turn++) {
    await lab.wheel(middle, Math.sign(turns) * NOTCH);
    await lab.step(TURN_FRAMES);
  }
  await lab.step(SETTLE);
}

/**
 * In room `id`, from above: the wheel turned out and in as far as it goes, the zoom read each way against
 * `ROOM_ZOOM`, the furthest out pictured. `canary` lets the room's hold go first, which must be found.
 */
export async function zoomInRoom(lab: Lab, id: RoomId, moments: Pictured[], canary: boolean): Promise<RoomZoom> {
  const problems: string[] = [];
  if (canary) holdZoom(null, false);
  await wheel(lab, TURNS);
  const outMost = cameraZoom();
  moments.push(await lab.screen(`houses-${id}-zoomed-out`, [`the wheel turned out ${TURNS} notches: zoom ${outMost.toFixed(2)}`]));
  await wheel(lab, -TURNS * 2);
  const inMost = cameraZoom();
  const outside = outMost > ROOM_ZOOM.most + SLACK;
  if (outside) problems.push(`${id}: the wheel turned out took the zoom to ${outMost.toFixed(2)}, past ${ROOM_ZOOM.most}`);
  if (inMost < ROOM_ZOOM.least - SLACK) {
    problems.push(`${id}: the wheel turned in took the zoom to ${inMost.toFixed(2)}, under ${ROOM_ZOOM.least}`);
  }
  if (outMost - inMost < (ROOM_ZOOM.most - ROOM_ZOOM.least) / 2) {
    problems.push(`${id}: the wheel moved the zoom only ${outMost.toFixed(2)} to ${inMost.toFixed(2)}: it never took`);
  }
  const line = `${id} from above: the wheel out ${outMost.toFixed(2)}, in ${inMost.toFixed(2)} `
    + `(held ${ROOM_ZOOM.least} to ${ROOM_ZOOM.most})`;
  return { line, problems: canary ? [] : problems, caught: outside };
}

/** He's given `OWN_ZOOM` outside, before a door (the zoom a player had there). */
export function ownZoom(): void {
  setZoom(OWN_ZOOM);
}

/** Out again: the zoom he had outside given back, or what's wrong. */
export function zoomGivenBack(id: RoomId): string[] {
  const now = cameraTargetZoom();
  return Math.abs(now - OWN_ZOOM) > 1e-6 ? [`${id}: out again, his zoom is ${now.toFixed(3)}, not his own ${OWN_ZOOM}`] : [];
}
