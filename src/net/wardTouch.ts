// A hero's wall broken in the village by a partner walking into it (the ranger's Hedgeward,
// combat/skills/hedgeward.ts), told to every game. Skills are cast in the training yard alone, so a partner shut out by one had no way through it
// (from the owner: "its currently possible to troll other players in coop by denying them entry with ranger's vines
// skill that cannot be destroyed"). The touch is the toucher's own game's, as each game judges its own hero; it says
// where the wall stood (`ctl` `wardTouch`), and each game breaks its own copy found there. The session sets the way
// out (`setWardTouchNet`) as a ping's is: this module imports nothing, so the wall never imports the session.

/** a touch told to every other game (alone: nothing) */
let sendTouch: (x: number, z: number) => void = () => {};

/** The session's way to tell every other game (null: alone). */
export function setWardTouchNet(send: ((x: number, z: number) => void) | null): void {
  sendTouch = send ?? (() => {});
}

/** The wall whose middle stands at (x, z) broken by this game's hero's touch: every other game told. */
export function tellWardTouched(x: number, z: number): void {
  sendTouch(x, z);
}
