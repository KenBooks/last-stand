// The village's map (M, or the touch Map button, in the lobby): a sheet of parchment drawn from the village's plan
// (world/villagePlan.ts) in ink and wash, the meadow and its groves, the roads and footpaths, the palisade, every
// building, the two ways out with their portals, a compass and its title; each object's name on it a button that walks
// the hero there and uses it, and a mark where he stands. It unfolds as a folded map does: its panels open out of an
// accordion, each shaded by how far it's turned from the light, and folds back the same way as it's put away. The
// fold is stepped by the game's frames (`updateVillageMap`), a transform a panel; the sheet is drawn once, as it opens
// at a size it hasn't been drawn at.
import { G } from '../state';
import {
  CAMPFIRE, COTTAGES, ENTRANCES, GAP_HALF, HALL, NOTICE, TERRACE, VILLAGE_OBJECTS, YARD, portalPlace, yardToWorld,
  type Spot, type VillageObject,
} from '../data/village';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { COTTAGE, PODIUM, SQUARE_EDGE, TOMB, WAY, footpathOf, fromGap, palisadePolygon, roadLines } from '../world/villagePlan';
import { canvasOf, ctx2d } from '../core/textures';
import { FOUNTAIN } from '../world/fountain';
import { LOOKS, mapStyle, type Look } from './villageMapLooks';
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
/** the panels it folds into, and how long it takes to open or fold (s) */
const PANELS = 4, FOLD_TIME = 0.75;

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
  }
  // (paper unfolded or folded away, however it's opened or put away: M, the touch Map button, Esc, a name, its margin)
  if (on) sfx.mapOpen(); else sfx.mapClose();
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
  const names = all.map((el) => ({
    el,
    x: (parseFloat(el.style.left) / 100) * across,
    y: (parseFloat(el.style.top) / 100) * down,
    wide: el.offsetWidth,
    tall: el.offsetHeight,
    aside: 0,
  }));
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
      name.wide = Math.max(name.wide, 2 * (Math.abs(name.aside) + TAIL_IN));
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

/** The sheet drawn at its size on the screen in the look chosen, and cut into its panels (once a size and look). */
function drawSheet(): void {
  const ratio = devicePixelRatio || 1;
  const w = Math.round(sheet.clientWidth * ratio), h = Math.round(sheet.clientHeight * ratio);
  const style = mapStyle();
  root.dataset.style = style;
  if (!w || !h || drawnAt === `${w}x${h}:${style}`) return;
  drawnAt = `${w}x${h}:${style}`;
  const whole = canvasOf(w, h);
  drawMap(ctx2d(whole), w, h, LOOKS[style]);
  const pw = Math.ceil(w / PANELS);
  for (const [i, { canvas }] of panels.entries()) {
    canvas.width = pw;
    canvas.height = h;
    ctx2d(canvas).drawImage(whole, i * pw, 0, pw, h, 0, 0, pw, h);
  }
}

// --- the drawing ----------------------------------------------------------------------------------------------------

