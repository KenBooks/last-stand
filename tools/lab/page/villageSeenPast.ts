// `lab village --only wallsPastHimWhole,portalOverAll`: what blends from above and what stands past him.
// `wallsPastHimWhole` (from play: "not supposed to make walls transparent like this, because I'm front of the wall",
// "these pillars in hero hall are oddly cut", "we need to see this in top down view as well"): from above, stood before
// each wall and on the hall's floor, places on what stands past him are read drawn as the game thins and with nothing
// thinned; they must agree. `canary` has what thins reach past him. `portalOverAll` (from play: "some kinda glitch at
// the portal, only under some angles"): round the crypt's portal, how much of its inner sheet the frame shows unchanged
// with the sheet hidden: what draws over it. `canary` sorts what thins by blending among the glows, as it was.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, HALL, portalPlace, TERRACE } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { holdHallWallsAllThin } from '../../../src/game/village';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import {
  holdBlendedAmongGlows,
  hideHallColumns,
  holdBuiltOpenAlways,
  holdColumnsUnderWalls,
  holdThinningReach,
  thinningLetGo,
} from '../../../src/core/seeThrough';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle */
const SETTLE = 90;
/** how much a place's light may differ from what's drawn with nothing thinned, a share of it (its first 3% of full
 *  light forgiven, as a share of nothing means nothing), and the most places that may */
const MOST_DIFFERENT = 0.2;
const LIGHT_FORGIVEN = 0.03;
const MOST_PLACES_WRONG = 0;
/** how much of the sheet may show unchanged with it hidden (corners and what stands before it are out of the part
 *  read) */
const MOST_OVER_THE_SHEET = 0.06;
/** the part of the sheet read: its middle's half width and half height, as shares of its own */
const SHEET_READ = { across: 0.32, up: 0.34 };
/** how far apart the pixels read over it are, and how much a pixel must change to count as the sheet shown (of full
 *  light) */
const SHEET_STRIDE = 3;
const SHEET_CHANGE = 0.025;

/** A stand of his and what stands past him there; `noColumns`: the hall's columns are taken out of both frames, as they
 *  stand over the walls read. */
interface Stand { name: string; x: number; z: number; facing: number; past: THREE.Vector3[]; noColumns?: boolean }

/** The hero placed at (x, z) facing `facing`, the camera behind him, let settle. */
async function standAt(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** The places read past him at each stand: walls he's before, the hall's far columns and its back wall. */
function stands(): Stand[] {
  const x = TERRACE.x;
  const floor = TERRACE.high;
  const north = Math.PI;
  const backWall = HALL.plinths.map((across) => new THREE.Vector3(x + across, floor + 3.6, HALL.wall + 0.02));
  const backColumns = [-1, 1].flatMap((side) => [
    new THREE.Vector3(x + side * HALL.columnX, floor + 1.4, HALL.columnZ[3]),
    new THREE.Vector3(x + side * HALL.columnX, floor + 2.4, HALL.columnZ[3]),
  ]);
  const frontWall = [-3, -2.2, 2.6, 4].flatMap((across) => [1.6, 3, 4.6].map((up) =>
    new THREE.Vector3(x + across, floor + up, HALL.door + 0.02)));
  const cottage = COTTAGES[0];
  const halfD = (COTTAGE.d / 2) * cottage.size;
  const cos = Math.cos(cottage.facing);
  const sin = Math.sin(cottage.facing);
  const inFront = (along: number, out: number): [number, number] =>
    [cottage.x + along * cos + out * sin, cottage.z - along * sin + out * cos];
  const [cottageX, cottageZ] = inFront(0, halfD + 1.2);
  const onTheWall = (along: number, up: number): THREE.Vector3 => {
    const [wx, wz] = inFront(along, halfD + 0.02);
    return new THREE.Vector3(wx, groundHeight(wx, wz) + up, wz);
  };
  const cottageWall = [-1.6, 1.6].map((along) => onTheWall(along, 1.5));
  const halfW = (COTTAGE.w / 2) * cottage.size;
  const [cornerX, cornerZ] = inFront(-halfW - 0.7, halfD + 0.7);
  const alongWall = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6].flatMap((share) =>
    [0.9, 1.5, 2.1].map((up) => onTheWall(share * halfW, up)));
  return [
    {
      name: 'on the hall\'s floor before the dais',
      x,
      z: HALL.daisZ + 3,
      facing: north,
      past: [...backWall, ...backColumns],
    },
    // (well aside of the door: nearer it he sees into the room, and the wall over that floor thins whole for it,
    // `hallWallsOneByOne`)
    { name: 'on the portico before the front wall', x: x + 4.6, z: HALL.door + 1.4, facing: north, past: frontWall },
    {
      name: 'before a cottage\'s front',
      x: cottageX,
      z: cottageZ,
      facing: cottage.facing + Math.PI,
      past: cottageWall,
    },
    // (from play, "why am I seeing through walls here?": on the floor with the camera each way, the walls beside him)
    {
      name: 'on the hall\'s floor, its near side walls beside him',
      x,
      z: HALL.door - 7,
      facing: north,
      noColumns: true,
      // (under the windows, whose panes go with the columns; clear of the front wall's ghost, which lies over the wall
      // nearer the door, no fault of the side wall's)
      past: [-1, 1].flatMap((side) => [HALL.door - 6.5, HALL.door - 9].flatMap((along) => [0.25, 0.45].map((up) =>
        new THREE.Vector3(x + side * (HALL.inHalf + 0.02), floor + up, along)))),
    },
    {
      name: 'on the hall\'s floor, turned to its back corner',
      x,
      z: HALL.daisZ + 3,
      facing: north + 0.9,
      past: [...backWall, new THREE.Vector3(x + HALL.plinths[0], floor + 1.5, HALL.wall + 0.02)],
    },
    // (from play, "it shows green where it should not": beside the wall, hiding nothing of him, it stays whole)
    { name: 'at a cottage\'s corner', x: cornerX, z: cornerZ, facing: cottage.facing + Math.PI + 0.7, past: alongWall },
  ];
}

