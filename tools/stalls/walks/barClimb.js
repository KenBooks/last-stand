// The fight's loading bar from a portal's Start to the run, read every frame from the page alone, so any build takes
// it: `--before @tools/stalls/walks/barClimb.js` with `--scenario boot --cold-return` (the village on, `?village=1`;
// without `--cold-return` the boot has pressed Start before it, and the page is in a run). The training
// skipped, the Crypt's portal picked on the map, Start pressed, and then each frame till the run shows: the fill's
// width as drawn (its transform, the compositor's glide included) and as asked (`--p`), and the bar's words. It says
// whether the fill ever went back (a bar begun again: from play, "the bar should not restart midway"), its largest
// step between two frames and the frame gap it came in, the words in turn, and the arena's own measures (`arena
// <place> <step>`: a biome's build, seal and bake as the run first needed it, against the village's build, the
// guesses `world/arena.ts` glides the bar by). It goes to `out/read-N.before.json`.
(async () => {
  /** how long the hero may take to walk to the portal (ms): on a CPU slowed 4 times its frames, and its steps, are few */
  const CARD_MOST_MS = 120000;
  /** how long the map may take to lie open after M (ms) */
  const MAP_MOST_MS = 10000;
  const POLL_MS = 250;
  const RUN_MOST_MS = 60000;
  /** a fill's step this large between two frames is listed (0 to 1) */
  const BIG_STEP = 0.1;
  const log = [];
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const shown = (selector) => Boolean(document.querySelector(selector)?.checkVisibility());
  const fixed = (value, digits = 2) => value.toFixed(digits);

  /** `selector` shown within `most` ms: whether it was */
  const until = async (selector, most) => {
    for (let waited = 0; !shown(selector) && waited < most; waited += POLL_MS) await wait(POLL_MS);
    return shown(selector);
  };
  /** The key pressed and let go on the page, as the game hears it (the map's M). */
  const tap = (key, code) => {
    for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true }));
  };

  document.querySelector('.tr-skip')?.click();
  // (a slow first visit's report asked for over the map's names: Not now)
  document.querySelector('#perf-ask .pa-later')?.click();
  await wait(POLL_MS);
  tap('m', 'KeyM');
  if (!(await until('#vmap.flat:not(.ahead)', MAP_MOST_MS))) {
    const ids = ['vmap', 'menu', 'pause', 'help', 'coop', 'vcard', 'heroes', 'perf-ask', 'readying'];
    const open = ids.filter((id) => document.getElementById(id)?.checkVisibility());
    return [`the map never opened (shown: ${open.join(', ') || 'none'})`];
  }
  document.querySelector('.vm-name[data-use="portal"][data-biome="crypt"]').click();
  let waited = 0;
  while (!shown('#btn-start') && waited < CARD_MOST_MS) {
    await wait(POLL_MS);
    waited += POLL_MS;
  }
  if (!shown('#btn-start')) return [`the portal's card never showed in ${CARD_MOST_MS} ms`];

  const bar = document.getElementById('readying');
  const fill = bar.querySelector('.rd-fill');
  /** the fill's width as drawn now (0 to 1): its transform's scale, mid-glide too */
  const drawn = () => {
    const matrix = getComputedStyle(fill).transform;
    return matrix === 'none' ? 1 : new DOMMatrixReadOnly(matrix).a;
  };
  const asked = () => Number(bar.style.getPropertyValue('--p') || 0);

  const frames = [];
  const pressed = performance.now();
  let last = pressed;
  let running = true;
  const onFrame = (now) => {
    if (!running) return;
    if (bar.classList.contains('on')) {
      const words = bar.querySelector('.rd-sub').textContent;
      frames.push({ at: now - pressed, gap: now - last, drawn: drawn(), asked: asked(), words });
    }
    last = now;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
  document.querySelector('#btn-start').click();
  while (!shown('#wavebadge') && performance.now() - pressed < RUN_MOST_MS) await wait(POLL_MS);
  running = false;
  if (!shown('#wavebadge')) log.push(`the run never showed in ${RUN_MOST_MS} ms`);

  log.push(`the bar on ${frames.length} frames, ${fixed((frames.at(-1)?.at ?? 0) / 1000)} s from Start`);
  const words = frames.map((frame) => frame.words).filter((word, i, all) => word !== all[i - 1]);
  log.push(`its words in turn: ${words.join(' / ') || 'none'}`);
  let back = 0;
  let mostBack = 0;
  let mostStep = { step: 0, at: 0, gap: 0 };
  for (let i = 1; i < frames.length; i++) {
    const step = frames[i].drawn - frames[i - 1].drawn;
    if (step < -0.005) {
      back++;
      mostBack = Math.max(mostBack, -step);
    }
    if (step > mostStep.step) mostStep = { step, at: frames[i].at, gap: frames[i].gap };
  }
  log.push(`the fill went back on ${back} frames${back ? `, at most ${fixed(mostBack)}` : ''}`);
  log.push(`its largest step ${fixed(mostStep.step)} at ${fixed(mostStep.at / 1000)} s, `
    + `after a frame gap of ${fixed(mostStep.gap, 0)} ms`);
  for (let i = 1; i < frames.length; i++) {
    const step = frames[i].drawn - frames[i - 1].drawn;
    if (step < BIG_STEP) continue;
    log.push(`  a step of ${fixed(step)} at ${fixed(frames[i].at / 1000)} s (gap ${fixed(frames[i].gap, 0)} ms, `
      + `asked ${fixed(frames[i].asked)})`);
  }
  for (const measure of performance.getEntriesByType('measure')) {
    if (measure.name.startsWith('arena')) log.push(`${measure.name}: ${fixed(measure.duration, 0)} ms`);
  }
  return log;
})()
