// How long each step of a stalls run took, said as it goes (tools/stalls): the build, Chrome, the game's boot, the
// set-up, the scenario, the trace and its analysis. From the owner: "boot in 50sec is too slow btw, we need to speed
// it up": a step that isn't timed can't be made faster.

/** A clock for one run's steps: `lap(name)` says how long since the last lap (or the start) and starts the next. */
export function stepClock(label) {
  let since = Date.now();
  return {
    lap(name) {
      const now = Date.now();
      console.log(`stalls: ${label}: ${name} in ${((now - since) / 1000).toFixed(1)} s`);
      since = now;
    },
  };
}
