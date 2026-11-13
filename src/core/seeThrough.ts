// Screen-door dissolve of world geometry between the camera and the character it follows, so
// nothing hides the player. Only the main pass: shadow maps render with their own depth
// material, so shadows stay whole.
import * as THREE from 'three';
import { HALL, TERRACE } from '../data/village';
import { RUNNING } from './rendererChoice';
import { VILLAGE } from './beta';
import * as plain from './seeThroughPlain';
import { DOOR_ROW, DOOR_SOFT, HIS_ROW, SIGHT } from './sight';

/** how far over his floor a prop starts to dissolve (m): the terrace's and the hall's floor came apart round his feet
 *  when this was held at the village's ground, 1.6 m under them */
const FLOOR_CLEAR = 0.12;

/** the followed character (chest height), set by the camera every frame */
const focus = { value: new THREE.Vector3() };

/**
 * How a class of material dissolves: x..y the radius round the camera-to-player line where the
 * fade runs out, z the share of pixels dropped at its core (0 turns it off), w how far short of
 * the player it stops. `minY`: nothing lower dissolves (the floor under a prop stays).
 */
interface Kind {
  k: { value: THREE.Vector4 };
  minY: { value: number };
  across: { value: number };
  whole: { value: number };
  /** how far short of him what thins whole comes back (m) */
  ramp: { value: number };
  /** whether it thins by blending, not by a pattern of dropped pixels */
  blended?: boolean;
  /** of `blended`: whether a pale surface of it keeps less of itself than a dark one (`PALE`) */
  pale?: boolean;
  /** of `blended`: thinned where it hides the floor he sees (`HALL_SIGHT`), its depth let go there */
  sight?: boolean;
  /** of `sight`: the share of that it thins by (all if not given) */
  sightShare?: number;
  /** of `sight`: how far it thins by it now (`HALL_SIGHT` if not given) */
  sightOn?: { value: number };
  /** how far round the line to him what thins whole reaches: from x it comes back, whole by y (m at his depth); all of it
   *  if not given */
  reach?: { value: THREE.Vector2 };
  /** the room it thins for (least x, least z, most x, most z): only what has it just past it along the view thins whole;
   *  everywhere if not given */
  room?: { value: THREE.Vector4 };
  /** the door's two jambs (x, z, x, z), for the cone he sees through it to open in it; none if not given */
  door?: { value: THREE.Vector4 };
  /** how far that cone is open (a share of what's in it dropped) */
  doorOn?: { value: number };
}
/** what thins whole reaching all of it */
const ALL_OF_IT = { value: new THREE.Vector2(1e5, 1e6) };
/** how far the hall's walls aside of him and behind thin where they hide the floor he sees (`hallSightCone`): not at
 *  all with him in the hall, where they stand whole or thin each as a whole (`wallHidesNearHim`), from play "here we
 *  should not try to make transparent the side which doesn't help see the hero" */
const HALL_SIGHT_ASIDE = { value: 0 };
/** the same for its columns: with him in the hall or on its portico the portico's alone, told by a share under none.
 *  The room's thinned past him (`lab village --only wallsPastHimWhole`) and those seen through the door went with it
 *  (`--only roomColumnsStay`); left whole from inside, the portico's stood solid by the front wall thinned over the
 *  floor he sees (from play, "black column should partially thin here too", "these should thin too, right ?") */
const HALL_SIGHT_COLUMNS = { value: 0 };
/** a reach under this is something's own, placed by its middle (`seeFade`'s `seeOn`) */
/** whether the see-through is the plain one (`seeThroughPlain.ts`): no village, on WebGL (WebGPU's port reads the
 *  village's uniforms off each material, `shaderPorts.ts`) */
const PLAIN = !VILLAGE && !RUNNING.webgpu;
/** the kinds the plain see-through has: a biome's props are of these alone */
type PlainKind = Parameters<typeof plain.seeThrough>[1];

export const PLACED_BY_MIDDLE = 1e4;
/** the attribute that keeps each part's middle (its object's place in the world) through a merge into one mesh: the
 *  village's still meshes are drawn merged (`mergeStill` in world/props.ts), each at the origin */
export const MIDDLE_ATTRIBUTE = 'seeAt';

/** Whether what's drawn in `material` thins by its own middle, read from `MIDDLE_ATTRIBUTE` (a kind with a reach). */
export function thinsByMiddle(material: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(material)) return false;
  const see = (material as { seeThrough?: SeeThrough }).seeThrough;
  return see?.reach !== undefined;
}

/** `mesh` given its place in the world as every vertex's middle (`MIDDLE_ATTRIBUTE`), on a copy of its geometry of
 *  its own (a geometry is shared by every column). */
export function keepMiddle(mesh: THREE.Mesh): void {
  const at = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const geometry = mesh.geometry.clone();
  const count = geometry.attributes.position.count;
  const middles = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) at.toArray(middles, i * 3);
  geometry.setAttribute(MIDDLE_ATTRIBUTE, new THREE.BufferAttribute(middles, 3));
  mesh.geometry = geometry;
}

/** the most columns whose share of the floor they hide is kept (`columnsSeen`): the hall's 8 and its portico's 4 */
const COLUMNS_MOST = 16;
/** each column's middle on the floor (x, z) and how far he sees the floor it hides (0 to 1), eased by the game */
const COLUMNS_SEEN = { value: Array.from({ length: COLUMNS_MOST }, () => new THREE.Vector3(1e6, 1e6, 0)) };

/**
 * How far he sees the floor each column hides, as the game has eased it (`columnsFade` in game/village.ts): read off
 * the rays at each pixel, a column went from ghost to whole within a step of his as the place it hides crossed the
 * edge of what he sees, the portico's last one flickering as he walked about (from play, "when I move around on
 * portico, last pillar flickers", "it should fade in/out over 1 sec (all changes to it)").
 */
export function columnsSeen(columns: readonly { x: number; z: number; seen: number }[]): void {
  if (columns.length > COLUMNS_MOST) throw new Error(`seeThrough: ${columns.length} columns, at most ${COLUMNS_MOST}`);
  COLUMNS_SEEN.value.forEach((kept, index) => {
    const column = columns[index];
    if (column) kept.set(column.x, column.z, column.seen);
    else kept.set(1e6, 1e6, 0);
  });
}

/** The vertex shader's declarations and the lines that set `vSeeAt` for `kind`: its middle from its attribute where
 *  it thins by its middle (and with it its column's share, none where it's no column: `columnsSeen`), else its
 *  object's place. */
function vertexMiddle(kind: keyof typeof kinds): { declared: string; set: string } {
  if ((kinds[kind] as Kind).reach === undefined) return { declared: '', set: 'vSeeAt = modelMatrix[3].xyz;' };
  return {
    declared: `\nattribute vec3 ${MIDDLE_ATTRIBUTE};\nuniform vec3 uSeeColumns[${COLUMNS_MOST}];\nvarying float vSeeColumn;`,
    set: `vSeeAt = ${MIDDLE_ATTRIBUTE};
        vSeeColumn = -1.0;
        for (int seeColumn = 0; seeColumn < ${COLUMNS_MOST}; seeColumn++) {
          vec2 seeOffColumn = uSeeColumns[seeColumn].xy - ${MIDDLE_ATTRIBUTE}.xz;
          if (dot(seeOffColumn, seeOffColumn) < 0.25) vSeeColumn = uSeeColumns[seeColumn].z;
        }`,
  };
}
/** no room to thin for */
const ANYWHERE = { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) };
/** the hall's room, for what thins whole of its walls */
const HALL_ROOM = { value: new THREE.Vector4(-1e5, -1e5, 1e5, 1e5) };
/** the hall's door's jambs, and how far what hides the cone he sees through it is thinned (`seeDoorCone`) */
const HALL_DOOR = { value: new THREE.Vector4() };
const HALL_DOOR_ON = { value: 0 };
/** the same for what stands in the room past it, less than none (`seeFade`) */
const HALL_DOOR_ROOM = { value: 0 };
/** no door to see through */
const NO_DOOR = { value: new THREE.Vector4() };
const DOOR_SHUT = { value: 0 };
/** the props' hole, which what fades whole has too */
const PROP_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) }, PROP_ACROSS_NOW = { value: 1 };
/** nothing under this height dissolves in a prop: the floor he stands on (`updateSeeThrough`) and what lies lower */
const PROP_MIN_Y = { value: FLOOR_CLEAR };
/** the hole in what's built (`built`), and in the hall's walls and roof, which stays his own size: wide, it opened the
 *  hall's side wall onto the grass */
const BUILT_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
/** a fence's hole (`fence`: the village's palisade), opened wide by the fence hiding him alone, as what's built is by a
 *  house: one hole for both, the palisade hiding him at the village's edge opened the houses' too, and the cottage beside
 *  him went to its footing (from play, "at border of map, the house behind player suddenly disappeared") */
const FENCE_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
// (reaching past him, its w far under 0: a wall thins as one, or not at all, `hallInside` in game/village.ts)
const HALL_K = { value: new THREE.Vector4(1.0, 1.8, 0, -1000) };
/** a hall column's: no hole of its own, as the hall's walls have none: each thins whole. On top of that, a wall's hole cut
 *  a round bite out of the door's jambs and the lintel as he stood in the doorway, and a column's left it clear below and
 *  solid above, a smoke gradient (from play, "still looks broken to me"; a review) */