/** The whole map on `g`, `w` by `h` px, in `look`. */
function drawMap(g: CanvasRenderingContext2D, w: number, h: number, look: Look): void {
  const metre = w / (VIEW.x1 - VIEW.x0);
  const at = (x: number, z: number): Spot => [(x - VIEW.x0) * metre, (z - VIEW.z0) * metre];
  const line = (points: readonly Spot[], close = false): void => {
    g.beginPath();
    points.forEach(([x, z], i) => (i ? g.lineTo(...at(x, z)) : g.moveTo(...at(x, z))));
    if (close) g.closePath();
  };
  // (everything drawn within the sheet's margin)
  g.save();
  g.clip(look.ground(g, w, h));
  // the meadow inside the palisade, the wood round it
  const fence = palisadePolygon(200);
  const meadow = new Path2D();
  fence.forEach(([x, z], i) => (i ? meadow.lineTo(...at(x, z)) : meadow.moveTo(...at(x, z))));
  meadow.closePath();
  look.meadowWash(g, meadow, metre);
  for (const t of hooks.trees()) look.tree(g, ...at(t.x, t.z), Math.max(1.6, t.height * 0.28) * metre, t.x * 7.1 + t.z * 3.3);
  // the footpaths (each runs on under the road it joins), the roads over them, the square
  g.lineCap = 'butt';
  g.lineJoin = 'round';
  g.setLineDash([metre * 0.5, metre * 0.45]);
  for (const c of COTTAGES) {
    const path = footpathOf(c);
    if (!path) continue;
    // (laid from the way it joins, so a whole dash meets its edge)
    line([...path].reverse());
    g.strokeStyle = look.footpath;
    g.lineWidth = metre * 0.3;
    g.stroke();
  }
  const groveIn: Spot[] = [roadLines[1].line[roadLines[1].line.length - 1], [portalPlace('forest').x, portalPlace('forest').z]];
  line(groveIn);
  g.stroke();
  g.setLineDash([]);
  const edge = look.box === 'token' ? 0.35 : 0.5;
  for (const road of roadLines) {
    line(road.line);
    g.strokeStyle = look.roadEdge;
    g.lineWidth = (road.width + edge) * metre;
    g.stroke();
  }
  g.beginPath();
  g.arc(...at(0, 0), SQUARE_EDGE * metre + (edge / 2) * metre, 0, Math.PI * 2);
  g.fillStyle = look.roadEdge;
  if (look.box !== 'ink') g.fill();
  for (const road of roadLines) {
    line(road.line);
    g.strokeStyle = look.road;
    g.lineWidth = road.width * metre;
    g.stroke();
  }
  g.beginPath();
  g.arc(...at(0, 0), SQUARE_EDGE * metre, 0, Math.PI * 2);
  g.fillStyle = look.road;
  g.fill();
  if (look.box === 'ink') {
    g.strokeStyle = look.inkSoft;
    g.lineWidth = Math.max(1, metre * 0.12);
    g.stroke();
  }
  drawBuildings(g, at, metre, look);
  drawPalisade(g, at, metre, fence, look);
  for (const id of BIOME_IDS) drawWay(g, at, metre, id, look);
  look.frame?.(g, w, h, metre);
  look.compass(g, w - metre * look.compassAt.in, h - metre * look.compassAt.in, metre * look.compassAt.size);
  look.title(g, w, h, metre);
  g.restore();
}

type At = (x: number, z: number) => Spot;

/** A box's outline (half sides hx, hz round (x, z), turned `turn` about y) as the current path. */
function boxPath(g: CanvasRenderingContext2D, at: At, x: number, z: number, hx: number, hz: number, turn: number): void {
  const c = Math.cos(turn), s = Math.sin(turn);
  const corner = (u: number, v: number): Spot => at(x + u * c + v * s, z - u * s + v * c);
  g.beginPath();
  [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].forEach(([u, v], i) => (i ? g.lineTo(...corner(u, v)) : g.moveTo(...corner(u, v))));
  g.closePath();
}

/** A box (half sides hx, hz round (x, z), turned `turn` about y) filled and edged as the look draws one: inked flat,
 *  hatched in ink, a raised token with a gold edge, or a wash with a pencil line. `edged` false leaves its edge off. */
function drawBox(g: CanvasRenderingContext2D, at: At, x: number, z: number, hx: number, hz: number, turn: number, fill: string,
  look: Look, edged = true, ink = look.ink, width = 1.5): void {
  const metre = Math.hypot(...sub(at(1, 0), at(0, 0)));
  if (look.box === 'token' && edged) {
    // its shadow cast on the table
    g.save();
    g.translate(metre * 0.22, metre * 0.3);
    boxPath(g, at, x, z, hx, hz, turn);
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fill();
    g.restore();
  }
  boxPath(g, at, x, z, hx, hz, turn);
  if (look.box === 'wash') {
    g.save();
    g.globalAlpha = 0.85;
    g.fillStyle = fill;
    g.fill();
    g.translate(metre * 0.12, metre * 0.1);
    g.globalAlpha = 0.35;
    g.fill();
    g.restore();
    boxPath(g, at, x, z, hx, hz, turn);
  } else {
    g.fillStyle = fill;
    g.fill();
  }
  if (!edged) return;
  if (look.box === 'hatch') {
    // hatched across in ink, as an engraver shades
    g.save();
    g.clip();
    const [cx, cy] = at(x, z), reach = (Math.max(hx, hz) + 1) * metre * 1.5;
    g.strokeStyle = 'rgba(59, 38, 21, 0.28)';
    g.lineWidth = Math.max(0.8, metre * 0.06);
    g.beginPath();
    for (let o = -reach; o <= reach; o += metre * 0.45) {
      g.moveTo(cx + o - reach, cy + reach);
      g.lineTo(cx + o + reach, cy - reach);
    }
    g.stroke();
    g.restore();
    boxPath(g, at, x, z, hx, hz, turn);
  }
  g.strokeStyle = look.box === 'wash' ? look.inkSoft : ink;
  g.lineWidth = look.box === 'wash' ? Math.max(1, metre * 0.06) : look.box === 'token' ? Math.max(1, metre * 0.1) : width;
  g.stroke();
}

