// What the hero can see from where he stands, from above (from play, "we have a bug that allows character to see inside
// buildings while staying outside, we need to evaluate cone of possible view (360) and hide the areas player cannot
// possibly see (black out)"): rays all round him against the walls, as far as each goes kept in a strip of a texture, and
// each pixel of the frame fogged as the post chain starts (before the bloom, so nothing unseen glows), its place in the
// world read from the frame's depth. One program, for every renderer; a wall is a line on the floor, so nothing else in
// the scene compiles or draws more. Through the eyes and over the shoulder the camera stands where he does, and walls hide
// what they hide.
import * as THREE from 'three';

/** A wall as a line on the floor, from (x0, z0) to (x1, z1). */
export interface SightWall { x0: number; z0: number; x1: number; z1: number }

/** A house's roof from above: its middle, its half sides, and its turn about y (as `SightWall`s are turned). */
export interface SightRoof { x: number; z: number; halfW: number; halfD: number; cos: number; sin: number }

/** A door his sight passes through into a room: its middle on its wall's line, the way into the room (a unit), its half
 *  width, and how far out from it he looks in through it (m). */
export interface SightDoor { x: number; z: number; nx: number; nz: number; half: number; reach: number }

/** how many rays go round him, and how far one goes that meets nothing (m) */
const RAYS = 1024;
const FAR = 120;
/** how far he must move for the rays to be cast again (m) */
const MOVED = 0.02;
/** A ray's reach jumping by this much in one cast has passed a corner (m), and what the jump uncovers or covers fades in
 *  place over this long (s). A reach that only slides, as he walks up to a wall, follows at once: eased too, the fog lagged
 *  him past the wall by half a metre, walking; and a reach eased across the jump swept a far place from fog to sight in a
 *  frame all the same. From play, "fog of war should ease in/out, not jerk", "sometimes it's jerking left and right as I'm
 *  walking in straight line": a corner's edge crossed the rays a whole ray at a time, 12 cm a step at 20 m. At 0.5 m a
 *  slide followed at once moved a place 0.35 of the way into sight in a frame as the mage walked past a corner
 *  (`lab village --only fogHoldsSteady`, at most 0.34); at 0.4, 0.33 for every hero. */
const JUMP = 0.4;
const FADES_OVER = 0.22;

/** the rays' strips, four half floats a ray: the band of a jump's nearer and further reach, how much of it is seen, and
 *  its reach as last cast, settled (the hall's sight cone's, `seeSeenFrom` in seeThrough.ts); his in the first row, the
 *  door's he sees through in the second (`DOOR_ROW`) */
const strip = new Uint16Array(RAYS * 4 * 2);
const sightTexture = new THREE.DataTexture(strip, RAYS, 2, THREE.RGBAFormat, THREE.HalfFloatType);
/** where each row is read, as a texture's v: his rays and the door's */
export const HIS_ROW = 0.25;
export const DOOR_ROW = 0.75;
/** how far inside a door its rays are cast from (m), off its wall's line; and how far past that line what they see
 *  comes in, soft (m) */
const DOOR_IN = 0.05;
export const DOOR_SOFT = 0.3;
/** how much nearer the door than him the room's seen from (m): in the doorway the whole room, and out from it the
 *  wedge through its jambs, all but his own line of sight (a lean of his head). At 1.5 m, anywhere on the portico
 *  the whole room counted as seen and none of it lay in the fog, the walls thinned over it, from play, "whree is fog
 *  of war inside the building ?" */
const WEDGE_FROM = 0.3;
/** how far aside of a door he may stand and still look in through it: its half width and this share of how far out he
 *  stands. Stood against its wall beside it he saw the doorway edge on, and the whole room came out of the fog, the
 *  portico's column before him cleared with it (`lab village --only columnsStayGhosts`) */
const DOOR_ASIDE = 0.5;
// (each ray read alone: filtered, two rays' bands in the middle of their own fades met as a third that neither was)
sightTexture.minFilter = sightTexture.magFilter = THREE.NearestFilter;
sightTexture.wrapS = THREE.RepeatWrapping;
sightTexture.wrapT = THREE.ClampToEdgeWrapping;
sightTexture.needsUpdate = true;

/** each ray's reach before its last jump, its reach as last cast, and how far it has faded from the one to the other */
const from = new Float32Array(RAYS).fill(FAR);
const to = new Float32Array(RAYS).fill(FAR);
const faded = new Float32Array(RAYS).fill(1);

