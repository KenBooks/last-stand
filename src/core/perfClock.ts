// The clock the game times its own work by (ms): the frame's parts, and the slices of work spread over frames (a
// build behind the lobby, a hero's fewer triangles). The page's own clock, or a harness's in its place (tools/lab:
// the browser's, as the page's stands still within a frame there, and a slice timed by it never ended). Imports
// nothing, so a worker's modules may read it.

/** `now()`, ms: the page's `performance.now`, or what a harness puts in its place. */
export const perfClock = { now: (): number => performance.now() };
