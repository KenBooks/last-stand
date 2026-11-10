// A boot's film (tools/stalls, `--film`): the screen's frames as Chrome's screencast sends them (a picture of each
// frame its compositor draws for the page), from a moment before the loading screen begins to leave till a moment
// after it's gone, each set against the frames either side of it. A frame, or a run of up to `FLICKER_MOST`, unlike the
// frames either side of it where those are like each other is a flicker: a fade or a blow changes the screen a
// little a frame, all one way. The frames go on a sheet, the flickers' on one of their own, each frame with its time
// from the reveal. (A trace's screenshots stop at 450: a first visit's were all of its loading screen.)
import { REVEALED } from './analyze.mjs';

/** the boot's steps the film runs between (`page.mjs` `bootRecording`): the logo's blow, else the reveal */
const BLOWN = 'the logo blown away';
/** the film starts this long before the loading screen begins to leave, and ends this long after it's gone or, where
 *  it never went in the recording, after the reveal (ms) */
const BEFORE_MS = 500;
const AFTER_GONE_MS = 500;
const AFTER_REVEAL_MS = 4000;
/** each frame is set against the others as a grid of greys this size: a flicker changes the screen as a whole */
const GREY_WIDTH = 64;
const GREY_HEIGHT = 32;
/** a run of frames is a flicker when each is this much further (its mean grey level, of 255) from the frames either
 *  side of the run than those are from each other, and the run is this many frames at most */
const FLICKER_LEVELS = 6;
const FLICKER_MOST = 3;
/** the canary's blinks (`--blink-exit`, `page.mjs` `bootRecording`): the loading screen hidden for a frame every this
 *  many frames from the reveal (a plain fade cut short was gone 0.15 s after it); a blink is found where a flicker
 *  starts within `BLINK_FOUND_MS` after it (the frame drawn, then sent) */
export const BLINK_FRAMES = 4;
const BLINK_FOUND_MS = 100;
/** the screencast's pictures: JPEGs of this quality, at most this size (device px), or the window's own (`full`:
 *  any window fits in this) */
const CAST_QUALITY = 80;
const CAST_WIDTH = 640;
const CAST_HEIGHT = 360;
const CAST_FULL = 8192;
/** the logo's sheet (`--film-logo`): its frames a row, and the margin round the lobby logo each is cut to (css px).
 *  A film at the window's size is cut and scaled in the page, `CUT_BATCH` frames at a time, its pictures JPEGs of
 *  `CUT_QUALITY`: put whole on a sheet, a boot's 250 frames were 50 MB of a page that never loaded */
const LOGO_COLUMNS = 6;
const LOGO_MARGIN = 16;
const CUT_BATCH = 20;
const CUT_QUALITY = 0.92;
/** the sheets: the film's frames a row and each frame's width (css px), the frames shown either side of a flicker */
const SHEET_COLUMNS = 10;
const TILE_WIDTH = 192;
const AROUND = 2;

/**
 * Films `page` from now on, across its loads: CDP's screencast, each frame acknowledged as it comes, so the next is
 * sent, at the window's own size where `full`. Returns `stop`, which ends it and gives the frames, each its time on
 * the wall's clock (`wall`, ms) and its picture (`jpeg`, base64).
 */
export async function startFilm(page, { full = false } = {}) {
  const session = await page.context().newCDPSession(page);
  const shots = [];
  session.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (metadata.timestamp) shots.push({ wall: metadata.timestamp * 1000, jpeg: data });
  });
  const size = full ? { maxWidth: CAST_FULL, maxHeight: CAST_FULL } : { maxWidth: CAST_WIDTH, maxHeight: CAST_HEIGHT };
  await session.send('Page.startScreencast', { format: 'jpeg', quality: CAST_QUALITY, ...size, everyNthFrame: 1 });
  return {
    async stop() {
      await session.send('Page.stopScreencast').catch(() => {});
      await session.detach().catch(() => {});
      return shots;
    },
  };
}

