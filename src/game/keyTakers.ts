// What takes E from the village's objects for a frame (game/village.ts reads it): the tavern's mug the pointer is on,
// taken up by E where Bertram would otherwise be talked to (world/tavernKeeper.ts). Imports nothing, so a world module
// can register without bringing the village's in.

const takers: (() => boolean)[] = [];

/** `taker` asked each frame whether E is its, not the village object's near (and, sat, left to it: `usedWhileSat`) */
export function takeKeyWhen(taker: () => boolean): void {
  takers.push(taker);
}

/** whether something registered takes E this frame */
export function keyTaken(): boolean {
  return takers.some((taker) => taker());
}
