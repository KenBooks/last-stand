// tools/lab hood: the mage's hood against its reference, by numbers. Tuned by eye from pictures in the forest, one
// change to its cut reshaped the whole of it (a deeper face opening buckled the capelet, a wider dome turned the back
// to a blob) and four reviews in a row failed it. Here it's read two ways:
// - its outline in the studio from the front, his left and the back, laid over the reference's (its figure cut from
//   its plain backdrop), both on one grid in the face's own unit (the eye line to the chin, `E`, from marks on the
//   reference and the head's anatomy on ours): how much of the two outlines is shared, how high the hood stands over
//   the eyes and how wide or deep it is at the crown, the temples, the chin, the nape, the neck and the shoulders, its
//   fullness held to the reference's at the chin (from his left how far behind it hangs, and at the nape; from the
//   back how wide), and from his left how far its back comes in under its slack behind the head before the capelet
//   and how far it reaches ahead of his body below the chin (its outline beside his own with it hidden);
// - its shape on the head, from its cloth, against the sizes the reference was made to (its modelling notes): how far
//   its rim stands ahead of the brow and of the cheeks and out from the cheeks, how far its point rises above the
//   scalp and how far its capelet falls below the nape; and how much it changes shape as he walks;
// - its opening round the face from the front and his left (`hoodOpening.ts`): where its rim runs, how much of the
//   face it shows;
// - how its capelet lies on him (`hoodLie.ts`): how far it stands off his front, his shoulders and his back, and how
//   deep his body comes through the hood above it;
// - what its cloth costs a frame as he stands and walks (`HoodCloth.update`, by the browser's own clock).
import * as THREE from 'three';
import type { Lab, Fixture, Report, Pictured, Tile } from './lab';
import { cameraOn, shoot, studio, type Shot } from './studio';
import { toGroup } from '../../../src/entities/models/head';
import { EYE } from '../../../src/entities/models/face';
import { HoodCloth } from '../../../src/entities/models/hood';
import {
  deepestOf, hoodThroughCanary, hoodThroughLine, hoodThroughOf, lieCanary, lieLines, lieOf, lieRows, walkingLine,
  type CapeletMesh, type Deepest,
} from './hoodLie';
import {
  aheadAt, halfWidthAt, isSkinMesh, maskOf, onTile, openingLines, ourOpening, referenceOpening, rimDots, shownAt,
  type FaceMarks, type Figure, type Mask, type Opening, type OpeningView,
} from './hoodOpening';
import { timeCalls, type CallTimes } from './timing';

/** A reference picture and where its face is on it (shares of the picture across and down). */
export interface HoodReference {
  url: string;
  eyes: [number, number];
  chin: [number, number];
}

export interface HoodOptions {
  fixture: Fixture;
  /** the reference's pictures from the front, his left and the back, each with its marks */
  reference?: Partial<Record<ViewName, HoodReference>>;
  /** the sizes the reference was made to (cm, the least and the most), where its marks give them */
  sizes?: Partial<Record<Size, [number, number]>>;
  /** plant the faults the measures must catch: the hood narrowed, moved forward, made shallower front to back, its
   *  back pressed in under the nape */
  canary?: boolean;
  /** list each view's outline every `EDGES_STEP` down the window, ours beside the reference's */
  edges?: boolean;
  /** list how the capelet lies on him row by row */
  rows?: boolean;
}

type ViewName = 'front' | 'left' | 'back';

/** The sides the hood is read from: the camera's way from him (he faces +z, his left +x). His left: the reference's
 *  profile faces the picture's left, as he does seen from there. */
const VIEWS: { name: ViewName; from: THREE.Vector3Tuple }[] = [
  { name: 'front', from: [0, 0, 1] },
  { name: 'left', from: [1, 0, 0] },
  { name: 'back', from: [0, 0, -1] },
];

/** the grid the outlines are read on, in `E` from the eyes (across, + to the picture's right; up, + up) and its cell */
const WINDOW = { left: -3.2, right: 3.2, top: 2.0, bottom: -2.6, cell: 0.05 };
/** the heights the outline's width (or, from the side, its reach ahead and behind) is read at, in `E` over the eyes */
const LEVELS = [
  { name: 'crown', up: 1.2 },
  { name: 'temples', up: 0.4 },
  { name: 'chin', up: -1.0 },
  { name: 'nape', up: -1.3 },
  { name: 'neck', up: -1.6 },
  { name: 'shoulders', up: -2.2 },
];
/** how far apart the heights `--edges` lists are (`E`) */
const EDGES_STEP = 0.2;
/** the heights the hood's fullness is held to the reference's at from his left and the back (`LEVELS`' names), and
 *  how far ours may stray from it there (`E`): from his left how far it reaches behind the eyes, from the back how
 *  wide it is. (Pulled in to the neck, it read as a shell where the reference's cloth hangs loose behind the head and
 *  gathers at the nape: "do you see bagginess in the ref? where is ours?"; cut wider and deeper than the reference's,
 *  it read as a sack.) Below the nape it's the capelet's: the reference's stands out behind the shoulder blades and
 *  over the shoulders in a ledge, ours lies on his back, read at the neck and the shoulders but not held */
const FULL_LEVELS: Record<'left' | 'back', string[]> = { left: ['chin', 'nape'], back: ['chin'] };
const FULL_SLACK = 0.1;
/** the heights the waist under the hood's slack behind the head is read over from his left (`E` over the eyes: from
 *  the eyes down to the shoulders), and how much deeper than the reference's ours may be (`E`). (Its slack hung lowest
 *  at the nape and was pulled in under it to the join with the capelet lying on his back: from the side a lump with a
 *  waist under it, "why do we have the bulge ? its not there in ref"; the reference's falls from behind the head in
 *  one line into its capelet) */
const WAIST = { top: 0, bottom: -2.2 };
const WAIST_SLACK = 0.1;
/** the heights the hood's reach ahead of his body is read over from his left (`E` over the eyes: from under the chin
 *  down past the capelet's hem), and the most it may reach ahead of him there (`E`: 0.1, 1.2 cm, its front edge's own
 *  thickness, rolled and piped, as the reference's is, lying on his chest; 0.2 the shape the owner kept, 0.15, #711). (What puffed out over the fronts of his
 *  shoulders, "reference does not overhang over shoulder, ours does", lay inside his outline from the side: the
 *  capelet's lie over them, `hoodLie.ts`, reads it) */
const OVERHANG = { top: -1.4, bottom: -2.6, most: 0.2 };
/** what the camera frames round the head's joint (m): across, below it (the capelet, the shoulders), above it, and its
 *  lens (degrees): at the studio's 20°, from 2.2 m, the hood's back, 20 cm nearer the camera than the eyes the scale
 *  is set at, read 10% wider than it is (from 7 m, 3%) */