const COLUMN_K = { value: new THREE.Vector4(1.0, 1.8, 0, 0.25) };
/** the share of the floor he sees the hall's columns thin by (`HALL_SIGHT`; their pale surfaces further, `PALE`) */
const COLUMN_SIGHT = 1.45;
/** the roofs' hole: reaching past him (its w far under 0), so a ghost of a roof is one all over, whichever side of him
 *  the camera looks at it from */
const ROOF_K = { value: new THREE.Vector4(1.0, 1.8, 0, -1000) };
/** how far every roof thins from above, whatever it hides (a share of its pixels; from play, "we should make roof
 *  semi-transparent in this case too, even if hero is not directly under it") */
export const ROOF_GHOST_ABOVE = 0.25;
/** thinned past this a roof lets its depth go, for the fog to read what's under it */
const ROOF_LET_GO = 0.1;
/** the share of what's built's widening a roof's hole takes */
const ROOF_HOLE_WIDER = 0.25;
/** how far a house's gables thin from above: gone, as any ghost of plaster that pale stood as a band over what lay past it */
const GABLE_GHOST_ABOVE = 1;
/** how much wider what's built opens from above while it hides him (m at his depth): his own size, he showed alone in a
 *  roof, "it needs to match the previous screenshot, logically" */
const BUILT_OPENS = 5;
/** the walls' way back over the last of the way to him */
const WALL_RAMP = { value: 2 };
/** how far short of him a ghost comes back (m): over 2 m, as the hall's walls do, a post a stride before him stayed whole */
const GHOST_RAMP = 0.5;
const kinds = {
  /** canopies: a wide hole in every view, since the tree line can hide the player top-down */
  foliage: { k: { value: new THREE.Vector4(2.5, 5, 0.9, 1) }, minY: { value: -1e9 }, across: { value: 1 }, whole: { value: 0 }, ramp: WALL_RAMP },
  /** what stands free: a hole round the line to the player, and all of it a ghost while it hides him, in every view but
   *  through the eyes */
  prop: { k: PROP_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** what's built (a house's walls and roof, the palisade): the same hole from above alone. Over the shoulder the camera
   *  stands on his side of it, and a hole there showed both sides of a wall at once (from play, "I should not able to
   *  see through walls like this") */
  built: { k: BUILT_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** a fence (the palisade): as `built`, its hole opened by what of him it hides alone */
  fence: { k: FENCE_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** a thing's foot on the floor: as `prop`, from the ground up */
  propFoot: { k: PROP_K, minY: { value: -1e9 }, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: GHOST_RAMP } },
  /** the hall of heroes' front wall and its roof over the hero inside: a prop, all of it before him thinned by a share
   *  of its own (`fadeWhole`) */
  // (each wall a kind of its own, thinned by itself: by how far along the view each place stood, a side wall hiding nothing
  // near him thinned where it stood short of him, and one hiding him stayed solid over the last of the way to him, from
  // play, "here we should not try to make transparent the side which doesn't help see the hero", "this wall should be
  // transparent but the one 90 degree to it should not", "here both should be transparent, but only 1 is")
  hallFront: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    sight: true, room: HALL_ROOM, door: HALL_DOOR, doorOn: HALL_DOOR_ON },
  hallBack: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    sight: true, sightOn: HALL_SIGHT_ASIDE },
  hallBeam: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    sight: true },
  hallEast: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    sight: true, sightOn: HALL_SIGHT_ASIDE },
  hallWest: { k: HALL_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    sight: true, sightOn: HALL_SIGHT_ASIDE },
  hallRoof: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true,
    door: HALL_DOOR, doorOn: HALL_DOOR_ON },
  /** the other roofs: as what's built, and a ghost from above (`ROOF_GHOST_ABOVE`) */
  roof: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** a house's gables from above, fainter than its roof: at the roof's own ghost, plaster that pale read as a strip
   *  standing off the roof's end, edge on (a review; from play, "chimney/gable needs work") */
  gable: { k: ROOF_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: WALL_RAMP, blended: true },
  /** what stands free in the hall (its columns, its banners), which hides as much of the room as of him */
  // (those near the line to him: a column well aside of it hides nothing of him, and all gone, the portico stood on plinths)
  hallColumn: { k: COLUMN_K, minY: PROP_MIN_Y, across: PROP_ACROSS_NOW, whole: { value: 0 }, ramp: { value: 0.4 }, blended: true,
    pale: true, sight: true, sightShare: COLUMN_SIGHT, sightOn: HALL_SIGHT_COLUMNS,
    reach: { value: new THREE.Vector2(0.8, 1.6) }, room: HALL_ROOM, door: HALL_DOOR, doorOn: HALL_DOOR_ROOM },
} satisfies Record<string, Kind>;

/** how far the hall's walls thin where they hide the floor he sees (a share of their pixels, `hallSightCone`): from
 *  above, a wall between the camera and him hid what he'd see over the shoulder or through the eyes, from play, "we need
 *  to make the side wall transparent too, because he otherwise cannot see what he could see with 3rd person or 1st person
 *  camera", "not whole wall, right? only the cone of view". Its depth is let go while it's on, or the fog read the floor
 *  seen through it as the wall's place, past what he sees */
const HALL_SIGHT = { value: 0 };

/** How far the hall's walls thin where they hide the floor he sees, 0 to 1 (the game's `hallInside`): with him `inside`
 *  the hall, its front wall and its beam alone (from play, "this should be semi transparent, right? visibility cone
 *  and all"); with him on its portico, the portico's columns alone. */
export function hallSightCone(share: number, inside: boolean, onPortico: boolean): void {
  // (the columns alone, each as one by its middle: a wall thins whole or not at all, the game's `hidesSeenFloor`. By
  // the floor each of its pixels hid, a cone of his sight stood cut across the wall, a slanted pane with the columns
  // through it, from play, "didnt we agree to thin whole wall? but mark unseen regions with fog of war ?")
  HALL_SIGHT.value = 0;
  HALL_SIGHT_ASIDE.value = 0;
  HALL_SIGHT_COLUMNS.value = inside || onPortico ? -share : share;
}

/** how far short of where a ray of his sight stops the floor counts as seen for `seeSightCone`, from all to none (m) */
const SIGHT_CONE_SHORT = { from: 0.4, to: 0.1 };
/** the steps the view behind a wall over a door is read at, on its way down to his floor (`seeSeenPast`) */
const SEEN_PAST_STEPS = 12;


/** What `seeSightCone` reads, for WebGPU's port of it (core/shaderPorts.ts): how far it's on, how far short of each
 *  ray, and how far under his floor the floor it hides is found */
export const SIGHT_CONE = { on: HALL_SIGHT, short: SIGHT_CONE_SHORT, floorClear: FLOOR_CLEAR };

/** The floor a fragment hides, along the view, and how far he sees it by the fog's rays (`seenAlong` in sight.ts): the
 *  hall's walls thinned there alone */