/** The frames of the loading screen's exit among `shots` (`startFilm`'s), on the page's clock (the boot's `record`'s
 *  `origin` on the wall's), in order: each its time (`at`, ms) and its picture (`jpeg`); none where the loading screen
 *  never left. With `whole`, the loading screen's from the page's first frame on (`--film-boot`). And how many were
 *  filmed in all (`caught`). */
export function filmFrames(record, shots, whole = false) {
  const phaseAt = (name) => record.phases.find((phase) => phase.name === name)?.at ?? null;
  const leaving = phaseAt(BLOWN) ?? phaseAt(REVEALED);
  if (leaving === null) return { frames: [], caught: shots.length };
  const from = whole ? 0 : leaving - BEFORE_MS;
  const to = record.goneAt ? record.goneAt + AFTER_GONE_MS : phaseAt(REVEALED) + AFTER_REVEAL_MS;
  const frames = shots
    .map((shot) => ({ at: shot.wall - record.origin, jpeg: shot.jpeg }))
    .filter((frame) => frame.at >= from && frame.at <= to)
    .sort((a, b) => a.at - b.at);
  return { frames, caught: shots.length };
}

/** In the page: the lobby logo's box (css px) and the window's width, which a film's frame spans; null where the
 *  lobby has no logo laid out. */
export function logoBox() {
  const box = document.querySelector('#menu .logo-art')?.getBoundingClientRect();
  if (!box || box.width < 1) return null;
  return { left: box.left, top: box.top, width: box.width, height: box.height, view: innerWidth };
}

/** In the page: each of `jpegs` (base64) drawn `width` × `height`, its pixels' greys (0 to 255, row by row), and its
 *  own size. */
async function greysIn({ jpegs, width, height }) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const frames = [];
  for (const jpeg of jpegs) {
    const bytes = Uint8Array.from(atob(jpeg), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    context.drawImage(bitmap, 0, 0, width, height);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    const greys = [];
    for (let i = 0; i < data.length; i += 4) {
      greys.push(Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]));
    }
    frames.push({ greys, size });
  }
  return frames;
}

/** In the page: each of `jpegs` (base64, the window's whole frame, `logo.view` css px wide) drawn at `width` px
 *  wide (`small`, for the film's sheet) and cut to the lobby logo (`cut`: `logo`'s box with `margin` round it, at
 *  the frame's own pixels), each a JPEG of `quality` (base64). */