/** The pixel `point` falls on, or null off the frame. */
function pixelOf(point: THREE.Vector3, width: number, height: number): number | null {
  const place = point.clone().project(G.camera);
  const column = Math.floor(((place.x + 1) / 2) * width);
  const row = Math.floor(((place.y + 1) / 2) * height);
  if (column < 0 || column >= width || row < 0 || row >= height) return null;
  return (row * width + column) * 4;
}

/** How many of a stand's places differ thinned as the game thins from nothing thinned, and how many were in the
 *  frame. */
function readStand(lab: Lab, stand: Stand): { wrong: number; read: number; worst: number; places: string } {
  if (stand.noColumns) hideHallColumns(true);
  const canvas = drawFrame(lab);
  const thinned = canvas.pixels.slice();
  const giveBack = thinningLetGo();
  const whole = drawFrame(lab).pixels;
  giveBack();
  if (stand.noColumns) hideHallColumns(false);
  let wrong = 0;
  let read = 0;
  let worst = 0;
  const places: string[] = [];
  for (const point of stand.past) {
    const pixel = pixelOf(point, canvas.width, canvas.height);
    if (pixel === null) continue;
    read++;
    let differs = 0;
    let light = 0;
    for (let part = 0; part < 3; part++) {
      differs += Math.abs(thinned[pixel + part] - whole[pixel + part]);
      light += whole[pixel + part];
    }
    const share = Math.max(0, differs / 3 - LIGHT_FORGIVEN) / Math.max(light / 3, LIGHT_FORGIVEN);
    worst = Math.max(worst, share);
    if (share > MOST_DIFFERENT) wrong++;
    places.push(`${point.x.toFixed(1)},${point.y.toFixed(1)},${point.z.toFixed(1)} ${(share * 100).toFixed(0)}%`);
  }
  return { wrong, read, worst, places: places.join('; ') };
}

/** How far each of `points` differs thinned as the game thins from nothing thinned, the hall's columns out of both
 *  frames: of full light, null off the frame. */
export function placesThinned(lab: Lab, points: THREE.Vector3[]): (number | null)[] {
  hideHallColumns(true);
  const canvas = drawFrame(lab);
  const thinned = canvas.pixels.slice();
  const giveBack = thinningLetGo();
  const whole = drawFrame(lab).pixels;
  giveBack();
  hideHallColumns(false);
  return points.map((point) => {
    const pixel = pixelOf(point, canvas.width, canvas.height);
    if (pixel === null) return null;
    let differs = 0;
    for (let part = 0; part < 3; part++) differs += Math.abs(thinned[pixel + part] - whole[pixel + part]);
    return differs / 3;
  });
}