/** Where the roofs are, in a map of the ground: what stands high over what's unseen stays seen on a roof alone. By height
 *  alone a tree's lower crown read as one, bright green over the fog (from play, "and tree leaves should be grey too?"). */
const ROOFS_TEXELS = 256;
export const ROOFS_HALF = 64;
/** how far past its walls a roof reaches (m), and how far it's soft (the eaves) */
const ROOF_EAVES = 1.1;
const roofMap = new Uint8Array(ROOFS_TEXELS * ROOFS_TEXELS);
const roofTexture = new THREE.DataTexture(roofMap, ROOFS_TEXELS, ROOFS_TEXELS, THREE.RedFormat, THREE.UnsignedByteType);
roofTexture.minFilter = roofTexture.magFilter = THREE.LinearFilter;
roofTexture.needsUpdate = true;

/** what the map holds within a house's walls, and under its eaves past them: a roof's alpha lets the fog off what's under
 *  it within its walls alone, as a house's inside is always hidden from him. Under the eaves too, the ground past the wall
 *  lay half out of the fog, a strip of green round a house he can't see past (from play, "and here should be all grey,
 *  right ?") */
const WITHIN_WALLS = 255;
const UNDER_EAVES = 127;
/** the roofs last painted, and whether a harness has their eaves count as within their walls, as they did */
let roofsPainted: readonly SightRoof[] = [];
let eavesHeld = false;

/** For a harness (tools/lab): the roofs' eaves letting the fog off what's under them, as they did. */
export function holdEavesAsWithin(held: boolean): void {
  eavesHeld = held;
  paintRoofs(roofsPainted);
}

/** The roofs painted into their map. */
function paintRoofs(roofs: readonly SightRoof[]): void {
  roofsPainted = roofs;
  roofMap.fill(0);
  const texel = (ROOFS_HALF * 2) / ROOFS_TEXELS;
  for (const roof of roofs) {
    const reach = Math.hypot(roof.halfW, roof.halfD) + ROOF_EAVES;
    const first = (at: number): number => Math.max(0, Math.floor((at - reach + ROOFS_HALF) / texel));
    const last = (at: number): number => Math.min(ROOFS_TEXELS - 1, Math.ceil((at + reach + ROOFS_HALF) / texel));
    for (let row = first(roof.z); row <= last(roof.z); row++) {
      for (let column = first(roof.x); column <= last(roof.x); column++) {
        const dx = (column + 0.5) * texel - ROOFS_HALF - roof.x;
        const dz = (row + 0.5) * texel - ROOFS_HALF - roof.z;
        // (back by the turn `turned` in the village's walls made)
        const alongW = dx * roof.cos - dz * roof.sin;
        const alongD = dx * roof.sin + dz * roof.cos;
        if (Math.abs(alongW) <= roof.halfW + ROOF_EAVES && Math.abs(alongD) <= roof.halfD + ROOF_EAVES) {
          const within = Math.abs(alongW) <= roof.halfW && Math.abs(alongD) <= roof.halfD;
          roofMap[row * ROOFS_TEXELS + column] = within || eavesHeld ? WITHIN_WALLS : UNDER_EAVES;
        }
      }
    }
  }
  roofTexture.needsUpdate = true;
}

/** The uniforms of the frame's sight, the same objects in WebGL's pass and WebGPU's nodes. */
export const SIGHT = {
  tSight: { value: sightTexture as THREE.Texture },
  tSightRoofs: { value: roofTexture as THREE.Texture },
  /** how much of the fog is on: 0 where it's off, eased in as the view comes down from above */
  uSightOn: { value: 0 },
  uSightFrom: { value: new THREE.Vector2() },
  uSightInverse: { value: new THREE.Matrix4() },
  /** the building that may be shut to him (least x, least z, most x, most z), and how shut it is: eased as he walks in
   *  and out of it */
  uSightSealed: { value: new THREE.Vector4(1, 1, 0, 0) },
  uSightShut: { value: 0 },
  /** whether the ground seen through a roof away from him is taken as unseen whatever the rays say (`seenColour`):
   *  0, or 1 under a harness, as it was */
  uSightRoofOne: { value: 0 },
  /** a harness's: a ghost's share of what's under it let off the fog whole, its hue too, as it was */
  uSightHueLetOff: { value: 0 },
  /** the door he sees through, where its rays are cast from and the way into its room (x, z, nx, nz), and how much of
   *  what they see counts: eased in as he comes to see through it and out as he stops */
  uSightDoor: { value: new THREE.Vector4(0, 0, 0, 1) },
  uSightDoorOn: { value: 0 },
};

