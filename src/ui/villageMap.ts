// The village's map (M, or the touch Map button, in the lobby): a sheet of parchment drawn from the village's plan
// (world/villagePlan.ts) in ink and wash, the meadow and its groves, the roads and footpaths, the palisade, every
// building, the two ways out with their portals, a compass and its title; each object's name on it a button that walks
// the hero there and uses it, and a mark where he stands. It unfolds as a folded map does: its panels open out of an
// accordion, each shaded by how far it's turned from the light, and folds back the same way as it's put away. The
// fold is stepped by the game's frames (`updateVillageMap`), a transform a panel; the sheet is drawn once, as it opens
// at a size it hasn't been drawn at.
import { G } from '../state';
import {
  CAMPFIRE, COTTAGES, ENTRANCES, GAP_HALF, HALL, NOTICE, RACK, TERRACE, VILLAGE_OBJECTS, YARD, portalPlace, yardToWorld,
  type Spot, type VillageObject,
} from '../data/village';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { COTTAGE, PODIUM, SQUARE_EDGE, TOMB, WAY, footpathOf, fromGap, palisadePolygon, roadLines } from '../world/villagePlan';
import { canvasOf, ctx2d } from '../core/textures';
import { FOUNTAIN } from '../world/fountain';
import { mulberry } from '../util';
import { sfx } from '../core/audio';
import { completeStep } from '../game/training';
import { input, isDown } from '../core/input';

/** what the map shows of the world (m): x and z from, to, the parchment's shape (the crypt's court reaches 46 m east:
 *  at 39 it ran off the parchment's edge; the palisade goes round the hall of heroes' back at 39 m north) */
const VIEW = { x0: -54.5, x1: 54.5, z0: -44, z1: 44 };
/** the hall of heroes' roof as the map draws it (world/village.ts builds it): how far past the back wall's face it
 *  reaches, its front's z and half its width with the eaves' overhang (m) */
export const HALL_ROOF = { back: 1.2, front: -12.3, half: HALL.half + 0.6 };
/** the least gap between two names side by side, how far in a pointer stays from its name's corners, and the rounds
 *  names are pushed apart in (css px, at the reference layout's scale for the first two) */
const NAME_GAP = 3, TAIL_IN = 3, NAME_ROUNDS = 12;
/** the objects named beside their places (to the east), not over them: the rack's, which over it stood in one row with
 *  the Sparring Shade's and the campfire's, the three pushed into strips across a phone's sheet */
const NAMED_BESIDE = new Set(['rack']);
/** the panels it folds into, and how long it takes to open or fold (s) */
const PANELS = 4, FOLD_TIME = 0.75;
/** the ink and washes it's drawn in */
const INK = '#3a2a1a', INK_SOFT = 'rgba(58, 42, 26, 0.55)', PAPER = '#ead9b4', PAPER_DARK = '#c8ad7c';
const MEADOW = 'rgba(112, 148, 70, 0.30)', WOOD = 'rgba(70, 104, 48, 0.55)', ROAD = '#bfa676', ROOF = '#a8664a';
const STONE = '#b9b1a2', DARK_STONE = '#5e5852', SAND = 'rgba(196, 170, 120, 0.45)';
/** each portal's colour on the map */
const PORTAL_INK: Record<BiomeId, string> = { crypt: '#7a2fb0', forest: '#2f9a4a' };

export interface VillageMapHooks {
  /** an object picked on the map: the hero walks there and uses it */
  go(o: VillageObject): void;
  /** a place picked on the map that has nothing to use (the training yard): the hero walks there */
  walk(x: number, z: number): void;
  /** the trees as they stand (x, z, how tall), drawn as the groves and the wood */
  trees(): readonly { x: number; z: number; height: number }[];
}

let hooks: VillageMapHooks;
let root: HTMLElement, sheet: HTMLElement, you: HTMLElement;
const panels: { el: HTMLElement; canvas: HTMLCanvasElement; shade: HTMLElement }[] = [];
/** whether it's wanted open, how far it's open (0 folded away, 1 flat), and the size it was last drawn at */
let wanted = false, open = 0, drawnAt = '';
/** how far it's seen through as he walks (0 not at all, 1 as far as `SEE_THROUGH`) */
let seenThrough = 0;
/** while he's walked with it open, how much of it is left, and how fast it goes and comes back (1/s): from play, "make
 *  map semi-transparent if user opens a map and attempts to walk... if not attempt to walk, then keep opaque". The whole
 *  map's opacity, as its rehearsal under the loading screen draws it (`.ahead`), so no new program is drawn with */
