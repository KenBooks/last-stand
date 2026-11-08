// What every hero's update costs a game in `lab coop` (`Player.update`, the local hero's and each partner's copy),
// timed by the browser's own clock frame by frame and kept apart by where the game is (in a run, in the lobby, in the
// hall of heroes) and by whose hero it is (its own, or a partner's copy). A co-op trace's player stage (KXRQ-WWX3)
// read 5.7 ms a frame, 8.7 to 11.8 in the lobby after a run.
import { G } from '../../../src/state';
import { Player } from '../../../src/entities/player';
import { hallOpen } from '../../../src/game/hall';

/** where a game is as a frame runs */
type Place = 'run' | 'lobby' | 'hall';

/** A place's frames, and the update time (ms) of its own hero and its partners' copies over them. */
interface Spent {
  frames: number;
  own: number;
  partners: number;
  /** the partners' copies updated over the frames, counted once a frame each */
  copies: number;
}

/** What the heroes' update cost a frame in a place: its own hero's and each partner copy's, ms. */
export interface PlaceCost {
  frames: number;
  own: number;
  perCopy: number;
}

const spent: Record<Place, Spent> = {
  run: { frames: 0, own: 0, partners: 0, copies: 0 },
  lobby: { frames: 0, own: 0, partners: 0, copies: 0 },
  hall: { frames: 0, own: 0, partners: 0, copies: 0 },
};
/** this frame's time so far, the game's own hero's and its partners' */
const frame = { own: 0, partners: 0, copies: 0 };
let timed = false;

const placeNow = (): Place => (hallOpen() ? 'hall' : G.mode === 'run' ? 'run' : 'lobby');

/** Every hero's update timed by the browser's clock into this frame's (a call inside another counted once). */
function timeUpdates(): void {
  const original = Player.prototype.update;
  const now = window.__labClock.realNow;
  let depth = 0;
  Player.prototype.update = function timedUpdate(this: Player, ...args: Parameters<Player['update']>): void {
    // (the hall of heroes' own heroes are players too, not in the room: left out)
    if (depth > 0 || !G.players.includes(this)) return original.apply(this, args);
    depth++;
    const start = now();
    try {
      original.apply(this, args);
    } finally {
      const took = now() - start;
      if (this.local) frame.own += took;
      else {
        frame.partners += took;
        frame.copies++;
      }
      depth--;
    }
  };
}

/** Notes, after a frame, what the heroes' update took in it (timing from the first frame watched). */
export function watchHeroCost(): void {
  if (!timed) {
    timeUpdates();
    timed = true;
    return;
  }
  const place = spent[placeNow()];
  place.frames++;
  place.own += frame.own;
  place.partners += frame.partners;
  place.copies += frame.copies;
  frame.own = frame.partners = frame.copies = 0;
}

/** A place's cost a frame: its own hero's, and each partner copy's. */
function costOf(place: Spent): PlaceCost {
  const own = place.frames ? place.own / place.frames : 0;
  const perCopy = place.copies ? place.partners / place.copies : 0;
  return { frames: place.frames, own, perCopy };
}

/** What the heroes' update cost this game a frame in each place. */
export function coopHeroCost(): Record<Place, PlaceCost> {
  return { run: costOf(spent.run), lobby: costOf(spent.lobby), hall: costOf(spent.hall) };
}