/** How far past a wall's near face the fog is whole, none of it nearer than `wallFrom` (m): from a wall's line the place
 *  past it is unseen at once, and it took 2.3 m past the wall to come in, a green band round the hall as he stood in it
 *  (from play, "grass should be grey outside through a wall"). Across a ray its edge is soft instead, by reading the
 *  rays beside it, `edge` m aside at most `edgeAngle` rad (a corner's edge is the only one the wall doesn't stand over).
 *  How high over what's unseen stays seen: from `over` to `roofs` (a house's roof, over its walls), a crown over that
 *  fogged as the ground under it is (from play, "and tree leaves should be grey too?"); over a building shut to him, up
 *  from `overSealed`, its roof's own height whatever it is. What the fog leaves of what's unseen, and how much of its
 *  colour goes to the fog's own (from play, "solid black does not look good": a wedge of black read as a hole in the
 *  picture, where a dim, colourless village still reads as the place he's in). Its light is pressed into a narrow range,
 *  `floor` up to `floor + range` as `light / (light + knee)` goes: only dimmed, its shadows fell to black and its white
 *  walls stayed the brightest thing there (a review). The inside of a building shut to him is fogged as the open is
 *  (`sealed`, `sealedFloor`, the shares of that it keeps: all): at a quarter, the hall's room seen through its thinned
 *  walls was too dark to read as fog at all, a dark room with its torches lit ("whree is fog of war inside the
 *  building ?"); with none it was a pure black mass over him on the terrace, a void (a review). */
export const SIGHT_LOOK = {
  roofNear: 0.8, roofFar: 1.8, eaves: 0.5, eavesBy: 2.5, groundFrom: 0.4, groundTo: 0.7, wallFrom: 0.05, wall: 0.5, edge: 0.6, edgeAngle: 0.12, over: 3.2, roofs: 5.3, overSealed: 8, overSoft: 0.4, ghostFrom: 0.55, ghostTo: 0.8,
  floor: 0.022, range: 0.2, knee: 0.5, sealed: 1, sealedFloor: 1, grey: 0.85,
  tint: [0.72, 0.82, 1] as const,
};

let walls: readonly SightWall[] = [];
let doors: readonly SightDoor[] = [];
let building: THREE.Vector4 | null = null;
let castFrom: { x: number; z: number } | null = null;
/** the door whose rays the second row holds, and whether a harness has the doors left out, as they were */
let doorCast: SightDoor | null = null;
let doorsHeldOff = false;
/** whether a harness has the door's rays cast without his line of sight through it, as they were */
let wedgeLeft = false;
let heldOff = false;
/** whether a harness has the rays shown as cast, at once and one read a pixel, as they were */
let heldSharp = false;

/** The walls that stop his sight, the building a wall of which he may be outside (its least x and z, its most), and the
 *  roofs over what they stand round. */
export function sightWalls(
  lines: readonly SightWall[],
  sealedBuilding: THREE.Vector4 | null,
  roofs: readonly SightRoof[],
  doorways: readonly SightDoor[] = [],
): void {
  walls = lines;
  doors = doorways;
  paintRoofs(roofs);
  building = sealedBuilding;
  castFrom = null;
  doorCast = null;
  if (sealedBuilding) SIGHT.uSightSealed.value.copy(sealedBuilding);
}

/** For a harness (tools/lab): the doors left out, his rays alone telling what he sees past one, as they did. */
export function holdDoorsOff(off: boolean): void {
  doorsHeldOff = off;
}

/** For a harness (tools/lab): the door's rays cast as from the doorway alone, his line of sight through it left out, as
 *  they were (from the next cast). */
export function holdDoorWedgeOff(off: boolean): void {
  wedgeLeft = off;
  doorCast = null;
}

/** The fog held off whatever else asks for it (`lab village --only sightBlacksOut`'s canary). */
/** For a harness (tools/lab): under a ghost, its share let off the fog whole, its hue too, as it was. */
export function holdFogHueLetOff(held: boolean): void {
  SIGHT.uSightHueLetOff.value = held ? 1 : 0;
}