/** From above, what stands past him is drawn whole. */
export async function wallsPastHimWhole(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdThinningReach(canary);
  holdHallWallsAllThin(canary);
  holdBuiltOpenAlways(canary);
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  let wrongAll = 0;
  try {
    await viewBy(lab, 'top');
    for (const stand of stands()) {
      await standAt(lab, stand.x, stand.z, stand.facing);
      const { wrong, read, worst, places } = readStand(lab, stand);
      wrongAll += wrong;
      const worstShare = (worst * 100).toFixed(0);
      lines.push(`${stand.name}: ${wrong} of ${read} places past him thinned, the worst by ${worstShare}%`);
      lines.push(`  ${places}`);
      if (read === 0) problems.push(`${stand.name}: no place past him in the frame`);
      if (wrong > MOST_PLACES_WRONG) problems.push(`${stand.name}: ${wrong} places past him thinned`);
      if (!canary) moments.push(await lab.screen(stand.name, []));
    }
  } finally {
    holdThinningReach(false);
    holdHallWallsAllThin(false);
    holdBuiltOpenAlways(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
  if (canary) return { lines, problems: [], caught: wrongAll > MOST_PLACES_WRONG, moments: [] };
  return { lines, problems, caught: null, moments };
}

/** The share of the way from the frame without the hall's columns to the frame with them whole that the ghost of the
 *  column before him takes, at `point` on its shaft. */
function ghostShown(lab: Lab, point: THREE.Vector3): number {
  const canvas = drawFrame(lab);
  const ghost = canvas.pixels.slice();
  hideHallColumns(true);
  const none = drawFrame(lab).pixels.slice();
  hideHallColumns(false);
  const giveBack = thinningLetGo();
  const whole = drawFrame(lab).pixels;
  giveBack();
  const pixel = pixelOf(point, canvas.width, canvas.height);
  if (pixel === null) throw new Error('lab: village: the portico\'s column is out of the frame');
  let shown = 0;
  let full = 0;
  for (let part = 0; part < 3; part++) {
    shown += Math.abs(ghost[pixel + part] - none[pixel + part]);
    full += Math.abs(whole[pixel + part] - none[pixel + part]);
  }
  if (full < 0.05) throw new Error('lab: village: the column read isn\'t at the place read');
  return shown / full;
}

/** The fewest of a column's ghost that must show. */
const LEAST_GHOST = 0.2;
/** The portico's column read: how far aside of the door's middle and where along (m), how high on it over the terrace
 *  (m), and how far behind it he stands. */
const COLUMN_ACROSS = 3.3;
const COLUMN_Z = -13.4;
const COLUMN_READ_UP = 1;
/** The hall's column whose capital is read, and his stand and the view's way that put it at the edge of what thins
 *  round him: where its top is, how far out of its middle it's read, in how many steps a side; how far the frame may
 *  change on it (of 0..1: a level or so of the GPU's rounding); and the corners of the hall's shafts' mesh, which
 * picks it. */
const CAPITAL_Z = -24.6;
const CAPITAL_TOP = 7.6;
const GRANITE_COLOUR = 0xc8c4c0;
const CAPITAL_STAND_Z = -21.7;
const CAPITAL_STAND_FACING = -1.03;
const CAPITAL_HALF = 0.33;
const CAPITAL_STEPS = 4;
const THROUGH_APART = 0.01;
const SHAFTS_CORNERS = 1344;
const BEHIND_COLUMN = 0.7;

/** What the capital read is drawn in. */
function capitalMaterial(): THREE.Material {
  const over = new THREE.Vector3(TERRACE.x + HALL.columnX, CAPITAL_TOP + 1, CAPITAL_Z);
  const hits = new THREE.Raycaster(over, new THREE.Vector3(0, -1, 0), 0, 2).intersectObjects(G.scene.children, true);
  // (by its colour: the ceiling's underside lies at its top's height, hidden from above, and a ray meets what's hidden)
  const capital = hits.find((hit) => {
    const material = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
    return material.color?.getHex() === GRANITE_COLOUR && Math.abs(hit.point.y - CAPITAL_TOP) < 0.05;
  });
  if (!capital) throw new Error('lab: village: no capital where it\'s read');
  return (capital.object as THREE.Mesh).material as THREE.Material;
}

/** At how many of the places read on a capital's top the shaft under it shows, and a picture of it. */
interface CapitalRead { through: number; read: number; shot: Pictured }

/** The column-kind meshes drawn in the shaft's look (the one that stands on the plinth, under its capital), and the
 *  meshes writing the depth of them all. */
function columnParts(): { shafts: THREE.Mesh[]; depths: THREE.Mesh[] } {
  const shafts: THREE.Mesh[] = [];
  const depths: THREE.Mesh[] = [];
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const see = (mesh.material as { seeThrough?: { reach?: unknown; wholeOnly?: boolean } } | undefined)?.seeThrough;
    if (!mesh.isMesh || !see?.reach) return;
    if (see.wholeOnly) depths.push(mesh);
    else if (mesh.geometry.getAttribute('position').count === SHAFTS_CORNERS) shafts.push(mesh);
  });
  if (shafts.length !== 1) throw new Error('lab: village: the hall\'s shafts weren\'t found');
  return { shafts, depths };
}

