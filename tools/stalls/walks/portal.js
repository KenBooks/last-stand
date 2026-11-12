// A portal used as a player uses it, from the page alone, so any build takes it:
// `--before @tools/stalls/walks/portal.js` with `--scenario boot --cold-return` (the fight's programs cold, as a first
// visit leaves them). The training skipped,
// the map's portal name clicked, the hero walking there, Enter pressed, and then a second at a time the frames, the
// longest gap and whether the loading bar or the run shows; last, the warm-ups' own measures (their `drawMs` is what a
// draw made and linked, the page held up). It goes to `out/read-1.before.json`. From play, "when using a portal to the
// main game, it hangs": at `?hour=0`, 38 s and then 9 to 11 s with no frame, which the lab's boots, warmed, never met.
(async () => {
  const CARD_MOST_MS = 25000;
  const CARD_POLL_MS = 250;
  const SECONDS_READ = 14;
  const log = [];
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const shown = (selector) => Boolean(document.querySelector(selector)?.checkVisibility());

  document.querySelector('.tr-skip')?.click();
  await wait(CARD_POLL_MS);
  document.querySelector('.vm-name[data-biome="crypt"]').click();
  let waited = 0;
  while (!shown('#btn-start') && waited < CARD_MOST_MS) {
    await wait(CARD_POLL_MS);
    waited += CARD_POLL_MS;
  }
  if (!shown('#btn-start')) return [`the portal's card never showed in ${CARD_MOST_MS} ms`];
  log.push(`the card after ${waited} ms`);

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

  const pressed = performance.now();
  document.querySelector('#btn-start').click();
  for (let second = 0; second < SECONDS_READ; second++) {
    await wait(1000);
    const at = ((performance.now() - pressed) / 1000).toFixed(1);
    const state = `loading bar ${shown('#readying')}, run ${shown('#wavebadge')}`;
    log.push(`${at} s: ${frames} frames, the longest ${longest.toFixed(0)} ms, ${state}`);
    frames = 0;
    longest = 0;
  }
  for (const measure of performance.getEntriesByType('measure')) {
    if (!measure.name.startsWith('warm')) continue;
    log.push(`${measure.name}: ${measure.duration.toFixed(0)} ms ${JSON.stringify(measure.detail ?? {})}`);
  }
  return log;
})()