export function holdSightOff(off: boolean): void {
  heldOff = off;
}

/** For a harness (tools/lab): the ground seen through a roof away from him taken as unseen, as it was. */
export function holdRoofAsOne(held: boolean): void {
  SIGHT.uSightRoofOne.value = held ? 1 : 0;
}

/** For a harness (tools/lab): the rays shown as they're cast, at once, as they were (`--only fogHoldsSteady`'s canary). */
export function holdSightSharp(sharp: boolean): void {
  heldSharp = sharp;
}

/** How far a ray from (x, z) along (dx, dz) goes before a wall. */
function rayReach(x: number, z: number, dx: number, dz: number): number {
  let nearest = FAR;
  for (const wall of walls) {
    const ex = wall.x1 - wall.x0;
    const ez = wall.z1 - wall.z0;
    const facing = dx * ez - dz * ex;
    if (Math.abs(facing) < 1e-6) continue;
    const ox = wall.x0 - x;
    const oz = wall.z0 - z;
    const along = (ox * ez - oz * ex) / facing;
    const on = (ox * dz - oz * dx) / facing;
    if (along > 0 && along < nearest && on >= 0 && on <= 1) nearest = along;
  }
  return nearest;
}

/** how far the eye may move between casts for the rays to fade as they jump (m): further, as it moves across a door's
 *  line (`sightEyeZ` in game/village.ts), a ray of an angle runs along another line from there, and each is cast as it
 *  is, at once */
const EYE_JUMPS = 0.3;

/** The rays cast again from (x, z), where they were last cast from (ox, oz): a jump fades from where the ray stood, a
 *  slide moves its band with it. With the eye moved past `EYE_JUMPS`, each ray as it is now: faded from its reach by
 *  its angle alone, a reach from the other side of the hall's door line was another line's, and the portico's columns,
 *  seen from both, went into the fog in a frame and came back over the fade (`lab village --only hallEntrySteady`);
 *  faded from what was shown along its own line, found by rounds along it, a frame of it stood brighter. */
function castRays(x: number, z: number, ox: number, oz: number): void {
  const jumped = Math.hypot(x - ox, z - oz) > EYE_JUMPS;
  for (let i = 0; i < RAYS; i++) {
    // (as the shader reads them: an angle by `atan(z, x)`, from -pi to pi over the strip, a ray at a texel's middle)
    const angle = ((i + 0.5) / RAYS - 0.5) * Math.PI * 2;
    const now = rayReach(x, z, Math.cos(angle), Math.sin(angle));
    const change = now - to[i];
    if (jumped) {
      from[i] = now;
      faded[i] = 1;
    } else if (Math.abs(change) <= JUMP) from[i] += change;
    else if (faded[i] >= 1) {
      from[i] = to[i];
      faded[i] = 0;
    } else if ((now - to[i]) * (to[i] - from[i]) < 0) {
      // (a jump back within a fade goes on from where it had come to; one further on goes on as it was: begun again at
      // each, a ray along a wall he's crossing the line of, which jumps every frame, took a place to and fro)
      from[i] = to[i];
      faded[i] = 1 - faded[i];
    }
    to[i] = now;
  }
}

/** Each ray's fade taken on by `by`, and the strip written if anything changed. */
function showRays(moved: boolean, by: number): void {
  let any = moved;
  for (let i = 0; i < RAYS; i++) {
    if (faded[i] < 1) {
      any = true;
      faded[i] = heldSharp ? 1 : Math.min(1, faded[i] + by);
    }
  }
  if (!any) return;
  for (let i = 0; i < RAYS; i++) {
    const growing = to[i] > from[i];
    strip[i * 4] = THREE.DataUtils.toHalfFloat(growing ? from[i] : to[i]);
    strip[i * 4 + 1] = THREE.DataUtils.toHalfFloat(growing ? to[i] : from[i]);
    strip[i * 4 + 2] = THREE.DataUtils.toHalfFloat(growing ? faded[i] : 1 - faded[i]);
    strip[i * 4 + 3] = THREE.DataUtils.toHalfFloat(to[i]);
  }
  sightTexture.needsUpdate = true;
}

/** The nearest door he sees through from (x, z): him outside it, before it (`DOOR_ASIDE`) within its reach, no wall
 *  between him and its middle. */