const SEE_THROUGH = 0.35, SEE_RATE = 8;
/** the keys that walk him, and the least push of the touch stick that does */
const WALK_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const STICK_WALKS = 0.1;

/** Whether the player is walking him now: a walking key held, or the touch stick pushed. */
const walking = (): boolean => WALK_KEYS.some(isDown) || Math.hypot(input.stick.x, input.stick.y) > STICK_WALKS;

/** The map's markup filled in: its panels, its names, its mark. */
export function initVillageMap(h: VillageMapHooks): void {
  hooks = h;
  root = document.querySelector<HTMLElement>('#vmap')!;
  sheet = root.querySelector<HTMLElement>('.vm-sheet')!;
  const holder = sheet.querySelector<HTMLElement>('.vm-panels')!;
  for (let i = 0; i < PANELS; i++) {
    const el = document.createElement('div');
    el.className = 'vm-panel';
    const canvas = document.createElement('canvas');
    const shade = document.createElement('div');
    shade.className = 'vm-shade';
    el.append(canvas, shade);
    holder.append(el);
    panels.push({ el, canvas, shade });
  }
  const names = sheet.querySelector<HTMLElement>('.vm-names')!;
  for (const o of VILLAGE_OBJECTS) {
    const b = document.createElement('button');
    b.className = 'vm-name';
    b.dataset.use = o.use;
    b.classList.toggle('beside', NAMED_BESIDE.has(o.id));
    if (o.biome) b.dataset.biome = o.biome;
    b.textContent = o.name;
    const [u, v] = toSheet(o.at[0], o.at[1]);
    b.style.left = `${u * 100}%`;
    b.style.top = `${v * 100}%`;
    b.addEventListener('click', () => {
      sfx.click();
      setVillageMap(false);
      hooks.go(o);
    });
    names.append(b);
  }
  // (the training yard has nothing to use, but is a place to go: from play, "why I cannot click training yard ?")
  const yard = document.createElement('button');
  yard.className = 'vm-name';
  yard.dataset.use = 'yard';
  yard.textContent = 'Training Yard';
  const [yx, yz] = yardToWorld(0, 0), [yu, yv] = toSheet(yx, yz);
  yard.style.left = `${yu * 100}%`;
  yard.style.top = `${yv * 100}%`;
  yard.addEventListener('click', () => {
    sfx.click();
    setVillageMap(false);
    hooks.walk(yx, yz);
  });
  names.append(yard);
  you = sheet.querySelector<HTMLElement>('.vm-you')!;
  root.querySelector<HTMLElement>('.vm-close')!.addEventListener('click', () => setVillageMap(false));
  // (a click on the parchment's margin, off the sheet, folds it away)
  root.addEventListener('click', (e) => { if (e.target === root) setVillageMap(false); });
  addEventListener('resize', () => {
    drawnAt = '';
    if (!wanted) return;
    drawSheet();
    layNames();
  });
}

/** Whether the map is open (or opening). */
export const villageMapOpen = (): boolean => wanted;

/** The map opened, or folded away. */
export function setVillageMap(on: boolean): void {
  if (on === wanted) return;
  wanted = on;
  if (on) {
    completeStep('map');
    // (shown first: hidden, the sheet has no size to be drawn at)
    root.classList.remove('hidden');
    drawSheet();
    layNames();
    root.setAttribute('aria-hidden', 'false');
    sfx.click();
  }
  root.classList.toggle('open', on);
}

/** a stage of the map's rehearsal under the loading screen (`layOutMapAhead`) */
export type MapAhead = 'folding' | 'flat' | 'done';

