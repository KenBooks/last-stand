// The loading screen's exit: a gust from the right blows the logo's letters away to the left as
// dust and snow, then the swirl gathers again into the lobby's logo (top left) and becomes it.
// The steel letters (SVG) are snapshotted and every pixel becomes a point. A point is only drawn
// once the wind has picked it up: the real letters stay on screen and are wiped away just behind the
// wind front, so no copy of them at rest is ever seen (a coarser snapshot would show as a swap).
// The glows stay live and fade. Motion is closed-form in the vertex shader (hundreds of thousands
// of points, no CPU work a point) and driven by smooth noise of each point's starting position,
// so neighbours move together in streaks and eddies, like real wind.
//
// The points land into the lobby logo's own picture: a snapshot of it on the screen's pixels, which takes each point's
// pixel over as it lands, and which the logo is then shown as, on the same pixels, till it moves or changes size.
// (Landed points that faded over the logo the browser paints showed it jump as it took over, a pixel down and aside
// at some sizes: the browser paints its SVG a little otherwise than its snapshot, and points landing on one pixel
// added up to a darker rim and shadow.)
//
// Every point is kept as its place in the letters, never as a place on the screen, and the letters, the lobby's
// logo and the canvas are measured again on every frame of the exit: it follows the window however often it
// changes (full screen and back, a phone turned, the zoom). (Placed once, as the lobby was laid out, a window resized
// on the loading screen had the letters blow from where they had been and gather where the lobby's logo had been.)
//
// It is heavy (up to 1.5M points while the lobby renders behind), so it scales to the device:
// phones and low-end machines snapshot the letters at a lower resolution to stay within a much
// smaller point budget, and a watchdog cuts the exit short (and remembers not to run it again on
// this device) when it still can't keep up. loading.ts falls back to a plain fade then.

const SWEEP = 1.1;                 // s for the wind front to cross the letters, right to left
export const REVEAL_AT = 1.2;      // s: the loading backdrop starts fading to the lobby
const GATHER = 1.45;               // s: points start flying to the lobby logo...
const GATHER_SPREAD = 0.65;        // ...staggered left to right across it...
const GATHER_TIME = 0.85;          // ...each taking this long
const LAND_SPREAD = 0.2;           // ...the points of a column landing this far apart, evenly
// the handoff to the lobby logo: every point of a column (x 0..1 across the letters) has landed by
// LANDED + GATHER_SPREAD * x, each into the logo's picture, which shows a pixel as its points land
const LANDED = GATHER + LAND_SPREAD + GATHER_TIME;
/** s: every point has landed, and the lobby logo shows as their picture from the next frame */
const GATHERED = LANDED + GATHER_SPREAD + 0.05;
const GLOW_IN = GATHER_SPREAD + 0.3;   // s: the lobby logo's glow fades in as the points land
// the wind front (as in the shader): a point at x (0..1 across the letters, right = 0 s) starts
// moving at (1 - x + tear) / OVER * SWEEP, the tear being up to TEAR
const TEAR = 0.07, OVER = 1.07;
/** When the points landing in column `x` of the lobby logo (0..1 across its letters) are all at rest there, and when
 *  the logo takes the column over from them, s into the exit (tools/lab `wind` reads them then) */
export function restOf(x: number): { from: number; to: number } {
  return { from: LANDED + GATHER_SPREAD * Math.min(Math.max(x, 0), 1), to: GATHERED };
}
/** the letters are wiped this far (fraction of their width) behind the front, where every point there has lifted */
const WIPE_LAG = TEAR + 0.02;
const MAX_POINTS = 1_500_000;      // point budget of a capable desktop
const LOW_POINTS = 120_000;        // ...and of a phone, tablet or low-end machine
/** the watchdog: below this frame rate over the first frames of the wind (their median: a stall among them, the
 *  GPU busy elsewhere a moment, is no slow device), the exit is cut short */
const SLOW_FRAME_MS = 50, SLOW_SAMPLES = 10;
/** the launches in a row whose exit the watchdog cut short; at SLOW_LAUNCHES, the device gets the plain fade */
const SLOW_KEY = 'last-stand.logo-wind-slow';
const SLOW_LAUNCHES = 2;
/** the switch it replaced: one launch cut short turned the blow off for good (a stall did it on a fast machine) */
const OLD_OFF_KEY = 'last-stand.logo-wind-off';
/** s: the loading backdrop's fade (#loading.done in index.html) */
const BACKDROP_FADE = 0.9;

