// The lab's picture sheet as one image (tools/lab): a row a moment, a column a view, each row's notes beside it.
// With an A/B, each moment's row from the other commit sits above this tree's.

import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TILE_WIDTH = 340;
const TILE_HEIGHT = 560;
/** a picture of the whole frame (`lab.screen`, the view through the eyes) is as wide as it shows at the row's height,
 *  up to this */
const SCREEN_TILE_WIDTH = 960;
/** the views that are the whole frame: put in the common width, the eyes' was a strip a third of the tile high */
const WHOLE_FRAME_VIEWS = ['screen', 'eyes'];
const NOTES_WIDTH = 300;
const GAP = 3;

const STYLE = `
  body { margin: 0; background: #1b1c1f; color: #ddd; font: 13px/1.35 system-ui, sans-serif; }
  .row { display: flex; gap: ${GAP}px; margin-bottom: ${GAP}px; }
  .notes { width: ${NOTES_WIDTH}px; flex: none; padding: 8px; box-sizing: border-box; background: #26282c; }
  .notes b { display: block; font-size: 15px; color: #fff; }
  .notes i { display: block; color: #e9b44c; margin: 2px 0 4px; font-style: normal; }
  .notes p { margin: 5px 0; }
  figure { margin: 0; position: relative; width: ${TILE_WIDTH}px; height: ${TILE_HEIGHT}px; background: #000; }
  img { width: 100%; height: 100%; object-fit: scale-down; }
  figcaption { position: absolute; left: 6px; top: 4px; color: #fff; text-shadow: 0 0 3px #000; }
`;

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** A tile's width on the sheet: a view's crop the common width, the whole frame its own at the row's height. */
function tileWidth(tile) {
  if (!WHOLE_FRAME_VIEWS.includes(tile.view)) return TILE_WIDTH;
  return Math.min(SCREEN_TILE_WIDTH, Math.round(tile.width * TILE_HEIGHT / tile.height));
}

/** A row's width on the sheet: its notes and its tiles. */
function rowWidth(moment) {
  return NOTES_WIDTH + moment.tiles.reduce((width, tile) => width + tileWidth(tile) + GAP, 0);
}

function rowHtml(moment, sideName) {
  const side = sideName ? `<i>${escapeHtml(sideName)}</i>` : '';
  const notes = moment.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('');
  const tiles = moment.tiles
    .map((tile) => {
      const figure = `<figure style="width: ${tileWidth(tile)}px">`;
      return `${figure}<img src="${tile.png}"><figcaption>${tile.view}</figcaption></figure>`;
    })
    .join('');
  return `<div class="row"><div class="notes"><b>${escapeHtml(moment.label)}</b>${side}${notes}</div>${tiles}</div>`;
}

const STACK_STYLE = `
  body { margin: 0; background: #1b1c1f; color: #fff; font: bold 16px/1.4 system-ui, sans-serif; }
  figure { margin: 0 0 ${GAP}px; }
  figcaption { padding: 4px 8px; background: #26282c; }
  img { display: block; }
`;

/**
 * `html` pictured whole into `file`: loaded from a file beside it, as sent over the DevTools protocol a sheet of many
 * pictures, each inline, was one message too long and closed the browser ("Target page, context or browser has been
 * closed", "setting frame content").
 */
async function pictureOf(page, html, file) {
  const held = `${file}.html`;
  await writeFile(held, html);
  try {
    await page.goto(pathToFileURL(resolve(held)).href);
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await rm(held, { force: true });
  }
}

/**
 * Writes `pictures` to `file` one above another, each at its own size under its caption (an A/B's sides of a picture
 * that's read whole: a film's strip of frames, scaled to a sheet's row, was too small to read).
 */
export async function writeStack(browser, pictures, file) {
  const width = Math.max(...pictures.map((picture) => picture.width));
  const figures = pictures.map((picture) => {
    const caption = `<figcaption>${escapeHtml(picture.caption)}</figcaption>`;
    return `<figure>${caption}<img src="${picture.png}" width="${picture.width}" height="${picture.height}"></figure>`;
  });
  const page = await browser.newPage({ viewport: { width, height: 100 } });
  try {
    await pictureOf(page, `<!doctype html><style>${STACK_STYLE}</style>${figures.join('')}`, file);
  } finally {
    await page.close();
  }
}

/**
 * Writes the sheet to `file`. `runs` is a list of [side name, sheet] (the other commit first in an A/B); a moment
 * is matched across sides by its place in the list.
 */
export async function writeSheet(browser, runs, viewCount, file) {
  const rows = [];
  let width = NOTES_WIDTH + viewCount * (TILE_WIDTH + GAP);
  const moments = Math.max(...runs.map(([, sheet]) => sheet.moments.length));
  for (let i = 0; i < moments; i++) {
    for (const [sideName, sheet] of runs) {
      const moment = sheet.moments[i];
      if (!moment) continue;
      rows.push(rowHtml(moment, runs.length > 1 ? sideName : ''));
      width = Math.max(width, rowWidth(moment));
    }
  }
  const page = await browser.newPage({ viewport: { width, height: TILE_HEIGHT + GAP } });
  try {
    await pictureOf(page, `<!doctype html><style>${STYLE}</style>${rows.join('')}`, file);
  } finally {
    await page.close();
  }
}