const sightConeGlsl = (byColumn: boolean): string => `
${byColumn ? 'varying float vSeeColumn;' : ''}
uniform float uSeeStillWhole;
uniform float uSeeSight;
uniform float uSeeSightShare;
uniform sampler2D tSight;
uniform vec2 uSightFrom;
uniform vec4 uSightDoor;
uniform float uSightDoorOn;
#define SEE_SIGHT_PATH
// (how far a row's rays see a place \`seeTo\` off their middle: short of where each stops, not the fog's soft band past
// it, by which the foot of a wall past him thinned. By each ray's reach as cast, not as the fog fades it: read one ray
// alone, neighbours a frame apart in their fades flipped it as he walked, and a portico column went in and out of the
// cone, its depth with it, the fog reading the floor behind it, \`lab village --only hallEntrySteady\`)
float seeSeenFrom(vec2 seeTo, float seeRow) {
  float seeAway = length(seeTo);
  // (atan(0, 0) is undefined, and NaN smears over the frame in the bloom)
  if (seeAway < 0.3) return 1.0;
  float seeReach = texture2D(tSight, vec2(atan(seeTo.y, seeTo.x) / ${(Math.PI * 2).toFixed(6)} + 0.5, seeRow)).a;
  return 1.0 - smoothstep(seeReach - ${SIGHT_CONE_SHORT.from.toFixed(2)}, seeReach - ${SIGHT_CONE_SHORT.to.toFixed(2)}, seeAway);
}
// (how far he sees the floor at \`seeAt\`: by his rays, or past the door he sees through by the door's, as the fog has it)
float seeSeenAt(vec2 seeAt) {
  float seeSeen = seeSeenFrom(seeAt - uSightFrom, ${HIS_ROW.toFixed(2)});
  if (uSightDoorOn > 0.0) {
    vec2 seeFromDoor = seeAt - uSightDoor.xy;
    float seePastDoor = smoothstep(0.0, ${DOOR_SOFT.toFixed(2)}, dot(seeFromDoor, uSightDoor.zw));
    if (seePastDoor > 0.0) {
      seeSeen = max(seeSeen, seeSeenFrom(seeFromDoor, ${DOOR_ROW.toFixed(2)}) * seePastDoor * uSightDoorOn);
    }
  }
  return seeSeen;
}
// (whether the view behind \`seeFrom\` passes over what he sees, on its way down to his floor: the floor, or the face of
// a wall his rays stop at, which stands as tall as what hides it. Through a door, the room's floor and its nearest walls,
// never a wall behind those, which his rays don't reach)
float seeSeenPast(vec3 seeFrom) {
  float seeDown = cameraPosition.y - seeFrom.y;
  if (seeDown <= 0.01) return 0.0;
  float seeFloorDown = cameraPosition.y - (uSeeMinY - ${FLOOR_CLEAR.toFixed(2)});
  vec2 seeFloor = cameraPosition.xz + (seeFrom.xz - cameraPosition.xz) * seeFloorDown / seeDown;
  float seeAny = 0.0;
  for (int seeStep = 1; seeStep <= ${SEEN_PAST_STEPS}; seeStep++) {
    seeAny = max(seeAny, seeSeenAt(mix(seeFrom.xz, seeFloor, float(seeStep) / ${SEEN_PAST_STEPS.toFixed(1)})));
  }
  return seeAny;
}
float seeSightCone() {
  if (uSeeSight == 0.0) return 0.0;
  // (a column by the floor its middle hides at his height, all of it as one: by each pixel's, the part of a shaft that
  // hid the floor he sees thinned and the rest stood solid, a step across it, from play "see the step on column")
  vec3 seeBy = uSeeReach.x < ${PLACED_BY_MIDDLE.toFixed(1)} ? vec3(vSeeAt.x, uSeeFocus.y, vSeeAt.z) : vSeeWp;
  // (under none, what stands out past the door's line alone: the portico's columns, not the room's, with him on it)
  if (uSeeSight < 0.0 && seeBy.z < uSeeDoor.y) return 0.0;
  float seeDown = cameraPosition.y - seeBy.y;
  if (seeDown <= 0.01) return 0.0;
  float seeFloorDown = cameraPosition.y - (uSeeMinY - ${FLOOR_CLEAR.toFixed(2)});
  vec2 seeHidden = cameraPosition.xz + (seeBy.xz - cameraPosition.xz) * seeFloorDown / seeDown;
  float seeSeen = seeSeenAt(seeHidden);
  // (a column's as the game eased it, where it's one: \`columnsSeen\`)
  ${byColumn ? 'if (vSeeColumn >= 0.0) seeSeen = vSeeColumn;' : ''}
  return abs(uSeeSight) * uSeeSightShare * seeSeen;
}`;

/** Whether \`kind\` is a column's, thinned by its middle. */
const thinsAsColumn = (kind: keyof typeof kinds): boolean => (kinds[kind] as Kind).reach !== undefined;

/** What a column's capital is drawn in (`userData`, kept by a clone): drawn after its shaft and thinned as pale as it.
 *  Dark granite kept most of itself where the stucco shaft under it thinned as pale, and drawn before the shaft with its
 *  depth let go, the shaft's top showed over it: a solid dark slab on a ghost (from play, "black column should
 *  partially thin here too, right ?"). */
export const OVER_SHAFT = 'overShaft';

/** Whether `material` is a column's capital's (`OVER_SHAFT`). */
export const overShaft = (material: THREE.Material): boolean => material.userData[OVER_SHAFT] === true;

/** how much less of itself a pale surface keeps as it thins by blending (`Kind.pale`): of what's thinned, a share by
 *  its albedo's luminance from `from` to `to`. A pale stucco shaft's ghost over him at the dark granite's share washed
 *  him out, from play, "this needs to be ghosted more... maybe need to vary by color" */
export const PALE = { most: 0.7, from: 0.1, to: 0.55 };

/** how far under the line from the eye to his feet a hole round him comes in, from none to all (m): what lies under
 *  that line hides nothing of him. Opened from his middle down alone, a cottage's wall before him stood as a band over
 *  his legs, its posts across them (from play, "if its thinned, its thinned enough so I can see my full character, not
 *  part"); and by height alone, down to his floor, the disc round his middle took a ledge under his feet on the screen
 *  apart in dots, a band across the frame */
export const HOLE_UNDER = { from: 0.15, to: 0 };

/** Less of it than this left and a blended thing drops the pixel: nothing's drawn, its depth too, or the fog would read
 *  what's under a roof gone as the roof */
export const BLEND_GONE = 0.02;
/** the count of thinned ghosts that blend lying over each pixel of the scene (`core/ghostLayers.ts`), a step of
 *  1 / `GHOSTS_MOST` each, and a pixel's size in it: none bound, the count is none and nothing changes */
export const GHOST_COUNT = {
  tGhostLayers: { value: null as THREE.Texture | null },
  uGhostTexel: { value: new THREE.Vector2(1, 1) },
};
/** the most ghosts one pixel of the count holds */
export const GHOSTS_MOST = 16;

/** Props' dissolve strength at full weight: they stay a faint ghost, so the player can still see what they stand behind. */
const PROP_STRENGTH = 0.7;
/** The props' hole over the shoulder (wide round the camera's way past him) and from above, about the hero's own
 *  size on screen there: at the shoulder's, a stump beside him came apart though it hid nothing of him. */
const PROP_HOLE_CLOSE = { from: 1.0, to: 1.8 };
const PROP_HOLE_TOP = { from: 1.1, to: 2.0 };
/** How much more the props' hole counts an offset across the view (level, aside of the line to him) than up and down
 *  it, over the shoulder and from above: a body is a third as wide as it is tall (at 3, the wall half a metre beside
 *  him still came apart in a strip), and a round hole his height across
 *  took the wall or the cottage he stood beside apart toward the camera, though it hid nothing of him ("should not see
 *  through here, because I'm in the front"). */
const PROP_ACROSS = { close: 4, top: 1.2 };
/** While something hides him (`updateSeeThrough`'s `open`), all that stands free nearer than him thinned alike, a ghost
 *  still there: a hole his own size showed him alone (from play, "character and context around character needs to be
 *  visible even if the character is behind props"), and a wide one cut what it met at its edge, a lantern left floating
 *  over its post and a wall torn along the grass (two reviews). Beside what hides nothing, it isn't thinned. */
const GHOST_WHILE_HIDDEN = 0.55;
/** the props' across held by a harness (the round hole as it was, 1), or null */
let acrossHeld: number | null = null;
/** the hole's opening held by a harness (0: his own size, as it was), or null */
let openHeld: number | null = null;
/** whether a harness thins what's built over the shoulder too, as it was */
let builtThinned = false;
/** whether a harness has what's built open round him whether or not it hides him, as it was */
let heldOpenAlways = false;
/** what a harness holds the roofs' ghost from above at */
let roofGhostHeld: number | null = null;
/** whether a harness holds the props' hole shut (a frame drawn as without it) */
let fadeHeld = false;
/** whether the hall alone is what's thinned for him now, so what stands free stays whole (`propsLeftWhole`) */
let propsWhole = false;