/** Whether this device showed it can't run the exit smoothly (cut short on the last SLOW_LAUNCHES launches). */
export function logoWindOff(): boolean {
  try {
    localStorage.removeItem(OLD_OFF_KEY);
    return Number(localStorage.getItem(SLOW_KEY)) >= SLOW_LAUNCHES;
  } catch { return false; }
}
/** The watchdog's judgement of this launch: a slow one counted, one that kept up clearing the count. */
function judged(slow: boolean): void {
  try {
    if (slow) localStorage.setItem(SLOW_KEY, String((Number(localStorage.getItem(SLOW_KEY)) || 0) + 1));
    else localStorage.removeItem(SLOW_KEY);
  } catch { /* ignore */ }
}

/** How many points the device can move smoothly: touch devices and small or low-memory machines get far fewer. */
function pointBudget(): number {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const low = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4 || mem <= 4;
  return low ? LOW_POINTS : MAX_POINTS;
}
const PAD_X = 0.12, PAD_Y = 0.22;  // the letters' rim and drop shadow reach this far outside their box

export interface LogoBlow {
  /** Run the exit; `reveal` fires at REVEAL_AT, `done` once the lobby logo has taken over. */
  start(reveal: () => void, done: () => void): void;
  /** Not running after all: put the lobby logo back. */
  cancel(): void;
}

const letters = (logo: Element): SVGSVGElement | null => logo.querySelector('svg:not(.logo-glow)');

