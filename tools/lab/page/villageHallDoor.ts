// `lab village --only hallDoorSight`: wall, column, and door leaf visibility near the Hall of Heroes door (#760).
// Checks seven invariants from top-down view:
// 1. Standing outside in front of the hall (Chronicle, Save slots at close rotated zoom, West/East jambs, Door center,
//    Stash) keeps `hallFront` wings, `hallBeam`, and non-occluding portico columns 100% solid (zero bleed-through behind
//    the solid wall wings, and left portico columns stay 100% solid over the plinth).
// 2. Standing near either jamb, the doorway sight wedge stays true to the jambs instead of pulling toward the door
//    center and unfogging interior columns behind the solid masonry wings.
// 3. Standing at the doorway threshold looking in, `hallFront` and `hallBeam` thin per pixel according to the player's
//    true 1st/3rd-person doorway cone of view (widening outward with height above the doorway while keeping lower masonry
//    wings behind Save slots & Stash 100% solid).
// 4. Inside the hall looking out the front, `hallFront` thins and unseen interior columns behind its solid wings draw
//    behind `hallFront` rather than painting opaque over the front wall.
// 5. Inside the hall behind both `hallFront` and a portico column at midnight, stacked ghosts count `hallColumn` shafts
//    (`>= 2`) and the portico column drops thinned depth so the hero stays clearly visible (`>= 45%` of unblocked light).
// 6. Inside the hall near the doorway, the bottom strip (`< FLOOR_CLEAR`) of the open wooden door leaves thins cleanly
//    all the way to the floor.
// `--canary` enables all legacy holds (`holdFrontOutsideThins`, `holdPorticoConeOutside`, `holdDoorWedgeCentered`,
// `holdDoorMiddleOff`, `holdRoomColumnsOverWalls`, `holdGhostsUncounted`, `holdPorticoDepthInside`, `holdHallFloorClear`)
// and catches every fault class.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMERA } from '../../../src/data/balance';
import { HALL, TERRACE } from '../../../src/data/village';
import { setZoom } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { ghostsAt, holdGhostsUncounted } from '../../../src/core/ghostLayers';
import {
  holdDoorMiddleOff, holdFrontOutsideThins, holdPorticoConeOutside, villageReport,
} from '../../../src/game/village';
import {
  doorFadeShare, GHOST_COUNT, hideHallColumns, holdHallFloorClear, holdPorticoDepthInside, holdRoomColumnsOverWalls,
  thinningLetGo, thinsByBlending, wholeShare,
} from '../../../src/core/seeThrough';
import { holdDoorWedgeCentered, seenShareAt } from '../../../src/core/sight';
import { drawFrame } from './light';
import { hisPixels } from './villageHeroInView';
import { fromAboveAtNoon, LOOKING_IN, standFacing } from './villageHallOpens';
import type { LightsChecked } from './villageLights';

/** stands outside in front of the hall where `hallFront`, `hallBeam`, and portico columns stay solid */
const STAND_OUTSIDE: readonly { name: string; x: number; z: number; facing: number }[] = [
  { name: 'chronicle stand', x: -3.6, z: -12.75, facing: LOOKING_IN },
  { name: 'save slots (rotated)', x: -2.75, z: -13.9, facing: LOOKING_IN + 0.45 },
  { name: 'west jamb', x: -2.21, z: -14.02, facing: LOOKING_IN },
  { name: 'door center', x: -1.5, z: -14.1, facing: LOOKING_IN },
  { name: 'east jamb', x: -0.57, z: -13.89, facing: LOOKING_IN },
  { name: 'stash stand', x: 0.6, z: -12.75, facing: LOOKING_IN },
];

/** zooms checked at the stands outside the door (default lobby zoom and close zoom) */
const ZOOMS = [CAMERA.lobbyZoom, 0.25];
const ZOOM_FRAMES = 90;

/** stands just before each jamb and which side's wings sit behind the solid masonry */
const JAMB_STANDS: readonly {
  name: string;
  x: number;
  z: number;
  wingSide: -1 | 1;
  unseenColumns: readonly number[];
}[] = [
  { name: 'west jamb', x: -2.21, z: -14.02, wingSide: -1, unseenColumns: [0] },
  { name: 'east jamb', x: -0.57, z: -13.89, wingSide: 1, unseenColumns: [0, 1] },
];