const sub = (a: Spot, b: Spot): Spot => [a[0] - b[0], a[1] - b[1]];

/** A roof (half sides hx, hz round (x, z), turned `turn`), its ridge along its hx: one flat box, or two pitches in the
 *  look's light and shade either side of the ridge, and the ridge drawn. */
function drawRoof(g: CanvasRenderingContext2D, at: At, metre: number, x: number, z: number, hx: number, hz: number,
  turn: number, lit: string, shade: string, look: Look): void {
  const c = Math.cos(turn), s = Math.sin(turn);
  const r0 = at(x - hx * c, z + hx * s), r1 = at(x + hx * c, z - hx * s);
  if (!look.pitched) {
    drawBox(g, at, x, z, hx, hz, turn, lit, look);
  } else {
    if (look.box === 'token') drawBox(g, at, x, z, hx, hz, turn, lit, look);
    for (const side of [-1, 1]) {
      const v = side * hz / 2;
      drawBox(g, at, x + v * s, z + v * c, hx, hz / 2, turn, side > 0 ? shade : lit, look, look.box !== 'token');
    }
    if (look.box === 'hatch') {
      // the shaded pitch hatched again across, darker
      drawBox(g, at, x + (hz / 2) * s, z + (hz / 2) * c, hx, hz / 2, turn, 'rgba(59, 38, 21, 0.12)', look);
    }
    if (look.box === 'token') boxPath(g, at, x, z, hx, hz, turn), g.strokeStyle = look.ink, g.stroke();
  }
  g.beginPath();
  g.moveTo(...r0);
  g.lineTo(...r1);
  g.strokeStyle = look.box === 'token' ? look.ink : look.box === 'ink' ? look.inkSoft : look.ink;
  g.lineWidth = look.box === 'ink' ? 1.2 : Math.max(1, metre * 0.1);
  g.stroke();
}

/** The hall's terrace and its plinths, the cottages and sheds, the yard, the fountain, the
 *  campfire and the notice board. */