/** Snapshot the letters of `logo` into a particle field that will gather into `target` (both .logo-art). */
export async function prepareBlow(logo: HTMLElement, target: HTMLElement | null): Promise<LogoBlow | null> {
  const metal = letters(logo), glow = logo.querySelector<SVGSVGElement>('svg.logo-glow');
  if (!metal) return null;
  const box = metal.getBoundingClientRect();
  const tMetal = target && letters(target);
  const dst = tMetal?.getBoundingClientRect();
  if (box.width < 10) return null;
  const budget = pointBudget();
  // the canvas: device pixels, but no more than 2x on a device with a small budget
  const most = budget < MAX_POINTS ? 2 : 3;
  const dpr = canvasScale(most);
  // the snapshot grid: device pixels when the budget allows (every point lands exactly on the pixel it
  // copies), else coarser, sized from the letters' area (about 45% of their padded box is lit)
  const area = box.width * (1 + 2 * PAD_X) * box.height * (1 + 2 * PAD_Y) * 0.45;
  const grid = Math.max(1, Math.min(dpr, Math.sqrt(budget / area)));
  const x0 = Math.floor((box.left - box.width * PAD_X) * grid), y0 = Math.floor((box.top - box.height * PAD_Y) * grid);
  const pw = Math.ceil((box.right + box.width * PAD_X) * grid) - x0, ph = Math.ceil((box.bottom + box.height * PAD_Y) * grid) - y0;
  const vb = metal.viewBox.baseVal, k = box.width / vb.width;   // CSS px per viewBox unit
  const view = [vb.x + (x0 / grid - box.left) / k, vb.y + (y0 / grid - box.top) / k, pw / grid / k, ph / grid / k];
  const px = await snapshot(metal, view, pw, ph);
  if (!px) return null;

  let lit = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
  // should the estimate have been low, sample every step-th pixel to stay within the budget
  const step = Math.max(1, Math.ceil(Math.sqrt(lit / budget)));
  const n = Math.ceil(lit / (step * step)) + 16;
  const pos = new Float32Array(n * 2), col = new Uint8Array(n * 4), rnd = new Uint8Array(n * 4);
  let c = 0;
  for (let y = 0; y < ph; y += step) for (let x = 0; x < pw; x += step) {
    const o = (y * pw + x) * 4;
    if (px[o + 3] === 0 || c >= n) continue;
    // its pixel's centre, as a place in the letters' box (0..1 across it): wherever the box is as it's drawn
    pos[c * 2] = ((x0 + x + step / 2) / grid - box.left) / box.width;
    pos[c * 2 + 1] = ((y0 + y + step / 2) / grid - box.top) / box.height;
    col.set(px.subarray(o, o + 4), c * 4);
    for (let j = 0; j < 4; j++) rnd[c * 4 + j] = Math.random() * 256;
    c++;
  }
  // (the lobby logo's letters, where the points gather: none where it isn't laid out)
  const into = tMetal && dst && dst.width > 10 ? tMetal : null;
  // the lobby logo is drawn at its own size (its rim, shadow and shine don't simply scale), so the
  // points land into its own picture: a snapshot of it on the canvas's pixel grid (none to land in, they blow away)
  const home = into && dst ? await homeOf(into, dst, dpr) : null;
  const gather = home !== null;
  // a point covers its cell of the grid (CSS px, at the letters' size then)
  const field = createField(pos, col, rnd, c, { box, dst: gather ? dst! : null, cell: step / grid, most, home });
  if (import.meta.env.DEV) console.info(`logo wind: ${c} points (budget ${budget}), grid ${grid.toFixed(2)}x, canvas ${dpr}x`);
  if (!field) return null;
  // the lobby logo is made of the particles until they have settled. It stays on its own layer at
  // a (not quite zero) opacity so the browser keeps it painted: repainting its SVG filters when it
  // reappears would stall that frame
  const hide = (on: boolean): void => {
    target!.style.willChange = on ? 'opacity' : '';
    target!.style.opacity = on ? '0.001' : '';
  };
  if (gather) hide(true);
  const cancel = (): void => { if (gather) hide(false); field.dispose(); };
  // the letters and the lobby logo where they are now, and the logo's picture taken again where it has moved or
  // changed size or the screen its pixel ratio (till it comes, the picture before is read where the logo is now)
  let homeAt = home && { left: dst!.left, top: dst!.top, width: dst!.width, px: dpr };
  let latest = home;
  const place = (): void => {
    const box = metal.getBoundingClientRect(), now = gather ? into!.getBoundingClientRect() : null;
    // (a window moved to another monitor can be 0 px for a moment: the last real place is kept)
    if (innerWidth < 1 || innerHeight < 1 || box.width < 1 || (now && now.width < 1)) return;
    field.fit({ box, dst: now });
    const scale = canvasScale(most);
    if (!homeAt || !now || sameSpot(homeAt, now, scale)) return;
    const asked = homeAt = { left: now.left, top: now.top, width: now.width, px: scale };
    void homeOf(into!, now, scale).then((taken) => {
      if (!taken || asked !== homeAt) return;
      latest = taken;
      field.home(taken);
    });
  };
  return {
    cancel,
    start(reveal, done) {
      let revealed = false, handed = false, swapped = false, glowing = false;
      const tGlow = gather ? target!.querySelector<SVGSVGElement>('svg.logo-glow') : null;
      field.follow(place);
      field.canvas.style.visibility = 'visible';
      field.run((t) => {
        if (!swapped) {
          swapped = true;
          // the letters are cut away right to left, following the front (a straight line trailing
          // its torn edge): what has gone is dust by then. The clip runs from beyond the letters'
          // right edge (their rim and shadow) to beyond the left one
          const at = (s: number): string => `inset(-50% ${((s * OVER / SWEEP - WIPE_LAG) * 100).toFixed(2)}% -50% -50%)`;
          const end = (1 + PAD_X + WIPE_LAG) * SWEEP / OVER;
          metal.animate([{ clipPath: at(0) }, { clipPath: at(end) }], { duration: end * 1000, easing: 'linear', fill: 'forwards' });
          // the glow has nothing left to light: it fades as the front crosses
          glow?.animate([{ opacity: getComputedStyle(glow).opacity }, { opacity: 0 }], { duration: SWEEP * 1000, easing: 'ease-in', fill: 'forwards' });
        }
        if (!revealed && t >= REVEAL_AT) { revealed = true; reveal(); }
        if (gather && !glowing && t >= LANDED - 0.1) {
          glowing = true;
          // the logo shows from here, its letters hidden (the swarm is them, then their picture)
          into!.style.visibility = 'hidden';
          target!.style.opacity = '';
          tGlow?.animate([{ opacity: 0 }, { opacity: getComputedStyle(tGlow).opacity }], { duration: GLOW_IN * 1000, easing: 'ease-in', fill: 'backwards' });
        }
      }, () => {
        // every point landed: the logo shows as their picture, on the same pixels, in the frame the field goes
        // (as itself where the picture isn't of it where it is now: a window changed, its picture still to come)
        if (gather && !handed) {
          handed = true;
          if (!showPicture(into!, latest!)) into!.style.visibility = '';
          target!.style.willChange = '';
        }
        field.dispose();
        done();
      }, () => {
        // too slow for this device: the lobby (and its logo) take over now (and after SLOW_LAUNCHES launches like
        // this, later ones use the plain fade)
        if (!revealed) { revealed = true; reveal(); }
        if (gather && !handed) {
          handed = true;
          into!.style.visibility = '';
          target!.style.transition = 'opacity .3s linear'; target!.style.opacity = ''; target!.style.willChange = '';
        }
      });
    },
  };
}

/** The canvas's pixels a CSS px: the screen's, but no more than `most`. */
const canvasScale = (most: number): number => Math.min(window.devicePixelRatio || 1, most);