const SHAFT_UPS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const PORTICO_X = [3.3, 5.6];
const PORTICO_LEFT_X = [-4.8, -7.1];
const PORTICO_UP = [2.0, 2.5, 3.0];
const PORTICO_Z = -13.4;
const CLEAR_OF_PORTICO = 0.75;
const LEAST_DOOR_SEEN = 0.9;
const MOST_WING_SEEN = 0.15;
const LEAST_FRONT_THIN = 0.5;
const LEAST_SHAFTS = 4;
const LEAST_WALL_OVER_SHAFT = 0.015;
const MOST_BLEED = 0.005;
const MOST_PORTICO_DIFF = 0.005;
const LEAST_STACK_GHOSTS = 2;
const LEAST_STACK_SHOWN = 0.45;
const STACK_CHEST_Y = 1.2;
const LEAST_DOOR_BOTTOM_DIFF = 0.02;
const DOOR_LEAF_LEN = HALL.doorHalf - 0.03;
const DOOR_HALF_THICK = 0.06;
const DOOR_OPEN = 1.45;
const DOOR_SET = 0.22;
const DOOR_MIDDLE_X = [TERRACE.x - 0.5, TERRACE.x + 0.5];
const DOOR_MIDDLE_Y = [TERRACE.high + 4.2, TERRACE.high + 5.2];
const DOOR_CONE_X = [TERRACE.x - 2.0, TERRACE.x + 2.0];
const DOOR_CONE_Y = [TERRACE.high + 5.2, TERRACE.high + 6.0];
const DOOR_WING_X = [TERRACE.x - 4.45, TERRACE.x + 4.45];
const DOOR_WING_Y = [TERRACE.high + 1.5, TERRACE.high + 2.2];
const LEAST_DOOR_MIDDLE_DIFF = 0.03;
const MOST_DOOR_WING_DIFF = 0.005;

/** Pixel offset of `point` in `width x height`, or null outside the frame. */
function pixelOf(point: THREE.Vector3, width: number, height: number): number | null {
  const projected = point.clone().project(G.camera);
  const col = Math.floor(((projected.x + 1) / 2) * width);
  const row = Math.floor(((projected.y + 1) / 2) * height);
  if (col < 0 || col >= width || row < 0 || row >= height) return null;
  return (row * width + col) * 4;
}

/** Whether the camera ray to `point` passes through `hallFront`'s solid wing masonry (clear of doorway & portico). */
function crossesSolidFrontWing(point: THREE.Vector3, wingSide: -1 | 1): boolean {
  const eye = G.camera.position;
  if (eye.z <= HALL.door || point.z >= HALL.door) return false;
  const along = (HALL.door - eye.z) / (point.z - eye.z);
  const hitX = eye.x + (point.x - eye.x) * along;
  const hitY = eye.y + (point.y - eye.y) * along;
  const offMiddle = hitX - TERRACE.x;
  if (offMiddle * wingSide <= HALL.doorHalf + 0.4) return false;
  if (Math.abs(offMiddle) >= HALL.half - 0.3) return false;
  if (hitY <= TERRACE.high + 0.5 || hitY >= TERRACE.high + HALL.wallHigh - 0.2) return false;
  const toPortico = (PORTICO_Z - eye.z) / (point.z - eye.z);
  if (toPortico > 0 && toPortico < 1) {
    const px = eye.x + (point.x - eye.x) * toPortico - TERRACE.x;
    if (PORTICO_X.some((col) => Math.abs(Math.abs(px) - col) < CLEAR_OF_PORTICO)) return false;
  }
  return true;
}

/** Mean RGB channel difference between frames `a` and `b` over `offsets`. */
function meanPointDiff(a: ArrayLike<number>, b: ArrayLike<number>, offsets: readonly number[]): number {
  if (!offsets.length) return 0;
  let sum = 0;
  for (const px of offsets) {
    let d = 0;
    for (let ch = 0; ch < 3; ch++) d += Math.abs(a[px + ch] - b[px + ch]);
    sum += d / 3;
  }
  return sum / offsets.length;
}

/** Screen offsets of interior column shaft points lying behind `hallFront`'s solid wing(s). */
function wingShaftOffsets(width: number, height: number, wings: readonly (-1 | 1)[],
  columns: readonly number[] = [0, 1, 2]): number[] {
  const offsets: number[] = [];
  for (const wingSide of wings) {
    const colX = TERRACE.x + wingSide * HALL.columnX;
    for (const i of columns) {
      for (const up of SHAFT_UPS) {
        const point = new THREE.Vector3(colX, TERRACE.high + up, HALL.columnZ[i]);
        if (!crossesSolidFrontWing(point, wingSide)) continue;
        const px = pixelOf(point, width, height);
        if (px !== null) offsets.push(px);
      }
    }
  }
  return offsets;
}