/** Stood so that a column's capital lies at the edge of what thins round him, at how many places on its top the frame
 *  changes with the shaft under it taken out (from play, "but this is a defect, right ?": a bite of the shaft's top
 *  stood through the capital's corner). `canary` takes the capital's depth away. */
async function capitalOverItsShaft(lab: Lab, canary: boolean): Promise<CapitalRead> {
  await standAt(lab, TERRACE.x, CAPITAL_STAND_Z, CAPITAL_STAND_FACING);
  const { shafts } = columnParts();
  const capital = capitalMaterial();
  if (canary) capital.depthWrite = false;
  const shot = await lab.screen('a capital at the edge of what thins round him', []);
  const canvas = drawFrame(lab);
  const shown = canvas.pixels.slice();
  for (const shaft of shafts) shaft.visible = false;
  const without = drawFrame(lab).pixels;
  for (const shaft of shafts) shaft.visible = true;
  capital.depthWrite = true;
  let through = 0;
  let read = 0;
  for (let a = -CAPITAL_STEPS; a <= CAPITAL_STEPS; a++) {
    for (let b = -CAPITAL_STEPS; b <= CAPITAL_STEPS; b++) {
      const across = (a / CAPITAL_STEPS) * CAPITAL_HALF;
      const along = (b / CAPITAL_STEPS) * CAPITAL_HALF;
      const place = new THREE.Vector3(TERRACE.x + HALL.columnX + across, CAPITAL_TOP, CAPITAL_Z + along);
      const pixel = pixelOf(place, canvas.width, canvas.height);
      if (pixel === null) continue;
      read++;
      let apart = 0;
      for (let part = 0; part < 3; part++) apart += Math.abs(shown[pixel + part] - without[pixel + part]);
      if (apart / 3 > THROUGH_APART) through++;
    }
  }
  if (read === 0) throw new Error('lab: village: the capital is out of the frame');
  return { through, read, shot };
}

/** Stood behind a portico's column from above, it shows, ghost or whole, over the wall past it, its capital not left in
 *  the air (from play, "this geometry is messed up"). */