/**
 * The map shown over the loading screen unseen (`.ahead`: 0.4% opaque, one level of a colour's 255, nothing taking a
 * click), half folded and then flat with its names, so Chrome builds the Skia programs its first raster and its turned
 * panels' drawing take while the hero is built; `done` puts it away. A first visit's first opening of it held Chrome's
 * GPU process 4.0 s, then 0.85 s as it unfolded and 0.78 s as it lay flat (`npm run stalls -- --scenario walks`).
 * Over the loading screen, not under it: Chrome draws nothing an opaque layer covers, and a turned panel's programs
 * are its drawing's.
 */
export function layOutMapAhead(stage: MapAhead): void {
  root.classList.toggle('ahead', stage !== 'done');
  if (stage === 'done') {
    if (wanted) return;
    root.classList.add('hidden');
    root.classList.remove('open', 'flat');
    root.style.removeProperty('--vm-open');
    return;
  }
  root.classList.remove('hidden');
  root.classList.add('open');
  drawSheet();
  layNames();
  const flat = stage === 'flat';
  // (the sheet opaque, as it unfolds: faded, Chrome draws it through a pass of its own and other programs)
  layFolds(flat ? 1 : 0.5, 1);
  root.style.setProperty('--vm-open', flat ? '1' : '0.5');
  root.classList.toggle('flat', flat);
}