function doorSeenFrom(x: number, z: number): SightDoor | null {
  let seen: SightDoor | null = null;
  let nearest = Infinity;
  for (const door of doors) {
    const dx = door.x - x;
    const dz = door.z - z;
    const away = Math.hypot(dx, dz);
    const out = dx * door.nx + dz * door.nz;
    const aside = Math.abs(dx * door.nz - dz * door.nx);
    const before = out > 0 && aside <= door.half + out * DOOR_ASIDE;
    if (!before || away < 0.01 || away > door.reach || away >= nearest) continue;
    if (rayReach(x, z, dx / away, dz / away) < away) continue;
    seen = door;
    nearest = away;
  }
  return seen;
}

/** How far a ray from (x, z) along (dx, dz) goes before it leaves what's seen from (hx, hz) through the door: the wedge
 *  between the lines from there through its jambs. */
function wedgeReach(door: SightDoor, hx: number, hz: number, x: number, z: number, dx: number, dz: number): number {
  let nearest = FAR;
  for (const side of [-1, 1]) {
    const ex = door.x - door.nz * door.half * side - hx;
    const ez = door.z + door.nx * door.half * side - hz;
    const facing = ex * dz - ez * dx;
    if (Math.abs(facing) < 1e-6) continue;
    const along = -(ex * (z - hz) - ez * (x - hx)) / facing;
    if (along > 0 && along < nearest) nearest = along;
  }
  return nearest;
}

/** The door's rays cast into its second row, from just inside its middle, each as far as the room's walls and his line
 *  of sight through the door from (hx, hz) let it: past the jambs' lines from him he sees none of the room (from play,
 *  "new thinning ignores line of sight": from the stair the whole room came out of the fog and the wall over the door
 *  opened from end to end). */
function castDoor(door: SightDoor, hx: number, hz: number): void {
  const x = door.x + door.nx * DOOR_IN;
  const z = door.z + door.nz * DOOR_IN;
  const row = RAYS * 4;
  // (seen from `WEDGE_FROM` nearer the door than him: from the doorway the room beside the door too;
  // from the stair the wedge through the jambs; within it of the door, the whole room)
  const out = -((hx - door.x) * door.nx + (hz - door.z) * door.nz);
  const fromDoor = out > WEDGE_FROM ? (out - WEDGE_FROM) / out : 0;
  const ax = door.x + (hx - door.x) * fromDoor;
  const az = door.z + (hz - door.z) * fromDoor;
  const wedged = !wedgeLeft && fromDoor > 0;
  for (let i = 0; i < RAYS; i++) {
    const angle = ((i + 0.5) / RAYS - 0.5) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const seen = Math.min(rayReach(x, z, dx, dz), wedged ? wedgeReach(door, ax, az, x, z, dx, dz) : FAR);
    const reach = THREE.DataUtils.toHalfFloat(seen);
    strip[row + i * 4] = reach;
    strip[row + i * 4 + 1] = reach;
    strip[row + i * 4 + 2] = THREE.DataUtils.toHalfFloat(1);
    strip[row + i * 4 + 3] = reach;
  }
  SIGHT.uSightDoor.value.set(x, z, door.nx, door.nz);
  sightTexture.needsUpdate = true;
}

/** The door he sees through cast and eased in, `rate` a share a frame: what he sees through a doorway is the room as
 *  seen from the doorway (from play, "is hall is tall, I need to see tall from top down, from entrance, so no slanted
 *  walls that make it small"; "the character will see closest interior walls, but not the wall behind it"). By his rays
 *  alone, the door's jambs cut the room's floor beside the door out of what he saw, two dark wedges either side that
 *  read as slanted walls narrowing the hall ("you should not be ignoring the door, in field of view calc"). */
function seeThroughDoor(x: number, z: number, rate: number, moved: boolean): void {
  const door = doorsHeldOff ? null : doorSeenFrom(x, z);
  if (door && (door !== doorCast || moved)) {
    castDoor(door, x, z);
    doorCast = door;
  }
  const on = SIGHT.uSightDoorOn;
  on.value += Math.max(-rate, Math.min(rate, (door ? 1 : 0) - on.value));
}