/** Mean RGB difference across interior column shaft points behind solid `hallFront` when columns are hidden. */
function bleedBehindSolidFrontDiff(lab: Lab, wings: readonly (-1 | 1)[],
  columns: readonly number[] = [0, 1, 2]): { diff: number; count: number } {
  const asDrawn = drawFrame(lab);
  const drawn = asDrawn.pixels.slice();
  const offsets = wingShaftOffsets(asDrawn.width, asDrawn.height, wings, columns);
  hideHallColumns(true);
  const withoutCols = drawFrame(lab).pixels;
  hideHallColumns(false);
  return { diff: meanPointDiff(drawn, withoutCols, offsets), count: offsets.length };
}

/** Mean RGB difference across visible left portico column shafts against `thinningLetGo()`. */
function porticoSolidDiff(lab: Lab): { diff: number; count: number } {
  const asDrawn = drawFrame(lab);
  const drawn = asDrawn.pixels.slice();
  const offsets: number[] = [];
  for (const x of PORTICO_LEFT_X) {
    for (const y of PORTICO_UP) {
      const px = pixelOf(new THREE.Vector3(x, y, PORTICO_Z), asDrawn.width, asDrawn.height);
      if (px !== null) offsets.push(px);
    }
  }
  const restore = thinningLetGo();
  const solid = drawFrame(lab).pixels;
  restore();
  return { diff: meanPointDiff(drawn, solid, offsets), count: offsets.length };
}

/** Mean RGB difference vs `thinningLetGo()` over world points on `hallFront` (`z = HALL.door`). */
function frontWallPointsDiff(lab: Lab, xs: readonly number[], ys: readonly number[]): { diff: number; count: number } {
  const asDrawn = drawFrame(lab);
  const drawn = asDrawn.pixels.slice();
  const offsets: number[] = [];
  for (const x of xs) {
    for (const y of ys) {
      const px = pixelOf(new THREE.Vector3(x, y, HALL.door), asDrawn.width, asDrawn.height);
      if (px !== null) offsets.push(px);
    }
  }
  const restore = thinningLetGo();
  const solid = drawFrame(lab).pixels;
  restore();
  return { diff: meanPointDiff(drawn, solid, offsets), count: offsets.length };
}

/** Mean RGB difference across interior column shaft points hidden behind thinned `hallFront` when `hallFront` hides. */
function wallOverShaftDiff(lab: Lab, front: THREE.Object3D, wingSide: -1 | 1): { diff: number; count: number } {
  const withWall = drawFrame(lab);
  const drawn = withWall.pixels.slice();
  const offsets = wingShaftOffsets(withWall.width, withWall.height, [wingSide]);
  front.visible = false;
  const withoutWall = drawFrame(lab).pixels;
  front.visible = true;
  return { diff: meanPointDiff(drawn, withoutWall, offsets), count: offsets.length };
}

/** Wait for camera zoom transition to settle. */
async function zoomTo(lab: Lab, zoom: number): Promise<void> {
  setZoom(zoom);
  await lab.step(ZOOM_FRAMES);
}

/** Visible meshes under the village that thin by blending. */
function blendedGhosts(): THREE.Mesh[] {
  const ghosts: THREE.Mesh[] = [];
  G.arena.groupOf('village').traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && thinsByBlending(mesh.material)) ghosts.push(mesh);
  });
  return ghosts;
}

/** Channel light difference summed over `pixels` between frames with vs without the hero. */
function heroLightDiff(lab: Lab, pixels: readonly number[]): number {
  const withHim = drawFrame(lab);
  G.player.obj.visible = false;
  const withoutHim = drawFrame(lab);
  G.player.obj.visible = true;
  let sum = 0;
  for (const at of pixels) {
    for (let ch = 0; ch < 3; ch++) sum += Math.abs(withHim.pixels[at + ch] - withoutHim.pixels[at + ch]);
  }
  return sum;
}