/** The map's frame: its fold stepped toward open or away, the hero's mark where he stands. */
export function updateVillageMap(dt: number): void {
  if (!wanted && open === 0) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  open = Math.min(1, Math.max(0, open + (wanted ? 1 : -1) * dt / (reduced ? 0.25 : FOLD_TIME)));
  if (!wanted && open === 0) {
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
    seenThrough = 0;
    root.style.removeProperty('opacity');
    return;
  }
  seenThrough += ((wanted && walking() ? 1 : 0) - seenThrough) * (1 - Math.exp(-SEE_RATE * dt));
  if (seenThrough < 0.001) root.style.removeProperty('opacity');
  else root.style.opacity = (1 - (1 - SEE_THROUGH) * seenThrough).toFixed(3);
  layFolds(reduced ? 1 : easeInOut(open), reduced ? open : 1);
  root.style.setProperty('--vm-open', open.toFixed(3));
  root.classList.toggle('flat', open === 1);
  const p = G.player.pos;
  const [u, v] = toSheet(p.x, p.z);
  you.style.transform = `translate(${(u * sheet.clientWidth).toFixed(1)}px, ${(v * sheet.clientHeight).toFixed(1)}px)` +
    ` rotate(${(-G.player.facing * 180 / Math.PI + 180).toFixed(1)}deg)`;
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Each panel turned as an accordion folds: open at `k` (0 folded flat on itself, 1 laid out), its left edge where the
 * panels before it end as they're turned, each as wide as its turn leaves it seen face on, every other one shaded more
 * as it turns from the light; the whole sheet `fade` faded in (reduced motion: a fade alone). Squeezed flat, not
 * turned in 3D: a turned panel's drawing took Chrome a program of its own, its first unfold holding a first visit's GPU
 * process 0.9 to 2.3 s, and seen face on under a long lens the two are alike (`npm run stalls -- --scenario walks`).
 */
function layFolds(k: number, fade: number): void {
  const w = sheet.clientWidth / PANELS;
  const angle = (1 - k) * 86 * (Math.PI / 180);
  const squeeze = Math.cos(angle), across = w * squeeze;
  // (the folded stack kept in the sheet's middle as it opens)
  const offset = (sheet.clientWidth - across * PANELS) / 2;
  panels.forEach(({ el, shade }, i) => {
    el.style.transform = `translate(${(offset + i * across).toFixed(1)}px, 0) scaleX(${squeeze.toFixed(4)})`;
    shade.style.opacity = ((i % 2 === 0 ? 0.15 : 0.45) * (1 - k)).toFixed(3);
  });
  sheet.style.opacity = fade.toFixed(3);
}

/**
 * The names moved aside as far as they need to lie clear of each other and within the sheet, each pointer still at its
 * place: the Chronicle and the Stash stand either side of the hall's porch, and the one lay over the other (from play,
 * "need to fix the map, there is overlap"). Their sizes follow the UI's scale and the sheet the window's, so it's done
 * for the size it's shown at.
 */
function layNames(): void {
  const across = sheet.clientWidth, down = sheet.clientHeight;
  const all = [...sheet.querySelectorAll<HTMLElement>('.vm-name')];
  // (each measured at its own width, a widening of a size before let go)
  for (const el of all) el.style.width = '';
  const names = all.map((el) => {
    // (its own middle: a name's height over its place, or beside it, half its height off)
    const beside = el.classList.contains('beside');
    return {
      el,
      beside,
      x: (parseFloat(el.style.left) / 100) * across + (beside ? (el.offsetHeight + el.offsetWidth) / 2 : 0),
      y: (parseFloat(el.style.top) / 100) * down - (beside ? 0 : el.offsetHeight),
      wide: el.offsetWidth,
      tall: el.offsetHeight,
      aside: 0,
    };
  });
  for (let round = 0; round < NAME_ROUNDS; round++) {
    for (const [i, a] of names.entries()) {
      for (const b of names.slice(i + 1)) {
        if (Math.abs(a.y - b.y) >= (a.tall + b.tall) / 2) continue;
        const [left, right] = a.x + a.aside <= b.x + b.aside ? [a, b] : [b, a];
        const apart = right.x + right.aside - (left.x + left.aside);
        const short = (left.wide + right.wide) / 2 + NAME_GAP - apart;
        if (short <= 0) continue;
        left.aside -= short / 2;
        right.aside += short / 2;
      }
    }
    for (const name of names) {
      const least = name.wide / 2 - name.x;
      const most = across - name.wide / 2 - name.x;
      name.aside = Math.min(most, Math.max(least, name.aside));
      // (widened as far as its pointer must reach under it: moved further than half its width on a narrow sheet, the
      // pointer stopped at its end, off its place)
      if (!name.beside) name.wide = Math.max(name.wide, 2 * (Math.abs(name.aside) + TAIL_IN));
    }
  }
  for (const { el, wide, aside } of names) {
    const reach = wide / 2 - TAIL_IN;
    if (wide > el.offsetWidth) el.style.width = `${wide.toFixed(1)}px`;
    el.style.setProperty('--aside', `${aside.toFixed(1)}px`);
    el.style.setProperty('--tail', `${Math.min(reach, Math.max(-reach, -aside)).toFixed(1)}px`);
  }
}

/** A point of the world (x, z) as a share of the sheet across and down. */
function toSheet(x: number, z: number): Spot {
  return [(x - VIEW.x0) / (VIEW.x1 - VIEW.x0), (z - VIEW.z0) / (VIEW.z1 - VIEW.z0)];
}

/** The sheet drawn at its size on the screen, and cut into its panels (once a size). */
function drawSheet(): void {
  const ratio = devicePixelRatio || 1;
  const w = Math.round(sheet.clientWidth * ratio), h = Math.round(sheet.clientHeight * ratio);
  if (!w || !h || drawnAt === `${w}x${h}`) return;
  drawnAt = `${w}x${h}`;
  const whole = canvasOf(w, h);
  drawMap(ctx2d(whole), w, h);
  const pw = Math.ceil(w / PANELS);
  for (const [i, { canvas }] of panels.entries()) {
    canvas.width = pw;
    canvas.height = h;
    ctx2d(canvas).drawImage(whole, i * pw, 0, pw, h, 0, 0, pw, h);
  }
}

// --- the drawing ----------------------------------------------------------------------------------------------------

/** The whole map on `g`, `w` by `h` px. */
function drawMap(g: CanvasRenderingContext2D, w: number, h: number): void {
  const metre = w / (VIEW.x1 - VIEW.x0);
  const at = (x: number, z: number): Spot => [(x - VIEW.x0) * metre, (z - VIEW.z0) * metre];
  const line = (points: readonly Spot[], close = false): void => {
    g.beginPath();
    points.forEach(([x, z], i) => (i ? g.lineTo(...at(x, z)) : g.moveTo(...at(x, z))));
    if (close) g.closePath();
  };
  // (everything drawn within the paper's ragged margin)
  g.save();
  g.clip(drawParchment(g, w, h));
  // the meadow inside the palisade, the wood round it
  const fence = palisadePolygon(200);
  line(fence, true);
  g.fillStyle = MEADOW;
  g.fill();
  for (const t of hooks.trees()) drawTree(g, ...at(t.x, t.z), Math.max(1.6, t.height * 0.28) * metre, t.x * 7.1 + t.z * 3.3);
  // the footpaths (each runs on under the road it joins), the roads over them, the square
  g.lineCap = 'butt';
  g.lineJoin = 'round';
  g.setLineDash([metre * 0.5, metre * 0.45]);
  for (const c of COTTAGES) {
    const path = footpathOf(c);
    if (!path) continue;
    // (laid from the way it joins, so a whole dash meets its edge)
    line([...path].reverse());
    g.strokeStyle = 'rgba(120, 92, 56, 0.8)';
    g.lineWidth = metre * 0.3;
    g.stroke();
  }
  const groveIn: Spot[] = [roadLines[1].line[roadLines[1].line.length - 1], [portalPlace('forest').x, portalPlace('forest').z]];
  line(groveIn);
  g.stroke();
  g.setLineDash([]);
  for (const road of roadLines) {
    line(road.line);
    g.strokeStyle = INK_SOFT;
    g.lineWidth = (road.width + 0.5) * metre;
    g.stroke();
    g.strokeStyle = ROAD;
    g.lineWidth = road.width * metre;
    g.stroke();
  }
  g.beginPath();
  g.arc(...at(0, 0), SQUARE_EDGE * metre, 0, Math.PI * 2);
  g.fillStyle = ROAD;
  g.fill();
  g.strokeStyle = INK_SOFT;
  g.lineWidth = Math.max(1, metre * 0.12);
  g.stroke();
  drawBuildings(g, at, metre);
  drawPalisade(g, at, metre, fence);
  for (const id of BIOME_IDS) drawWay(g, at, metre, id);
  drawCompass(g, w - metre * 6.5, h - metre * 6.5, metre * 4.2);
  drawTitle(g, w, metre);
  g.restore();
}

/** The parchment: its colour, darker to its edges, its fibres and stains, a margin worn ragged (its outline). */
function drawParchment(g: CanvasRenderingContext2D, w: number, h: number): Path2D {
  const rng = mulberry(41);
  const edge = Math.min(w, h) * 0.025;
  const outline = new Path2D();
  const steps = 120;
  for (let k = 0; k <= steps * 4; k++) {
    const t = (k % steps) / steps, side = Math.floor(k / steps) % 4;
    const wobble = edge * (0.4 + rng() * 0.6);
    const [x, y] = side === 0 ? [t * w, wobble] : side === 1 ? [w - wobble, t * h] : side === 2 ? [w - t * w, h - wobble] : [wobble, h - t * h];
    if (k === 0) outline.moveTo(x, y); else outline.lineTo(x, y);
  }
  outline.closePath();
  g.fillStyle = PAPER;
  g.fill(outline);
  g.save();
  g.clip(outline);
  const vignette = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, PAPER_DARK);
  g.fillStyle = vignette;
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 26; k++) {
    const x = rng() * w, y = rng() * h, r = (0.03 + rng() * 0.09) * w;
    const stain = g.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, `rgba(150, 110, 60, ${0.04 + rng() * 0.06})`);
    stain.addColorStop(1, 'rgba(150, 110, 60, 0)');
    g.fillStyle = stain;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(120, 90, 50, 0.08)';
  g.lineWidth = 1;
  for (let k = 0; k < 900; k++) {
    const x = rng() * w, y = rng() * h, a = rng() * Math.PI, l = 4 + rng() * 14;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
  return outline;
}