/** The fragment side's declarations and `seeFade()`: the share of this fragment to drop (0 where it hides nothing). */
const SEE_FRAGMENT = `varying vec3 vSeeWp;
varying vec3 vSeeAt;
uniform vec3 uSeeFocus;
uniform vec4 uSeeK;
uniform float uSeeMinY;
uniform float uSeeAcross;
uniform float uSeeWhole;
uniform float uSeeRamp;
uniform vec2 uSeeReach;
uniform vec4 uSeeRoom;
uniform vec4 uSeeDoor;
uniform float uSeeDoorOn;
// (what hides the room he sees into through a door: the wall over it, all of it between the room's own walls, cut
// straight up their faces. Standing at a door the wall over it hid all he could see, from play, "here should open the
// wall above hero, so user can see in the cone up"; by a wedge from him past the door's jambs, and then by the floor each
// pixel hides, its edges ran slanted up the wall and left the room small, where through the eyes he sees it whole and
// tall, "the slanted lines, you see them? but you should not see them... only solid lines, the interior walls")
float seeOverRoom(vec3 seeWp) {
  float seeAcross = min(seeWp.x - uSeeRoom.x, uSeeRoom.z - seeWp.x);
  return smoothstep(-0.02, 0.02, seeAcross);
}
// (whether what stands at seeFrom hides the room's floor, along the view)
float seeDoorCone(vec3 seeFrom) {
  float seeDown = cameraPosition.y - seeFrom.y;
  if (seeDown <= 0.01) return 0.0;
  float seeFloorDown = cameraPosition.y - (uSeeMinY - ${FLOOR_CLEAR.toFixed(2)});
  vec2 seeHidden = cameraPosition.xz + (seeFrom.xz - cameraPosition.xz) * seeFloorDown / seeDown;
  float seeInRoom = min(min(seeHidden.x - uSeeRoom.x, uSeeRoom.z - seeHidden.x), min(seeHidden.y - uSeeRoom.y, uSeeRoom.w - seeHidden.y));
  return smoothstep(0.0, 0.3, seeInRoom);
}
// (whether the sight to this fragment meets the hall's front wall, not over it or through its door)
bool seeBehindFront(vec3 seeWp) {
  if (cameraPosition.z <= uSeeDoor.y || seeWp.z >= uSeeDoor.y) return false;
  vec3 seeAt = cameraPosition + (seeWp - cameraPosition) * (uSeeDoor.y - cameraPosition.z) / (seeWp.z - cameraPosition.z);
  float seeOffMiddle = abs(seeAt.x - ${TERRACE.x.toFixed(2)});
  if (seeAt.y >= ${(TERRACE.high + HALL.wallHigh).toFixed(2)} || seeOffMiddle >= ${HALL.half.toFixed(2)}) return false;
  return seeAt.y >= ${(TERRACE.high + HALL.doorHigh).toFixed(2)} || seeOffMiddle >= ${HALL.doorHalf.toFixed(2)};
}
float seeFadeAt(vec3 seeWp) {
  if (seeWp.y <= uSeeMinY) return 0.0;
  // (a column in the room past the door, its door on told as less than none, shows only as far as the wall before it has
  // opened: drawn after the wall, it stopped at the depth of what stays whole of it in a hard spike, a review. Only where
  // that wall stands before it: dropped wherever it stood, what's seen of the room over the wall lost its shafts, the
  // capitals left in the air, from play, "when entering hall, pillars inside disappear")
  // (and a column of the portico, out before the door's line, thins as one as far as the wall where it stands before the
  // room: left whole, the wall's open part and its whole part met across it in a slanted line, "no slanted walls that
  // make it small, should see through")
  // (by what he sees past it, where the kind reads his sight: "the character will see closest interior walls, but not
  // the wall behind it")
  // (read from the wall's top over each pixel, so the wall opens or stays in whole strips, straight up it: read from
  // each pixel, the edges of what he sees through the door ran slanted up the wall)
  #ifdef SEE_SIGHT_PATH
    vec3 seeTop = vec3(seeWp.x, uSeeMinY + ${HALL.wallHigh.toFixed(2)}, seeWp.z);
    float seeOpen = uSeeDoorOn == 0.0 ? 0.0 : seeOverRoom(seeWp) * seeSeenPast(seeTop);
  #else
    float seeOpen = seeOverRoom(seeWp);
  #endif
  // (a column before the room all gone: a ghost of it stood as a pale slanted shaft over the dark room)
  float seeCone = uSeeDoorOn > 0.0 ? uSeeDoorOn * seeOpen
    : uSeeDoorOn >= 0.0 ? 0.0
    : seeBehindFront(seeWp) ? 1.0 - seeOpen
    : vSeeAt.z > uSeeDoor.y ? min(-uSeeDoorOn * 1.5, 1.0) * seeDoorCone(vec3(vSeeAt.x, uSeeFocus.y, vSeeAt.z)) : 0.0;
  if (uSeeK.z <= 0.0 && uSeeWhole <= 0.0) return seeCone;
  vec3 seeCa = uSeeFocus - cameraPosition;
  float seeL = length(seeCa);
  vec3 seeDir = seeCa / seeL, seeCp = seeWp - cameraPosition;
  float seeAlong = dot(seeCp, seeDir);
  // (how far past him it stands on the floor, along the view: only what stands short of him there can hide him. By its
  // depth along the sight, from above the top of a wall or a column past him counted as before him and thinned, a wall
  // he stood in front of and a column cut across at his depth, from play, "not supposed to make walls transparent like
  // this, because I'm front of the wall", "these pillars in hero hall are oddly cut")
  float seeFlat = length(seeCa.xz);
  // (what has a reach of its own (a column) is placed aside of the way to him by its own middle, so it thins as one:
  // placed by each pixel, a column on the reach's edge stood half ghost and half solid, from play "here bug with
  // thinning". How far past him is still each pixel's: by its middle, a column he stood just behind never opened)
  vec2 seeOn = uSeeReach.x < ${PLACED_BY_MIDDLE.toFixed(1)} ? vSeeAt.xz : seeWp.xz;
  float seePast = seeFlat > 0.01 ? dot(seeWp.xz - uSeeFocus.xz, seeCa.xz) / seeFlat : seeAlong - seeL;
  if (seeAlong <= 0.0 || seePast >= -uSeeK.w) return seeCone;
  // (the offset from the line, its part aside of it, level, counted uSeeAcross times over)
  vec3 seeOff = seeCp - seeDir * seeAlong, seeLevel = vec3(-seeDir.z, 0.0, seeDir.x);
  float seeLevelLength = length(seeLevel);
  vec3 seeSide = seeLevelLength > 1e-3 ? seeLevel / seeLevelLength : vec3(1.0, 0.0, 0.0);
  float seeAside = dot(seeOff, seeSide);
  float seeR = length(seeOff + seeSide * seeAside * (uSeeAcross - 1.0));
  // (a cone from the eye to him, its hole his own size where he stands: what hides him from the eye. A tube as wide all
  // the way took the eave over the camera and the wall beside it apart, at the frame's edges)
  seeR /= max(seeAlong / seeL, 0.05);
  // (what thins whole comes back over the last of the way to him: cut at his depth, a column's foot behind it stood as a
  // pale crescent on its base, a review)
  // (its reach is on the floor, aside of the way to him: all of a column's shaft stands as far aside, and thins as one. By
  // the disc round him on the screen, one side of a shaft stood clear and the other solid, a flat pane, a review)
  float seeFloorOff = seeFlat > 0.01 ? abs(dot(seeOn - uSeeFocus.xz, vec2(-seeCa.z, seeCa.x))) / seeFlat : seeR;
  float seeWhole = uSeeWhole * (1.0 - smoothstep(-uSeeK.w - uSeeRamp, -uSeeK.w, seePast))
    * (1.0 - smoothstep(uSeeReach.x, uSeeReach.y, seeFloorOff));
  // (all that stands over the line from the eye to his feet, as only that can hide him: from his middle alone, a wall
  // before him stood as a band over his legs; the line's height where it passes this fragment, along the view on the
  // floor, or along the sight when the eye is straight over him)
  float seeFeetY = uSeeMinY - ${FLOOR_CLEAR.toFixed(2)};
  vec2 seeToFeet = uSeeFocus.xz - cameraPosition.xz;
  float seeFeetFlat = dot(seeToFeet, seeToFeet);
  float seeOnLine = seeFeetFlat > 1e-4 ? dot(seeCp.xz, seeToFeet) / seeFeetFlat : seeAlong / seeL;
  float seeLineY = cameraPosition.y + (seeFeetY - cameraPosition.y) * seeOnLine;
  float seeAtHim = smoothstep(seeLineY - ${HOLE_UNDER.from.toFixed(2)}, seeLineY - ${HOLE_UNDER.to.toFixed(2)}, seeWp.y);
  return max(max((1.0 - smoothstep(uSeeK.x, uSeeK.y, seeR)) * uSeeK.z * seeAtHim, seeWhole), seeCone);
}
float seeFade() { return seeFadeAt(vSeeWp); }`;

function bindUniforms(uniforms: Record<string, THREE.IUniform>, kind: keyof typeof kinds): void {
  const u = kinds[kind];
  uniforms.uSeeFocus = focus;
  uniforms.uSeeK = u.k;
  uniforms.uSeeMinY = u.minY;
  uniforms.uSeeAcross = u.across;
  uniforms.uSeeWhole = u.whole;
  uniforms.uSeeRamp = u.ramp;
  uniforms.uSeeReach = (u as Kind).reach ?? ALL_OF_IT;
  if ((u as Kind).reach) uniforms.uSeeColumns = COLUMNS_SEEN;
  uniforms.uSeeRoom = (u as Kind).room ?? ANYWHERE;
  uniforms.uSeeDoor = (u as Kind).door ?? NO_DOOR;
  uniforms.uSeeDoorOn = (u as Kind).doorOn ?? DOOR_SHUT;
}

/** What a material dissolves by, as WebGPU reads it off the material (`SeeThrough`, core/shaderPorts.ts `seeMask`):
 *  the followed character, and its kind's hole and floor. */
export interface SeeThrough {
  focus: { value: THREE.Vector3 };
  k: { value: THREE.Vector4 };
  minY: { value: number };
  across: { value: number };
  whole: { value: number };
  ramp: { value: number };
  reach?: { value: THREE.Vector2 };
  room?: { value: THREE.Vector4 };
  door?: { value: THREE.Vector4 };
  doorOn?: { value: number };
  blended?: boolean;
  pale?: boolean;
  sight?: boolean;
  sightShare?: number;
  sightOn?: { value: number };
  /** draws only what's left whole of it, for its depth (`depthOfWhatStaysWhole`) */
  wholeOnly?: boolean;
  /** of `wholeOnly`: thinned past this it writes no depth (a uniform's for the hall's columns, `COLUMN_STILL`) */
  stillWhole?: number | { value: number };
}

/** each kind's values, one object a kind: what WebGPU keeps its nodes by */
const seen = new Map<keyof typeof kinds, SeeThrough>();
/** each kind's values back to its kind */
const kindOfSeen = new Map<SeeThrough, keyof typeof kinds>();

