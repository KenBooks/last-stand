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

const clickTakers: (() => boolean)[] = [];
const pointClaims: ((x: number, y: number) => boolean)[] = [];
let objectThere: (x: number, y: number) => boolean = () => false;
let objectNear: () => number = () => Infinity;

/** how the village says how far off the object he's near is (m; Infinity: none), game/village.ts */
export function objectsNearBy(near: () => number): void {
  objectNear = near;
}

/** how far off the village's object he's near is (m): Bertram nearer than a mug he stands by keeps E his talk's */
export const objectNearAt = (): number => objectNear();

/** how the village says whether one of its objects is at (`x`, `y`) on the page (game/village.ts) */
export function objectsPointedBy(at: (x: number, y: number) => boolean): void {
  objectThere = at;
}

/** whether one of the village's objects is at (`x`, `y`) on the page: the pointer on Bertram is his talk's, never a
 *  mug's he stands close to */
export const objectPointed = (x: number, y: number): boolean => objectThere(x, y);

/** `claim` asked whether a press at (`x`, `y`) on the page is its, before the village's objects hear it (the tavern's
 *  mug, drawn before Bertram: his talk took the click) */
export function claimPointWhen(claim: (x: number, y: number) => boolean): void {
  pointClaims.push(claim);
}

/** whether something registered claims a press at (`x`, `y`) */
export function pointClaimed(x: number, y: number): boolean {
  return pointClaims.some((claim) => claim(x, y));
}

/** `taker` asked each frame whether the left button's press was its (a mug clicked to take it), so a hero sat isn't got
 *  up by it (`Player.handleInput`) */
export function takeClickWhen(taker: () => boolean): void {
  clickTakers.push(taker);
}

/** whether the left button's press this frame was taken by something registered */
export function clickTaken(): boolean {
  return clickTakers.some((taker) => taker());
}