/** A tree from above: a crown of lobes washed green, inked round, its shade to the south-east. */
function drawTree(g: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number): void {
  const rng = mulberry(Math.floor(Math.abs(seed) * 1000) + 1);
  g.fillStyle = 'rgba(40, 50, 30, 0.18)';
  g.beginPath();
  g.arc(x + r * 0.35, y + r * 0.35, r, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  const lobes = 7;
  for (let k = 0; k <= lobes; k++) {
    const a = (k / lobes) * Math.PI * 2, rr = r * (0.8 + rng() * 0.25);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py);
    else g.quadraticCurveTo(x + Math.cos(a - Math.PI / lobes) * r * 1.2, y + Math.sin(a - Math.PI / lobes) * r * 1.2, px, py);
  }
  g.closePath();
  g.fillStyle = WOOD;
  g.fill();
  g.strokeStyle = 'rgba(38, 56, 28, 0.7)';
  g.lineWidth = Math.max(1, r * 0.08);
  g.stroke();
}

type At = (x: number, z: number) => Spot;

/** A box (half sides hx, hz round (x, z), turned `turn` about y) filled and inked. */
function drawBox(g: CanvasRenderingContext2D, at: At, x: number, z: number, hx: number, hz: number, turn: number, fill: string,
  ink = INK, width = 1.5): void {
  const c = Math.cos(turn), s = Math.sin(turn);
  const corner = (u: number, v: number): Spot => at(x + u * c + v * s, z - u * s + v * c);
  g.beginPath();
  [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].forEach(([u, v], i) => (i ? g.lineTo(...corner(u, v)) : g.moveTo(...corner(u, v))));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = width;
  g.stroke();
}