/** Stacked ghost count sampled over the hero's chest in `tGhostLayers`. */
function ghostsOverChest(lab: Lab): number {
  drawFrame(lab);
  const chest = G.player.obj.position.clone();
  chest.y += STACK_CHEST_Y;
  const place = chest.project(G.camera);
  const texel = GHOST_COUNT.uGhostTexel.value;
  const column = Math.floor(((place.x + 1) / 2) / texel.x);
  const row = Math.floor(((place.y + 1) / 2) / texel.y);
  return ghostsAt(G.renderer as THREE.WebGLRenderer, column, row);
}

/** Hero share visible behind stacked `hallFront` + portico column (`0..1`). */
function stackedVisibility(lab: Lab): number {
  const pixels = hisPixels(lab);
  if (pixels.length < 100) throw new Error("lab: village: the hero isn't in the frame behind wall and portico column");
  const ghosts = blendedGhosts();
  try {
    for (const mesh of ghosts) mesh.visible = false;
    const clear = heroLightDiff(lab, pixels);
    for (const mesh of ghosts) mesh.visible = true;
    return heroLightDiff(lab, pixels) / Math.max(clear, 1e-6);
  } finally {
    for (const mesh of ghosts) mesh.visible = true;
  }
}

/** Mean RGB difference over the bottom strip of the open wooden door leaves vs `thinningLetGo()`, sampled on each
 *  leaf's inward (camera-facing) face so the steep top-down view ray meets it below `FLOOR_CLEAR`. */
function doorBottomDiff(lab: Lab): { diff: number; count: number } {
  const asDrawn = drawFrame(lab);
  const drawn = asDrawn.pixels.slice();
  const offsets: number[] = [];
  for (const s of [-1, 1]) {
    const hx = TERRACE.x + s * HALL.doorHalf;
    const hz = HALL.door - DOOR_SET;
    for (const t of [0.25, 0.5, 0.75]) {
      const u = t * DOOR_LEAF_LEN;
      const wx = hx - s * (u * Math.cos(DOOR_OPEN) + DOOR_HALF_THICK * Math.sin(DOOR_OPEN));
      const wz = hz - u * Math.sin(DOOR_OPEN) + DOOR_HALF_THICK * Math.cos(DOOR_OPEN);
      const point = new THREE.Vector3(wx, TERRACE.high + 0.05, wz);
      const px = pixelOf(point, asDrawn.width, asDrawn.height);
      if (px !== null) offsets.push(px);
    }
  }
  const restore = thinningLetGo();
  const solid = drawFrame(lab).pixels;
  restore();
  return { diff: meanPointDiff(drawn, solid, offsets), count: offsets.length };
}