function drawBuildings(g: CanvasRenderingContext2D, at: At, metre: number, look: Look): void {
  const X = TERRACE.x;
  drawBox(g, at, X, (TERRACE.front + TERRACE.back) / 2, TERRACE.half, (TERRACE.front - TERRACE.back) / 2, 0, look.stone, look);
  drawBox(g, at, X, (TERRACE.stairFoot + TERRACE.front) / 2, TERRACE.stairHalf, (TERRACE.front - TERRACE.stairFoot) / 2, 0,
    look.stone, look, true, look.inkSoft);
  if (look.box !== 'ink') {
    // the stair's treads
    g.strokeStyle = look.inkSoft;
    g.lineWidth = Math.max(1, metre * 0.06);
    g.beginPath();
    for (let zz = TERRACE.stairFoot - 0.4; zz > TERRACE.front; zz -= 0.6) {
      g.moveTo(...at(X - TERRACE.stairHalf, zz));
      g.lineTo(...at(X + TERRACE.stairHalf, zz));
    }
    g.stroke();
  }
  // (the hall a roofed building: its slate roof from the back wall to past the colonnade, its ridge front to back)
  const back = HALL.wall - HALL_ROOF.back, front = HALL_ROOF.front;
  if (look.pitched) {
    drawRoof(g, at, metre, X, (front + back) / 2, (front - back) / 2, HALL_ROOF.half, Math.PI / 2, look.slate, look.slateShade, look);
  } else {
    drawBox(g, at, X, (front + back) / 2, HALL_ROOF.half, (front - back) / 2, 0, look.darkStone, look);
    g.beginPath();
    g.moveTo(...at(X, back));
    g.lineTo(...at(X, front));
    g.strokeStyle = 'rgba(234, 217, 180, 0.6)';
    g.lineWidth = Math.max(1, metre * 0.12);
    g.stroke();
  }
  for (const c of COTTAGES) {
    const hx = (COTTAGE.w / 2 + COTTAGE.eave) * c.size, hz = (COTTAGE.d / 2 + COTTAGE.eave) * c.size;
    drawRoof(g, at, metre, c.x, c.z, hx, hz, c.facing, look.roof, look.roofShade, look);
  }
  // the yard: a fence round trodden ground, its dummies crosses
  drawBox(g, at, YARD.x, YARD.z, YARD.halfX, YARD.halfZ, YARD.turn, look.sand, look, false);
  const { halfX, halfZ, gate, gateAt } = YARD;
  // (its fence round from one gatepost to the other, the gate left open)
  const fence: Spot[] = [[gateAt + gate, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ], [-halfX, -halfZ],
    [gateAt - gate, -halfZ]];
  g.setLineDash([metre * 0.6, metre * 0.3]);
  g.beginPath();
  fence.forEach(([fx, fz], i) => (i ? g.lineTo(...at(...yardToWorld(fx, fz))) : g.moveTo(...at(...yardToWorld(fx, fz)))));
  g.strokeStyle = look.yardFence;
  g.lineWidth = Math.max(1.5, metre * 0.15);
  g.stroke();
  g.setLineDash([]);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(...at(...yardToWorld(gateAt + s * gate, -halfZ)), metre * 0.22, 0, Math.PI * 2);
    g.fillStyle = look.yardFence;
    g.fill();
  }
  for (const [dx, dz] of [[-3, 1.7], [0, 2.9], [3, 1.7]]) {
    const [x, y] = at(...yardToWorld(dx, dz));
    const s = metre * 0.45;
    g.beginPath();
    g.moveTo(x - s, y - s); g.lineTo(x + s, y + s);
    g.moveTo(x + s, y - s); g.lineTo(x - s, y + s);
    g.strokeStyle = look.ink;
    g.lineWidth = Math.max(1.5, metre * 0.12);
    g.stroke();
  }
  // (its name is a button over the sheet, as the objects' are: a place to walk to)
  // the fountain (its basin, its upper bowl), the campfire, the notice board
  for (const [radius, fill] of [[FOUNTAIN.r, look.water], [0.85, look.waterLight]] as const) {
    g.beginPath();
    g.arc(...at(0, 0), radius * metre, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = look.box === 'wash' ? look.inkSoft : look.ink;
    g.lineWidth = look.box === 'token' ? Math.max(1.5, metre * 0.15) : 1.5;
    g.stroke();
  }
  if (look.box !== 'ink') {
    // its water's ripples
    g.strokeStyle = look.box === 'token' ? 'rgba(216, 180, 106, 0.4)' : 'rgba(255, 255, 255, 0.45)';
    g.lineWidth = Math.max(1, metre * 0.05);
    for (const rr of [1.4, 1.95]) {
      g.beginPath();
      g.arc(...at(0, 0), rr * metre, -0.6, 1.4);
      g.stroke();
    }
  }
  drawCampfire(g, ...at(CAMPFIRE[0], CAMPFIRE[1]), metre, look);
  drawBox(g, at, NOTICE.x, NOTICE.z, 1, 0.15, NOTICE.facing, look.notice, look);
}