const FRAME = { across: 0.3, below: 0.32, above: 0.3 };
const LENS = 6;
/** how far a reference's pixel may be from its backdrop's colour and still count as backdrop (0-255 a channel) */
const BACKDROP_SLACK = 24;
/** a reference's backdrop is read from its rows down to here (a share of it): below, the figure reaches its sides */
const BACKDROP_ROWS = 0.55;
/**
 * The hood's sizes on the head (cm), the least and the most, where a reference's marks give none of their own
 * (`sizes`): the hood as the owner kept it (2026-11-19, #711), each within a centimetre or two of its own, so a change
 * to its cut is caught. The first reference's modelling notes asked for a rim 6 to 8 cm ahead of the brow, -4 to 0
 * ahead of the cheeks and 7 to 11 out from them, and a point 5 to 7 above the scalp; the rim was laid back from the
 * reference's place on the owner's word (it stood out over his flatter brow, a visor: "do you see hood overhang in
 * our case?"), and asked whether the shape or these should move, the owner kept the shape. They are the sizes the
 * owner's reference's marks give (`.tmp/references/hood/chatgpt/hood.marks.json`, `--ref`): the audit ran without
 * them, against the first reference's. The capelet below the nape is still the reference's.
 */
const SIZES = {
  brim: { least: 1.5, most: 3.5, what: 'the rim ahead of the brow' },
  cheeks: { least: -6.5, most: -4.5, what: 'the rim ahead of the cheeks' },
  clear: { least: 3.5, most: 5.5, what: 'the rim out from the cheeks' },
  rise: { least: 3, most: 4.5, what: 'the point above the scalp' },
  fall: { least: 16, most: 18, what: 'the capelet below the nape' },
};
type Size = keyof typeof SIZES;
/** the most the hood's top half may change shape from its standing one as he walks (cm): a tip flipping, or the dome
 *  trailing the head as he runs (7 cm, carried as the capelet is) */
const MOST_SWAY = 4;
const STAND_FRAMES = 60;
const WALK_FRAMES = 120;
/** with --canary: how much narrower the hood is made, and how much the measures must read it so (cm, `E` at the
 *  temples, `E` either side of the opening at the eyes) */
const CANARY_NARROW = 0.7;
const CANARY_LEAST_CLEAR = 1;
const CANARY_LEAST_TEMPLES = 0.2;
const CANARY_LEAST_OPENING = 0.15;
/** with --canary: how far forward the hood is moved (cm), and how much further ahead the measure must read its rim at
 *  the eyes from his left (`E`), how much less of the face shown ahead of it there (`E`) and of the face shown in all
 *  (a share), and how much further ahead of his body below the chin (`E`) */
const CANARY_FORWARD = 2;
const CANARY_LEAST_AHEAD = 0.12;
const CANARY_LEAST_OVERHANG = 0.12;
const CANARY_LEAST_HIDDEN = 0.1;
/** with --canary: how much shallower front to back the hood is made, and how much less far behind the eyes the
 *  measure must read it reach at the chin from his left (`E`); and how much narrower from the back at the neck it must
 *  read the narrowed hood (`E`) */
const CANARY_SHALLOW = 0.8;
const CANARY_LEAST_SHALLOWER = 0.15;
const CANARY_LEAST_NECK = 0.2;
/** with --canary: how far the hood's back is pressed in toward him under the nape (cm; from `DENT.top` down to
 *  `DENT.bottom` E over the eyes, more than `DENT.behind` E behind them), and how much deeper the measure must read
 *  the waist under its slack (`E`) */
const CANARY_DENT = 3;
const DENT = { top: -1.3, bottom: -1.9, behind: 1.2 };
const CANARY_LEAST_WAIST = 0.1;

/** An outline on the grid: a cell a value, true where the figure covers it, row by row from the top. */
interface Outline {
  across: number;
  down: number;
  cells: boolean[];
}

/** The hood's cloth: its outside's mesh and its grid (`HoodCloth`'s `userData.grid`: its columns and rows, and how far
 *  down it each row is, 0 to 1), and the row its capelet begins on if it says. */
interface HoodMesh {
  mesh: THREE.Mesh;
  across: number;
  down: number;
  rows: number[];
  capelet?: number;
}

function gridSize(): { across: number; down: number } {
  const across = Math.round((WINDOW.right - WINDOW.left) / WINDOW.cell);
  const down = Math.round((WINDOW.top - WINDOW.bottom) / WINDOW.cell);
  return { across, down };
}

/** The cell's middle in `E` from the eyes. */
function cellAt(i: number, j: number): { across: number; up: number } {
  return { across: WINDOW.left + (i + 0.5) * WINDOW.cell, up: WINDOW.top - (j + 0.5) * WINDOW.cell };
}

/** An outline read off a picture's `covered` pixels, the face where `marks` say. */
function outlineOf(covered: (x: number, y: number) => boolean, marks: FaceMarks): Outline {
  const { across, down } = gridSize();
  const cells: boolean[] = [];
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < across; i++) {
      const at = cellAt(i, j);
      const x = Math.round(marks.eyes.x + at.across * marks.unit);
      const y = Math.round(marks.eyes.y - at.up * marks.unit);
      cells.push(covered(x, y));
    }
  }
  return { across, down, cells };
}

/** The share of the two outlines' cells that both cover, of those either covers. */
function overlap(ours: Outline, theirs: Outline): number {
  let both = 0;
  let either = 0;
  for (let k = 0; k < ours.cells.length; k++) {
    if (ours.cells[k] && theirs.cells[k]) both++;
    if (ours.cells[k] || theirs.cells[k]) either++;
  }
  return either ? both / either : 0;
}

/** How far the outline reaches across at a height (`E` from the eyes), or null where it covers none of that row. */
function reachAt(outline: Outline, up: number): { from: number; to: number } | null {
  const j = Math.round((WINDOW.top - up) / WINDOW.cell - 0.5);
  let from = Infinity;
  let to = -Infinity;
  for (let i = 0; i < outline.across; i++) {
    if (!outline.cells[j * outline.across + i]) continue;
    const at = cellAt(i, j).across;
    from = Math.min(from, at - WINDOW.cell / 2);
    to = Math.max(to, at + WINDOW.cell / 2);
  }
  return from === Infinity ? null : { from, to };
}

/** How high the outline reaches over the eyes (`E`). */
function topOf(outline: Outline): number {
  for (let j = 0; j < outline.down; j++) {
    for (let i = 0; i < outline.across; i++) {
      if (outline.cells[j * outline.across + i]) return cellAt(i, j).up + WINDOW.cell / 2;
    }
  }
  return -Infinity;
}

/** The outline's readings at `LEVELS`, as a line: widths from the front and the back, reach ahead and behind from
 *  the side (the face is to the picture's left from his left). */
function readings(outline: Outline, view: ViewName): string {
  const parts = LEVELS.map((level) => {
    const reach = reachAt(outline, level.up);
    if (!reach) return `${level.name} -`;
    if (view !== 'left') return `${level.name} ${(reach.to - reach.from).toFixed(2)}`;
    return `${level.name} ${(-reach.from).toFixed(2)} ahead, ${reach.to.toFixed(2)} behind`;
  });
  return `top ${topOf(outline).toFixed(2)}; ${parts.join('; ')}`;
}