/** A snapshot of the lobby logo's letters `tMetal` where they are (`dst`, CSS px), `dpr` texels a CSS px. */
async function homeOf(tMetal: SVGSVGElement, dst: DOMRect, dpr: number): Promise<HomeTex | null> {
  const vb = tMetal.viewBox.baseVal;
  const hx = Math.floor((dst.left - dst.width * PAD_X) * dpr), hy = Math.floor((dst.top - dst.height * PAD_Y) * dpr);
  const hw = Math.ceil((dst.right + dst.width * PAD_X) * dpr) - hx, hh = Math.ceil((dst.bottom + dst.height * PAD_Y) * dpr) - hy;
  const tk = dst.width / vb.width;
  const data = await snapshot(tMetal, [vb.x + (hx / dpr - dst.left) / tk, vb.y + (hy / dpr - dst.top) / tk, hw / dpr / tk, hh / dpr / tk], hw, hh);
  return data && {
    data, w: hw, h: hh, x: hx / dpr - dst.left, y: hy / dpr - dst.top,
    px: dpr, left: dst.left, top: dst.top, width: dst.width,
  };
}

/** Whether the lobby logo's letters are `now` where `at` says they were (CSS px), on a screen of `px` px a CSS px. */
function sameSpot(at: Spot, now: DOMRect, px: number): boolean {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
  return at.px === px && near(at.left, now.left) && near(at.top, now.top) && near(at.width, now.width);
}

/**
 * The lobby logo's letters `tMetal` shown as their picture `h` (the snapshot the points landed into) on the same
 * pixels, a canvas in their place, till the logo moves or changes size or the screen its pixel ratio: then as
 * themselves again. False, and nothing shown, where the picture isn't of the logo where it is now on this screen.
 */
function showPicture(tMetal: SVGSVGElement, h: HomeTex): boolean {
  const now = tMetal.getBoundingClientRect();
  const art = tMetal.parentElement;
  if (!art || !sameSpot(h, now, window.devicePixelRatio)) return false;
  const picture = document.createElement('canvas');
  picture.width = h.w;
  picture.height = h.h;
  picture.getContext('2d')?.putImageData(new ImageData(h.data, h.w, h.h), 0, 0);
  picture.setAttribute('aria-hidden', 'true');
  const size = { width: h.w / h.px, height: h.h / h.px };
  Object.assign(picture.style, {
    position: 'absolute', left: '0', top: '0', width: `${size.width}px`, height: `${size.height}px`,
    imageRendering: 'pixelated', pointerEvents: 'none',
  });
  art.appendChild(picture);
  // (placed in the panel's own CSS px: the lobby's panels are zoomed with the UI's scale, measured here)
  const laid = picture.getBoundingClientRect();
  const zoom = laid.width / size.width;
  Object.assign(picture.style, {
    left: `${(now.left + h.x - laid.left) / zoom}px`, top: `${(now.top + h.y - laid.top) / zoom}px`,
    width: `${size.width / zoom}px`, height: `${size.height / zoom}px`,
  });
  tMetal.style.visibility = 'hidden';
  const spot = { left: now.left, top: now.top, width: now.width, px: h.px };
  const back = (): void => {
    if (sameSpot(spot, tMetal.getBoundingClientRect(), window.devicePixelRatio)) return;
    picture.remove();
    tMetal.style.visibility = '';
    watch.disconnect();
    removeEventListener('resize', back);
    removeEventListener('scroll', back, true);
  };
  const watch = new ResizeObserver(back);
  watch.observe(tMetal);
  addEventListener('resize', back);
  addEventListener('scroll', back, true);
  return true;
}

/** RGBA pixels as a 2D canvas reads them */
type Pixels = Uint8ClampedArray<ArrayBuffer>;

/** the font's @font-face rule, fetched once (the lobby logo is snapshotted again when it changes size) */
let cinzel: Promise<string> | null = null;

/** Render the letters' SVG (with the font embedded, which an SVG image can't load) to RGBA pixels. */
async function snapshot(metal: SVGSVGElement, view: number[], w: number, h: number): Promise<Pixels | null> {
  const defs = document.querySelector('.svg-defs defs');
  if (!defs) return null;
  const font = await (cinzel ??= fontFace('Cinzel', 900).catch(() => ''));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view.join(' ')}" preserveAspectRatio="none">`
    + `<style>${font}</style>${new XMLSerializer().serializeToString(defs)}${metal.innerHTML}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

/** An @font-face rule with the font file inlined, from the page's Google Fonts stylesheet. */
async function fontFace(family: string, weight: number): Promise<string> {
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
  if (!link) return '';
  const css = await (await fetch(link.href)).text();
  const block = css.split('@font-face').find((b) => b.includes(`'${family}'`) && b.includes(`font-weight: ${weight}`) && /U\+0000-00FF/.test(b));
  const src = block?.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) return '';
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
}

const VERT = /* glsl */`#version 300 es
in vec2 aPos; in vec4 aCol; in vec4 aRnd;
uniform float uT, uPx, uDpr;
uniform sampler2D uHome;   // the lobby logo's snapshot...
uniform vec4 uHomeAt;      // ...its texel at a point: (CSS px from the logo's corner) * z - xy; w = 1 when there is one
uniform vec2 uView;
uniform vec4 uBox;   // letters' left, top, width, height (CSS px, where they are now: aPos is a place in it, 0..1)
uniform vec4 uDst;   // lobby logo left, top, scale; w = 1 when there is one to gather into
out vec4 vCol; out float vRound;
const float SWEEP = ${SWEEP.toFixed(2)}, TEAR = ${TEAR.toFixed(2)}, OVER = ${OVER.toFixed(2)};
const float GATHER = ${GATHER.toFixed(2)}, SPREAD = ${GATHER_SPREAD.toFixed(2)}, GTIME = ${GATHER_TIME.toFixed(2)};
const float LAND_SPREAD = ${LAND_SPREAD.toFixed(2)};

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// smooth noise in -1..1
float fbm(vec2 p) { return (noise(p) * 0.65 + noise(p * 2.3 + 7.1) * 0.35) * 2.0 - 1.0; }
// the front is torn: how far it lags at height v (0..1)
float tear(float v) { return TEAR * (0.5 + 0.5 * fbm(vec2(v * 9.0, 2.0))); }