/** `m`'s dissolve given it for WebGPU (`seeThrough`, a property of its own: not copied to a clone, as its
 *  `onBeforeCompile` isn't). */
function markSeeThrough(m: THREE.Material, kind: keyof typeof kinds): void {
  let value = seen.get(kind);
  if (!value) {
    seen.set(kind, value = { focus, ...kinds[kind] });
    kindOfSeen.set(value, kind);
  }
  Object.defineProperty(m, 'seeThrough', { value, configurable: true });
}

/** Dissolve `m` where it stands between the camera and the player. Keeps any patch the material already has. A roof and
 *  what the hall thins whole blend (from play, "Yes, real blending": a pattern of dots over a roof reads as a screen door,
 *  and the fog, reading the depth, stippled it too), with their depth kept, for the fog to read them as what they are. */
export function seeThrough<M extends THREE.Material>(m: M, kind: keyof typeof kinds): M {
  if (PLAIN) return plain.seeThrough(m, kind as PlainKind);
  markSeeThrough(m, kind);
  const blended = (kinds[kind] as Kind).blended === true;
  const pale = blended && (kinds[kind] as Kind).pale === true;
  const sight = blended && (kinds[kind] as Kind).sight === true;
  if (blended) {
    m.transparent = true;
    m.depthWrite = true;
    // (a column too: its depth let go, the fog fogged its own share with the ground past it, a dark slab over the
    // portico, "without 'slanted roof' on it")
    if (kind === 'roof' || kind === 'gable' || kind === 'hallColumn') tellsItsShare(m);
    if (kind !== 'built' && kind !== 'fence') thinningWhole.set(kind, [...(thinningWhole.get(kind) ?? []), m]);
  }
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    bindUniforms(shader.uniforms, kind);
    const middle = vertexMiddle(kind);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSeeWp;\nvarying vec3 vSeeAt;${middle.declared}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 seeWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          seeWp = instanceMatrix * seeWp;
        #endif
        vSeeWp = (modelMatrix * seeWp).xyz;
        ${middle.set}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEE_FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // (a fine ordered pattern, a 4 by 4 Bayer matrix, an even tone: interleaved noise's long lines read on a roof as
        // z-fighting, "z fighting texture at this angle", and a hash's clumps as a broken picture, a review)
        vec2 seeBit = mod(floor(gl_FragCoord.xy), 2.0), seeTwo = mod(floor(gl_FragCoord.xy * 0.5), 2.0);
        float seeN = (abs(seeBit.x - seeBit.y) * 8.0 + seeBit.y * 4.0 + abs(seeTwo.x - seeTwo.y) * 2.0 + seeTwo.y + 0.5) / 16.0;
        if (seeN < seeFade()) discard;`);
    if (sight) seeBySight(shader, kind);
    if (blended) thinByBlending(shader, pale);
    if (pale) shader.uniforms.uSeePaleAll = { value: overShaft(m) ? 1 : 0 };
  };
  // the same code for every kind (they differ in uniforms only), so kinds share programs; on WebGPU a kind's uniforms are
  // nodes of its build, and sharing the first's, the fountain's stone (`prop`) stood solid over him as a wall (`built`) does
  m.customProgramCacheKey = () => (RUNNING.webgpu ? `${key}|seethrough|${kind}` : `${key}|seethrough${blended ? '|blended' : ''}${pale ? '|pale' : ''}${sight ? '|sight' : ''}`);
  return m;
}

/** The sight's uniforms on `shader` (`sightConeGlsl`), and how thinned `kind` still counts as whole. */
function bindSight(shader: { uniforms: Record<string, THREE.IUniform> }, kind: keyof typeof kinds): void {
  shader.uniforms.uSeeSight = (kinds[kind] as Kind).sightOn ?? HALL_SIGHT;
  shader.uniforms.tSight = SIGHT.tSight;
  shader.uniforms.uSightFrom = SIGHT.uSightFrom;
  shader.uniforms.uSightDoor = SIGHT.uSightDoor;
  shader.uniforms.uSightDoorOn = SIGHT.uSightDoorOn;
  shader.uniforms.uSeeStillWhole = kind === 'hallColumn' ? COLUMN_STILL : { value: STILL_WHOLE };
  shader.uniforms.uSeeSightShare = { value: (kinds[kind] as Kind).sightShare ?? 1 };
}

/** `shader` thinned where it hides the floor he sees too (`sightConeGlsl`). Its depth is let go while that's on, and
 *  written by its depth's own draw where it's still whole (`fadeWhole`, `wholeDepthMaterial`): a fragment can't let its
 *  own go, and written as the farthest it failed its own depth test, all of it gone where it hid the floor. */
function seeBySight(shader: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> },
  kind: keyof typeof kinds): void {
  bindSight(shader, kind);
  shader.fragmentShader = shader.fragmentShader
    .replace('float seeFade() {', `${sightConeGlsl(thinsAsColumn(kind))}\nfloat seeFade() {`)
    .replace('if (seeN < seeFade()) discard;', `float seeBySight = seeSightCone();
        if (seeN < max(seeFade(), seeBySight)) discard;`);
}

/** Where ghosts that blend lie one over another, each keeps less, so all of them hide what's past them as one does:
 *  each kept a, n of them kept as much as one alone kept a, and left n times over what's past them, the hero behind
 *  a roof, a gable and a wall darkened by each (the owner's choice: "Fewer layers thin less", where they overlap
 *  alone). Each keeps 1 - (1 - a)^(1 / n), n the ghosts over its pixel; where one alone lies, n is 1. */
const LAYERS_SHARE_GLSL = `float seeLayers = floor(texture2D(tGhostLayers, gl_FragCoord.xy * uGhostTexel).r
          * ${GHOSTS_MOST.toFixed(1)} + 0.5);
        if (seeLayers > 1.5) seeLeft = 1.0 - pow(max(1.0 - seeLeft, 0.0), 1.0 / seeLayers);`;

/** A dissolve's pattern of dropped pixels in `shader` made a blend; `pale`, a pale surface keeping less (`PALE`). */
function thinByBlending(shader: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> },
  pale: boolean): void {
  const paleLess = pale
    ? `seeLeft *= 1.0 - (1.0 - seeLeft) * ${PALE.most.toFixed(2)} * max(uSeePaleAll,
          smoothstep(${PALE.from.toFixed(2)}, ${PALE.to.toFixed(2)}, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))));`
    : '';
  shader.uniforms.tGhostLayers = GHOST_COUNT.tGhostLayers;
  shader.uniforms.uGhostTexel = GHOST_COUNT.uGhostTexel;
  const declared = '#include <common>\nuniform sampler2D tGhostLayers;\nuniform vec2 uGhostTexel;';
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', pale ? `${declared}\nuniform float uSeePaleAll;` : declared)
    .replace('if (seeN < seeFade()) discard;', `float seeLeft = 1.0 - seeFade();
        if (seeLeft < ${BLEND_GONE.toFixed(2)}) discard;`)
    .replace('if (seeN < max(seeFade(), seeBySight)) discard;', `float seeLeft = 1.0 - max(seeFade(), seeBySight);
        if (seeLeft < ${BLEND_GONE.toFixed(2)}) discard;`)
    .replace('#include <opaque_fragment>', `${paleLess}
        ${LAYERS_SHARE_GLSL}
        diffuseColor.a *= seeLeft;
        #include <opaque_fragment>`);
}

/** Whether `material` thins by blending: drawn blended, it's as solid as what's opaque, to a body or a shot. */
export const thinsByBlending = (material: THREE.Material): boolean =>
  (material as { seeThrough?: SeeThrough }).seeThrough?.blended === true;

/** Whether `material` is seen through from above whatever it hides: a roof, or the hall's walls. A cottage's walls and the
 *  palisade blend too, but only open round him while they hide him. */
export const seenThroughFromAbove = (material: THREE.Material): boolean => {
  const k = (material as { seeThrough?: SeeThrough }).seeThrough?.k;
  return k === ROOF_K || k === HALL_K;
};

/** What three sorts a list's blended things by. */
interface Sorted {
  groupOrder: number; renderOrder: number; z: number; id: number; material: THREE.Material; object: THREE.Object3D;
}

/** the middle of what each blended thing draws, in the world: what's built stands still, and is merged, so its own place
 *  says nothing of where it's drawn */
const middles = new WeakMap<THREE.Object3D, THREE.Vector3>();

/** The middle of what `object` draws. */
function middleOf(object: THREE.Object3D): THREE.Vector3 {
  let middle = middles.get(object);
  if (middle) return middle;
  const geometry = (object as THREE.Mesh).geometry;
  if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere();
  middle = (geometry?.boundingSphere?.center.clone() ?? new THREE.Vector3()).applyMatrix4(object.matrixWorld);
  middles.set(object, middle);
  return middle;
}

/** Which comes first of what thins by blending: the depth of what's left whole, so nothing behind it draws over it
 *  whatever the order, then the walls, what stands free before them (drawn under them, a column's ghost was gone, its
 *  capital left in the air, from play, "this geometry is messed up"), the roofs over all (from above nothing built stands
 *  over a roof). */