/** The outlines' edges every `EDGES_STEP` down the window, ours beside the reference's (`E` from the eyes: from the
 *  front and the back, its left and right edges on the picture; from the side, its reach ahead and behind). */
function edgeLines(ours: Outline, theirs: Outline | null, view: ViewName): string[] {
  const edges = (outline: Outline | null, up: number): string => {
    const reach = outline ? reachAt(outline, up) : null;
    if (!reach) return '-'.padStart(11);
    const [first, second] = view === 'left' ? [-reach.from, reach.to] : [reach.from, reach.to];
    return `${first.toFixed(2)} ${second.toFixed(2)}`.padStart(11);
  };
  const what = view === 'left' ? 'ahead, behind' : 'left, right';
  const lines = [`  every ${EDGES_STEP} E down (${what}): ours | the reference's`];
  for (let step = 1; WINDOW.top - step * EDGES_STEP > WINDOW.bottom; step++) {
    const up = WINDOW.top - step * EDGES_STEP;
    lines.push(`  ${up.toFixed(1).padStart(5)}: ${edges(ours, up)} | ${edges(theirs, up)}`);
  }
  return lines;
}

/** An image from a data URL, its pixels readable. */
async function pixelsOf(url: string): Promise<ImageData> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** A reference's figure: each pixel that isn't its backdrop, the backdrop's colour read row by row off its two sides
 *  (it's shaded down the picture) down to `BACKDROP_ROWS`, and the last of those below. */
function figureOf(image: ImageData): Figure {
  const { width, height, data } = image;
  const backdropRow = (y: number) => {
    const row = Math.min(y, Math.floor(height * BACKDROP_ROWS));
    const colour = [0, 0, 0];
    for (const x of [2, 3, 4, width - 5, width - 4, width - 3]) {
      for (let c = 0; c < 3; c++) colour[c] += data[(row * width + x) * 4 + c] / 6;
    }
    return colour;
  };
  return (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const backdrop = backdropRow(y);
    let off = 0;
    for (let c = 0; c < 3; c++) off = Math.max(off, Math.abs(data[(y * width + x) * 4 + c] - backdrop[c]));
    return off > BACKDROP_SLACK;
  };
}

/** A reference read: its pixels, its figure, where its face is, and its outline. */
interface ReferenceRead {
  image: ImageData;
  figure: Figure;
  marks: FaceMarks;
  outline: Outline;
}

/** The reference's outline from its marks. */
async function referenceOutline(reference: HoodReference): Promise<ReferenceRead> {
  const image = await pixelsOf(reference.url);
  const eyes = new THREE.Vector2(reference.eyes[0] * image.width, reference.eyes[1] * image.height);
  const unit = (reference.chin[1] - reference.eyes[1]) * image.height;
  const figure = figureOf(image);
  const marks = { eyes, unit };
  return { image, figure, marks, outline: outlineOf(figure, marks) };
}

/** The head's group (where the face's anatomy is placed, `toGroup`) and its face. */
function headOf(lab: Lab): { group: THREE.Object3D; face: THREE.Mesh } {
  const face = lab.model.root.getObjectByName('face') as THREE.Mesh | undefined;
  if (!face?.parent) throw new Error('lab: hood: the hero has no face');
  return { group: face.parent, face };
}

/** The hood's outside, or a throw: the hero wears none. */
function hoodOf(lab: Lab): HoodMesh {
  let found: HoodMesh | undefined;
  lab.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry.name === 'hood' && mesh.visible) {
      const grid = mesh.geometry.userData.grid as { across: number; down: number; rows: number[]; capelet?: number };
      found = { mesh, across: grid.across, down: grid.down, rows: grid.rows, capelet: grid.capelet };
    }
  });
  if (!found) throw new Error('lab: hood: the hero wears no hood (--wear helm)');
  return found;
}

/** The hood's points in the head group's space (m). */
function hoodPoints(hood: HoodMesh, group: THREE.Object3D): THREE.Vector3[] {
  const toHead = new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(hood.mesh.matrixWorld);
  const at = hood.mesh.geometry.attributes.position;
  const points: THREE.Vector3[] = [];
  for (let k = 0; k < at.count; k++) points.push(new THREE.Vector3().fromBufferAttribute(at, k).applyMatrix4(toHead));
  return points;
}

/** The face's skin points (the head group's space, m). */
function skinPoints(face: THREE.Mesh): THREE.Vector3[] {
  const at = face.geometry.attributes.position;
  const points: THREE.Vector3[] = [];
  for (let k = 0; k < at.count; k++) points.push(new THREE.Vector3().fromBufferAttribute(at, k));
  return points;
}

/** The hood's shape on the head (cm), as the reference's modelling notes size it. */
function sizesOf(lab: Lab): Record<Size, number> {
  const { group, face } = headOf(lab);
  const hood = hoodOf(lab);
  const cloth = hoodPoints(hood, group);
  const skin = skinPoints(face);
  const brow = toGroup(0, EYE.y + 15, 0).y;
  const cheek = toGroup(0, EYE.y - 25, 0).y;
  const chin = toGroup(0, 0, 0).y;
  const near = (y: number, band: number) => (p: THREE.Vector3) => Math.abs(p.y - y) < band;
  // (the rim: the face's edge on each side, the fine grid's first and last columns, above the chin)
  const rim: THREE.Vector3[] = [];
  for (let row = 0; row < hood.down; row++) {
    for (const column of [0, hood.across - 1]) {
      const p = cloth[row * hood.across + column];
      if (p.y > chin) rim.push(p);
    }
  }
  const most = (points: THREE.Vector3[], of: (p: THREE.Vector3) => number) => Math.max(...points.map(of));
  const least = (points: THREE.Vector3[], of: (p: THREE.Vector3) => number) => Math.min(...points.map(of));
  const browSkin = skin.filter((p) => near(brow, 0.008)(p) && Math.abs(p.x) < 0.02);
  const cheekSkin = skin.filter(near(cheek, 0.008));
  const cheekWide = most(cheekSkin, (p) => Math.abs(p.x));
  const cheekFront = most(cheekSkin.filter((p) => Math.abs(p.x) > cheekWide * 0.6), (p) => p.z);
  const rimAtCheek = rim.filter(near(cheek, 0.015));
  const rimAtBrow = rim.filter((p) => p.y > brow && Math.abs(p.x) < 0.04);
  const behind = cloth.filter((p) => p.z < 0 && Math.abs(p.x) < 0.05);
  const nape = least(skin.filter((p) => p.z < -0.02), (p) => p.y);
  if (!browSkin.length || !cheekSkin.length || !rimAtCheek.length || !rimAtBrow.length || !behind.length) {
    throw new Error('lab: hood: the face\'s brow and cheeks or the rim at them weren\'t found');
  }
  const cm = (m: number) => m * 100;
  return {
    brim: cm(most(rimAtBrow, (p) => p.z) - most(browSkin, (p) => p.z)),
    cheeks: cm(most(rimAtCheek, (p) => p.z) - cheekFront),
    clear: cm(least(rimAtCheek, (p) => Math.abs(p.x)) - cheekWide),
    rise: cm(most(cloth, (p) => p.y) - most(skin, (p) => p.y)),
    fall: cm(nape - least(behind, (p) => p.y)),
  };
}