void main() {
  vec2 n = aPos;   // 0..1 across the letters
  float rel = max(0.0, (1.0 - n.x + tear(clamp(n.y, 0.0, 1.0))) / OVER * SWEEP - aRnd.x * 0.06);
  float W = uBox.z;
  bool gathers = uDst.w > 0.5;
  // when (and how far) this point flies to its place in the lobby logo, left to right
  float g0 = GATHER + SPREAD * clamp(n.x, 0.0, 1.0) + LAND_SPREAD * aRnd.x;
  // eased out: it leaves at the wind's speed and slows as it lands
  float g = gathers ? 1.0 - pow(1.0 - clamp((uT - g0) / GTIME, 0.0, 1.0), 3.0) : 0.0;
  // the wind carries it until the gather takes over
  float age = max(0.0, (gathers ? min(uT, g0) : uT) - rel);
  // most pixels become fine dust; a few become snowflakes that are lighter and ride the eddies more
  bool flake = aRnd.w > 0.92;
  float r = fract(aRnd.w * 13.7);
  // the gust: its strength varies in bands with height (streaks), plus a little per point
  float gust = 0.65 + 0.55 * fbm(vec2(n.y * 3.5, 4.2)) + 0.25 * (aRnd.y - 0.5);
  if (flake) gust *= 0.6;
  float a2 = age * age;
  vec2 p = uBox.xy + n * uBox.zw;
  p.x -= W * (0.16 * age + (gathers ? 0.42 : 0.9) * gust * a2);
  // eddies: neighbours curl up or down together, drifting with time; the gust also lifts
  float eddy = fbm(n * vec2(2.2, 3.0) + vec2(age * 0.9, 1.7));
  p.y += W * (eddy * (flake ? 0.3 : 0.2) * pow(age, 1.5) - 0.1 * a2);
  // turbulent spread grows the longer a point is airborne
  vec2 jit = (aRnd.yz - 0.5) * vec2(0.1, 0.16) * W * pow(age, 1.4);
  p += flake ? jit * 1.6 : jit;
  if (flake) p.y += W * 0.02 * (sin(aRnd.z * 6.2832 + age * 4.0) - sin(aRnd.z * 6.2832));   // flutter (none at rest)

  // gathering: a curved path (quadratic Bezier) to the same pixel of the lobby logo. The curve
  // bows the same way for every point (onward with the gust, then curling up into the panel), so
  // the swarm streams in as one; the noise varies it a little between neighbours.
  vec2 home = uDst.xy + n * uBox.zw * uDst.z;
  vec2 d = home - p;
  vec2 ctrl = (p + home) * 0.5 + vec2(d.y, -d.x) * (0.38 + 0.12 * eddy + 0.1 * (aRnd.z - 0.5));
  float h = 1.0 - g;
  if (g > 0.0) p = h * h * p + 2.0 * h * g * ctrl + g * g * home;

  float blown = clamp(age * 5.0, 0.0, 1.0) * (1.0 - g);
  float a;
  // airborne dust thins a little; landed, a point is gone into the logo's picture (HOME_FRAG), which shows its pixel
  if (gathers) a = g >= 1.0 ? 0.0 : mix(1.0, flake ? 1.0 : 0.75, blown);
  else {
    float life = flake ? 2.1 + 1.0 * r : 0.8 + 0.9 * r, k = age / life;
    a = k >= 1.0 ? 0.0 : (flake ? 1.0 - k * k : (1.0 - k) * (1.0 - k));
  }
  // not drawn until the wind lifts it: the letters themselves are still there
  if (age <= 0.0 && g <= 0.0) a = 0.0;
  // flakes whiten while airborne, like snow
  vec4 col = aCol;
  if (uHomeAt.w > 0.5 && g > 0.0) {
    // landing: into the lobby logo's own colour at that pixel
    ivec2 size = textureSize(uHome, 0);
    ivec2 at = clamp(ivec2((home - uDst.xy) * uHomeAt.z - uHomeAt.xy), ivec2(0), size - 1);
    col = mix(aCol, texelFetch(uHome, at, 0), smoothstep(0.4, 1.0, g));
  }
  vec3 c = mix(col.rgb, vec3(0.95, 0.96, 1.0), flake ? 0.6 * blown : 0.0);
  float alpha = mix(col.a, flake ? max(col.a, 0.9) : col.a, blown);
  vCol = vec4(c * alpha, alpha) * a;
  vRound = flake ? blown : 0.0;
  // one grid pixel at rest; dust stays fine, flakes grow; settled points match the lobby logo's scale
  float settled = uPx * mix(1.0, max(uDst.z, 0.75), g);
  gl_PointSize = a > 0.0 ? mix(settled, flake ? uDpr * (2.2 + 1.6 * aRnd.y) : uPx * 1.25, blown) : 0.0;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  if (a <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // outside the view: some GPUs draw a 0-size point as 1 pixel
}`;
const FRAG = /* glsl */`#version 300 es
precision mediump float;
in vec4 vCol; in float vRound; out vec4 o;
void main() {
  // flakes are soft discs, pixels stay square
  float d = length(gl_PointCoord - 0.5);
  o = vCol * mix(1.0, 1.0 - smoothstep(0.2, 0.5, d), vRound);
}`;

// the lobby logo's picture, which the points land into: a pixel of it shows as the points of its column land
// (evenly over LAND_SPREAD), on the canvas's own pixels, so the points' last picture is the snapshot exactly
const HOME_VERT = /* glsl */`#version 300 es
uniform sampler2D uHome; uniform vec4 uDst, uHomeAt; uniform vec2 uView;
const vec2 CORNERS[6] = vec2[6](vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(0, 1), vec2(1, 0), vec2(1, 1));
void main() {
  // the snapshot's box: its first texel at the logo's corner less its offset, each 1 / uHomeAt.z CSS px across
  vec2 p = uDst.xy + (uHomeAt.xy + CORNERS[gl_VertexID] * vec2(textureSize(uHome, 0))) / uHomeAt.z;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
const HOME_FRAG = /* glsl */`#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uHome; uniform vec4 uDst, uHomeAt, uBox; uniform vec2 uView; uniform float uDpr, uT;
out vec4 o;
const float GATHER = ${GATHER.toFixed(2)}, SPREAD = ${GATHER_SPREAD.toFixed(2)}, GTIME = ${GATHER_TIME.toFixed(2)};
const float LAND_SPREAD = ${LAND_SPREAD.toFixed(2)};
void main() {
  // this pixel, CSS px from the window's top left (the canvas is the window's whole device pixels), and its texel
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  ivec2 at = ivec2(floor((p - uDst.xy) * uHomeAt.z - uHomeAt.xy));
  if (any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, textureSize(uHome, 0)))) discard;
  // the share of its column's points landed (as the vertex shader lands them: x across the logo's letters)
  float x = clamp((p.x - uDst.x) / (uBox.z * uDst.z), 0.0, 1.0);
  float landed = clamp((uT - GATHER - SPREAD * x - GTIME) / LAND_SPREAD, 0.0, 1.0);
  vec4 c = texelFetch(uHome, at, 0);
  o = vec4(c.rgb * c.a, c.a) * landed;
}`;

/** The field's canvas, its context and its programs (the points', the lobby logo's picture's), and what they're read
 *  for once linked (`readLinked`; null: a link failed). */
interface Context {
  canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; prog: WebGLProgram; homeProg: WebGLProgram;
  linked?: Linked | null;
}
/** the context made ahead (`prepareWind`) */
let ahead: Context | null = null;

/** The points' program's attribute and uniform locations, and the picture's uniforms'. */
type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Linked { attributes: Record<string, number>; uniforms: Uniforms; home: Uniforms }
const ATTRIBUTES = ['aPos', 'aCol', 'aRnd'];
const UNIFORMS = ['uView', 'uBox', 'uDst', 'uPx', 'uDpr', 'uHomeAt', 'uHome', 'uT'];
const HOME_UNIFORMS = ['uView', 'uBox', 'uDst', 'uDpr', 'uHomeAt', 'uHome', 'uT'];
/** KHR_parallel_shader_compile's query: whether the link is done (read from a result the browser keeps, no wait) */
const COMPLETION_STATUS_KHR = 0x91b1;
/** how often the link is asked after, ms */
const LINK_POLL_MS = 20;

/** The programs' link status and locations: each a round trip to the GPU's process, waiting behind its work. */
function readLinked(made: Context): Linked | null {
  const { gl, prog, homeProg } = made;
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) || !gl.getProgramParameter(homeProg, gl.LINK_STATUS)) return null;
  const attributes = Object.fromEntries(ATTRIBUTES.map((name) => [name, gl.getAttribLocation(prog, name)]));
  const locations = (p: WebGLProgram, names: string[]): Uniforms => {
    return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(p, name)]));
  };
  return { attributes, uniforms: locations(prog, UNIFORMS), home: locations(homeProg, HOME_UNIFORMS) };
}