/** The campfire as a map draws one: a ring of stones round two crossed logs, a flame rising over them. */
function drawCampfire(g: CanvasRenderingContext2D, x: number, y: number, metre: number, look: Look): void {
  const ring = metre * 1.15;
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2;
    g.beginPath();
    g.arc(x + Math.cos(a) * ring, y + Math.sin(a) * ring, metre * 0.3, 0, Math.PI * 2);
    g.fillStyle = look.stone;
    g.fill();
    g.strokeStyle = look.box === 'wash' ? look.inkSoft : look.ink;
    g.lineWidth = 1;
    g.stroke();
  }
  g.lineCap = 'round';
  for (const turn of [0.6, -0.6]) {
    const dx = Math.cos(turn) * metre * 0.8, dy = Math.sin(turn) * metre * 0.8;
    g.beginPath();
    g.moveTo(x - dx, y - dy);
    g.lineTo(x + dx, y + dy);
    g.strokeStyle = look.box === 'token' ? '#140c08' : look.ink;
    g.lineWidth = metre * 0.42;
    g.stroke();
    g.strokeStyle = look.log;
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
  if (look.box === 'token') {
    // (a glow round it on the dark table)
    const glow = g.createRadialGradient(x, y, 0, x, y, metre * 3);
    glow.addColorStop(0, 'rgba(255, 150, 60, 0.35)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    g.fillStyle = glow;
    g.fillRect(x - metre * 3, y - metre * 3, metre * 6, metre * 6);
  }
  flame(metre * 1.3, metre * 0.62, '#d9541e');
  g.strokeStyle = look.box === 'wash' ? look.inkSoft : look.box === 'token' ? '#3a1408' : look.ink;
  g.lineWidth = 1;
  g.stroke();
  flame(metre * 0.75, metre * 0.32, '#f6c04a');
}

/** The palisade: its line drawn thick, a stake across it every metre or so, open at the ways out. */
function drawPalisade(g: CanvasRenderingContext2D, at: At, metre: number, fence: readonly Spot[], look: Look): void {
  g.strokeStyle = look.palisade;
  g.lineCap = 'round';
  if (look.box === 'token') {
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.7)';
    g.shadowBlur = metre * 0.4;
  }
  for (let i = 0; i < fence.length; i++) {
    const [ax, az] = fence[i], [bx, bz] = fence[(i + 1) % fence.length];
    if (fromGap(ax, az) < GAP_HALF || fromGap(bx, bz) < GAP_HALF) continue;
    g.beginPath();
    g.moveTo(...at(ax, az));
    g.lineTo(...at(bx, bz));
    g.lineWidth = Math.max(2, metre * (look.box === 'token' ? 0.25 : 0.35));
    g.stroke();
    // (a stake across it)
    const len = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / len, nz = (bx - ax) / len;
    g.beginPath();
    g.moveTo(...at(ax + nx * 0.45, az + nz * 0.45));
    g.lineTo(...at(ax - nx * 0.45, az - nz * 0.45));
    g.lineWidth = Math.max(1, metre * 0.12);
    g.stroke();
  }
  if (look.box === 'token') g.restore();
}

/** A way out: the crypt's court and tomb in stone, or the grove's path; its portal a swirl in its colour. */
function drawWay(g: CanvasRenderingContext2D, at: At, metre: number, id: BiomeId, look: Look): void {
  const { gap, out } = ENTRANCES[id];
  const turn = Math.atan2(-out[0], -out[1]);
  const along = (o: number): Spot => [gap[0] + out[0] * o, gap[1] + out[1] * o];
  if (id === 'crypt') {
    // its court, the stair up, the mausoleum's podium and its pitched roof, a ridge down its middle
    const front = PODIUM.front, run = front - TOMB.stairFoot, from = front - 0.2, to = TOMB.back + 0.5;
    drawBox(g, at, ...along(front / 2), GAP_HALF - 0.3, front / 2, turn, look.courtStone, look, true, look.inkSoft);
    drawBox(g, at, ...along(TOMB.stairFoot + run / 2), 2.7, run / 2, turn, look.stone, look, true, look.inkSoft);
    drawBox(g, at, ...along((front + TOMB.back + 0.7) / 2), TOMB.w / 2 + 0.7, (TOMB.back + 0.7 - front) / 2, turn, look.stone, look);
    if (look.pitched) {
      const [mx, mz] = along((from + to) / 2);
      drawRoof(g, at, metre, mx, mz, (to - from) / 2, TOMB.w / 2 + 0.6, turn + Math.PI / 2, look.slate, look.slateShade, look);
    } else {
      drawBox(g, at, ...along((from + to) / 2), TOMB.w / 2 + 0.6, (to - from) / 2, turn, look.darkStone, look);
      g.beginPath();
      g.moveTo(...at(...along(from)));
      g.lineTo(...at(...along(to)));
      g.strokeStyle = look.stone;
      g.lineWidth = Math.max(1.5, metre * 0.25);
      g.stroke();
    }
  } else {
    drawBox(g, at, ...along(WAY.forest.out / 2), WAY.forest.half - 0.6, WAY.forest.out / 2, turn, look.forestWay, look, false);
  }
  const p = portalPlace(id);
  const [x, y] = at(p.x, p.z);
  const r = metre * 1.9;
  const swirl = g.createRadialGradient(x, y, 0, x, y, r);
  swirl.addColorStop(0, '#ffffff');
  swirl.addColorStop(0.35, look.portal[id]);
  swirl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = swirl;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = look.portal[id];
  g.lineWidth = Math.max(1.5, metre * 0.18);
  g.beginPath();
  for (let k = 0; k < 40; k++) {
    const a = k * 0.45, rr = r * 0.9 * (k / 40);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
}