/** The hero at (x, z), the fog `wanted` or not: eased in and out over the frames, `rate` a share a frame, `dt` long. */
export function seeFrom(x: number, z: number, wanted: boolean, rate: number, dt: number): void {
  const target = wanted && !heldOff ? 1 : 0;
  const on = SIGHT.uSightOn;
  on.value += Math.max(-rate, Math.min(rate, target - on.value));
  if (on.value <= 0) return;
  const moved = !castFrom || Math.hypot(castFrom.x - x, castFrom.z - z) > MOVED;
  if (moved) {
    castRays(x, z, castFrom?.x ?? x, castFrom?.z ?? z);
    castFrom = { x, z };
  }
  showRays(moved, dt / FADES_OVER);
  seeThroughDoor(x, z, rate, moved);
  SIGHT.uSightFrom.value.set(x, z);
  const inside = building && x > building.x && x < building.z && z > building.y && z < building.w;
  const shut = SIGHT.uSightShut;
  shut.value += Math.max(-rate, Math.min(rate, (building && !inside ? 1 : 0) - shut.value));
}

/** Whether the fog lies over (x, z), from where the rays were last cast (a thing in it needn't move). */
export function inTheFog(x: number, z: number): boolean {
  if (SIGHT.uSightOn.value < 0.5 || !castFrom) return false;
  const dx = x - castFrom.x;
  const dz = z - castFrom.z;
  const away = Math.hypot(dx, dz);
  if (away < 0.3) return false;
  if (away <= rayReach(castFrom.x, castFrom.z, dx / away, dz / away) + SIGHT_LOOK.wall) return false;
  return seenThroughDoorAt(x, z) <= 0;
}

/** How far (x, z) is seen through the door he sees through, 0 to 1, as `SIGHT_GLSL` reads its row. */
function seenThroughDoorAt(x: number, z: number): number {
  const door = SIGHT.uSightDoor.value;
  const on = SIGHT.uSightDoorOn.value;
  if (on <= 0) return 0;
  const dx = x - door.x;
  const dz = z - door.y;
  const past = THREE.MathUtils.smoothstep(dx * door.z + dz * door.w, 0, DOOR_SOFT);
  return past > 0 ? seenAround(dx, dz, 1) * past * on : 0;
}

/** How far a place `away` m off is seen along the ray at `across` (a share of the strip) of `row` (0 his, 1 the door's),
 *  as `seenAlong` reads it. */
function seenAlongRay(across: number, away: number, row: number): number {
  const ray = ((Math.floor(across * RAYS) % RAYS) + RAYS) % RAYS + row * RAYS;
  const seenPast = (reach: number): number => {
    const span = SIGHT_LOOK.wall - SIGHT_LOOK.wallFrom;
    const past = Math.min(1, Math.max(0, (away - reach - SIGHT_LOOK.wallFrom) / span));
    return 1 - past * past * (3 - 2 * past);
  };
  const nearer = seenPast(THREE.DataUtils.fromHalfFloat(strip[ray * 4]));
  const further = seenPast(THREE.DataUtils.fromHalfFloat(strip[ray * 4 + 1]));
  return nearer + (further - nearer) * THREE.DataUtils.fromHalfFloat(strip[ray * 4 + 2]);
}

/** For a harness (tools/lab): how far (x, z) is seen now, 0 to 1, as `SIGHT_GLSL` reads it off the rays (a harness can't
 *  draw a grid of places a frame). */
export function seenShareAt(x: number, z: number): number {
  const place = SIGHT.uSightFrom.value;
  return Math.max(seenAround(x - place.x, z - place.y, 0), seenThroughDoorAt(x, z));
}

/** How far a place (dx, dz) off a row's rays' middle is seen, read soft across the rays as `SIGHT_GLSL` reads it. */
function seenAround(dx: number, dz: number, row: number): number {
  const away = Math.hypot(dx, dz);
  const across = Math.atan2(dz, dx) / (Math.PI * 2) + 0.5;
  const aside = Math.min(SIGHT_LOOK.edge / Math.max(away, 0.01), SIGHT_LOOK.edgeAngle) / (Math.PI * 2);
  let open = 0;
  for (let tap = -4; tap <= 4; tap++) open += seenAlongRay(across + (aside * tap) / 4, away, row) / 9;
  return open;
}

/** The frame's camera told to the fog, as it's about to be drawn. */
export function aimSight(camera: THREE.Camera): void {
  if (SIGHT.uSightOn.value <= 0) return;
  camera.updateMatrixWorld();
  SIGHT.uSightInverse.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
}