function drawnInTurn(material: THREE.Material): number {
  const see = (material as { seeThrough?: SeeThrough }).seeThrough;
  // (a column's depth after the walls it stands over, before its own colour)
  if (see?.wholeOnly) return see.k === COLUMN_K && !columnsUnderWalls ? 1.5 : 0;
  if (see?.k === ROOF_K) return 3;
  if (see?.k === COLUMN_K && !columnsUnderWalls) return overShaft(material) ? 2.5 : 2;
  return 1;
}

/** whether a harness has what stands free drawn in with the walls, as it was */
let columnsUnderWalls = false;

/** For a harness (tools/lab): what stands free in the hall drawn in with its walls, as it was. */
export function holdColumnsUnderWalls(held: boolean): void {
  columnsUnderWalls = held;
}

/** For a harness (tools/lab): the hall's columns hidden, or back. */
export function hideHallColumns(hidden: boolean): void {
  for (const material of thinningWhole.get('hallColumn') ?? []) material.visible = !hidden;
  // (their depth with them: a portico's column keeps all of it, and left, its depth stood where none was drawn)
  for (const twin of wholeDepths.get('hallColumn') ?? []) (twin.material as THREE.Material).visible = !hidden;
}

/** The hall's room told to what thins whole of its walls, and its door's jambs (x, z, x, z). */
export function hallRoomIs(room: THREE.Vector4, door: THREE.Vector4): void {
  HALL_ROOM.value.copy(room);
  HALL_DOOR.value.copy(door);
}


/** Whether what stands free stays whole, while the hall alone is what's thinned for him: thinned too, the terrace's coping
 *  stood in dots across the frame, over the hall's foot, for hiding nothing of him, from play, "also this is broken". */
export function propsLeftWhole(whole: boolean): void {
  propsWhole = whole && !propsThinnedHeld;
}

/** whether a harness has what stands free thin while the hall alone is thinned for him, as it did */
let propsThinnedHeld = false;

/** For a harness (tools/lab): what stands free thinned while the hall alone is thinned for him, as it was. */
export function holdPropsThinned(held: boolean): void {
  propsThinnedHeld = held;
}

/** How two things that thin by blending are ordered: in their turns, each back to front by the middle of what it draws.
 *  With its depth let go a whole wall past him was painted over by what stood behind it, in an order that changed with
 *  the camera, as all a merge draws stands at the origin (from play, "this is still flickering"). */
function blendedOrder(a: Sorted, b: Sorted): number {
  const turn = drawnInTurn(a.material) - drawnInTurn(b.material);
  if (turn !== 0) return turn;
  const away = awayFromEye(b.object) - awayFromEye(a.object);
  return away !== 0 ? away : a.id - b.id;
}

/** How far `object` stands from the eye, squared, for the order of what blends: a ring's by its nearest part ahead, any
 *  other's by its middle. */
const awayFromEye = (object: THREE.Object3D): number =>
  nearestAhead.get(object) ?? middleOf(object).distanceToSquared(sortEye.value);

/** what's ordered by its part nearest the eye (`sortByNearest`): each one's parts' places in the world */
const ringParts = new Map<THREE.Object3D, THREE.Vector3[]>();
/** each such one's distance this frame, squared (`sortBlendedFrom`) */
const nearestAhead = new Map<THREE.Object3D, number>();
/** whether a harness has the rings ordered by their middles, as they were */
let ringsByMiddle = false;

/**
 * `mesh` ordered among what blends by its instance nearest the eye ahead of it, not by its middle: the palisade, a ring
 * round the village, has its middle in the village's, so seen from outside it was drawn before the cottages past it, and
 * its ghost in its hole wrote depth they then failed, their walls and roofs gone to their footings (from play, "where
 * did the house go?"; `lab village --only housesPastFence`).
 */
export function sortByNearest(mesh: THREE.InstancedMesh): void {
  const parts: THREE.Vector3[] = [];
  const matrix = new THREE.Matrix4();
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    parts.push(new THREE.Vector3().setFromMatrixPosition(matrix.premultiply(mesh.matrixWorld)));
  }
  ringParts.set(mesh, parts);
}

/** For a harness (tools/lab): the rings ordered by their middles, as they were. */
export function holdRingsByMiddle(held: boolean): void {
  ringsByMiddle = held;
}

/** Each ring's part nearest the eye ahead of it (`toward`, the way it looks), squared, kept for this frame's order. */
function measureRings(toward: THREE.Vector3): void {
  nearestAhead.clear();
  if (ringsByMiddle) return;
  for (const [ring, parts] of ringParts) {
    let nearest = Infinity;
    for (const part of parts) {
      _toPart.subVectors(part, sortEye.value);
      if (_toPart.dot(toward) > 0) nearest = Math.min(nearest, _toPart.lengthSq());
    }
    if (nearest < Infinity) nearestAhead.set(ring, nearest);
  }
}
const _toPart = new THREE.Vector3();

/** Whether `material` draws for what blends' order: what thins by blending, or the depth of what's left whole of it. */
const drawsWithTheBlended = (material: THREE.Material): boolean =>
  thinsByBlending(material) || (material as { seeThrough?: SeeThrough }).seeThrough?.wholeOnly === true;

/** where the camera stands, for what thins by blending to be ordered by */
const sortEye = { value: new THREE.Vector3() };

/** The camera's place told to the order of what blends, as it's about to be drawn, and the way it looks. */
export function sortBlendedFrom(eye: THREE.Vector3, toward: THREE.Vector3): void {
  sortEye.value.copy(eye);
  measureRings(toward);
}

/** whether a harness has what thins by blending sorted among the glows, as it was */
let blendedAmongGlows = false;

/** For a harness (tools/lab): what thins by blending sorted by distance with all else that blends, as it was. */
export function holdBlendedAmongGlows(held: boolean): void {
  blendedAmongGlows = held;
}

/** The order of what blends, for `setTransparentSort`: what's built and thins by blending before all else, as it's as
 *  solid as what's opaque, then back to front as three has it. Sorted by its distance among them, a stair of the tomb past
 *  a portal drew over the portal's vortex, which writes no depth, from the angles that put its mesh nearer the camera
 *  (from play, "some kinda glitch at the portal, only under some angles"). */
export function blendedBuiltFirst(a: Sorted, b: Sorted): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  const firstA = !blendedAmongGlows && drawsWithTheBlended(a.material);
  const firstB = !blendedAmongGlows && drawsWithTheBlended(b.material);
  if (firstA !== firstB) return firstA ? -1 : 1;
  if (firstA) return blendedOrder(a, b);
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.z !== b.z) return b.z - a.z;
  return a.id - b.id;
}

/** whether a harness has the roofs keep their depth over what's under them, as they did */
let roofDepthHeld = false;

/** For a harness (tools/lab): the roofs' depth kept when thinned, so the fog reads a roof over what's under it. */
export function holdRoofDepth(held: boolean): void {
  roofDepthHeld = held;
}

/** The roof's pixel says how much of it is roof: its alpha over what's opaque comes to what's left of what's under it,
 *  which the fog alone lies over (`seenColour`'s `under`). With its depth kept, the fog read a roof's whole pixel as the
 *  roof, and the grass and walls seen through it stood bright over what he can't see (from play, "fog of war bugs"); and
 *  fogged by what's under it, a roof would be the fog's colour whole, as a house's inside is always hidden from him. */
