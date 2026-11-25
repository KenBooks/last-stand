// A boss pictured from its side at a player's height (tools/lab `boss`, parts `rootWalkPictures` and
// `stagStridePictures`): the developer mode's free camera (src/dev/freeCam.ts, which the engine draws from, as it
// takes the game's camera after the game has placed it) held still beside the boss's path at a man's eye, looking
// across it, and one crop of the screen kept for a whole strip. With the camera and the crop both still, a foot
// planted on the earth stays on the same pixels from frame to frame while the body passes over it: Victor judges
// whether the movement could be so in life ("would not be possible irl"), which the top-down view can't show.
import * as THREE from 'three';
import { screenArea, type Clip } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { pastWall } from '../../../src/world/edge';
import { freeCamOn, placeFreeCam, setFreeCam } from '../../../src/dev/freeCam';
import { markedShown, setMarkedShown } from '../../../src/dev/marked';
import { flash, release, type LightSlot } from '../../../src/fx/lights';

/** a man's eye over the floor (m), and the height on the boss the camera looks at */
const EYE = 1.7;
const LOOK_UP = 2.4;
/** the distances off the path tried, as shares of the one asked for, nearest the asked first */
const TRIED = [1, 0.85, 1.2, 0.7, 1.4];
/** the camera's room from a prop (m), the line's room from props, and the least depth inside the wall (m) */
const PROP_ROOM = 1;
const LINE_ROOM = 0.3;
const INSIDE = 1;
/** how deep across the path a strip's crop takes in (m) */
const DEPTH = 1.5;

/** Where the camera stands and the point on the path it looks at. */
export interface SideView {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

const _normal = new THREE.Vector3();

/** The camera's place `distance` m to either side of `on` across the way `way`, at a man's eye, with a clear line to
 *  it (to `body` m short of it: the boss's own body stands there, and a rooted one is an obstacle), off the props and
 *  inside the wall: the side and distance nearest what's asked that is, slid `ahead` m along the way (looking back
 *  across it, to keep a prop by the path out of the shot). Throws where none is, saying why each was
 *  refused. */
export function sideView(on: THREE.Vector3, way: THREE.Vector3, distance: number, body: number,
  ahead = 0): SideView {
  const across = new THREE.Vector3(way.z, 0, -way.x).normalize();
  const refused: string[] = [];
  for (const share of TRIED) {
    for (const side of [1, -1]) {
      const pos = on.clone().addScaledVector(across, side * distance * share).addScaledVector(way, ahead);
      const near = on.clone().addScaledVector(across, side * body);
      const at = `${pos.x.toFixed(1)},${pos.z.toFixed(1)}`;
      if (inObstacle(pos, PROP_ROOM)) {
        refused.push(`${at} in a prop`);
      } else if (!lineClear(pos.x, pos.z, near.x, near.z, LINE_ROOM)) {
        refused.push(`${at} its line blocked`);
      } else if (pastWall(G.arena.biome, pos.x, pos.z, _normal).by > -INSIDE) {
        refused.push(`${at} past the wall`);
      } else {
        pos.y = groundHeight(pos.x, pos.z) + EYE;
        const look = new THREE.Vector3(on.x, groundHeight(on.x, on.z) + LOOK_UP, on.z);
        return { pos, look };
      }
    }
  }
  const path = `${on.x.toFixed(1)},${on.z.toFixed(1)}`;
  throw new Error(`lab: no spot beside the boss's path at ${path} with a clear line to it: ${refused.join('; ')}`);
}

/** the page's class the developer mode's Hide UI sets (src/dev/panel.ts) */
const CLEAN = 'dev-clean';
/** what the side view changed, put back as it ends: whether the UI was hidden and the grass drawn before it, and the
 *  raking light it took */
let before: { clean: boolean; grass: boolean } | null = null;
let raking: LightSlot | null = null;

/** The raking light (`holdSideView`'s `rake`): how far from the path towards the camera it's held (share of the way),
 *  how high over the floor (m), its strength, its reach (m) and its colour (a pale daylight). Low, so it lights the
 *  upright sides of what stands on the floor (the boss's roots, its legs) and only grazes the floor round them. */
const RAKE = { toward: 0.45, high: 0.6, intensity: 90, distance: 9, color: 0xfff1dc };

/**
 * The free camera taken and held at `view` (the game's own camera let go), from the next frame on. The UI is hidden
 * (the developer mode's Hide UI: the boss's bar lay over its antlers) and the grass isn't drawn (its Grass checkbox:
 * tufts at a man's eye hid the hooves and roots where they meet the earth); the floor and all else as the game has it.
 * With `rake`, a light of the pool (`fx/lights.ts`, the scene's count of lights kept) is held low between the camera
 * and the path for the strip alone: the Rootmother's dark roots on the dark earth showed no step without it.
 */
export function holdSideView(view: SideView, rake = false): void {
  before ??= { clean: document.body.classList.contains(CLEAN), grass: markedShown('grass') };
  setFreeCam(true);
  if (!freeCamOn()) throw new Error('lab: the free camera never came on (a dev build has it)');
  document.body.classList.add(CLEAN);
  setMarkedShown('grass', false);
  const dx = view.look.x - view.pos.x, dy = view.look.y - view.pos.y, dz = view.look.z - view.pos.z;
  // (its look is -z turned by its yaw, then tilted up by its pitch)
  placeFreeCam(view.pos, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  if (rake && !raking) {
    const at = view.look.clone().lerp(view.pos, RAKE.toward);
    at.y = groundHeight(at.x, at.z) + RAKE.high;
    raking = flash({ ...RAKE, pos: at, life: 1, hold: Infinity });
  }
}

/** The game's own camera back, and the UI and the grass as they were. */
export function endSideView(): void {
  setFreeCam(false);
  release(raking);
  raking = null;
  if (!before) return;
  document.body.classList.toggle(CLEAN, before.clean);
  setMarkedShown('grass', before.grass);
  before = null;
}

/** The crop kept for a strip: a box round the path from `from` `span` m along `way`, `reach` m before and after it,
 *  `DEPTH` m across and `high` m up, as the camera held at the side sees it (read once the camera has drawn a frame from there). */
export function sideClip(from: THREE.Vector3, way: THREE.Vector3, span: number, reach: number, high: number): Clip {
  const across = new THREE.Vector3(way.z, 0, -way.x).normalize();
  const points: THREE.Vector3[] = [];
  for (const along of [-reach, span + reach]) {
    // (only its middle's depth across: padded towards the camera as far as along, the box filled the screen)
    for (const off of [-DEPTH, DEPTH]) {
      const at = from.clone().addScaledVector(way, along).addScaledVector(across, off);
      const floor = groundHeight(at.x, at.z);
      for (const y of [floor, floor + high]) points.push(new THREE.Vector3(at.x, y, at.z));
    }
  }
  return screenArea(points);
}