/**
 * `made`'s program read as soon as its link is done, early in the boot (asked every `LINK_POLL_MS` where the browser
 * says when, else as the field is made). Read as the field was made, its round trips waited behind the GPU
 * process's main thread building Skia's programs for the lobby's first paint, one after another: 0.57 s on a first
 * visit, the page held up.
 */
function readWhenLinked(made: Context): void {
  if (!made.gl.getExtension('KHR_parallel_shader_compile')) return;
  const ask = (): void => {
    if (made.linked !== undefined || made.gl.isContextLost()) return;
    const done = (p: WebGLProgram): boolean => made.gl.getProgramParameter(p, COMPLETION_STATUS_KHR);
    if (done(made.prog) && done(made.homeProg)) made.linked = readLinked(made);
    else setTimeout(ask, LINK_POLL_MS);
  };
  setTimeout(ask, LINK_POLL_MS);
}

function makeContext(): Context | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  };
  const program = (vert: string, frag: string): WebGLProgram => {
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vert));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    return p;
  };
  // (their status and locations read once they have linked: `readWhenLinked`. Sent to the GPU's process now: a
  // context never drawn to the page holds its commands till something waits on them, and on a first visit the
  // field's ask for its status then waited 0.85 s, the link queued behind the lobby's compiles)
  const prog = program(VERT, FRAG), homeProg = program(HOME_VERT, HOME_FRAG);
  gl.flush();
  const made: Context = { canvas, gl, prog, homeProg };
  readWhenLinked(made);
  return made;
}