/** the heights the head's width is read at, in `E` over the eyes (its crown, its temples, the eyes, its cheeks), and
 *  how far round each a skin point may be and count */
const HEAD_LEVELS = [0.8, 0.4, 0, -0.4];
const HEAD_BAND = 0.05;
/** the brow's height (`E` over the eyes: `sizesOf`'s, 15 mm) and how far from the middle its skin is read (m) */
const BROW_UP = 15 / EYE.y;
const BROW_ACROSS = 0.02;

/** The head the hood is laid round, in `E` from the eyes as the outlines are read: how high its scalp rises, how far
 *  its brow stands ahead of the eyes and its skull's back behind them, and how wide it is at each `HEAD_LEVELS`. */
function headLine(lab: Lab): string {
  const skin = skinPoints(headOf(lab).face);
  const eyes = toGroup(0, EYE.y, EYE.z);
  const unit = toGroup(0, EYE.y, 0).y - toGroup(0, 0, 0).y;
  const up = (p: THREE.Vector3) => (p.y - eyes.y) / unit;
  const at = (level: number) => skin.filter((p) => Math.abs(up(p) - level) < HEAD_BAND);
  const scalp = Math.max(...skin.map(up));
  const brow = Math.max(...at(BROW_UP).filter((p) => Math.abs(p.x) < BROW_ACROSS).map((p) => p.z));
  const back = Math.min(...skin.map((p) => p.z));
  const sides = HEAD_LEVELS.map((level) => {
    const wide = Math.max(...at(level).map((p) => Math.abs(p.x)));
    return `${level.toFixed(1)}: ${(wide / unit).toFixed(2)}`;
  });
  return `the head under it, E from the eyes: its scalp ${scalp.toFixed(2)} up, its brow `
    + `${((brow - eyes.z) / unit).toFixed(2)} ahead, its skull's back ${((eyes.z - back) / unit).toFixed(2)} behind; `
    + `its half width at each height up, ${sides.join(', ')}`;
}

/** The sizes as a line, and a problem for each outside the reference's (`given`, where its marks give them). */
function sizeLines(sizes: Record<Size, number>, given: HoodOptions['sizes'], problems: string[]): string {
  const parts = (Object.keys(SIZES) as Size[]).map((size) => {
    const { what } = SIZES[size];
    const [least, most] = given?.[size] ?? [SIZES[size].least, SIZES[size].most];
    const read = sizes[size];
    if (read < least || read > most) {
      problems.push(`hood: ${what} ${read.toFixed(1)} cm, the kept shape's ${least} to ${most}`);
    }
    return `${what} ${read.toFixed(1)} (${least}-${most})`;
  });
  return `on the head, cm (the kept shape's): ${parts.join('; ')}`;
}

/** Where the face is in a studio picture of ours (px of the tile `shoot` reads, down from its top). */
function ourMarks(lab: Lab, camera: THREE.Camera, tile: { width: number; height: number }): FaceMarks {
  const { group } = headOf(lab);
  const project = onTile(camera, tile);
  const eyes = project(toGroup(0, EYE.y, EYE.z).applyMatrix4(group.matrixWorld));
  const chin = project(toGroup(0, 0, EYE.z).applyMatrix4(group.matrixWorld));
  return { eyes, unit: chin.y - eyes.y };
}

/** Our figure from `camera`: every mesh of his drawn flat white on black, the staff in his hand hidden (it stands up
 *  through the outline), read back as the tile `shoot` reads. */
function ourFigure(lab: Lab, scene: THREE.Scene, camera: THREE.Camera): Mask {
  return maskOf(lab, scene, camera, () => true, heldThings(lab));
}

/** The rim's two edges (world space), each from the top of the face down: the drawn grid's first and last columns. */
function rimEdges(lab: Lab): THREE.Vector3[][] {
  const hood = hoodOf(lab);
  const at = hood.mesh.geometry.attributes.position;
  const edge = (column: number) => {
    const points: THREE.Vector3[] = [];
    for (let row = 0; row < hood.down; row++) {
      const point = new THREE.Vector3().fromBufferAttribute(at, row * hood.across + column);
      points.push(point.applyMatrix4(hood.mesh.matrixWorld));
    }
    return points;
  };
  return [edge(0), edge(hood.across - 1)];
}

/** Our opening from `camera` as drawn in `scene` (the model in it). */
function ourOpeningFrom(lab: Lab, scene: THREE.Scene, camera: THREE.Camera, view: OpeningView): Opening {
  const skin = maskOf(lab, scene, camera, isSkinMesh, heldThings(lab));
  return ourOpening(rimEdges(lab), camera, skin, ourMarks(lab, camera, skin), view);
}

/** Our opening from `view` now, read in a studio of its own (the canary's, its faults planted). */
function openingNow(lab: Lab, view: OpeningView): Opening {
  const scene = studio();
  const back = intoStudio(lab, scene);
  try {
    const from = VIEWS.find((each) => each.name === view)!.from;
    return ourOpeningFrom(lab, scene, cameraFrom(lab, from), view);
  } finally {
    back();
  }
}

/** What he holds in his hands (the staff, a book): each of a hand joint's children but the hand drawn on it. */
function heldThings(lab: Lab): THREE.Object3D[] {
  const held: THREE.Object3D[] = [];
  for (const hand of [lab.joints.handR, lab.joints.handL]) {
    for (const child of hand.children) {
      let drawnHand = false;
      child.traverse((object) => {
        if (object.userData.drawnHand === true) drawnHand = true;
      });
      if (!drawnHand) held.push(child);
    }
  }
  return held;
}