export async function columnsStayGhosts(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdColumnsUnderWalls(canary);
  try {
    await viewBy(lab, 'top');
    const columnAt = new THREE.Vector3(TERRACE.x + COLUMN_ACROSS, TERRACE.high + COLUMN_READ_UP, COLUMN_Z);
    await standAt(lab, columnAt.x, columnAt.z - BEHIND_COLUMN, Math.PI);
    // (the fault as it was: the columns' depth gone too, or the depth held the walls back from over them)
    const { depths } = columnParts();
    const heldVisible = depths.map((mesh) => mesh.visible);
    if (canary) for (const mesh of depths) mesh.visible = false;
    const shown = ghostShown(lab, columnAt);
    depths.forEach((mesh, at) => {
      mesh.visible = heldVisible[at];
    });
    const line = `a portico's column with him behind it: ${(shown * 100).toFixed(0)}% shown`;
    const wrong = shown < LEAST_GHOST;
    const shot = await lab.screen('behind a portico\'s column', []);
    const seen = await capitalOverItsShaft(lab, canary);
    const capitalLine = `the shaft's top seen through its capital at ${seen.through} of ${seen.read} places`;
    const capitalWrong = seen.through > 0;
    const lines = [line, capitalLine];
    if (canary) return { lines, problems: [], caught: wrong && capitalWrong, moments: [] };
    const problems = [...(wrong ? [line] : []), ...(capitalWrong ? [capitalLine] : [])];
    return { lines, problems, caught: null, moments: [shot, seen.shot] };
  } finally {
    holdColumnsUnderWalls(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** The crypt portal's sheet, as it stands in the village. */
function cryptSheet(): THREE.Mesh {
  const place = portalPlace('crypt');
  let nearest: THREE.Mesh | null = null;
  let nearestOff = Infinity;
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    const uniforms = (mesh.material as { uniforms?: Record<string, unknown> } | undefined)?.uniforms;
    if (!mesh.isMesh || !uniforms?.uArch || !uniforms.uPower) return;
    const at = mesh.getWorldPosition(new THREE.Vector3());
    const off = Math.hypot(at.x - place.x, at.z - place.z);
    if (off < nearestOff) {
      nearest = mesh;
      nearestOff = off;
    }
  });
  if (!nearest || nearestOff > 2) throw new Error('lab: village: the crypt\'s portal sheet wasn\'t found');
  return nearest;
}

/** The pixels over the middle of `sheet`, each a place in the frame's array. */
function sheetPixels(sheet: THREE.Mesh, width: number, height: number): number[] {
  const corners = sheet.geometry.getAttribute('position') as THREE.BufferAttribute;
  const size = new THREE.Box3().setFromBufferAttribute(corners);
  const pixels = new Set<number>();
  const across = size.max.x;
  const up = size.max.y;
  const steps = 60;
  for (let a = -steps; a <= steps; a++) {
    for (let b = -steps; b <= steps; b++) {
      const local = new THREE.Vector3((a / steps) * across * SHEET_READ.across, (b / steps) * up * SHEET_READ.up, 0);
      const pixel = pixelOf(sheet.localToWorld(local), width, height);
      if (pixel === null) continue;
      const column = (pixel / 4) % width;
      const row = Math.floor(pixel / 4 / width);
      if (column % SHEET_STRIDE === 0 && row % SHEET_STRIDE === 0) pixels.add(pixel);
    }
  }
  return [...pixels];
}

/** The share of the sheet's middle the frame shows the same with the sheet hidden: what's drawn over it. */
function overTheSheet(lab: Lab, sheet: THREE.Mesh): number {
  const canvas = drawFrame(lab);
  const shown = canvas.pixels.slice();
  sheet.visible = false;
  const hidden = drawFrame(lab).pixels;
  sheet.visible = true;
  const pixels = sheetPixels(sheet, canvas.width, canvas.height);
  if (pixels.length === 0) return 0;
  let same = 0;
  for (const pixel of pixels) {
    let changed = 0;
    for (let part = 0; part < 3; part++) changed += Math.abs(shown[pixel + part] - hidden[pixel + part]);
    if (changed / 3 < SHEET_CHANGE) same++;
  }
  return same / pixels.length;
}

/** Where he stands before the portal (m out from it, m aside), and from what view. */
const PORTAL_STANDS: readonly { out: number; aside: number; view: ViewMode }[] = [
  { out: 7, aside: 0, view: 'third' },
  { out: 10, aside: -3, view: 'third' },
  { out: 10, aside: 3, view: 'third' },
  { out: 5, aside: -2, view: 'top' },
  { out: 5, aside: 2, view: 'top' },
  { out: 9, aside: 0, view: 'top' },
];

/** Round the portal, nothing past it draws over its sheet. */
export async function portalOverAll(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdBlendedAmongGlows(canary);
  const place = portalPlace('crypt');
  const outX = Math.sin(place.facing);
  const outZ = Math.cos(place.facing);
  const lines: string[] = [];
  const moments: Pictured[] = [];
  let worst = 0;
  try {
    for (const stand of PORTAL_STANDS) {
      await viewBy(lab, stand.view);
      const x = place.x + outX * stand.out + outZ * stand.aside;
      const z = place.z + outZ * stand.out - outX * stand.aside;
      await standAt(lab, x, z, place.facing + Math.PI);
      const sheet = cryptSheet();
      G.player.obj.visible = false;
      const share = overTheSheet(lab, sheet);
      G.player.obj.visible = true;
      worst = Math.max(worst, share);
      const over = (share * 100).toFixed(1);
      lines.push(`${stand.view}, ${stand.out} m out, ${stand.aside} aside: ${over}% drawn over the sheet`);
      if (!canary && share === worst) {
        moments.length = 0;
        moments.push(await lab.screen('the crypt\'s portal, where the most stands over its sheet', []));
      }
    }
  } finally {
    holdBlendedAmongGlows(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
  const wrong = worst > MOST_OVER_THE_SHEET;
  if (canary) return { lines, problems: [], caught: wrong, moments: [] };
  const problems = wrong ? [`${(worst * 100).toFixed(1)}% over the portal's sheet`] : [];
  return { lines, problems, caught: null, moments };
}