/** WebGL's pass: `colour` at `uv` as he sees it, in the fog where he can't. */
export const SIGHT_GLSL = /* glsl */`
  uniform sampler2D tSight; uniform sampler2D tSightDepth; uniform sampler2D tSightRoofs; uniform float uSightOn; uniform vec2 uSightFrom;
  uniform mat4 uSightInverse; uniform vec4 uSightSealed; uniform float uSightShut; uniform float uSightRoofOne; uniform float uSightHueLetOff;
  uniform vec4 uSightDoor; uniform float uSightDoorOn;
  float seenAlong(float across, float away, float row) {
    vec3 ray = texture2D(tSight, vec2(across, row)).rgb;
    float nearer = 1.0 - smoothstep(ray.r + ${SIGHT_LOOK.wallFrom.toFixed(2)}, ray.r + ${SIGHT_LOOK.wall.toFixed(2)}, away);
    float further = 1.0 - smoothstep(ray.g + ${SIGHT_LOOK.wallFrom.toFixed(2)}, ray.g + ${SIGHT_LOOK.wall.toFixed(2)}, away);
    return mix(nearer, further, ray.b);
  }
  // (how far a place \`to\` off a row's rays' middle is seen, soft across the rays only: the strip read ray by ray)
  float seenAround(vec2 to, float row) {
    float away = length(to);
    if (away < 0.3) return 1.0;
    float across = atan(to.y, to.x) / ${(Math.PI * 2).toFixed(6)} + 0.5;
    float aside = min(${SIGHT_LOOK.edge.toFixed(2)} / away, ${SIGHT_LOOK.edgeAngle.toFixed(2)}) / ${(Math.PI * 2).toFixed(6)};
    float open = 0.0;
    for (int tap = -4; tap <= 4; tap++) open += seenAlong(across + aside * float(tap) * 0.25, away, row);
    return open / 9.0;
  }
  vec3 seenColour(vec3 colour, vec2 uv, float under) {
    if (uSightOn <= 0.0) return colour;
    float depth = texture2D(tSightDepth, uv).r;
    if (depth >= 0.99999) return colour;
    vec4 world = uSightInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 place = world.xyz / world.w;
    vec2 to = place.xz - uSightFrom;
    // (atan(0, 0) is undefined, and NaN smears over the frame in the bloom)
    float away = length(to);
    if (away < 0.3) return colour;
    float open = seenAround(to, ${HIS_ROW.toFixed(2)});
    // (past the door he sees through, the room as seen from the doorway: \`seeThroughDoor\`)
    if (uSightDoorOn > 0.0) {
      vec2 fromDoor = place.xz - uSightDoor.xy;
      float pastDoor = smoothstep(0.0, ${DOOR_SOFT.toFixed(2)}, dot(fromDoor, uSightDoor.zw));
      if (pastDoor > 0.0) open = max(open, seenAround(fromDoor, ${DOOR_ROW.toFixed(2)}) * pastDoor * uSightDoorOn);
    }
    // (the ground seen through a roof is by the rays, green where he sees it, the owner's choice: taken as unseen
    // there, with the ghost of a far wall through a roof, the ground he saw past a house's corner lay grey under its roof)
    float offGround = smoothstep(${SIGHT_LOOK.groundFrom.toFixed(2)}, ${SIGHT_LOOK.groundTo.toFixed(2)}, place.y);
    float throughRoof = (1.0 - smoothstep(0.9, 0.99, under))
      * smoothstep(${SIGHT_LOOK.roofNear.toFixed(2)}, ${SIGHT_LOOK.roofFar.toFixed(2)}, away) * (1.0 - offGround);
    open *= 1.0 - uSightRoofOne * throughRoof;
    float inIt = step(uSightSealed.x, place.x) * step(place.x, uSightSealed.z)
      * step(uSightSealed.y, place.z) * step(place.z, uSightSealed.w);
    float shut = inIt * uSightShut;
    float over = mix(${SIGHT_LOOK.over.toFixed(2)}, ${SIGHT_LOOK.overSealed.toFixed(2)}, shut);
    float above = smoothstep(over, over + ${SIGHT_LOOK.overSoft.toFixed(2)}, place.y);
    float roof = texture2D(tSightRoofs, place.xz / ${(ROOFS_HALF * 2).toFixed(1)} + 0.5).r;
    // (read through a roof, by what's under it, eaves and all: fogged whole past its walls, the roof's own colour went
    // with it, and its eaves stood round it as a dark plate, a review)
    // (and a thinned column's own share, whatever lies past it: fogged with the wall behind it, its ghost stood as a dark
    // slab over the portico, "without 'slanted roof' on it"; none under it is a ghost left whole, fogged as itself)
    float ghostShare = (1.0 - smoothstep(0.9, 0.99, under)) * smoothstep(0.01, 0.05, under);
    // (ground outside every roof's eaves that he can't see is fogged whole, whatever ghost lies over it in the picture: by a
    // far roof's share, its overhang let the grass under it through as green, from play, "still seeing green where
    // character cannot see", \`--only fogPastCottages\`)
    float pastRoofs = (1.0 - offGround) * (1.0 - smoothstep(0.01, 0.05, roof));
    float ghosted = max(throughRoof, ghostShare) * (1.0 - pastRoofs);
    float letOff = mix(1.0, under, max(smoothstep(0.6, 0.9, roof), ghosted));
    if (inIt <= 0.0) {
      above *= min(roof * 2.0, 1.0) * (1.0 - smoothstep(${SIGHT_LOOK.roofs.toFixed(2)},
        ${(SIGHT_LOOK.roofs + SIGHT_LOOK.overSoft).toFixed(2)}, place.y));
    }
    float light = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    vec3 tint = vec3(${SIGHT_LOOK.tint.map((part) => part.toFixed(2)).join(', ')});
    float pressed = ${SIGHT_LOOK.range.toFixed(3)} * light / (light + ${SIGHT_LOOK.knee.toFixed(3)});
    float kept = mix(${SIGHT_LOOK.floor.toFixed(3)} + pressed, ${(SIGHT_LOOK.floor * SIGHT_LOOK.sealedFloor).toFixed(3)} + pressed * ${SIGHT_LOOK.sealed.toFixed(3)}, shut);
    // (under a ghost, its share of the light alone is let off the fog, never its hue: a roof's pixel is roof and ground
    // blended, and fogged by the ground's share alone, the roof's share of the grass under it stayed green, another
    // green under each ghost and each count of them, from play, "not the same greyness of grass at different angles";
    // \`--only fogOneGrey\`)
    float keptUnder = mix(light, kept, letOff);
    vec3 fogged = mix(colour * keptUnder / max(light, 0.001), tint * keptUnder, ${SIGHT_LOOK.grey.toFixed(2)});
    vec3 shown = mix(colour, fogged, (1.0 - max(open, above)) * uSightOn);
    // (only where the place read is the ground's: a ghost that keeps its depth, a wall open round him, is read at
    // its own place, unseen, whatever shows through it, and the grass he sees past the wall he stands at went grey
    // under its hole, from play, "this grass should be green right ?"; there its share lets the fog off whole, as
    // it did)
    // (from over the grass's blades, which stand to half a metre: by groundFrom, their tips under a roof stayed green)
    float byItsShare = max(smoothstep(${SIGHT_LOOK.ghostFrom.toFixed(2)}, ${SIGHT_LOOK.ghostTo.toFixed(2)}, place.y),
      uSightHueLetOff);
    if (byItsShare > 0.0) {
      vec3 whole = mix(colour * kept / max(light, 0.001), tint * kept, ${SIGHT_LOOK.grey.toFixed(2)});
      shown = mix(shown, mix(colour, whole, (1.0 - max(open, above)) * uSightOn * letOff), byItsShare);
    }
    // (the eaves, past its walls, in the fog's hue and their own light: the lit grass under them stood green round the
    // roof; where a roof's map reaches alone, as a column's ghost tells its share too, and fogged so, it stood dark. To
    // the map's last trace: from 0.1, the eave's outer edge, where the map fades out, stood green, \`--only fogUnderEaves\`)
    float eaves = throughRoof * (1.0 - smoothstep(0.6, 0.9, roof)) * smoothstep(0.01, 0.05, roof)
      * uSightOn * (1.0 - open);
    return mix(shown, tint * light * ${SIGHT_LOOK.eaves.toFixed(2)}, eaves * min(under * ${SIGHT_LOOK.eavesBy.toFixed(1)}, 1.0));
  }
`;
