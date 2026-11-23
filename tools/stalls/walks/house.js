// A house walked into for the first time, as a player does, from the page alone, so any build takes it:
// `--before @tools/stalls/walks/house.js` with `--scenario boot --cold-return --warm-behind` (the hero left in the
// village on both visits). The training skipped, the house's name clicked on the map, the hero walking to its door and
// in, and then a second at a time the frames, the longest gap between two and whether the loading bar shows; last, how
// long after the click the bar came up and went (the boot's end picture shows him inside). It goes to
// `out/read-N.before.json`. A house's villager is built as it's first walked into (`folkComing` in
// `src/game/rooms.ts`, #838): this reads what that entry holds up. Which house: `HOUSE` below (the library's scholar
// is the longer build; "Odo's Wares" is the merchant's).
(async () => {
  const HOUSE = 'Library';
  const SECONDS_READ = 12;
  const POLL_MS = 50;
  const log = [];
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const shown = (selector) => Boolean(document.querySelector(selector)?.checkVisibility());

  document.querySelector('.tr-skip')?.click();
  await wait(250);
  const name = document.querySelector(`.vm-name[aria-label="${HOUSE}: go in"]`);
  if (!name) return [`the map names no house "${HOUSE}"`];

  let frames = 0;
  let longest = 0;
  let last = performance.now();
  const onFrame = (now) => {
    frames++;
    longest = Math.max(longest, now - last);
    last = now;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  const clicked = performance.now();
  const since = () => ((performance.now() - clicked) / 1000).toFixed(2);
  let barUp = null;
  let barDown = null;
  const watch = setInterval(() => {
    const bar = shown('#readying');
    if (bar && barUp === null) barUp = since();
    if (!bar && barUp !== null && barDown === null) barDown = since();
  }, POLL_MS);
  name.click();
  for (let second = 0; second < SECONDS_READ; second++) {
    await wait(1000);
    log.push(`${since()} s: ${frames} frames, the longest ${longest.toFixed(0)} ms, loading bar ${shown('#readying')}`);
    frames = 0;
    longest = 0;
  }
  clearInterval(watch);
  log.push(`the loading bar: up at ${barUp ?? 'never'} s, down at ${barDown ?? 'never'} s after the click`);
  return log;
})()