/** The hall's terrace and its plinths, the cottages and sheds, the yard, the fountain, the
 *  campfire and the notice board. */
function drawBuildings(g: CanvasRenderingContext2D, at: At, metre: number): void {
  const X = TERRACE.x;
  drawBox(g, at, X, (TERRACE.front + TERRACE.back) / 2, TERRACE.half, (TERRACE.front - TERRACE.back) / 2, 0, STONE);
  drawBox(g, at, X, (TERRACE.stairFoot + TERRACE.front) / 2, TERRACE.stairHalf, (TERRACE.front - TERRACE.stairFoot) / 2, 0, STONE, INK_SOFT);
  // (the hall a roofed building: its slate roof from the back wall to past the colonnade, its ridge front to back)
  const back = HALL.wall - HALL_ROOF.back, front = HALL_ROOF.front;
  drawBox(g, at, X, (front + back) / 2, HALL_ROOF.half, (front - back) / 2, 0, DARK_STONE);
  g.beginPath();
  g.moveTo(...at(X, back));
  g.lineTo(...at(X, front));
  g.strokeStyle = 'rgba(234, 217, 180, 0.6)';
  g.lineWidth = Math.max(1, metre * 0.12);
  g.stroke();
  for (const c of COTTAGES) {
    const hx = (COTTAGE.w / 2 + COTTAGE.eave) * c.size, hz = (COTTAGE.d / 2 + COTTAGE.eave) * c.size;
    drawBox(g, at, c.x, c.z, hx, hz, c.facing, ROOF);
    // the ridge along its roof
    const r = Math.cos(c.facing), s = Math.sin(c.facing);
    g.beginPath();
    g.moveTo(...at(c.x - hx * r, c.z + hx * s));
    g.lineTo(...at(c.x + hx * r, c.z - hx * s));
    g.strokeStyle = INK_SOFT;
    g.lineWidth = 1.2;
    g.stroke();
  }
  // the yard: a fence round trodden ground, its dummies crosses
  drawBox(g, at, YARD.x, YARD.z, YARD.halfX, YARD.halfZ, YARD.turn, SAND, 'rgba(0,0,0,0)', 0);
  const { halfX, halfZ, gate, gateAt } = YARD;
  // (its fence round from one gatepost to the other, the gate left open)
  const fence: Spot[] = [[gateAt + gate, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ], [-halfX, -halfZ],
    [gateAt - gate, -halfZ]];
  g.setLineDash([metre * 0.6, metre * 0.3]);
  g.beginPath();
  fence.forEach(([fx, fz], i) => (i ? g.lineTo(...at(...yardToWorld(fx, fz))) : g.moveTo(...at(...yardToWorld(fx, fz)))));
  g.strokeStyle = '#6a4a2a';
  g.lineWidth = Math.max(1.5, metre * 0.15);
  g.stroke();
  g.setLineDash([]);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(...at(...yardToWorld(gateAt + s * gate, -halfZ)), metre * 0.22, 0, Math.PI * 2);
    g.fillStyle = '#6a4a2a';
    g.fill();
  }
  for (const [dx, dz] of [[-3, 1.7], [0, 2.9], [3, 1.7]]) {
    const [x, y] = at(...yardToWorld(dx, dz));
    const s = metre * 0.45;
    g.beginPath();
    g.moveTo(x - s, y - s); g.lineTo(x + s, y + s);
    g.moveTo(x + s, y - s); g.lineTo(x - s, y + s);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.stroke();
  }
  // (its name is a button over the sheet, as the objects' are: a place to walk to)
  // the fountain (its basin, its upper bowl), the campfire, the notice board
  for (const [radius, fill] of [[FOUNTAIN.r, '#5a7ea0'], [0.85, '#7fa2c0']] as const) {
    g.beginPath();
    g.arc(...at(0, 0), radius * metre, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.stroke();
  }
  drawCampfire(g, ...at(CAMPFIRE[0], CAMPFIRE[1]), metre);
  drawBox(g, at, NOTICE.x, NOTICE.z, 1, 0.15, NOTICE.facing, '#8a6a4a');
  drawRack(g, at, metre);
}