/**
 * Makes the field's context and program at the boot's start, while the GPU's process is idle: made as the game's
 * loop started, on a first visit, the context waited a second on it (busy with the game's first draws).
 */
export function prepareWind(): void { ahead ??= makeContext(); }

/** The context made ahead let go, where the exit is a plain fade. */
export function dropWind(): void {
  ahead?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  ahead = null;
}

/** Where the lobby logo's letters are (their corner and width, CSS px), on a screen of `px` pixels a CSS px. */
interface Spot { left: number; top: number; width: number; px: number }
/** A snapshot of the lobby logo: RGBA, `w` by `h`, taken with its letters at `left`, `top` and `width` CSS px wide,
 *  `px` texels a CSS px; its top left `x`, `y` CSS px from the letters' corner. */
interface HomeTex extends Spot { data: Pixels; w: number; h: number; x: number; y: number }
/** Where the letters (`box`) and the lobby logo's (`dst`: none where the points don't gather) are, CSS px. */
interface Place { box: DOMRect; dst: DOMRect | null }
/** The field as it's made: where things are then, the CSS px a point covers with the letters that size, the most
 *  canvas pixels a CSS px, and the lobby logo's snapshot. */
interface FieldOpts extends Place { cell: number; most: number; home: HomeTex | null }

function createField(pos: Float32Array, col: Uint8Array, rnd: Uint8Array, count: number, o: FieldOpts) {
  const made = ahead ?? makeContext();
  ahead = null;
  if (!made) return null;
  const { canvas, gl, prog, homeProg } = made;
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: '101', pointerEvents: 'none', visibility: 'hidden' });
  if (made.linked === undefined) made.linked = readLinked(made);
  const linked = made.linked;
  if (!linked) return null;
  // (the picture draws a box of its own, with no attributes)
  const homeVao = gl.createVertexArray();
  gl.useProgram(prog);
  const attr = (name: string, data: ArrayBufferView, size: number, type: number, norm: boolean): void => {
    const loc = linked.attributes[name];
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
  };
  gl.bindVertexArray(gl.createVertexArray());
  attr('aPos', pos, 2, gl.FLOAT, false);
  attr('aCol', col, 4, gl.UNSIGNED_BYTE, true);
  attr('aRnd', rnd, 4, gl.UNSIGNED_BYTE, true);
  const u = (name: string): WebGLUniformLocation | null => linked.uniforms[name];
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  let h = o.home;
  const upload = (): void => {
    if (h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, h.w, h.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, h.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  };
  upload();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(u('uHome'), 0);
  gl.useProgram(homeProg);
  gl.uniform1i(linked.home.uHome, 0);
  let placed: Place = o, sized = '';
  /** the canvas fitted to the window, and the uniforms to `placed` (the lobby logo's snapshot read where it is now) */
  const fit = (): void => {
    const dpr = canvasScale(o.most);
    // a whole number of device pixels, shown unscaled: any resampling would soften the letters
    const w = Math.floor(innerWidth * dpr), ht = Math.floor(innerHeight * dpr);
    if (sized !== `${w}x${ht}@${dpr}`) {
      sized = `${w}x${ht}@${dpr}`;
      canvas.width = w; canvas.height = ht;
      Object.assign(canvas.style, { width: `${w / dpr}px`, height: `${ht / dpr}px` });
      gl.viewport(0, 0, w, ht);
    }
    const { box, dst } = placed;
    const k = h && dst ? h.px * h.width / dst.width : 0;
    // (the same places for both programs: the points', and the picture's they land into)
    for (const [p, at] of [[prog, linked.uniforms], [homeProg, linked.home]] as const) {
      gl.useProgram(p);
      gl.uniform2f(at.uView, w / dpr, ht / dpr);
      gl.uniform4f(at.uBox, box.left, box.top, box.width, box.height);
      gl.uniform4f(at.uDst, dst?.left ?? 0, dst?.top ?? 0, dst ? dst.width / box.width : 1, dst ? 1 : 0);
      gl.uniform1f(at.uDpr, dpr);
      gl.uniform4f(at.uHomeAt, h ? h.x * h.px : 0, h ? h.y * h.px : 0, k, h && dst ? 1 : 0);
    }
    // (a point covers its cell with the letters as large as they are now, in canvas pixels)
    gl.useProgram(prog);
    gl.uniform1f(u('uPx'), o.cell * box.width / o.box.width * dpr);
  };
  fit();
  const uT = u('uT');
  const pointsVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const draw = (t: number): void => {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // the lobby logo's picture under the points, from the first of them landing
    if (o.dst && h && t >= GATHER + GATHER_TIME) {
      gl.useProgram(homeProg);
      gl.bindVertexArray(homeVao);
      gl.uniform1f(linked.home.uT, t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.useProgram(prog);
      gl.bindVertexArray(pointsVao);
    }
    gl.uniform1f(uT, t);
    gl.drawArrays(gl.POINTS, 0, count);
  };
  draw(0);   // compile and upload now, not on the first frame of the exit
  document.body.appendChild(canvas);
  // gathering: settled and handed over; otherwise the last flakes (released at SWEEP) fade by then
  const END = o.dst ? GATHERED : SWEEP + 3.2;
  let disposed = false;
  /** where things are, asked as the exit starts and on each of its frames (`follow`) */
  let measure: (() => void) | null = null;
  return {
    canvas,
    /** Placed where `place` says: the letters and the lobby logo where they are now. */
    fit(place: Place): void { placed = place; fit(); },
    /** The lobby logo's colours taken again (`homeOf`), read from now on. */
    home(taken: HomeTex): void {
      if (disposed) return;
      h = taken;
      upload();
      fit();
    },
    /** `place` asked now and on every frame of the exit before it's drawn (it calls `fit`). */
    follow(place: () => void): void { measure = place; place(); },
    /** `tick` gets the exit's time: seconds since the wind started. */
    /** `slow` fires if the watchdog cuts the exit short; `done` still follows once the backdrop has faded. */
    run(tick: (t: number) => void, done: () => void, slow: () => void): void {
      const t0 = performance.now();
      let last = t0, judging = true;
      const samples: number[] = [];
      const frame = (now: number): void => {
        if (disposed) return;
        const t = (now - t0) / 1000;
        // the watchdog: the first frames of the wind show whether the device keeps up
        if (judging && t > 0) samples.push(now - last);
        if (judging && samples.length === SLOW_SAMPLES) {
          judging = false;
          const sorted = samples.sort((a, b) => a - b);
          const isSlow = (sorted[SLOW_SAMPLES / 2 - 1] + sorted[SLOW_SAMPLES / 2]) / 2 > SLOW_FRAME_MS;
          judged(isSlow);
          if (isSlow) {
            slow();
            canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
            setTimeout(done, BACKDROP_FADE * 1000);
            return;
          }
        }
        last = now;
        measure?.();
        draw(t);
        tick(t);
        if (t < END) requestAnimationFrame(frame); else done();
      };
      draw(0);
      requestAnimationFrame(frame);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // hide first, tear down a little later: removing a full-screen WebGL canvas and losing its
      // context in the same frame can flash the whole page in some browsers. Its context goes with the canvas, never
      // lost by hand: `loseContext` waits for the GPU process, and on WebGPU, busy making the lobby's pipelines, it held
      // the page up 1.9 s just after the reveal.
      canvas.style.display = 'none';
      setTimeout(() => canvas.remove(), 500);
    },
  };
}