async function cutIn({ jpegs, width, logo, margin, quality }) {
  const base64Of = async (canvas) => {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  };
  const cuts = [];
  for (const jpeg of jpegs) {
    const bytes = Uint8Array.from(atob(jpeg), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const small = new OffscreenCanvas(width, Math.round(bitmap.height * width / bitmap.width));
    small.getContext('2d').drawImage(bitmap, 0, 0, small.width, small.height);
    // (the frame's pixels a css px)
    const scale = bitmap.width / logo.view;
    const cut = new OffscreenCanvas(
      Math.round((logo.width + 2 * margin) * scale),
      Math.round((logo.height + 2 * margin) * scale),
    );
    const [left, top] = [(logo.left - margin) * scale, (logo.top - margin) * scale];
    cut.getContext('2d').drawImage(bitmap, left, top, cut.width, cut.height, 0, 0, cut.width, cut.height);
    bitmap.close();
    cuts.push({ small: await base64Of(small), cut: await base64Of(cut) });
  }
  return cuts;
}

/** `frames` at the window's size made ready for the sheets in `page` (`cutIn`): each picture scaled to the film's
 *  usual size (`jpeg`), and cut to the lobby logo (`cut`). */
async function cutFrames(page, frames, logo) {
  const cut = [];
  for (let first = 0; first < frames.length; first += CUT_BATCH) {
    const jpegs = frames.slice(first, first + CUT_BATCH).map((frame) => frame.jpeg);
    const quality = CUT_QUALITY;
    cut.push(...(await page.evaluate(cutIn, { jpegs, width: CAST_WIDTH, logo, margin: LOGO_MARGIN, quality })));
  }
  return frames.map((frame, index) => ({ at: frame.at, jpeg: cut[index].small, cut: cut[index].cut }));
}

/** How far apart two frames' greys are: their mean difference, in grey levels of 255. */
export function apart(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** How far the run of frames `first` to `first + length - 1` stands out from the frames either side of it: the least
 *  its frames are from those, less how far those are from each other (`sides`). */
function standingOut(greys, first, length) {
  const before = greys[first - 1];
  const after = greys[first + length];
  const sides = apart(before, after);
  const run = greys.slice(first, first + length);
  const least = Math.min(...run.map((grey) => Math.min(apart(before, grey), apart(grey, after))));
  return { out: least - sides, sides };
}

/**
 * The flickers among `greys` (each frame's, in order): runs of 1 to `FLICKER_MOST` frames that stand out from the
 * frames either side by `FLICKER_LEVELS` or more (`standingOut`), the shortest such run at each frame, none starting
 * beside one found before it. Each: its first frame's index, its length, how far it stood out and how far apart the
 * frames either side were (grey levels).
 */
export function flickersOf(greys) {
  const flickers = [];
  for (let first = 1; first < greys.length - 1; first++) {
    for (let length = 1; length <= FLICKER_MOST && first + length < greys.length; length++) {
      const { out, sides } = standingOut(greys, first, length);
      if (out < FLICKER_LEVELS) continue;
      flickers.push({ first, length, out, sides });
      // (the next run starts after the frame after this one: a run beside a flicker is set against it)
      first += length;
      break;
    }
  }
  return flickers;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

const SHEET_STYLE = `
  body { margin: 0; background: #1b1c1f; color: #ddd; font: 12px/1.3 system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(${SHEET_COLUMNS}, ${TILE_WIDTH}px); gap: 3px; padding: 3px; }
  .row { display: flex; gap: 3px; padding: 3px; align-items: start; }
  .row > b { width: ${TILE_WIDTH}px; padding: 4px; box-sizing: border-box; color: #fff; }
  figure { margin: 0; width: ${TILE_WIDTH}px; position: relative; background: #000; }
  figure.flicker { outline: 3px solid #ff4a3a; outline-offset: -3px; }
  img { display: block; width: 100%; }
  figcaption { position: absolute; left: 4px; top: 2px; color: #fff; text-shadow: 0 0 3px #000, 0 0 2px #000; }
`;

/** A time from the reveal (ms) as a caption's seconds, `+0.250 s`. */
function fromRevealText(ms) {
  return `${ms >= 0 ? '+' : ''}${(ms / 1000).toFixed(3)} s`;
}

/** A frame's tile: its picture, its index and its time from the reveal (`revealedAt`, ms), outlined if it flickered. */
function tileHtml(frames, index, revealedAt, flickered) {
  const frame = frames[index];
  const from = revealedAt === null ? '' : ` ${fromRevealText(frame.at - revealedAt)}`;
  const caption = `<figcaption>${index}${escapeHtml(from)}</figcaption>`;
  const flicker = flickered.has(index) ? ' class="flicker"' : '';
  return `<figure${flicker}><img src="data:image/jpeg;base64,${frame.jpeg}">${caption}</figure>`;
}

/** Writes `html`'s page to `file` as a picture, in a page of its own in `browser` (a context of its own: the game's
 *  init scripts run in every page of its). */
async function writePicture(browser, html, width, file) {
  const page = await browser.newPage({ viewport: { width, height: 100 } });
  try {
    await page.setContent(`<!doctype html><style>${SHEET_STYLE}</style>${html}`);
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await page.close();
  }
}

/** A frame's tile cut to the lobby logo (`cutFrames`' `cut`), `width` css px wide. */
function logoTileHtml(frame, index, revealedAt, width) {
  const from = revealedAt === null ? '' : ` ${fromRevealText(frame.at - revealedAt)}`;
  const caption = `<figcaption>${index}${escapeHtml(from)}</figcaption>`;
  const image = `<img src="data:image/jpeg;base64,${frame.cut}">`;
  return `<figure style="width: ${width}px">${image}${caption}</figure>`;
}

/** The logo's sheet (`--film-logo`): each frame from the reveal on cut to the lobby logo, where it rests at the
 *  film's end (`logo`), in `file`: the particles landing and the logo taking over from them. */
async function writeLogoSheet(browser, frames, revealedAt, logo, file) {
  const shown = frames.map((frame, index) => ({ frame, index }))
    .filter(({ frame }) => revealedAt === null || frame.at >= revealedAt);
  const width = Math.ceil(logo.width + 2 * LOGO_MARGIN);
  const tiles = shown.map(({ frame, index }) => logoTileHtml(frame, index, revealedAt, width)).join('');
  const grid = `display: grid; grid-template-columns: repeat(${LOGO_COLUMNS}, ${width}px)`;
  await writePicture(browser, `<div class="grid" style="${grid}">${tiles}</div>`, LOGO_COLUMNS * (width + 3) + 3, file);
}

/** The sheets: every frame of the film in `sheet`, and each flicker's frames with `AROUND` either side in `close`. */
async function writeSheets(browser, frames, flickers, revealedAt, { sheet, close }) {
  const flickered = new Set(flickers.flatMap(({ first, length }) => {
    return Array.from({ length }, (_, offset) => first + offset);
  }));
  const tiles = frames.map((_, index) => tileHtml(frames, index, revealedAt, flickered)).join('');
  await writePicture(browser, `<div class="grid">${tiles}</div>`, SHEET_COLUMNS * (TILE_WIDTH + 3) + 3, sheet);
  if (!flickers.length) return;
  const rows = flickers.map(({ first, length, out }) => {
    const shown = [];
    for (let index = first - AROUND; index < first + length + AROUND; index++) {
      if (index >= 0 && index < frames.length) shown.push(tileHtml(frames, index, revealedAt, flickered));
    }
    return `<div class="row"><b>frame ${first}: ${out.toFixed(1)} grey levels off</b>${shown.join('')}</div>`;
  });
  const most = Math.max(...flickers.map(({ length }) => length)) + 2 * AROUND + 1;
  await writePicture(browser, rows.join(''), most * (TILE_WIDTH + 3) + 3, close);
}

/** How many of the canary's `blinks` `flickers` found (each's `at`: ms from the reveal). */
export function blinksFound(flickers, blinks) {
  const found = (at) => flickers.some((flicker) => flicker.at >= at && flicker.at <= at + BLINK_FOUND_MS);
  return blinks.filter(found).length;
}

/**
 * The film of a boot's exit (`filmFrames`: its `frames`, of the `caught` in the trace): its frames decoded in `page`
 * (the game's, its measure done), the flickers among them (`flickersOf`), each by its time from the reveal
 * (`revealedAt`, ms), and the sheets written (`files.sheet`, and `files.close` for the flickers' frames; with `logo`,
 * `logoBox`'s, `files.logo` for the frames cut to the lobby logo). `blinks` are the canary's (`--blink-exit`: the
 * page's clock), `planted` of them, of which `found` were.
 */
export async function filmOf(browser, page, { frames, caught }, revealedAt, files, blinks, logo = null) {
  const planted = blinks.length;
  if (!frames.length) return { frames: 0, caught, planted, found: 0, flickers: [], files };
  const decoded = await page.evaluate(greysIn, {
    jpegs: frames.map((frame) => frame.jpeg),
    width: GREY_WIDTH,
    height: GREY_HEIGHT,
  });
  const flickers = flickersOf(decoded.map((frame) => frame.greys));
  const sheeted = logo ? await cutFrames(page, frames, logo) : frames;
  await writeSheets(browser, sheeted, flickers, revealedAt, files);
  if (logo) await writeLogoSheet(browser, sheeted, revealedAt, logo, files.logo);
  const from = (at) => (revealedAt === null ? null : at - revealedAt);
  const timed = flickers.map((flicker) => ({ ...flicker, at: from(frames[flicker.first].at) }));
  return {
    frames: frames.length,
    caught,
    size: decoded[0].size,
    from: from(frames[0].at),
    to: from(frames[frames.length - 1].at),
    flickers: timed,
    planted,
    found: blinksFound(timed, blinks.map(from)),
    files: logo ? files : { sheet: files.sheet, close: files.close },
  };
}