/** The weapons rack as a map draws one: its beam, and two swords crossed over it. */
function drawRack(g: CanvasRenderingContext2D, at: At, metre: number): void {
  drawBox(g, at, RACK.x, RACK.z, RACK.half, 0.2, RACK.facing, '#8a6a4a');
  const [x, y] = at(RACK.x, RACK.z), s = metre * 1.1;
  g.lineCap = 'round';
  for (const side of [-1, 1]) {
    // a blade from its point up to its pommel, its guard across it
    g.beginPath();
    g.moveTo(x - side * s, y + s); g.lineTo(x + side * s, y - s);
    g.moveTo(x + side * s * 0.25, y - s * 0.85); g.lineTo(x + side * s * 0.85, y - s * 0.25);
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1.5, metre * 0.16);
    g.stroke();
  }
  g.lineCap = 'butt';
}

/** The campfire as a map draws one: a ring of stones round two crossed logs, a flame rising over them. */
function drawCampfire(g: CanvasRenderingContext2D, x: number, y: number, metre: number): void {
  const ring = metre * 1.15;
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2;
    g.beginPath();
    g.arc(x + Math.cos(a) * ring, y + Math.sin(a) * ring, metre * 0.3, 0, Math.PI * 2);
    g.fillStyle = STONE;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.stroke();
  }
  g.lineCap = 'round';
  for (const turn of [0.6, -0.6]) {
    const dx = Math.cos(turn) * metre * 0.8, dy = Math.sin(turn) * metre * 0.8;
    g.beginPath();
    g.moveTo(x - dx, y - dy);
    g.lineTo(x + dx, y + dy);
    g.strokeStyle = INK;
    g.lineWidth = metre * 0.42;
    g.stroke();
    g.strokeStyle = '#8a5a34';
    g.lineWidth = metre * 0.28;
    g.stroke();
  }
  // the flame: a teardrop, its point up, a paler heart in it
  const flame = (high: number, wide: number, fill: string): void => {
    g.beginPath();
    g.moveTo(x, y - high);
    g.bezierCurveTo(x + wide, y - high * 0.45, x + wide, y + wide * 0.4, x, y + wide * 0.45);
    g.bezierCurveTo(x - wide, y + wide * 0.4, x - wide, y - high * 0.45, x, y - high);
    g.fillStyle = fill;
    g.fill();
  };
  flame(metre * 1.3, metre * 0.62, '#d9541e');
  g.strokeStyle = INK;
  g.lineWidth = 1;
  g.stroke();
  flame(metre * 0.75, metre * 0.32, '#f6c04a');
}

/** The palisade: its line inked thick, a stake across it every metre or so, open at the ways out. */
function drawPalisade(g: CanvasRenderingContext2D, at: At, metre: number, fence: readonly Spot[]): void {
  g.strokeStyle = '#4a3220';
  g.lineCap = 'round';
  for (let i = 0; i < fence.length; i++) {
    const [ax, az] = fence[i], [bx, bz] = fence[(i + 1) % fence.length];
    if (fromGap(ax, az) < GAP_HALF || fromGap(bx, bz) < GAP_HALF) continue;
    g.beginPath();
    g.moveTo(...at(ax, az));
    g.lineTo(...at(bx, bz));
    g.lineWidth = Math.max(2, metre * 0.35);
    g.stroke();
    // (a stake across it)
    const len = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / len, nz = (bx - ax) / len;
    g.beginPath();
    g.moveTo(...at(ax + nx * 0.45, az + nz * 0.45));
    g.lineTo(...at(ax - nx * 0.45, az - nz * 0.45));
    g.lineWidth = Math.max(1, metre * 0.12);
    g.stroke();
  }
}