/** The two outlines laid over each other as a tile: both white, the reference's alone red, ours alone green. */
function overlayTile(ours: Outline, theirs: Outline | null, name: string): Tile {
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = ours.across * scale;
  canvas.height = ours.down * scale;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#202024';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let j = 0; j < ours.down; j++) {
    for (let i = 0; i < ours.across; i++) {
      const k = j * ours.across + i;
      const mine = ours.cells[k];
      const theirsToo = theirs?.cells[k] ?? false;
      if (!mine && !theirsToo) continue;
      context.fillStyle = mine && theirsToo ? '#f0f0f0' : mine ? '#3fd06a' : '#e0404a';
      context.fillRect(i * scale, j * scale, scale, scale);
    }
  }
  // (the eye line and the chin)
  context.fillStyle = '#5fa8ff';
  for (const up of [0, -1]) context.fillRect(0, Math.round((WINDOW.top - up) / WINDOW.cell) * scale, canvas.width, 1);
  return { view: name, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** A picture cut to the grid's window round the face, as a tile the size of the overlay's, with `dots` on it (`E`
 *  from the eyes: across, up; where the opening's rim was read). */
function windowTile(source: CanvasImageSource, marks: FaceMarks, name: string, dots: [number, number][] = []): Tile {
  const { across, down } = gridSize();
  const scale = 4;
  const canvas = document.createElement('canvas');
  canvas.width = across * scale;
  canvas.height = down * scale;
  const context = canvas.getContext('2d')!;
  const sx = marks.eyes.x + WINDOW.left * marks.unit;
  const sy = marks.eyes.y - WINDOW.top * marks.unit;
  const sw = (WINDOW.right - WINDOW.left) * marks.unit;
  const sh = (WINDOW.top - WINDOW.bottom) * marks.unit;
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  context.fillStyle = '#3fe0ff';
  for (const [x, up] of dots) {
    const across = ((x - WINDOW.left) / WINDOW.cell) * scale;
    const down = ((WINDOW.top - up) / WINDOW.cell) * scale;
    context.beginPath();
    context.arc(across, down, 3, 0, Math.PI * 2);
    context.fill();
  }
  return { view: name, png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** An image of a data URL. */
async function imageOf(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** The hero's model taken into `scene` as he stands; `back` puts it back. */
function intoStudio(lab: Lab, scene: THREE.Scene): () => void {
  const root = lab.model.root;
  const parent = root.parent;
  scene.add(root);
  root.updateMatrixWorld(true);
  return () => {
    parent?.add(root);
    root.updateMatrixWorld(true);
  };
}

/** The camera on his head and shoulders from `from`. */
function cameraFrom(lab: Lab, from: THREE.Vector3Tuple): THREE.PerspectiveCamera {
  const head = lab.joints.head.getWorldPosition(new THREE.Vector3());
  const box = new THREE.Box3(
    new THREE.Vector3(head.x - FRAME.across, head.y - FRAME.below, head.z - FRAME.across),
    new THREE.Vector3(head.x + FRAME.across, head.y + FRAME.above, head.z + FRAME.across),
  );
  return cameraOn(box, from, undefined, LENS);
}

/** Our outline from one of `VIEWS` as the hood is now, in a studio of its own (for the canaries). */
function outlineNow(lab: Lab, view: ViewName): Outline {
  const scene = studio();
  const back = intoStudio(lab, scene);
  try {
    const camera = cameraFrom(lab, VIEWS.find((side) => side.name === view)!.from);
    const figure = ourFigure(lab, scene, camera);
    return outlineOf(figure.covered, ourMarks(lab, camera, figure));
  } finally {
    back();
  }
}

/** The height of one of `LEVELS` by its name (`E` over the eyes). */
function levelUp(name: string): number {
  return LEVELS.find((level) => level.name === name)!.up;
}

/** How full the hood hangs at a height (`E`): from his left how far its outline reaches behind the eyes, from the
 *  front and the back how wide it is; null where the outline doesn't reach the height. */
function fullnessAt(outline: Outline, view: ViewName, up: number): number | null {
  const reach = reachAt(outline, up);
  if (!reach) return null;
  return view === 'left' ? reach.to : reach.to - reach.from;
}

/** How far the back's outline from his left comes in under the slack above it (`E`): at each height from `WAIST.top`
 *  down to `WAIST.bottom`, how far its reach behind falls short of the most it reached above. */
function waistOf(outline: Outline): number {
  let most = -Infinity;
  let waist = 0;
  const steps = Math.round((WAIST.top - WAIST.bottom) / EDGES_STEP);
  for (let k = 0; k <= steps; k++) {
    const reach = reachAt(outline, WAIST.top - k * EDGES_STEP);
    if (!reach) continue;
    most = Math.max(most, reach.to);
    waist = Math.max(waist, most - reach.to);
  }
  return waist;
}

/** The waist under the hood's slack from his left as a line, ours beside the reference's, and a problem where ours is
 *  deeper by more than `WAIST_SLACK`: a bulge. */
function waistLine(ours: Outline, theirs: Outline, problems: string[]): string {
  const [mine, reference] = [waistOf(ours), waistOf(theirs)];
  if (mine - reference > WAIST_SLACK) {
    problems.push(`hood: from his left its back comes in ${mine.toFixed(2)} E under its slack behind the head before `
      + `the capelet, the reference's ${reference.toFixed(2)}: a bulge at the nape`);
  }
  return `  how far its back comes in under its slack behind the head, E: ${mine.toFixed(2)} | ${reference.toFixed(2)}`;
}

/** His outline from a side with the hood hidden. */
function bareOutline(lab: Lab, view: ViewName): Outline {
  const parts = hoodParts(lab);
  const shown = parts.map((part) => part.visible);
  parts.forEach((part) => (part.visible = false));
  try {
    return outlineNow(lab, view);
  } finally {
    parts.forEach((part, k) => (part.visible = shown[k]));
  }
}

/** How far the hood reaches ahead of his body from his left at each of `OVERHANG`'s heights (`E`, from the top; null
 *  where either outline misses the height), its outline beside his `bare` one. */
function overhangsOf(hooded: Outline, bare: Outline): (number | null)[] {
  const steps = Math.round((OVERHANG.top - OVERHANG.bottom) / EDGES_STEP);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const up = OVERHANG.top - k * EDGES_STEP;
    const [over, under] = [reachAt(hooded, up), reachAt(bare, up)];
    // (from his left, ahead is to the picture's left)
    return over && under ? Math.max(0, under.from - over.from) : null;
  });
}

/** The most the hood reaches ahead of his body from his left below the chin (`E`). */
function overhangOf(hooded: Outline, bare: Outline): number {
  return Math.max(0, ...overhangsOf(hooded, bare).map((off) => off ?? 0));
}

/** How far the hood reaches ahead of his body from his left below the chin, height by height, as a line, and a
 *  problem past `OVERHANG.most`. */
function overhangLine(hooded: Outline, bare: Outline, problems: string[]): string {
  const offs = overhangsOf(hooded, bare);
  const most = overhangOf(hooded, bare);
  if (most > OVERHANG.most) {
    problems.push(`hood: from his left it stands ${most.toFixed(2)} E ahead of his body below the chin `
      + `(${OVERHANG.most} at most): its capelet overhangs his chest`);
  }
  const levels = offs.map((off, k) => `${(OVERHANG.top - k * EDGES_STEP).toFixed(1)}: ${off?.toFixed(2) ?? '-'}`);
  return `  how far it reaches ahead of his body below the chin, E: ${levels.join('; ')}`;
}

/** A problem where the hood hangs fuller or tighter than the reference's at `FULL_LEVELS`, from his left and the
 *  back. */
function fullness(view: ViewName, ours: Outline, theirs: Outline, problems: string[]): void {
  if (view === 'front') return;
  for (const level of LEVELS.filter((height) => FULL_LEVELS[view].includes(height.name))) {
    const mine = fullnessAt(ours, view, level.up);
    const reference = fullnessAt(theirs, view, level.up);
    if (mine === null || reference === null) continue;
    const off = mine - reference;
    if (Math.abs(off) <= FULL_SLACK) continue;
    const how = view === 'left'
      ? `it reaches ${Math.abs(off).toFixed(2)} E ${off > 0 ? 'further' : 'less far'} behind`
      : `it's ${Math.abs(off).toFixed(2)} E ${off > 0 ? 'wider' : 'narrower'}`;
    const where = view === 'left' ? 'from his left' : 'from the back';
    problems.push(`hood: ${where} ${how} at the ${level.name} than the reference's (${mine.toFixed(2)}, the `
      + `reference's ${reference.toFixed(2)}): ${off > 0 ? 'a sack' : 'pulled in where the reference hangs loose'}`);
  }
}

/** What the views read: each one's outline, and the opening from the front and his left. */
interface ViewsRead {
  outlines: Record<ViewName, Outline>;
  openings: Record<OpeningView, Opening>;
}

/** Each view's outline and readings, ours beside the reference's, with its pictures; from the front and his left
 *  its opening too. */
async function outlines(lab: Lab, options: HoodOptions, lines: string[], problems: string[], moments: Pictured[]):
  Promise<ViewsRead> {
  // (each view lit from its camera's side, as the reference's are)
  const scene = studio(true);
  const back = intoStudio(lab, scene);
  const read: Partial<Record<ViewName, Outline>> = {};
  const openings: Partial<Record<OpeningView, Opening>> = {};
  try {
    const shots: Shot[] = VIEWS.map((view) => ({ name: view.name, camera: cameraFrom(lab, view.from) }));
    const { tiles } = shoot(lab, scene, shots);
    for (const [k, view] of VIEWS.entries()) {
      const camera = shots[k].camera;
      const figure = ourFigure(lab, scene, camera);
      const marks = ourMarks(lab, camera, figure);
      const ours = outlineOf(figure.covered, marks);
      read[view.name] = ours;
      const reference = options.reference?.[view.name];
      const theirs = reference ? await referenceOutline(reference) : null;
      const shared = theirs ? `, ${(overlap(ours, theirs.outline) * 100).toFixed(0)}% of the outlines shared` : '';
      lines.push(`${view.name}${shared}`);
      lines.push(`  ours, E from the eyes: ${readings(ours, view.name)}`);
      if (theirs) lines.push(`  the reference's:       ${readings(theirs.outline, view.name)}`);
      if (theirs) fullness(view.name, ours, theirs.outline, problems);
      if (theirs && view.name === 'left') lines.push(waistLine(ours, theirs.outline, problems));
      const bare = view.name === 'left' ? bareOutline(lab, 'left') : null;
      if (bare) lines.push(overhangLine(ours, bare, problems));
      if (options.edges) lines.push(...edgeLines(ours, theirs?.outline ?? null, view.name));
      const dots = { ours: [] as [number, number][], theirs: [] as [number, number][] };
      if (view.name !== 'back') {
        const mine = ourOpeningFrom(lab, scene, camera, view.name);
        const referenceOpened = theirs ? referenceOpening(theirs.image, theirs.figure, theirs.marks, view.name) : null;
        lines.push(...openingLines(view.name, mine, referenceOpened, problems));
        openings[view.name] = mine;
        dots.ours = rimDots(mine);
        if (referenceOpened) dots.theirs = rimDots(referenceOpened);
      }
      const pictured = await imageOf(tiles[k].png);
      const row: Tile[] = [windowTile(pictured, marks, `${view.name}: ours`, dots.ours)];
      if (theirs && reference) {
        const image = await imageOf(reference.url);
        row.push(windowTile(image, theirs.marks, `${view.name}: the reference`, dots.theirs));
      }
      row.push(overlayTile(ours, theirs?.outline ?? null, `${view.name}: both (white), theirs (red), ours (green)`));
      if (bare) row.push(overlayTile(ours, bare, `${view.name}: him (red) under the hood (green), both (white)`));
      moments.push({ label: view.name, tiles: row, notes: [] });
    }
  } finally {
    back();
  }
  return { outlines: read as Record<ViewName, Outline>, openings: openings as Record<OpeningView, Opening> };
}

/** How the hood moves as he walks: how far its top half moves from its standing shape at most (cm, the hat's own
 *  space), how far its seam down the back strays from straight standing and walking (cm, `seamKink`), what its
 *  cloth's frames cost as he stands and walks, and the seam as he stood (for the canary). */
interface Sway {
  moved: number;
  kink: { standing: Kink; walking: Kink };
  cost: CallTimes;
  seam: THREE.Vector3[];
}

/** How far the seam strays from straight at the most (cm) and at which drawn row (its share down the hood). */
interface Kink {
  most: number;
  down: number;
}

/** how many drawn rows either side of a point the seam's line is read through, and the most the seam may stray aside
 *  from it (cm): walking, it jogged aside in a Z where it crossed the gathers at the nape */
const SEAM_SPAN = 2;
const MOST_SEAM_KINK = 0.3;
/** with --canary: how far one of the seam's points is put aside (cm), and how much of it the measure must read */
const CANARY_KINK = 1;
const CANARY_LEAST_KINK = 0.6;

/** The seam down the back from the top, its points in the hat's space (the drawn grid's middle column: an even count
 *  of spaces across puts one on it). */
function seamOf(hood: HoodMesh): THREE.Vector3[] {
  const middle = (hood.across - 1) / 2;
  if (!Number.isInteger(middle)) throw new Error('lab: hood: no column of its drawn grid runs down the seam');
  const at = hood.mesh.geometry.attributes.position;
  const points: THREE.Vector3[] = [];
  for (let row = 0; row < hood.down; row++) {
    points.push(new THREE.Vector3().fromBufferAttribute(at, row * hood.across + middle));
  }
  return points;
}

/** How far the seam strays aside (across, x) from straight at the most: each point against the line through the points
 *  `SEAM_SPAN` rows either side, at its share of the way along them (m, the hat's space). */
function seamKink(seam: THREE.Vector3[], rows: number[]): { most: number; down: number } {
  let most = 0;
  let down = 0;
  for (let k = SEAM_SPAN; k + SEAM_SPAN < seam.length; k++) {
    const [before, after] = [seam[k - SEAM_SPAN], seam[k + SEAM_SPAN]];
    const along = Math.hypot(seam[k].y - before.y, seam[k].z - before.z);
    const rest = Math.hypot(after.y - seam[k].y, after.z - seam[k].z);
    const t = along + rest > 0 ? along / (along + rest) : 0.5;
    const aside = Math.abs(seam[k].x - THREE.MathUtils.lerp(before.x, after.x, t));
    if (aside > most) {
      most = aside;
      down = rows[k];
    }
  }
  return { most, down };
}

/** how often the capelet's lie is read as he walks (frames) */
const WALK_LIE_EVERY = 15;

/** How the hood moves and what it costs as he stands, then walks, `walking` called every `WALK_LIE_EVERY` frames of
 *  the walk. */
async function sway(lab: Lab, walking: () => void): Promise<Sway> {
  const hood = hoodOf(lab);
  const at = hood.mesh.geometry.attributes.position;
  // (its rows down to half its length: they're drawn finer where its creases are)
  const topHalf = hood.rows.filter((v) => v <= 0.5).length * hood.across;
  const standing: THREE.Vector3[] = [];
  const start = lab.player.pos.clone();
  const timing = timeCalls(HoodCloth.prototype, 'update');
  const scale = hood.mesh.getWorldScale(new THREE.Vector3()).x;
  const kink = { standing: { most: 0, down: 0 }, walking: { most: 0, down: 0 } };
  const readKink = (into: Kink) => {
    const now = seamKink(seamOf(hood), hood.rows);
    if (now.most * scale * 100 <= into.most) return;
    into.most = now.most * scale * 100;
    into.down = now.down;
  };
  let most = 0;
  let cost: CallTimes;
  let seam: THREE.Vector3[] = [];
  try {
    await lab.step(STAND_FRAMES, undefined, () => readKink(kink.standing));
    for (let k = 0; k < topHalf; k++) standing.push(new THREE.Vector3().fromBufferAttribute(at, k));
    seam = seamOf(hood);
    const point = new THREE.Vector3();
    let frame = 0;
    await lab.step(WALK_FRAMES, () => ({ keys: ['w'] }), () => {
      for (let k = 0; k < topHalf; k++) most = Math.max(most, point.fromBufferAttribute(at, k).distanceTo(standing[k]));
      readKink(kink.walking);
      if (++frame % WALK_LIE_EVERY === 0) walking();
    });
  } finally {
    cost = timing.stop();
  }
  if (lab.player.pos.distanceTo(start) < 1) throw new Error('lab: hood: the hero never walked');
  if (cost.calls === 0) throw new Error('lab: hood: its cloth never stepped');
  return { moved: most * scale * 100, kink, cost, seam };
}

/** The seam's kink as lines, a problem where it strays too far, and with --canary its canary: one of its points as he
 *  stood put aside, the measure must read it. */
function kinkLines(sway: Sway, hood: HoodMesh, canary: boolean, problems: string[]): string[] {
  const said = (kink: Kink) => `${kink.most.toFixed(2)} cm (at ${kink.down.toFixed(2)} of the way down)`;
  const lines = [`the seam down the back strays aside from straight at most ${said(sway.kink.standing)} standing, `
    + `${said(sway.kink.walking)} walking (${MOST_SEAM_KINK} at most)`];
  for (const [how, kink] of Object.entries(sway.kink)) {
    if (kink.most <= MOST_SEAM_KINK) continue;
    problems.push(`hood: its seam strays ${kink.most.toFixed(2)} cm from straight ${how}`);
  }
  if (!canary) return lines;
  const scale = hood.mesh.getWorldScale(new THREE.Vector3()).x;
  const planted = sway.seam.map((point) => point.clone());
  const k = Math.round(planted.length / 2);
  planted[k].x += CANARY_KINK / 100 / scale;
  const read = seamKink(planted, hood.rows).most * scale * 100;
  const canaryLine = `canary, a point of the seam put ${CANARY_KINK} cm aside: read ${read.toFixed(2)} cm `
    + 'from straight';
  if (read < CANARY_LEAST_KINK) problems.push(`missed: ${canaryLine}`);
  else lines.push(canaryLine);
  return lines;
}

/** The hood's capelet: its cloth and the row it begins on. */
function capeletOf(lab: Lab): CapeletMesh {
  const hood = hoodOf(lab);
  if (hood.capelet === undefined) throw new Error('lab: hood: the hood says nowhere where its capelet begins');
  return { ...hood, capelet: hood.capelet };
}

/** How the capelet lies on him as he stands, row by row with --rows, and with --canary its canary. */
function capeletLie(lab: Lab, options: HoodOptions, problems: string[]): string[] {
  const capelet = capeletOf(lab);
  const held = heldThings(lab);
  const lie = lieOf(lab, capelet, held);
  const lines = lieLines(lie, problems);
  if (options.rows) lines.push(...lieRows(lie));
  if (options.canary) lines.push(lieCanary(lab, capelet, held, lie, problems));
  lines.push(hoodThroughLine(hoodThroughOf(lab, capelet, held), 'standing', problems));
  if (options.canary) lines.push(hoodThroughCanary(lab, capelet, held, problems));
  return lines;
}

/** The hood's meshes (its outside, its lining, its piping). */
function hoodParts(lab: Lab): THREE.Object3D[] {
  const hood = hoodOf(lab);
  const meshes = hood.mesh.parent!.children.filter((child) => (child as THREE.Mesh).isMesh && child.userData.hoodPart);
  return meshes.length ? meshes : [hood.mesh];
}

/** The hood's meshes changed by `change` for a canary and `undo` back; returns the undo. */
function planted(lab: Lab, change: (part: THREE.Object3D) => void, undo: (part: THREE.Object3D) => void): () => void {
  const parts = hoodParts(lab);
  for (const part of parts) {
    change(part);
    part.updateMatrixWorld(true);
  }
  return () => {
    for (const part of parts) {
      undo(part);
      part.updateMatrixWorld(true);
    }
  };
}

/** How much less a view's fullness reads at a height now than `was` read it (`E`; none where either missed it). */
function lessFull(lab: Lab, was: Outline, view: ViewName, up: number): number {
  const before = fullnessAt(was, view, up);
  const now = fullnessAt(outlineNow(lab, view), view, up);
  return before !== null && now !== null ? before - now : 0;
}

/** The canary for the hood's width: made narrower about the head, the rim must read nearer the cheeks, the outline
 *  narrower at the temples and, from the back, at the neck, and the opening narrower at the eyes. */
function narrowCanary(lab: Lab, sizes: Record<Size, number>, read: ViewsRead, problems: string[]): string | null {
  const undo = planted(lab, (part) => (part.scale.x *= CANARY_NARROW), (part) => (part.scale.x /= CANARY_NARROW));
  try {
    const clear = sizesOf(lab).clear;
    const temples = lessFull(lab, read.outlines.front, 'front', 0.4);
    const neck = lessFull(lab, read.outlines.back, 'back', levelUp('neck'));
    const opening = (halfWidthAt(read.openings.front, 0) ?? 0) - (halfWidthAt(openingNow(lab, 'front'), 0) ?? 0);
    const lost = sizes.clear - clear;
    const said = `canary, the hood ${CANARY_NARROW}x as wide: the rim ${lost.toFixed(1)} cm nearer the cheeks, `
      + `${temples.toFixed(2)} E narrower at the temples and ${neck.toFixed(2)} at the neck from the back, the `
      + `opening ${opening.toFixed(2)} E narrower either side at the eyes`;
    const missed = lost < CANARY_LEAST_CLEAR || temples < CANARY_LEAST_TEMPLES || neck < CANARY_LEAST_NECK
      || opening < CANARY_LEAST_OPENING;
    if (!missed) return said;
    problems.push(`missed: ${said}`);
    return null;
  } finally {
    undo();
  }
}

/** The canary for the opening from his left: the hood moved forward, its rim must read further ahead at the eyes,
 *  the face shown ahead of it less there, less of the face shown in all, and it further ahead of his body below the
 *  chin. */
function forwardCanary(lab: Lab, read: ViewsRead, problems: string[]): string | null {
  const step = CANARY_FORWARD / 100 / hoodParts(lab)[0].parent!.getWorldScale(new THREE.Vector3()).z;
  const undo = planted(lab, (part) => (part.position.z += step), (part) => (part.position.z -= step));
  try {
    const before = read.openings.left;
    const after = openingNow(lab, 'left');
    const ahead = (aheadAt(after, 0) ?? 0) - (aheadAt(before, 0) ?? 0);
    const shown = (shownAt(before, 0) ?? 0) - (shownAt(after, 0) ?? 0);
    const hidden = before.face ? 1 - after.face / before.face : 0;
    const bare = bareOutline(lab, 'left');
    const overhang = overhangOf(outlineNow(lab, 'left'), bare) - overhangOf(read.outlines.left, bare);
    const said = `canary, the hood ${CANARY_FORWARD} cm forward: from his left its rim ${ahead.toFixed(2)} E further `
      + `ahead at the eyes, the face shown ${shown.toFixed(2)} E less ahead of it there, `
      + `${(hidden * 100).toFixed(0)}% less of the face shown, ${overhang.toFixed(2)} E further ahead of his body `
      + 'below the chin';
    const caught = ahead >= CANARY_LEAST_AHEAD && shown >= CANARY_LEAST_AHEAD && hidden >= CANARY_LEAST_HIDDEN
      && overhang >= CANARY_LEAST_OVERHANG;
    if (caught) return said;
    problems.push(`missed: ${said}`);
    return null;
  } finally {
    undo();
  }
}

/** The hood's meshes pressed in toward him by `cm` behind the head under the nape (`DENT`); returns the undo. */
function dented(lab: Lab, cm: number): () => void {
  const eyes = toGroup(0, EYE.y, EYE.z);
  const unit = eyes.y - toGroup(0, 0, 0).y;
  const parts = hoodParts(lab) as THREE.Mesh[];
  const step = cm / 100 / parts[0].parent!.getWorldScale(new THREE.Vector3()).z;
  const saved = parts.map((part) => (part.geometry.attributes.position.array as Float32Array).slice());
  for (const part of parts) {
    const position = part.geometry.attributes.position;
    for (let k = 0; k < position.count; k++) {
      const up = (position.getY(k) - eyes.y) / unit;
      const behind = (eyes.z - position.getZ(k)) / unit;
      if (up > DENT.top || up < DENT.bottom || behind < DENT.behind) continue;
      position.setZ(k, position.getZ(k) + step);
    }
    position.needsUpdate = true;
  }
  return () => {
    parts.forEach((part, k) => {
      const position = part.geometry.attributes.position;
      (position.array as Float32Array).set(saved[k]);
      position.needsUpdate = true;
    });
  };
}

/** The canary for the bulge: the hood's back pressed in under the nape, the waist under its slack from his left must
 *  read deeper. */
function waistCanary(lab: Lab, read: ViewsRead, problems: string[]): string | null {
  const undo = dented(lab, CANARY_DENT);
  try {
    const deeper = waistOf(outlineNow(lab, 'left')) - waistOf(read.outlines.left);
    const said = `canary, the hood's back pressed ${CANARY_DENT} cm in under the nape: from his left it comes in `
      + `${deeper.toFixed(2)} E further under its slack`;
    if (deeper >= CANARY_LEAST_WAIST) return said;
    problems.push(`missed: ${said}`);
    return null;
  } finally {
    undo();
  }
}

/** The canary for the hood's fullness: made shallower front to back about the head, its outline from his left must
 *  read less far behind the eyes at the chin. */
function shallowCanary(lab: Lab, read: ViewsRead, problems: string[]): string | null {
  const undo = planted(lab, (part) => (part.scale.z *= CANARY_SHALLOW), (part) => (part.scale.z /= CANARY_SHALLOW));
  try {
    const shallower = lessFull(lab, read.outlines.left, 'left', levelUp('chin'));
    const said = `canary, the hood ${CANARY_SHALLOW}x as deep: from his left it reaches ${shallower.toFixed(2)} E less `
      + 'far behind at the chin';
    if (shallower >= CANARY_LEAST_SHALLOWER) return said;
    problems.push(`missed: ${said}`);
    return null;
  } finally {
    undo();
  }
}

export async function hood(lab: Lab, options: HoodOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const sizes = sizesOf(lab);
  lines.push(sizeLines(sizes, options.sizes, problems));
  lines.push(headLine(lab));
  const read = await outlines(lab, options, lines, problems, moments);
  if (options.canary) {
    const canaries = [
      narrowCanary(lab, sizes, read, problems), forwardCanary(lab, read, problems), shallowCanary(lab, read, problems),
      waistCanary(lab, read, problems),
    ];
    for (const canary of canaries) {
      if (canary) lines.push(canary);
    }
  }
  lines.push(...capeletLie(lab, options, problems));
  const capelet = capeletOf(lab);
  const held = heldThings(lab);
  const walk = { deepest: null as Deepest | null, hood: null as Deepest | null, moments: 0 };
  const deeper = (was: Deepest | null, now: Deepest | null) => (now && (!was || now.through > was.through) ? now : was);
  const swayed = await sway(lab, () => {
    walk.moments++;
    walk.deepest = deeper(walk.deepest, deepestOf(lieOf(lab, capelet, held)));
    walk.hood = deeper(walk.hood, hoodThroughOf(lab, capelet, held));
  });
  const { moved, cost } = swayed;
  lines.push(walkingLine(walk.deepest, walk.moments, problems));
  lines.push(hoodThroughLine(walk.hood, 'walking', problems));
  lines.push(`walking, its top half moved at most ${moved.toFixed(1)} cm from its standing shape (${MOST_SWAY} at most)`);
  if (moved > MOST_SWAY) problems.push(`hood: its top half moved ${moved.toFixed(1)} cm from its shape as he walked`);
  lines.push(...kinkLines(swayed, hoodOf(lab), Boolean(options.canary), problems));
  lines.push(`its cloth a frame, standing and walking: ${cost.median.toFixed(2)} ms at the median, `
    + `${cost.p90.toFixed(2)} at the 90th percentile (${cost.calls} frames, by the browser's clock)`);
  return { text: lines.join('\n'), problems, moments };
}
