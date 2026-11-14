// The village map's looks (ui/villageMap.ts), while one is chosen: the map as it stands (`now`), an explorer's chart
// on aged parchment (`a`), a gilded war table's map on dark leather (`b`) and a painted watercolour map (`c`). Each is
// its colours and its own way of drawing the ground, the trees, a building's roof, the frame, the compass and the
// title; the map's plan is drawn by ui/villageMap.ts the same for all. Chosen by `?mapStyle=a|b|c` or the lab's
// `--tune villageMap.style=0|1|2|3`. (Exploratory: one is kept, the rest go.)
import type { BiomeId } from '../data/biomes';
import { mulberry } from '../util';
import { tunable } from '../core/tuning';

export type MapStyle = 'now' | 'a' | 'b' | 'c';
const STYLES: readonly MapStyle[] = ['now', 'a', 'b', 'c'];

/** the lab's switch (0 the map as it stands, 1 to 3 the looks a to c), read as the map is drawn */
const CHOSEN = tunable('villageMap', { style: -1 });

/** The look chosen: the lab's, else the address's `?mapStyle=`, else the map as it stands. */
export function mapStyle(): MapStyle {
  if (CHOSEN.style >= 0) return STYLES[Math.round(CHOSEN.style)] ?? 'now';
  const asked = new URLSearchParams(location.search).get('mapStyle');
  return STYLES.includes(asked as MapStyle) ? asked as MapStyle : 'now';
}

/** How a building's box is filled: inked flat, hatched in ink, a raised token, or washed in paint. */
export type BoxKind = 'ink' | 'hatch' | 'token' | 'wash';

export interface Look {
  style: MapStyle;
  box: BoxKind;
  /** whether a roof is drawn as two pitches, one in its shade, either side of its ridge */
  pitched: boolean;
  ink: string;
  inkSoft: string;
  meadow: string;
  road: string;
  roadEdge: string;
  footpath: string;
  roof: string;
  roofShade: string;
  slate: string;
  slateShade: string;
  stone: string;
  darkStone: string;
  sand: string;
  yardFence: string;
  water: string;
  waterLight: string;
  palisade: string;
  notice: string;
  log: string;
  courtStone: string;
  forestWay: string;
  portal: Record<BiomeId, string>;
  /** the ground: the sheet's colour and texture, its outline the drawing is clipped to */
  ground(g: CanvasRenderingContext2D, w: number, h: number): Path2D;
  /** the meadow inside the palisade */
  meadowWash(g: CanvasRenderingContext2D, fence: Path2D, metre: number): void;
  tree(g: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void;
  /** the frame round it, over everything (none: the map as it stands) */
  frame?(g: CanvasRenderingContext2D, w: number, h: number, metre: number): void;
  compass(g: CanvasRenderingContext2D, x: number, y: number, r: number): void;
  title(g: CanvasRenderingContext2D, w: number, h: number, metre: number): void;
  /** where the compass stands, in metres in from the bottom-right corner, and how large */
  compassAt: { in: number; size: number };
}

const TITLE = 'Wardenhollow';
const display = (size: number, weight = 700): string => `${weight} ${Math.round(size)}px Cinzel, Georgia, serif`;

// --- shared pieces --------------------------------------------------------------------------------------------------

/** A ragged outline `edge` px deep round a w by h sheet (a worn or deckled margin), from `seed`. */
function raggedOutline(w: number, h: number, edge: number, seed: number, steps = 120, jag = 0.6): Path2D {
  const rng = mulberry(seed);
  const outline = new Path2D();
  for (let k = 0; k <= steps * 4; k++) {
    const t = (k % steps) / steps, side = Math.floor(k / steps) % 4;
    const wobble = edge * (1 - jag + rng() * jag);
    const [x, y] = side === 0 ? [t * w, wobble] : side === 1 ? [w - wobble, t * h]
      : side === 2 ? [w - t * w, h - wobble] : [wobble, h - t * h];
    if (k === 0) outline.moveTo(x, y); else outline.lineTo(x, y);
  }
  outline.closePath();
  return outline;
}

/** Soft round stains of `rgb` over the sheet, `count` of them, from `rng`. */
function stains(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number, count: number, rgb: string,
  most: number, size: number): void {
  for (let k = 0; k < count; k++) {
    const x = rng() * w, y = rng() * h, r = (0.03 + rng() * size) * w;
    const stain = g.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, `rgba(${rgb}, ${(0.3 + rng() * 0.7) * most})`);
    stain.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = stain;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Short strokes scattered over the sheet: a paper's fibres, or a leather's grain. */
function fibres(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number, count: number, colour: string,
  long: number, width = 1): void {
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.beginPath();
  for (let k = 0; k < count; k++) {
    const x = rng() * w, y = rng() * h, a = rng() * Math.PI, l = long * (0.3 + rng());
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  g.stroke();
}

/** Tiny dabs of `colour` over the sheet (a paper's tooth, a leather's pores), each `size` px or so. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, rng: () => number, count: number, colour: string,
  size: number): void {
  g.fillStyle = colour;
  for (let k = 0; k < count; k++) {
    const s = size * (0.5 + rng());
    g.fillRect(rng() * w, rng() * h, s, s);
  }
}

/** The sheet darkened toward its edges to `rim`, from `from` of the way out. */
function vignette(g: CanvasRenderingContext2D, w: number, h: number, rim: string, from = 0.3): void {
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * from, w / 2, h / 2, Math.max(w, h) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, rim);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

/** A crown of `lobes` round (x, y), radius `r`, as a path. */
function crown(g: CanvasRenderingContext2D, x: number, y: number, r: number, rng: () => number, lobes = 7): void {
  g.beginPath();
  for (let k = 0; k <= lobes; k++) {
    const a = (k / lobes) * Math.PI * 2, rr = r * (0.8 + rng() * 0.25);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py);
    else g.quadraticCurveTo(x + Math.cos(a - Math.PI / lobes) * r * 1.2, y + Math.sin(a - Math.PI / lobes) * r * 1.2, px, py);
  }
  g.closePath();
}

/** A compass rose of 8 points at (x, y), `r` px to its long points, its halves `dark` and `light`, ringed in `ink`. */
function rose(g: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, dark: string, light: string,
  ring = true): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, r * 0.03);
  if (ring) {
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0, len = long ? r : r * 0.55, half = r * (long ? 0.13 : 0.09);
    g.save();
    g.rotate((k * Math.PI) / 4);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -len);
      g.lineTo(side * half, -half);
      g.closePath();
      g.fillStyle = side < 0 ? dark : light;
      g.fill();
      g.stroke();
    }
    g.restore();
  }
  g.fillStyle = ink;
  g.font = display(r * 0.32);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('N', 0, -r * 1.08);
  g.restore();
}