/** A way out: the crypt's court and tomb in stone, or the grove's path; its portal a swirl in its colour. */
function drawWay(g: CanvasRenderingContext2D, at: At, metre: number, id: BiomeId): void {
  const { gap, out } = ENTRANCES[id];
  const turn = Math.atan2(-out[0], -out[1]);
  const along = (o: number): Spot => [gap[0] + out[0] * o, gap[1] + out[1] * o];
  if (id === 'crypt') {
    // its court, the stair up, the mausoleum's podium and its pitched roof, a ridge down its middle
    const front = PODIUM.front, run = front - TOMB.stairFoot, from = front - 0.2, to = TOMB.back + 0.5;
    drawBox(g, at, ...along(front / 2), GAP_HALF - 0.3, front / 2, turn, 'rgba(120, 112, 104, 0.55)', INK_SOFT);
    drawBox(g, at, ...along(TOMB.stairFoot + run / 2), 2.7, run / 2, turn, STONE, INK_SOFT);
    drawBox(g, at, ...along((front + TOMB.back + 0.7) / 2), TOMB.w / 2 + 0.7, (TOMB.back + 0.7 - front) / 2, turn, STONE);
    drawBox(g, at, ...along((from + to) / 2), TOMB.w / 2 + 0.6, (to - from) / 2, turn, DARK_STONE);
    g.beginPath();
    g.moveTo(...at(...along(from)));
    g.lineTo(...at(...along(to)));
    g.strokeStyle = STONE;
    g.lineWidth = Math.max(1.5, metre * 0.25);
    g.stroke();
  } else {
    drawBox(g, at, ...along(WAY.forest.out / 2), WAY.forest.half - 0.6, WAY.forest.out / 2, turn, 'rgba(90, 120, 60, 0.25)', 'rgba(0,0,0,0)', 0);
  }
  const p = portalPlace(id);
  const [x, y] = at(p.x, p.z);
  const r = metre * 1.9;
  const swirl = g.createRadialGradient(x, y, 0, x, y, r);
  swirl.addColorStop(0, '#ffffff');
  swirl.addColorStop(0.35, PORTAL_INK[id]);
  swirl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = swirl;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PORTAL_INK[id];
  g.lineWidth = Math.max(1.5, metre * 0.18);
  g.beginPath();
  for (let k = 0; k < 40; k++) {
    const a = k * 0.45, rr = r * 0.9 * (k / 40);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
}

/** A compass rose at (x, y), `r` px across its points: north up, its points inked and half washed. */
function drawCompass(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.stroke();
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
      g.fillStyle = side < 0 ? INK : PAPER;
      g.fill();
      g.stroke();
    }
    g.restore();
  }
  g.fillStyle = INK;
  g.font = `700 ${Math.round(r * 0.32)}px Cinzel, Georgia, serif`;
  g.textAlign = 'center';
  g.fillText('N', 0, -r * 1.08);
  g.restore();
}

/** The map's title in a cartouche at its top. */
function drawTitle(g: CanvasRenderingContext2D, w: number, metre: number): void {
  const y = metre * 3.6, size = Math.round(metre * 1.9);
  g.font = `700 ${size}px Cinzel, Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = 'Wardenhollow';
  const tw = g.measureText(text).width + size * 2;
  g.fillStyle = 'rgba(234, 217, 180, 0.9)';
  g.fillRect(w / 2 - tw / 2, y - size, tw, size * 2);
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, metre * 0.1);
  g.strokeRect(w / 2 - tw / 2, y - size, tw, size * 2);
  g.strokeRect(w / 2 - tw / 2 + 4, y - size + 4, tw - 8, size * 2 - 8);
  g.fillStyle = INK;
  g.fillText(text, w / 2, y + size * 0.06);
}