/** Hall of Heroes front wall, portico columns, and doorway sight near Chronicle & Stash. */
export async function hallDoorSight(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAtNoon(lab, async () => {
    const front = G.arena.village?.hallCutaway[1];
    if (!front) throw new Error('lab: village: no hall front wall found');
    holdFrontOutsideThins(canary);
    holdPorticoConeOutside(canary);
    holdDoorWedgeCentered(canary);
    holdRoomColumnsOverWalls(canary);
    holdHallFloorClear(canary);
    const lines: string[] = [];
    const problems: string[] = [];
    const moments: Pictured[] = [];
    let wallCaught = false;
    let porticoCaught = false;
    let wedgeCaught = false;
    let doorMiddleCaught = false;
    let orderCaught = false;
    let stackCaught = false;
    let doorBottomCaught = false;
    try {
      for (const zoom of ZOOMS) {
        await zoomTo(lab, zoom);
        for (const stand of STAND_OUTSIDE) {
          await standFacing(lab, stand.x, stand.z, stand.facing);
          const frontShare = wholeShare('hallFront');
          const beamShare = wholeShare('hallBeam');
          const colShare = wholeShare('hallColumn');
          const colSight = (villageReport().columns as { sight: number }).sight;
          const msg = `${stand.name} (zoom ${zoom}): hallFront ${frontShare.toFixed(2)}, hallBeam ${beamShare.toFixed(2)}, `
            + `hallColumn ${colShare.toFixed(2)}, colSight ${colSight.toFixed(2)}`;
          lines.push(msg);
          if (frontShare > 0 || beamShare > 0) {
            wallCaught = true;
            if (!canary) problems.push(`${msg}: front wall or beam thinned from outside in front`);
          }
          if (colShare > 0 || colSight > 0) {
            porticoCaught = true;
            if (!canary) problems.push(`${msg}: portico columns thinned when not hiding the hero`);
          }
          if (!canary && zoom === 0.25 && (stand === STAND_OUTSIDE[0] || stand === STAND_OUTSIDE[1] || stand === STAND_OUTSIDE[5])) {
            moments.push(await lab.screen(`${stand.name} (close zoom)`, []));
          }
          if (zoom === 0.25 && stand.name === 'save slots (rotated)') {
            const bleed = bleedBehindSolidFrontDiff(lab, [-1]);
            if (bleed.count < 1) throw new Error('lab: village: no wing shaft points visible at save slots (rotated)');
            const bleedMsg = `${stand.name} (zoom 0.25): interior column bleed over ${bleed.count} wing points `
              + `${bleed.diff.toFixed(3)} (at most ${MOST_BLEED})`;
            lines.push(bleedMsg);
            if (bleed.diff > MOST_BLEED) {
              wallCaught = true;
              if (!canary) problems.push(bleedMsg);
            }
            const portico = porticoSolidDiff(lab);
            if (portico.count < 1) throw new Error('lab: village: no left portico column points visible at save slots');
            const porticoMsg = `${stand.name} (zoom 0.25): left portico diff vs solid over ${portico.count} points `
              + `${portico.diff.toFixed(3)} (at most ${MOST_PORTICO_DIFF})`;
            lines.push(porticoMsg);
            if (portico.diff > MOST_PORTICO_DIFF) {
              porticoCaught = true;
              if (!canary) problems.push(porticoMsg);
            }
          }
        }
      }
      for (const jamb of JAMB_STANDS) {
        await standFacing(lab, jamb.x, jamb.z, LOOKING_IN);
        const doorCenter = seenShareAt(TERRACE.x, HALL.columnZ[0]);
        if (doorCenter < LEAST_DOOR_SEEN) {
          throw new Error(`lab: village: ${jamb.name} did not see doorway center (${doorCenter.toFixed(2)})`);
        }
        const bleed = bleedBehindSolidFrontDiff(lab, [jamb.wingSide], jamb.unseenColumns);
        if (bleed.count < LEAST_SHAFTS) {
          throw new Error(`lab: village: ${jamb.name} only found ${bleed.count} shaft points behind solid wing`);
        }
        const bleedMsg = `${jamb.name} (zoom 0.25): interior column bleed over ${bleed.count} wing points `
          + `${bleed.diff.toFixed(3)} (at most ${MOST_BLEED})`;
        lines.push(bleedMsg);
        if (bleed.diff > MOST_BLEED) {
          wallCaught = true;
          if (!canary) problems.push(bleedMsg);
        }
        for (const colIdx of jamb.unseenColumns) {
          const unseen = seenShareAt(TERRACE.x + jamb.wingSide * HALL.columnX, HALL.columnZ[colIdx]);
          const msg = `${jamb.name} unseen col ${colIdx}: seen ${unseen.toFixed(2)} (at most ${MOST_WING_SEEN})`;
          lines.push(msg);
          if (unseen > MOST_WING_SEEN) {
            wedgeCaught = true;
            if (!canary) problems.push(msg);
          }
        }
        if (!canary) moments.push(await lab.screen(`${jamb.name} (close zoom)`, []));
      }
      holdFrontOutsideThins(false);
      holdDoorMiddleOff(canary);
      await zoomTo(lab, CAMERA.lobbyZoom);
      await standFacing(lab, TERRACE.x, HALL.door + 0.1, LOOKING_IN);
      const middleDoor = frontWallPointsDiff(lab, DOOR_MIDDLE_X, DOOR_MIDDLE_Y);
      const coneDoor = frontWallPointsDiff(lab, DOOR_CONE_X, DOOR_CONE_Y);
      const wingDoor = frontWallPointsDiff(lab, DOOR_WING_X, DOOR_WING_Y);
      if (middleDoor.count < 2 || coneDoor.count < 2 || wingDoor.count < 2) {
        throw new Error(`lab: village: doorway threshold points out of frame (${middleDoor.count}, ${coneDoor.count}, ${wingDoor.count})`);
      }
      const middleMsg = `at doorway threshold (lobby zoom): doorFade ${doorFadeShare().toFixed(2)}, `
        + `middle bay diff ${middleDoor.diff.toFixed(3)} / wide cone diff ${coneDoor.diff.toFixed(3)} `
        + `(at least ${LEAST_DOOR_MIDDLE_DIFF}), lower wings diff ${wingDoor.diff.toFixed(3)} (at most ${MOST_DOOR_WING_DIFF})`;
      lines.push(middleMsg);
      if (middleDoor.diff < LEAST_DOOR_MIDDLE_DIFF || coneDoor.diff < LEAST_DOOR_MIDDLE_DIFF
        || wingDoor.diff > MOST_DOOR_WING_DIFF) {
        doorMiddleCaught = true;
        if (!canary) problems.push(middleMsg);
      }
      if (!canary) moments.push(await lab.screen('at doorway threshold (cone-of-view opened, lower wings solid)', []));
      holdDoorMiddleOff(false);
      holdFrontOutsideThins(canary);
      await standFacing(lab, TERRACE.x, HALL.inFront - 2.0, LOOKING_IN);
      const insideFront = wholeShare('hallFront');
      if (insideFront < LEAST_FRONT_THIN) {
        throw new Error(`lab: village: inside hall did not thin hallFront (${insideFront.toFixed(2)})`);
      }
      const order = wallOverShaftDiff(lab, front, -1);
      if (order.count < LEAST_SHAFTS) {
        throw new Error(`lab: village: inside hall only found ${order.count} shaft points behind thinned wing`);
      }
      const orderMsg = `inside hall (lobby zoom): wall over ${order.count} shaft points diff ${order.diff.toFixed(3)} `
        + `(at least ${LEAST_WALL_OVER_SHAFT})`;
      lines.push(orderMsg);
      if (order.diff < LEAST_WALL_OVER_SHAFT) {
        orderCaught = true;
        if (!canary) problems.push(`${orderMsg}: interior columns drew over thinned wall`);
      }
      if (!canary) moments.push(await lab.screen('inside hall near front wall', []));
      await zoomTo(lab, 0.25);
      await standFacing(lab, TERRACE.x, HALL.inFront - 2.0, LOOKING_IN);
      const doorBottom = doorBottomDiff(lab);
      if (doorBottom.count < 2) {
        throw new Error(`lab: village: only ${doorBottom.count} door leaf bottom points in frame`);
      }
      const doorBottomMsg = `inside doorway bottom (${doorBottom.count} leaf points, zoom 0.25): diff vs solid `
        + `${doorBottom.diff.toFixed(3)} (at least ${LEAST_DOOR_BOTTOM_DIFF})`;
      lines.push(doorBottomMsg);
      if (doorBottom.diff < LEAST_DOOR_BOTTOM_DIFF) {
        doorBottomCaught = true;
        if (!canary) problems.push(`${doorBottomMsg}: bottom strip of door leaf stayed solid`);
      }
      holdHour(0);
      holdGhostsUncounted(canary);
      holdPorticoDepthInside(canary);
      await standFacing(lab, TERRACE.x + 3.3, HALL.inFront - 0.6, LOOKING_IN);
      const stackGhosts = ghostsOverChest(lab);
      const stackShown = stackedVisibility(lab);
      const stackMsg = `inside behind wall + portico column (midnight, zoom 0.25): ${stackGhosts} ghosts `
        + `(at least ${LEAST_STACK_GHOSTS}), ${(stackShown * 100).toFixed(0)}% of hero shown `
        + `(at least ${LEAST_STACK_SHOWN * 100}%)`;
      lines.push(stackMsg);
      if (stackGhosts < LEAST_STACK_GHOSTS || stackShown < LEAST_STACK_SHOWN) {
        stackCaught = true;
        if (!canary) problems.push(stackMsg);
      }
      if (!canary) moments.push(await lab.screen('inside behind wall + portico column', []));
    } finally {
      front.visible = true;
      hideHallColumns(false);
      holdFrontOutsideThins(false);
      holdPorticoConeOutside(false);
      holdDoorWedgeCentered(false);
      holdDoorMiddleOff(false);
      holdRoomColumnsOverWalls(false);
      holdHallFloorClear(false);
      holdGhostsUncounted(false);
      holdPorticoDepthInside(false);
      await zoomTo(lab, CAMERA.lobbyZoom);
      await standFacing(lab, 0, 4.5, 0);
    }
    if (canary) {
      return {
        lines,
        problems: [],
        caught: wallCaught && porticoCaught && wedgeCaught && doorMiddleCaught && orderCaught && stackCaught
          && doorBottomCaught,
        moments: [],
      };
    }
    return { lines, problems, caught: null, moments };
  });
}