function tellsItsShare(m: THREE.Material): void {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

/** the blended materials of what thins whole, by kind, their depth let go as they thin */
const thinningWhole = new Map<string, THREE.Material[]>();
/** thinned past this share, what thins whole leaves the depth to what's behind it: the fog reads the frame's depth, and
 *  the room behind a ghost of the hall's front wall lay under the fog of the wall's own place, whole */
const DEPTH_LET_GO = 0.3;

/** the meshes that write the depth of what's left whole, by kind, each shown only while its kind's depth is let go; the
 *  first of a kind always, for its program to be warmed with the rest */
const wholeDepths = new Map<FadesWhole, THREE.Mesh[]>();
/** how little thinned counts as left whole: a wall all but solid that gave up its depth let what's behind it draw over
 *  it, the hall's columns standing on the front wall as if painted there (from play, "still looks broken to me"). At half
 *  thinned, the fog read a wall where the ground past it showed through: `--only sightBlacksOut` */
const STILL_WHOLE = 0.15;
/** A column keeps all its depth, drawn after the walls (`drawnInTurn`), so nothing thins past this: where it left off at
 *  the disc round him, the shaft's top drew over its capital's corner, and a column behind over the capital (from play,
 *  "this geometry is messed up", "but this is a defect, right ?"). Walls are drawn after their depth, so a ghost of a
 *  wall must leave what's behind it room; a column's is drawn over them already. */
const KEEPS_ALL = 2;
/** How thinned the hall's columns count as left whole now: all of them with him in the hall (`KEEPS_ALL`), and with him
 *  outside as a wall does, `STILL_WHOLE` (`columnsKeepAllDepth`). Their depth kept, the fog read a thinned column's
 *  place inside the hall, which he can't see, and from over the roof one stood over him as a dark slab (from play,
 *  "why this not becoming transparent ?") */
const COLUMN_STILL = { value: KEEPS_ALL };

/** Whether the hall's columns keep all their depth however thinned (him in the hall), or let a thinned part's go. */
export function columnsKeepAllDepth(all: boolean): void {
  COLUMN_STILL.value = all ? KEEPS_ALL : STILL_WHOLE;
}

/** A material for the depth alone of what's left whole of `kind`. */
function wholeDepthMaterial(kind: FadesWhole, side: THREE.Side): THREE.Material {
  // (a hair behind what it follows, whose own draw must pass the depth test over it)
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false, transparent: true, depthWrite: true, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
  const column = kind === 'hallColumn';
  const stillWhole = column ? COLUMN_STILL : STILL_WHOLE;
  // (a column of the portico, out before the door's line, keeps all its depth: it stands in the open he sees, and let go
  // where the floor it hides is seen, the fog read the ground behind it there and laid a band of fog in steps over a
  // column drawn whole, from play "minus that shade on portico's column on the right side, that one looks weird")
  const kept = column ? 'vSeeAt.z <= uSeeDoor.y && ' : '';
  Object.defineProperty(material, 'seeThrough', {
    value: { focus, ...kinds[kind], blended: false, wholeOnly: true, stillWhole },
  });
  // (what the floor he sees thins too: every kind with a depth of its own is the hall's, all of them thinned by it)
  material.onBeforeCompile = (shader) => {
    bindUniforms(shader.uniforms, kind);
    bindSight(shader, kind);
    const middle = vertexMiddle(kind);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSeeWp;\nvarying vec3 vSeeAt;${middle.declared}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSeeWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ${middle.set}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEE_FRAGMENT}\n${sightConeGlsl(thinsAsColumn(kind))}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (${kept}max(seeFade(), seeSightCone()) > uSeeStillWhole) discard;`);
  };
  // (the columns' a program of their own: under one key, the walls' was compiled first and drawn for the columns too)
  material.customProgramCacheKey = () => (RUNNING.webgpu ? `seethrough|wholeDepth|${kind}`
    : `seethrough|wholeDepth${column ? '|column' : ''}`);
  return material;
}

/**
 * For each mesh under `root` of a kind that lets its depth go, one writing the depth of what's left whole of it. The fog
 * reads the frame's depth: with a wall's let go whole, for what's seen through its ghost to be read as itself, the part of
 * it past him read as the room behind it, and lay in that room's fog, dark glass over the wall he stood before (from play,
 * "here we dont need to see through the wall, because I'm in front of the wall"), and what's behind it drew over it.
 * Depth is written fragment by fragment only by a draw of its own. They stand still, as what they follow does.
 */
export function depthOfWhatStaysWhole(root: THREE.Object3D): void {
  const made = new Map<string, THREE.Material>();
  const twins: { mesh: THREE.Mesh; kind: FadesWhole; of: THREE.Mesh }[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    const kind = ([...HALL_WALL_KINDS, 'hallColumn'] as const).find((name) => thinningWhole.get(name)?.includes(mesh.material as THREE.Material));
    if (!kind) return;
    const key = `${kind}|${mesh.material.side}`;
    let material = made.get(key);
    if (!material) made.set(key, material = wholeDepthMaterial(kind, mesh.material.side));
    const twin = new THREE.Mesh(mesh.geometry, material);
    mesh.updateWorldMatrix(true, false);
    twin.matrix.copy(mesh.matrixWorld);
    twin.matrixWorld.copy(mesh.matrixWorld);
    twin.matrixAutoUpdate = false;
    twin.matrixWorldAutoUpdate = false;
    twin.userData.noMerge = true;
    // (nothing to meet: it's what it follows, a second surface in its plane to a ray)
    twin.raycast = () => {};
    twins.push({ mesh: twin, kind, of: mesh });
  });
  for (const { mesh, kind, of } of twins) {
    // (under what it follows, hidden with it)
    of.add(mesh);
    const ofKind = wholeDepths.get(kind) ?? [];
    mesh.visible = ofKind.length === 0;
    wholeDepths.set(kind, [...ofKind, mesh]);
  }
}

/** A material counting the ghosts of `kind` that blend, one a fragment thinned: drawn into the count alone
 *  (`core/ghostLayers.ts`), unlit, adding up, with no depth, as each is thinned in `seeThrough`. */
function ghostCountMaterial(kind: keyof typeof kinds, side: THREE.Side): THREE.ShaderMaterial {
  const middle = vertexMiddle(kind);
  const sight = (kinds[kind] as Kind).sight === true;
  const fade = sight ? 'max(seeFade(), seeSightCone())' : 'seeFade()';
  const material = new THREE.ShaderMaterial({
    side,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    uniforms: {},
    vertexShader: `varying vec3 vSeeWp;
      varying vec3 vSeeAt;${middle.declared}
      void main() {
        vec4 seeWp = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          seeWp = instanceMatrix * seeWp;
        #endif
        vSeeWp = (modelMatrix * seeWp).xyz;
        ${middle.set}
        gl_Position = projectionMatrix * viewMatrix * vec4(vSeeWp, 1.0);
      }`,
    fragmentShader: `${SEE_FRAGMENT}
      ${sight ? sightConeGlsl(false) : ''}
      void main() {
        float seeGone = ${fade};
        if (seeGone <= 0.0 || 1.0 - seeGone < ${BLEND_GONE.toFixed(2)}) discard;
        gl_FragColor = vec4(${(1 / GHOSTS_MOST).toFixed(6)});
      }`,
  });
  bindUniforms(material.uniforms, kind);
  if (sight) bindSight(material, kind);
  return material;
}

/** the twins the count is drawn with, each under the mesh it counts, and the layer they're on */
const ghostTwins: THREE.Mesh[] = [];

/** Whether any ghost is counted: the count is drawn only then. */
export const ghostsCounted = (): boolean => ghostTwins.length > 0;

/**
 * For each mesh under `root` that thins by blending, a twin drawn into the count of ghosts alone, on `layer`, which no
 * other camera draws. A culled instanced mesh's twin shares its instances and draws as many. They stand still, as what
 * they follow does.
 */
export function countGhosts(root: THREE.Object3D, layer: number): void {
  const made = new Map<string, THREE.ShaderMaterial>();
  const twins: { twin: THREE.Mesh; of: THREE.Mesh }[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const value = (mesh.material as { seeThrough?: SeeThrough }).seeThrough;
    const kind = value && value.blended === true ? kindOfSeen.get(value) : undefined;
    // (not a column: its capital lies over its own shaft, and counted as two, the shaft's top showed through it)
    if (!kind || kind === 'hallColumn') return;
    const key = `${kind}|${mesh.material.side}`;
    let material = made.get(key);
    if (!material) made.set(key, material = ghostCountMaterial(kind, mesh.material.side));
    twins.push({ twin: ghostTwin(mesh, material), of: mesh });
  });
  for (const { twin, of } of twins) {
    twin.layers.set(layer);
    of.add(twin);
    ghostTwins.push(twin);
  }
}

/** A twin of `mesh` drawn with `material`, where it stands: an instanced one's sharing its instances and their
 *  count. */
function ghostTwin(mesh: THREE.Mesh, material: THREE.Material): THREE.Mesh {
  const instanced = mesh as THREE.InstancedMesh;
  let twin: THREE.Mesh;
  if (instanced.isInstancedMesh) {
    const copy = new THREE.InstancedMesh(mesh.geometry, material, instanced.count);
    copy.instanceMatrix = instanced.instanceMatrix;
    copy.onBeforeRender = () => {
      copy.count = instanced.count;
    };
    copy.frustumCulled = false;
    twin = copy;
  } else {
    twin = new THREE.Mesh(mesh.geometry, material);
  }
  // (under what it follows, hidden with it, where it stands: its own matrix none)
  twin.matrixAutoUpdate = false;
  twin.matrixWorldAutoUpdate = false;
  mesh.updateWorldMatrix(true, false);
  twin.matrixWorld.copy(mesh.matrixWorld);
  twin.userData.noMerge = true;
  twin.castShadow = false;
  twin.receiveShadow = false;
  // (nothing to meet: it's what it follows, a second surface in its plane to a ray)
  twin.raycast = () => {};
  return twin;
}

/** The kinds that thin whole. */
export type FadesWhole = HallWallKind | 'hallRoof' | 'hallColumn';

/** The hall's walls, each thinning by itself. */
export const HALL_WALL_KINDS = ['hallFront', 'hallBack', 'hallEast', 'hallWest', 'hallBeam'] as const;
export type HallWallKind = (typeof HALL_WALL_KINDS)[number];

/** How much of what's before the hero `kind` thins by a share of its own, a whole wall's rather than a hole round him. */
export function fadeWhole(kind: FadesWhole, share: number): void {
  kinds[kind].whole.value = share;
  const letGo = share >= DEPTH_LET_GO || ((kind === 'hallFront' || kind === 'hallRoof') && HALL_DOOR_ON.value > 0)
    || ((kinds[kind] as Kind).sight === true && ((kinds[kind] as Kind).sightOn ?? HALL_SIGHT).value !== 0);
  for (const material of thinningWhole.get(kind) ?? []) material.depthWrite = !letGo;
  (wholeDepths.get(kind) ?? []).forEach((mesh, at) => {
    mesh.visible = letGo || at === 0;
  });
}

/** The share `kind` is thinned by now. */
export const wholeShare = (kind: FadesWhole): number => kinds[kind].whole.value;

/** Whether `kind` is thinned at all now. */
export const fadedWhole = (kind: FadesWhole): boolean => kinds[kind].whole.value > 0;

/**
 * A raw shader's share of `seeThrough`: `seeFade()` in its fragment shader (written before its `main`), the share of
 * it to fade where it hides the player, for a glow or a veil to fade out by rather than dither (a screen door in a
 * glow reads as noise). Its vertex shader's world position is the mesh's own, before any displacement.
 */
export function seeThroughFade<M extends THREE.ShaderMaterial>(m: M, kind: keyof typeof kinds): M {
  if (PLAIN) return plain.seeThroughFade(m, kind as PlainKind);
  bindUniforms(m.uniforms, kind);
  const main = /void\s+main\s*\(\s*\)\s*\{/;
  m.vertexShader = `varying vec3 vSeeWp;\nvarying vec3 vSeeAt;\n${m.vertexShader.replace(main, (head) => `${head}
  vSeeWp = (modelMatrix * vec4(position, 1.0)).xyz;
  vSeeAt = modelMatrix[3].xyz;`)}`;
  m.fragmentShader = `${SEE_FRAGMENT}\n${m.fragmentShader}`;
  return m;
}

/** How far short of the followed character a prop's see-through hole ends (m). */
export const seeHoleEnd = (): number => (PLAIN ? plain.seeHoleEnd() : kinds.prop.k.value.w);

/**
 * Each frame: where the followed character is, how far props dissolve (0..1: none through the eyes), how far the view
 * is from above (0..1), whose hole is narrower, and how far the hole opens round him (0..1: `core/heroHidden.ts`): for
 * what hides him, for what's built alone and for a fence alone.
 */
export function updateSeeThrough(x: number, y: number, z: number, props: number, top: number, floor = 0, open = 0,
  builtOpen = 0, fenceOpen = 0, propsOver = 1): void {
  if (PLAIN) {
    plain.updateSeeThrough(x, y, z, props, top);
    return;
  }
  focus.value.set(x, y, z);
  PROP_MIN_Y.value = floor + FLOOR_CLEAR;
  const from = PROP_HOLE_CLOSE.from + (PROP_HOLE_TOP.from - PROP_HOLE_CLOSE.from) * top;
  const to = PROP_HOLE_CLOSE.to + (PROP_HOLE_TOP.to - PROP_HOLE_CLOSE.to) * top;
  const strength = fadeHeld ? 0 : PROP_STRENGTH * props;
  // (the hole his own size only while what stands free hides him at his waist or above: a parapet before his legs alone
  // stood in dots over them, "dont thin if obstacle is below waist", and the hole took the corner of the notice board
  // beside him, which hid nothing of him, "half drawn props")
  const overHeld = heldOpenAlways || openHeld !== null || fadeHeld;
  PROP_K.value.set(from, to, strength * (overHeld ? 1 : propsOver), PROP_K.value.w);
  // (from above alone, what's built: over the shoulder the camera is on his side of it)
  const built = builtThinned ? strength : strength * top;
  const wider = (openHeld ?? builtOpen) * top * BUILT_OPENS;
  // (only while it hides him: a hole his own size all the time thinned the wall he stood beside, hiding nothing of him,
  // and a shutter thinned there, its depth written, held back the wall behind it, the grass past both showing through,
  // from play, "it shows green where it should not")
  const hides = (share: number): number => (heldOpenAlways ? 1 : openHeld === null ? share : 1);
  BUILT_K.value.set(from + wider, to + wider, built * hides(builtOpen), BUILT_K.value.w);
  const fenceWider = (openHeld ?? fenceOpen) * top * BUILT_OPENS;
  FENCE_K.value.set(from + fenceWider, to + fenceWider, built * hides(fenceOpen), FENCE_K.value.w);
  // (a roof's hole opens less wide: wide as a wall's while it hides him, it took all of a cottage's roof, and what lay under
  // it stood as a glass box with a strip of grass across it, where the roof of the next cottage stood whole, a review)
  const roofWider = wider * ROOF_HOLE_WIDER;
  ROOF_K.value.set(from + roofWider, to + roofWider, built, ROOF_K.value.w);
  kinds.roof.whole.value = (roofGhostHeld ?? ROOF_GHOST_ABOVE) * top * props;
  kinds.gable.whole.value = GABLE_GHOST_ABOVE * top * props;
  for (const material of [...(thinningWhole.get('roof') ?? []), ...(thinningWhole.get('gable') ?? [])]) {
    material.depthWrite = roofDepthHeld || kinds.roof.whole.value < ROOF_LET_GO;
  }
  // (what's built hiding him alone leaves what stands free whole: a lamp past a cottage stood in dots, a review; and what
  // stands free thins all the way as soon as it hides any of him, never by a share: by the share of him hidden, the
  // notice board's roof grazing him thinned a little, and only in the hole round him, "if its thinned, its thinned
  // enough so I can see my full character")
  const propsHide = openHeld ?? propsOver;
  kinds.prop.whole.value = fadeHeld || propsWhole ? 0 : propsHide * GHOST_WHILE_HIDDEN * props;
  kinds.propFoot.whole.value = kinds.prop.whole.value;
  PROP_ACROSS_NOW.value = acrossHeld ?? PROP_ACROSS.close + (PROP_ACROSS.top - PROP_ACROSS.close) * top;
}

/** For a harness (tools/lab): every roof thinned from above by `ghost` (null: the game's), from the next frame: thinner,
 *  what lies under one shows enough to read the fog on it. */
export function holdRoofGhost(ghost: number | null): void {
  roofGhostHeld = ghost;
}

/** For a harness (tools/lab): the props' hole held shut, at once (a frame drawn again as it was, without it), and its
 *  across held (null: the game's) from the next frame. */
export function holdPropHole(shut: boolean, across: number | null = null): void {
  fadeHeld = shut;
  acrossHeld = across;
  if (!shut) return;
  for (const k of [PROP_K, BUILT_K, FENCE_K, ROOF_K]) k.value.z = 0;
  kinds.prop.whole.value = 0;
  kinds.propFoot.whole.value = 0;
}

/** For a harness (tools/lab): the hole's opening held (0: his own size, as it was; null: the game's). */
export function holdHoleOpening(opening: number | null): void {
  openHeld = opening;
}

/** For a harness (tools/lab): what's built drawn with no hole, at once (a frame drawn again as it was without it). */
export function holdBuiltWhole(whole: boolean, built: number): number {
  const was = BUILT_K.value.z;
  BUILT_K.value.z = whole ? 0 : built;
  FENCE_K.value.z = whole ? 0 : built;
  ROOF_K.value.z = whole ? 0 : built;
  return was;
}

/** For a harness (tools/lab): the hole in what's built or in a fence drawn shut, at once, until the next frame opens it as
 *  the game does (a frame drawn again as it was without it). */
export function shutHole(kind: 'built' | 'fence'): void {
  (kind === 'built' ? BUILT_K : FENCE_K).value.z = 0;
}

/** For a harness (tools/lab): what's built and the hall's columns drawn with nothing thinned (the floor he sees thinning
 *  them too, `hallSightCone`), at once, and a function that puts it back. What stands free and the roofs stay as they are: a ghost of one over a wall is no fault of the wall's. */
export function thinningLetGo(): () => void {
  const kept = BUILT_K.value.z;
  const fenceKept = FENCE_K.value.z;
  const sight = HALL_SIGHT.value;
  const thinned = ([...HALL_WALL_KINDS, 'hallColumn'] as const).map((kind) => [kind, kinds[kind].whole.value] as const);
  BUILT_K.value.z = 0;
  FENCE_K.value.z = 0;
  HALL_SIGHT.value = 0;
  const aside = HALL_SIGHT_ASIDE.value;
  const columns = HALL_SIGHT_COLUMNS.value;
  HALL_SIGHT_ASIDE.value = 0;
  HALL_SIGHT_COLUMNS.value = 0;
  for (const [kind] of thinned) fadeWhole(kind, 0);
  return () => {
    BUILT_K.value.z = kept;
    FENCE_K.value.z = fenceKept;
    HALL_SIGHT.value = sight;
    HALL_SIGHT_ASIDE.value = aside;
    HALL_SIGHT_COLUMNS.value = columns;
    for (const [kind, share] of thinned) fadeWhole(kind, share);
  };
}

/** For a harness (tools/lab): what thins reaching past him, as a depth along the sight had it from above. */
export function holdThinningReach(past: boolean): void {
  for (const k of [PROP_K, BUILT_K, FENCE_K, COLUMN_K]) k.value.w = past ? -1000 : 0.25;
}

/** For a harness (tools/lab): what's built open round him whether or not it hides him, as it was. */
export function holdBuiltOpenAlways(always: boolean): void {
  heldOpenAlways = always;
}

/** For a harness (tools/lab): what's built thinned over the shoulder too, as it was. */
export function thinBuiltOverShoulder(on: boolean): void {
  builtThinned = on;
}