// --- the map as it stands -------------------------------------------------------------------------------------------

const NOW_PAPER = '#ead9b4', NOW_INK = '#3a2a1a';

const now: Look = {
  style: 'now', box: 'ink', pitched: false,
  ink: NOW_INK, inkSoft: 'rgba(58, 42, 26, 0.55)',
  meadow: 'rgba(112, 148, 70, 0.30)', road: '#bfa676', roadEdge: 'rgba(58, 42, 26, 0.55)',
  footpath: 'rgba(120, 92, 56, 0.8)', roof: '#a8664a', roofShade: '#a8664a', slate: '#5e5852', slateShade: '#5e5852',
  stone: '#b9b1a2', darkStone: '#5e5852', sand: 'rgba(196, 170, 120, 0.45)', yardFence: '#6a4a2a',
  water: '#5a7ea0', waterLight: '#7fa2c0', palisade: '#4a3220', notice: '#8a6a4a', log: '#8a5a34',
  courtStone: 'rgba(120, 112, 104, 0.55)', forestWay: 'rgba(90, 120, 60, 0.25)',
  portal: { crypt: '#7a2fb0', forest: '#2f9a4a' },
  ground(g, w, h) {
    const rng = mulberry(41);
    const outline = raggedOutline(w, h, Math.min(w, h) * 0.025, 41);
    g.fillStyle = NOW_PAPER;
    g.fill(outline);
    g.save();
    g.clip(outline);
    vignette(g, w, h, '#c8ad7c');
    stains(g, w, h, rng, 26, '150, 110, 60', 0.1, 0.09);
    fibres(g, w, h, rng, 900, 'rgba(120, 90, 50, 0.08)', 9);
    g.restore();
    return outline;
  },
  meadowWash(g, fence) {
    g.fillStyle = this.meadow;
    g.fill(fence);
  },
  tree(g, x, y, r, seed) {
    const rng = mulberry(Math.floor(Math.abs(seed) * 1000) + 1);
    g.fillStyle = 'rgba(40, 50, 30, 0.18)';
    g.beginPath();
    g.arc(x + r * 0.35, y + r * 0.35, r, 0, Math.PI * 2);
    g.fill();
    crown(g, x, y, r, rng);
    g.fillStyle = 'rgba(70, 104, 48, 0.55)';
    g.fill();
    g.strokeStyle = 'rgba(38, 56, 28, 0.7)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.stroke();
  },
  compass(g, x, y, r) { rose(g, x, y, r, NOW_INK, NOW_INK, NOW_PAPER); },
  compassAt: { in: 6.5, size: 4.2 },
  title(g, w, _h, metre) {
    const y = metre * 3.6, size = Math.round(metre * 1.9);
    g.font = display(size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tw = g.measureText(TITLE).width + size * 2;
    g.fillStyle = 'rgba(234, 217, 180, 0.9)';
    g.fillRect(w / 2 - tw / 2, y - size, tw, size * 2);
    g.strokeStyle = NOW_INK;
    g.lineWidth = Math.max(1, metre * 0.1);
    g.strokeRect(w / 2 - tw / 2, y - size, tw, size * 2);
    g.strokeRect(w / 2 - tw / 2 + 4, y - size + 4, tw - 8, size * 2 - 8);
    g.fillStyle = NOW_INK;
    g.fillText(TITLE, w / 2, y + size * 0.06);
  },
};

// --- A: an explorer's chart on aged parchment -----------------------------------------------------------------------

const SEPIA = '#3b2615', SEPIA_SOFT = 'rgba(59, 38, 21, 0.5)', VELLUM = '#e8d3a2';

const chart: Look = {
  style: 'a', box: 'hatch', pitched: true,
  ink: SEPIA, inkSoft: SEPIA_SOFT,
  meadow: 'rgba(132, 140, 72, 0.18)', road: '#d8bf8a', roadEdge: SEPIA,
  footpath: 'rgba(59, 38, 21, 0.7)', roof: '#c99a6c', roofShade: '#b07f55', slate: '#8c8072', slateShade: '#6f6457',
  stone: '#d2c3a0', darkStone: '#8c8072', sand: 'rgba(190, 158, 104, 0.35)', yardFence: SEPIA,
  water: 'rgba(92, 128, 140, 0.75)', waterLight: 'rgba(150, 178, 180, 0.8)', palisade: SEPIA, notice: '#a07a52',
  log: '#7a5030', courtStone: 'rgba(150, 132, 104, 0.45)', forestWay: 'rgba(110, 120, 60, 0.2)',
  portal: { crypt: '#6a2a8a', forest: '#2f7a3a' },
  ground(g, w, h) {
    const rng = mulberry(57);
    const outline = raggedOutline(w, h, Math.min(w, h) * 0.022, 57, 160, 0.8);
    g.fillStyle = VELLUM;
    g.fill(outline);
    g.save();
    g.clip(outline);
    stains(g, w, h, rng, 40, '160, 112, 52', 0.16, 0.12);
    // foxing: small rust spots of age
    stains(g, w, h, rng, 60, '140, 80, 30', 0.22, 0.006);
    fibres(g, w, h, rng, 1400, 'rgba(110, 76, 36, 0.07)', 10);
    grain(g, w, h, rng, 4000, 'rgba(90, 60, 30, 0.05)', Math.max(1, w / 900));
    // the edges worn and browned, as if held over a candle
    vignette(g, w, h, 'rgba(120, 72, 28, 0.75)', 0.36);
    g.lineWidth = Math.min(w, h) * 0.02;
    g.strokeStyle = 'rgba(80, 44, 14, 0.45)';
    g.filter = 'none';
    g.stroke(outline);
    g.restore();
    return outline;
  },
  meadowWash(g, fence, metre) {
    g.fillStyle = this.meadow;
    g.fill(fence);
    // tufts of grass stippled in ink over the meadow
    g.save();
    g.clip(fence);
    const rng = mulberry(5);
    const box = g.canvas;
    g.strokeStyle = 'rgba(59, 38, 21, 0.22)';
    g.lineWidth = Math.max(1, metre * 0.07);
    g.beginPath();
    for (let k = 0; k < 520; k++) {
      const x = rng() * box.width, y = rng() * box.height, s = metre * 0.35;
      g.moveTo(x - s, y); g.lineTo(x - s * 0.6, y - s);
      g.moveTo(x, y); g.lineTo(x, y - s * 1.2);
      g.moveTo(x + s, y); g.lineTo(x + s * 0.6, y - s);
    }
    g.stroke();
    g.restore();
  },
  tree(g, x, y, r, seed) {
    const rng = mulberry(Math.floor(Math.abs(seed) * 1000) + 1);
    crown(g, x, y, r, rng, 8);
    g.fillStyle = 'rgba(150, 150, 84, 0.22)';
    g.fill();
    g.strokeStyle = SEPIA;
    g.lineWidth = Math.max(1, r * 0.09);
    g.stroke();
    // its shade stippled to the south-east, and its trunk a dot
    g.fillStyle = 'rgba(59, 38, 21, 0.55)';
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (0.1 + rng() * 0.4), d = r * (0.35 + rng() * 0.5);
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.6, r * 0.06), 0, Math.PI * 2);
      g.fill();
    }
  },
  frame(g, w, h, metre) {
    const band = metre * 2.4, inner = metre * 0.5;
    g.save();
    g.strokeStyle = SEPIA;
    // an outer and an inner rule, a band of alternate ticks between them as a chart's border has
    g.lineWidth = Math.max(1.5, metre * 0.22);
    g.strokeRect(band * 0.35, band * 0.35, w - band * 0.7, h - band * 0.7);
    g.lineWidth = Math.max(1, metre * 0.1);
    g.strokeRect(band, band, w - band * 2, h - band * 2);
    g.strokeRect(band - inner * 0.4, band - inner * 0.4, w - band * 2 + inner * 0.8, h - band * 2 + inner * 0.8);
    const tick = metre * 3;
    g.fillStyle = 'rgba(59, 38, 21, 0.75)';
    const o = band * 0.35, t = band - inner * 0.4 - o;
    for (let x = o + tick, k = 0; x < w - o - tick; x += tick, k++) {
      if (k % 2) continue;
      g.fillRect(x, o, tick, t * 0.35);
      g.fillRect(x, h - o - t * 0.35, tick, t * 0.35);
    }
    for (let y = o + tick, k = 0; y < h - o - tick; y += tick, k++) {
      if (k % 2) continue;
      g.fillRect(o, y, t * 0.35, tick);
      g.fillRect(w - o - t * 0.35, y, t * 0.35, tick);
    }
    // a rosette in each corner
    for (const [cx, cy] of [[band * 0.67, band * 0.67], [w - band * 0.67, band * 0.67], [band * 0.67, h - band * 0.67],
      [w - band * 0.67, h - band * 0.67]]) {
      g.fillStyle = VELLUM;
      g.beginPath();
      g.arc(cx, cy, band * 0.45, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = SEPIA;
      for (let k = 0; k < 4; k++) {
        g.save();
        g.translate(cx, cy);
        g.rotate(k * Math.PI / 2 + Math.PI / 4);
        g.beginPath();
        g.ellipse(0, -band * 0.2, band * 0.08, band * 0.18, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    // a scale of ten metres, bottom left
    const sx = band + metre * 3, sy = h - band - metre * 2.6, seg = metre * 2.5;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? VELLUM : SEPIA;
      g.fillRect(sx + k * seg, sy, seg, metre * 0.5);
    }
    g.lineWidth = Math.max(1, metre * 0.08);
    g.strokeRect(sx, sy, seg * 4, metre * 0.5);
    g.fillStyle = SEPIA;
    g.font = `italic 600 ${Math.round(metre * 1.1)}px Georgia, serif`;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText('0', sx - metre * 0.3, sy - metre * 0.5);
    g.textAlign = 'center';
    g.fillText('10 paces', sx + seg * 4, sy - metre * 0.5);
    g.restore();
  },
  compass(g, x, y, r) {
    // a sixteen-point rose: the eight between drawn first, thin and pale, a ring of degrees round it
    g.save();
    g.translate(x, y);
    g.strokeStyle = SEPIA;
    g.lineWidth = Math.max(1, r * 0.025);
    for (const radius of [r * 0.78, r * 0.7]) {
      g.beginPath();
      g.arc(0, 0, radius, 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2, from = k % 4 ? r * 0.72 : r * 0.68;
      g.beginPath();
      g.moveTo(Math.cos(a) * from, Math.sin(a) * from);
      g.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
      g.stroke();
    }
    for (let k = 0; k < 8; k++) {
      g.save();
      g.rotate(k * Math.PI / 4 + Math.PI / 8);
      g.beginPath();
      g.moveTo(0, -r * 0.62);
      g.lineTo(r * 0.06, 0);
      g.lineTo(-r * 0.06, 0);
      g.closePath();
      g.fillStyle = 'rgba(176, 128, 70, 0.6)';
      g.fill();
      g.stroke();
      g.restore();
    }
    g.restore();
    rose(g, x, y, r, SEPIA, SEPIA, VELLUM, false);
    // a fleur over north
    g.save();
    g.translate(x, y - r * 1.3);
    g.fillStyle = '#8a2c1c';
    g.beginPath();
    g.moveTo(0, -r * 0.2);
    g.quadraticCurveTo(r * 0.12, -r * 0.05, 0, r * 0.08);
    g.quadraticCurveTo(-r * 0.12, -r * 0.05, 0, -r * 0.2);
    g.fill();
    g.restore();
  },
  compassAt: { in: 9, size: 4.6 },
  title(g, _w, _h, metre) {
    // a scroll in the top-left corner, its ends curled, the name in it and a line under it
    const size = metre * 1.75, x = metre * 5, y = metre * 4.3;
    g.font = display(size);
    const tw = g.measureText(TITLE).width;
    const wide = tw + size * 2.2, tall = size * 2.6;
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(40, 24, 10, 0.18)';
    g.fillRect(metre * 0.4, metre * 0.4, wide, tall);
    g.fillStyle = '#efdfb5';
    g.strokeStyle = SEPIA;
    g.lineWidth = Math.max(1, metre * 0.12);
    g.beginPath();
    g.rect(0, 0, wide, tall);
    g.fill();
    g.stroke();
    for (const end of [0, wide]) {
      g.beginPath();
      g.ellipse(end, tall / 2, size * 0.32, tall / 2 + size * 0.15, 0, 0, Math.PI * 2);
      g.fillStyle = '#dcc493';
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(end, tall / 2, size * 0.12, tall / 2 - size * 0.25, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = SEPIA;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(TITLE, wide / 2, tall * 0.44);
    g.font = `italic ${Math.round(size * 0.42)}px Georgia, serif`;
    g.fillText('the Warden’s Hold · surveyed', wide / 2, tall * 0.8);
    g.restore();
  },
};

// --- B: a gilded war table's map on dark leather --------------------------------------------------------------------

const GOLD = '#d8b46a', GOLD_DIM = 'rgba(216, 180, 106, 0.55)', LEATHER = '#2a1d15';

/** A gold line drawn engraved: a dark cut under it, a bright edge over it. */
function engrave(g: CanvasRenderingContext2D, draw: () => void, width: number): void {
  g.lineWidth = width * 1.8;
  g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  draw();
  g.stroke();
  g.lineWidth = width;
  g.strokeStyle = GOLD;
  draw();
  g.stroke();
}

const table: Look = {
  style: 'b', box: 'token', pitched: true,
  ink: GOLD, inkSoft: GOLD_DIM,
  meadow: 'rgba(78, 92, 46, 0.42)', road: '#3a2b1f', roadEdge: GOLD,
  footpath: 'rgba(216, 180, 106, 0.6)', roof: '#6e3a2a', roofShade: '#52281c', slate: '#3a3a44', slateShade: '#26262e',
  stone: '#5a544e', darkStone: '#2e2a28', sand: 'rgba(120, 96, 60, 0.4)', yardFence: GOLD,
  water: '#1d4a72', waterLight: '#3f7fb2', palisade: GOLD, notice: '#6a4a2a', log: '#6a4024',
  courtStone: 'rgba(90, 84, 78, 0.6)', forestWay: 'rgba(78, 100, 46, 0.35)',
  portal: { crypt: '#a24ae0', forest: '#3fcf62' },
  ground(g, w, h) {
    const rng = mulberry(73);
    const r = Math.min(w, h) * 0.03;
    const outline = new Path2D();
    outline.roundRect(0, 0, w, h, r);
    g.fillStyle = LEATHER;
    g.fill(outline);
    g.save();
    g.clip(outline);
    stains(g, w, h, rng, 30, '80, 52, 34', 0.35, 0.14);
    stains(g, w, h, rng, 20, '8, 4, 2', 0.35, 0.12);
    grain(g, w, h, rng, 9000, 'rgba(0, 0, 0, 0.18)', Math.max(1, w / 700));
    grain(g, w, h, rng, 4000, 'rgba(140, 100, 70, 0.07)', Math.max(1, w / 900));
    fibres(g, w, h, rng, 500, 'rgba(0, 0, 0, 0.2)', w / 60);
    vignette(g, w, h, 'rgba(0, 0, 0, 0.8)', 0.32);
    g.restore();
    return outline;
  },
  meadowWash(g, fence) {
    g.fillStyle = this.meadow;
    g.fill(fence);
  },
  tree(g, x, y, r, seed) {
    const rng = mulberry(Math.floor(Math.abs(seed) * 1000) + 1);
    g.fillStyle = 'rgba(0, 0, 0, 0.45)';
    g.beginPath();
    g.arc(x + r * 0.25, y + r * 0.3, r, 0, Math.PI * 2);
    g.fill();
    crown(g, x, y, r * 0.92, rng, 6);
    const shade = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    shade.addColorStop(0, '#4f6a34');
    shade.addColorStop(1, '#1e2c16');
    g.fillStyle = shade;
    g.fill();
    g.strokeStyle = 'rgba(216, 180, 106, 0.6)';
    g.lineWidth = Math.max(1, r * 0.07);
    g.stroke();
  },
  frame(g, w, h, metre) {
    const band = metre * 2.2;
    g.save();
    // the stitched hem, then the engraved frame's rules, then its corners
    g.setLineDash([metre * 0.55, metre * 0.4]);
    g.lineWidth = Math.max(1, metre * 0.12);
    g.strokeStyle = 'rgba(216, 180, 106, 0.45)';
    g.strokeRect(band * 0.3, band * 0.3, w - band * 0.6, h - band * 0.6);
    g.setLineDash([]);
    engrave(g, () => { g.beginPath(); g.rect(band, band, w - band * 2, h - band * 2); }, Math.max(1.5, metre * 0.2));
    engrave(g, () => {
      g.beginPath();
      g.rect(band + metre * 0.55, band + metre * 0.55, w - band * 2 - metre * 1.1, h - band * 2 - metre * 1.1);
    }, Math.max(1, metre * 0.08));
    const arm = metre * 6, inset = band - metre * 0.6;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = sx > 0 ? inset : w - inset, cy = sy > 0 ? inset : h - inset;
      // an L bracket with a lozenge at its heel and small scrolls at its arms' ends
      engrave(g, () => {
        g.beginPath();
        g.moveTo(cx + sx * arm, cy);
        g.lineTo(cx, cy);
        g.lineTo(cx, cy + sy * arm);
      }, Math.max(2, metre * 0.3));
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#1a120c';
      g.fillRect(-metre * 0.9, -metre * 0.9, metre * 1.8, metre * 1.8);
      g.strokeStyle = GOLD;
      g.lineWidth = Math.max(1, metre * 0.15);
      g.strokeRect(-metre * 0.9, -metre * 0.9, metre * 1.8, metre * 1.8);
      g.fillStyle = '#b0301f';
      g.fillRect(-metre * 0.4, -metre * 0.4, metre * 0.8, metre * 0.8);
      g.restore();
      for (const [ex, ey] of [[cx + sx * arm, cy], [cx, cy + sy * arm]]) {
        g.beginPath();
        g.arc(ex, ey, metre * 0.45, 0, Math.PI * 2);
        g.fillStyle = GOLD;
        g.fill();
      }
    }
    g.restore();
  },
  compass(g, x, y, r) {
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.6)';
    g.shadowBlur = r * 0.15;
    g.shadowOffsetY = r * 0.05;
    rose(g, x, y, r, GOLD, '#8c6a32', '#f3dca0');
    g.restore();
  },
  compassAt: { in: 9, size: 4.4 },
  title(g, w, _h, metre) {
    // a dark plaque with an engraved gold rim and the name in gold, flourishes either side
    const size = metre * 1.8, y = metre * 5.2;
    g.font = display(size);
    const tw = g.measureText(TITLE).width + size * 2.4, tall = size * 2.1;
    const x0 = w / 2 - tw / 2, y0 = y - tall / 2;
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.7)';
    g.shadowBlur = metre;
    g.shadowOffsetY = metre * 0.3;
    g.fillStyle = 'rgba(16, 12, 10, 0.94)';
    g.beginPath();
    g.roundRect(x0, y0, tw, tall, metre * 0.4);
    g.fill();
    g.restore();
    engrave(g, () => { g.beginPath(); g.roundRect(x0, y0, tw, tall, metre * 0.4); }, Math.max(1.5, metre * 0.15));
    engrave(g, () => { g.beginPath(); g.roundRect(x0 + metre * 0.45, y0 + metre * 0.45, tw - metre * 0.9, tall - metre * 0.9, metre * 0.2); },
      Math.max(1, metre * 0.06));
    for (const side of [-1, 1]) {
      const from = side < 0 ? x0 : x0 + tw;
      engrave(g, () => {
        g.beginPath();
        g.moveTo(from, y);
        g.bezierCurveTo(from + side * metre * 2, y - metre * 1.4, from + side * metre * 3.4, y + metre * 1.2, from + side * metre * 5, y);
      }, Math.max(1, metre * 0.12));
    }
    const leaf = g.createLinearGradient(0, y0, 0, y0 + tall);
    leaf.addColorStop(0, '#f6e2a8');
    leaf.addColorStop(0.55, GOLD);
    leaf.addColorStop(1, '#9a7434');
    g.fillStyle = leaf;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(TITLE, w / 2, y + size * 0.06);
  },
};

// --- C: a painted watercolour map -----------------------------------------------------------------------------------

const PAPER_C = '#f3ecdc', PENCIL = 'rgba(70, 62, 54, 0.6)';

/** A wash of `colour` over `path`: laid three times a little apart, as wet paint spreads unevenly, its edge darker
 *  where the pigment gathered as it dried. */
function wash(g: CanvasRenderingContext2D, path: Path2D, colour: string, edge: string, width: number, seed: number): void {
  const rng = mulberry(seed);
  for (let k = 0; k < 3; k++) {
    g.save();
    g.translate((rng() - 0.5) * width, (rng() - 0.5) * width);
    g.fillStyle = colour;
    g.fill(path);
    g.restore();
  }
  g.strokeStyle = edge;
  g.lineWidth = width * 0.6;
  g.stroke(path);
}

const painted: Look = {
  style: 'c', box: 'wash', pitched: true,
  ink: 'rgba(60, 52, 44, 0.85)', inkSoft: PENCIL,
  meadow: 'rgba(140, 178, 96, 0.22)', road: 'rgba(214, 182, 128, 0.85)', roadEdge: 'rgba(170, 132, 84, 0.35)',
  footpath: 'rgba(150, 112, 70, 0.7)', roof: '#c0614a', roofShade: '#8e3e2e', slate: '#6f7d92', slateShade: '#4c586c',
  stone: '#d8d0c2', darkStone: '#7a7472', sand: 'rgba(222, 196, 140, 0.55)', yardFence: '#7a5634',
  water: 'rgba(84, 140, 196, 0.75)', waterLight: 'rgba(150, 196, 230, 0.85)', palisade: '#6b4a2e', notice: '#a07a52',
  log: '#8a5a34', courtStone: 'rgba(150, 144, 136, 0.45)', forestWay: 'rgba(120, 168, 84, 0.3)',
  portal: { crypt: '#8a3cc8', forest: '#36a856' },
  ground(g, w, h) {
    const rng = mulberry(91);
    const outline = raggedOutline(w, h, Math.min(w, h) * 0.018, 91, 260, 0.9);
    g.fillStyle = PAPER_C;
    g.fill(outline);
    g.save();
    g.clip(outline);
    // cold-pressed paper's tooth, and a faint warm bloom where the paper took the water
    grain(g, w, h, rng, 12000, 'rgba(120, 104, 80, 0.06)', Math.max(1, w / 800));
    grain(g, w, h, rng, 6000, 'rgba(255, 255, 255, 0.35)', Math.max(1, w / 900));
    stains(g, w, h, rng, 18, '230, 200, 150', 0.18, 0.14);
    vignette(g, w, h, 'rgba(190, 168, 130, 0.35)', 0.4);
    g.restore();
    return outline;
  },
  meadowWash(g, fence, metre) {
    wash(g, fence, 'rgba(150, 186, 102, 0.16)', 'rgba(96, 140, 62, 0.25)', metre * 0.8, 3);
    // a few blooms of deeper green over the meadow
    g.save();
    g.clip(fence);
    const rng = mulberry(8);
    for (let k = 0; k < 22; k++) {
      const x = rng() * g.canvas.width, y = rng() * g.canvas.height, r = metre * (3 + rng() * 6);
      const bloom = g.createRadialGradient(x, y, 0, x, y, r);
      bloom.addColorStop(0, 'rgba(110, 160, 80, 0.14)');
      bloom.addColorStop(1, 'rgba(110, 160, 80, 0)');
      g.fillStyle = bloom;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
  },
  tree(g, x, y, r, seed) {
    const rng = mulberry(Math.floor(Math.abs(seed) * 1000) + 1);
    const hue = rng();
    g.fillStyle = 'rgba(60, 80, 60, 0.12)';
    g.beginPath();
    g.arc(x + r * 0.4, y + r * 0.4, r, 0, Math.PI * 2);
    g.fill();
    // layers of green, each a little apart, yellower on top where the light falls
    const layers: [number, number, string][] = [
      [0.15, 0.15, `rgba(${46 + hue * 20}, ${100 + hue * 20}, ${70 - hue * 20}, 0.55)`],
      [-0.05, -0.05, `rgba(${92 + hue * 30}, ${150 + hue * 10}, ${70 - hue * 20}, 0.5)`],
      [-0.25, -0.25, 'rgba(176, 200, 104, 0.4)'],
    ];
    for (const [dx, dy, colour] of layers) {
      crown(g, x + dx * r, y + dy * r, r * (dy < -0.2 ? 0.5 : 0.95), rng, 6);
      g.fillStyle = colour;
      g.fill();
    }
    crown(g, x + 0.15 * r, y + 0.15 * r, r * 0.95, rng, 6);
    g.strokeStyle = 'rgba(40, 70, 40, 0.3)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.stroke();
  },
  frame(g, w, h, metre) {
    const band = metre * 2;
    g.save();
    // a paper margin left bare round the painting, a pencil line at the painting's edge
    const inside = new Path2D();
    inside.rect(band, band, w - band * 2, h - band * 2);
    const margin = new Path2D();
    margin.rect(0, 0, w, h);
    margin.addPath(inside);
    g.fillStyle = PAPER_C;
    g.fill(margin, 'evenodd');
    const rng = mulberry(17);
    grain(g, w, band, rng, 1600, 'rgba(120, 104, 80, 0.06)', Math.max(1, w / 800));
    g.strokeStyle = 'rgba(70, 62, 54, 0.55)';
    g.lineWidth = Math.max(1, metre * 0.07);
    g.stroke(inside);
    g.strokeStyle = 'rgba(70, 62, 54, 0.25)';
    g.strokeRect(band - metre * 0.5, band - metre * 0.5, w - band * 2 + metre, h - band * 2 + metre);
    g.restore();
  },
  compass(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(214, 182, 128, 0.35)';
    g.beginPath();
    g.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    g.fill();
    g.restore();
    rose(g, x, y, r, 'rgba(60, 52, 44, 0.85)', 'rgba(150, 52, 40, 0.85)', 'rgba(243, 236, 220, 0.95)');
  },
  compassAt: { in: 8.5, size: 4.2 },
  title(g, w, _h, metre) {
    // a red ribbon banner across the top, its tails folded under and notched
    const size = metre * 1.7, y = metre * 5;
    g.font = display(size);
    const tw = g.measureText(TITLE).width + size * 2, tall = size * 1.9;
    const x0 = w / 2 - tw / 2, y0 = y - tall / 2, tail = size * 1.6, drop = tall * 0.35;
    g.save();
    for (const side of [-1, 1]) {
      const at = side < 0 ? x0 : x0 + tw;
      // the tail, behind and lower, notched at its end
      g.beginPath();
      g.moveTo(at, y0 + drop);
      g.lineTo(at + side * tail, y0 + drop);
      g.lineTo(at + side * tail * 0.7, y0 + drop + tall / 2);
      g.lineTo(at + side * tail, y0 + drop + tall);
      g.lineTo(at, y0 + drop + tall);
      g.closePath();
      g.fillStyle = '#7e2a22';
      g.fill();
      // its fold under the front
      g.beginPath();
      g.moveTo(at, y0 + tall);
      g.lineTo(at - side * size * 0.6, y0 + tall);
      g.lineTo(at, y0 + tall + drop);
      g.closePath();
      g.fillStyle = '#4e1813';
      g.fill();
    }
    const front = g.createLinearGradient(0, y0, 0, y0 + tall);
    front.addColorStop(0, '#c4473a');
    front.addColorStop(1, '#9a3328');
    g.fillStyle = front;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(w / 2, y0 - tall * 0.25, x0 + tw, y0);
    g.lineTo(x0 + tw, y0 + tall);
    g.quadraticCurveTo(w / 2, y0 + tall * 0.75, x0, y0 + tall);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60, 20, 14, 0.5)';
    g.lineWidth = Math.max(1, metre * 0.08);
    g.stroke();
    g.fillStyle = '#fbf1dc';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(TITLE, w / 2, y);
    g.restore();
  },
};

/** Each look by its style. */
export const LOOKS: Record<MapStyle, Look> = { now, a: chart, b: table, c: painted };
