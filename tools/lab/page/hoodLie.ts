// tools/lab hood: how the hood's capelet lies on him. From play: "this doesn't seem like cloth, why it sticks out from
// body": laid as a cone over the shoulders, held there and fended off by capsules 4 cm over the coat, it stood off his
// shoulders as pauldrons do. Each point of its outside from the row below where it begins (`HoodCloth`'s
// `userData.grid.capelet`: the join, where the hood's gathers fold onto it) down to its hem is read by a ray from
// `LIE_FROM` out along its normal back in onto his body as drawn (`BakedBody`:
// what he holds and the hood itself left out): how far it stands off what it covers, or, where the ray meets him
// before it, how deep his body has come out through it. Read round him: the front, over the shoulders, down the back;
// with --rows, row by row from its first, and where its farthest and deepest points are and what they lie over. And
// above the capelet, from below the jaw down to the join, how deep his body comes through the hood (the harness
// straps' tops came out through its front there, under the rim's foot drawn in round the collar, and the capelet's
// reading never looked: "cloth should not clip through hood").
import * as THREE from 'three';
import type { Lab } from './lab';
import { BakedBody, isUnder } from './geometry';

/** the most the capelet may stand off him (cm): as a rule (its median), and at its tenth farthest; over the fronts
 *  of his shoulders, closer: the reference's lies flat on them (lifted off the coat over the straps' tops and the
 *  front of the shoulder, ours puffed out forward over them, "reference does not overhang over shoulder, ours does";
 *  read with the rest of his shoulders, it passed) */
const MOST_OFF = { typical: 2, far: 4 };
/** (the shape the owner kept, #711: off the fronts of his shoulders 1.5 cm, a tenth 2.7, where the reference's lies at
 *  1.2 and 2.5; off his back 2.7, a tenth 3.6) */
const MOST_OFF_FORE = { typical: 2, far: 3.5 };
const MOST_OFF_BACK = { typical: 3.5, far: 4.5 };
/** where round him a point is: how far from his front about the chest's axis, either way (degrees), at most, and how
 *  far the capelet may stand off him there */
const REGIONS = [
  { name: 'front', most: 45, off: MOST_OFF },
  { name: 'shoulders in front', most: 90, off: MOST_OFF_FORE },
  { name: 'shoulders', most: 135, off: MOST_OFF },
  { name: 'back', most: 180, off: MOST_OFF_BACK },
] as const;
type Region = (typeof REGIONS)[number]['name'];
/** the deepest his body may come out through it (cm): what's read is the cloth's outside, so anything through it
 *  shows (at 3 mm, the coat's front of the shoulder stood 2 mm out through the capelet and passed, a patch of the coat
 *  on it in the parts look) */
const MOST_THROUGH = 0.1;
/** how far out along a point's normal its ray starts back in (m): past anything the capelet lies over */
const LIE_FROM = 0.15;
/** how far past the point its ray looks for him (m): beyond, the point covers nothing */
const LIE_PAST = 0.2;
/** how many of a region's farthest and deepest points --rows names */
const NAMED = 3;
/** with --canary: how far the capelet is lifted off him (cm), and how much further off the measure must read it */
const CANARY_LIFT = 4;
const CANARY_LEAST_LIFT = 3;
/** with --canary: how deep its back is sunk (cm: past where it stands off him, `MOST_OFF.far`, and on into him), and how
 *  deep the measure must read him come through */
const CANARY_SINK = 7;
const CANARY_LEAST_SINK = 2;
/** how far down the hood (a share of its rows from the top seam) its body's coming through it is read from, above the
 *  capelet: below the jaw, where it falls onto the collar and the shoulders; and the rows over the join left out
 *  (their normals the fold's) */
const THROUGH_FROM = 0.35;
const JOIN_ROWS = 1;
/** how far out along the cloth's normal his body is looked for over the hood above the capelet (m: a body come through
 *  lies a few millimetres out, the canary's 5 cm), and the least its surface there may face the way the cloth does (the
 *  cosine between their normals). In the gathers' valleys at the nape the cloth's normal turns down: looked for from 15
 *  cm out, and whatever it faced, the ray met his back from below, and a brass fitting 14 cm out, read as come through
 *  as he walked */
const THROUGH_LOOK = 0.06;
const LEAST_FACING = 0.5;
/** with --canary: how deep the hood's front below the jaw is sunk into him (cm), and how deep the measure must read
 *  him come through it */
const CANARY_HOOD_SINK = 5;
const CANARY_LEAST_HOOD_SINK = 2;

/** The hood's outside, its grid (how far down it each row is, 0 to 1) and the row its capelet begins on. */
export interface CapeletMesh {
  mesh: THREE.Mesh;
  across: number;
  down: number;
  rows: number[];
  capelet: number;
}

/** A point of the capelet read: how far it stands off him (cm; negative, how deep he's come through), its row from
 *  where the capelet begins, where it is in the chest's space, and what it lies over. */
interface LiePoint {
  off: number;
  row: number;
  inChest: THREE.Vector3;
  over: string;
}

/** One region's points read, and how many cover nothing. */
interface RegionLie {
  points: LiePoint[];
  bare: number;
}

export interface Lie {
  regions: Record<Region, RegionLie>;
  rows: number;
}

/** A point of the capelet's outside in the world: where it is, which way it faces, and its row. */
interface ClothPoint {
  at: THREE.Vector3;
  normal: THREE.Vector3;
  row: number;
}

/** A region's reading (cm): its median, its tenth farthest and its deepest through. */
interface Reading {
  typical: number;
  far: number;
  through: number;
}

function emptyLie(rows: number): Lie {
  const region = (): RegionLie => ({ points: [], bare: 0 });
  const regions = Object.fromEntries(REGIONS.map(({ name }) => [name, region()]));
  return { regions: regions as Record<Region, RegionLie>, rows };
}

/** His body as drawn this frame, but what he holds and the hood. */
function bodyOf(lab: Lab, held: THREE.Object3D[]): THREE.Mesh[] {
  const include = (mesh: THREE.Mesh) => !mesh.userData.hoodPart && !held.some((thing) => isUnder(mesh, thing));
  return new BakedBody(lab.model.root, lab.joints, include).bake();
}

/** The capelet's first row: the one below the row it begins on, the join, where the hood's gathers fold onto it (the
 *  join's normal is the fold's: along it, his back read 10 cm through the capelet). */
function firstRow(hood: CapeletMesh): number {
  return hood.capelet + 1;
}

/** The capelet's rows: from its first down to its hem. */
function capeletRows(hood: CapeletMesh): [number, number] {
  return [firstRow(hood), hood.down];
}

/** The hood's rows above its capelet that its body's coming through is read on: from `THROUGH_FROM` of the way down
 *  to those over the join. */
function hoodRows(hood: CapeletMesh): [number, number] {
  return [hood.rows.findIndex((share) => share >= THROUGH_FROM), hood.capelet - JOIN_ROWS];
}

/** The hood's outside, point by point, over rows `from` to `to` (each point's row counted from `from`). */
function clothPoints(hood: CapeletMesh, [from, to]: [number, number]): ClothPoint[] {
  const geometry = hood.mesh.geometry;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const world = hood.mesh.matrixWorld;
  const turn = new THREE.Matrix3().getNormalMatrix(world);
  const points: ClothPoint[] = [];
  for (let k = from * hood.across; k < to * hood.across; k++) {
    const at = new THREE.Vector3().fromBufferAttribute(position, k).applyMatrix4(world);
    const facing = new THREE.Vector3().fromBufferAttribute(normal, k).applyMatrix3(turn).normalize();
    points.push({ at, normal: facing, row: Math.floor(k / hood.across) - from });
  }
  return points;
}

/** What the point lies over and how far it stands off it (cm; negative, how deep it's come through), how square the
 *  surface met faces the way the cloth does (the cosine between their normals), or null if it covers nothing. */
function overAt(point: ClothPoint, body: THREE.Mesh[], ray: THREE.Raycaster, look = LIE_FROM):
  { off: number; over: string; facing: number } | null {
  const from = point.at.clone().addScaledVector(point.normal, look);
  ray.set(from, point.normal.clone().negate());
  ray.far = look + LIE_PAST;
  const hit = ray.intersectObjects(body, false)[0];
  if (!hit) return null;
  const met = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : point.normal;
  return {
    off: (hit.distance - look) * 100,
    over: String(hit.object.userData.label ?? hit.object.name),
    facing: met.dot(point.normal),
  };
}

/** Where round him a point is, from where it is in the chest's space. */
function regionOf(inChest: THREE.Vector3): Region {
  const round = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(inChest.x, inChest.z)));
  return REGIONS.find((region) => round <= region.most)!.name;
}

/** How the capelet lies on him as he stands now. */
export function lieOf(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[]): Lie {
  const body = bodyOf(lab, held);
  const ray = new THREE.Raycaster();
  const toChest = lab.joints.chest.matrixWorld.clone().invert();
  const lie = emptyLie(hood.down - firstRow(hood));
  for (const point of clothPoints(hood, capeletRows(hood))) {
    const inChest = point.at.clone().applyMatrix4(toChest);
    const region = lie.regions[regionOf(inChest)];
    const read = overAt(point, body, ray);
    if (read) region.points.push({ off: read.off, over: read.over, row: point.row, inChest });
    else region.bare++;
  }
  return lie;
}

/** The value `share` of the way up the sorted values. */
function quantile(sorted: number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

const sortedOffs = (points: LiePoint[]): number[] => points.map((point) => point.off).sort((a, b) => a - b);

/** A region's reading, or null where none of the capelet lies over it. */
function readingOf(region: RegionLie): Reading | null {
  if (!region.points.length) return null;
  const sorted = sortedOffs(region.points);
  return { typical: quantile(sorted, 0.5), far: quantile(sorted, 0.9), through: Math.max(0, -sorted[0]) };
}

/** The lie as lines, a problem for each region standing off or come through past its limit. */
export function lieLines(lie: Lie, problems: string[]): string[] {
  const lines = [`the capelet on him, cm off his body (his body through it ${MOST_THROUGH} deep at most):`];
  for (const { name, off } of REGIONS) {
    const region = lie.regions[name];
    const read = readingOf(region);
    if (!read) {
      lines.push(`  ${name}: none of it`);
      continue;
    }
    const bare = region.bare ? `, ${region.bare} over nothing` : '';
    lines.push(`  ${name}: ${read.typical.toFixed(1)} as a rule (${off.typical} at most), ${read.far.toFixed(1)} at its `
      + `tenth farthest (${off.far}), through it ${read.through.toFixed(1)} at worst (${region.points.length} `
      + `points${bare})`);
    problems.push(...regionProblems(name, off, read));
  }
  const overNone = REGIONS.every(({ name }) => !lie.regions[name].points.length);
  if (overNone) problems.push('hood: the capelet lies over none of him');
  return lines;
}

/** A region's problems: standing off him past `off`, or him come through it. */
function regionProblems(name: Region, off: { typical: number; far: number }, read: Reading): string[] {
  const problems: string[] = [];
  if (read.typical > off.typical) {
    problems.push(`hood: the capelet stands ${read.typical.toFixed(1)} cm off his ${name}`);
  }
  if (read.far > off.far) {
    problems.push(`hood: a tenth of the capelet stands ${read.far.toFixed(1)} cm off his ${name}`);
  }
  if (read.through > MOST_THROUGH) {
    problems.push(`hood: his ${name} comes ${read.through.toFixed(1)} cm through the capelet`);
  }
  return problems;
}

/** Where his body comes through the capelet deepest in a lie: how deep (cm), round him where, and the point; null
 *  where it comes through nowhere. */
export interface Deepest {
  through: number;
  region: Region;
  point: LiePoint;
}

export function deepestOf(lie: Lie): Deepest | null {
  let deepest: Deepest | null = null;
  for (const { name } of REGIONS) {
    for (const point of lie.regions[name].points) {
      if (point.off >= 0 || (deepest && -point.off <= deepest.through)) continue;
      deepest = { through: -point.off, region: name, point };
    }
  }
  return deepest;
}

/** The deepest his body came through the capelet as he walked as a line, and a problem past the limit. (Standing it
 *  lay clear of him; as his arm swung forward, the sleeve's top and the coat's stitched shoulder seam came through
 *  it) */
export function walkingLine(deepest: Deepest | null, moments: number, problems: string[]): string {
  if (!deepest) return `walking, his body through the capelet nowhere (${moments} moments)`;
  const read = `${deepest.through.toFixed(1)} cm at worst, his ${deepest.region}: ${pointWords(deepest.point)}`;
  if (deepest.through > MOST_THROUGH) problems.push(`hood: walking, his body came through the capelet ${read}`);
  return `walking, his body through the capelet ${read} (${MOST_THROUGH} at most; ${moments} moments)`;
}

/** A point as words: how far off (or through), its row, where in the chest's space (cm) and what it lies over. */
function pointWords(point: LiePoint): string {
  const where = [point.inChest.x, point.inChest.y, point.inChest.z].map((v) => (v * 100).toFixed(0)).join(', ');
  return `${point.off.toFixed(1)} at row ${point.row} (${where}) over ${point.over}`;
}

/** The lie row by row from where the capelet begins to its hem, each region's median there, and each region's
 *  farthest and deepest points. */
export function lieRows(lie: Lie): string[] {
  const lines = [`  row by row from its first below the join (${REGIONS.map(({ name }) => name).join(', ')}):`];
  for (let row = 0; row < lie.rows; row++) {
    const cells = REGIONS.map(({ name }) => {
      const offs = sortedOffs(lie.regions[name].points.filter((point) => point.row === row));
      return (offs.length ? quantile(offs, 0.5).toFixed(1) : '-').padStart(5);
    });
    lines.push(`  ${String(row).padStart(4)}: ${cells.join(' ')}`);
  }
  for (const { name } of REGIONS) {
    const points = [...lie.regions[name].points].sort((a, b) => b.off - a.off);
    if (!points.length) continue;
    lines.push(`  ${name}, farthest: ${points.slice(0, NAMED).map(pointWords).join('; ')}`);
    lines.push(`  ${name}, deepest: ${points.slice(-NAMED).reverse().map(pointWords).join('; ')}`);
  }
  return lines;
}

/** Where his body comes through the hood above its capelet deepest as he stands now (its point's row counted from the
 *  first read, `hoodRows`), or null where it comes through nowhere. */
export function hoodThroughOf(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[]): Deepest | null {
  const body = bodyOf(lab, held);
  const ray = new THREE.Raycaster();
  const toChest = lab.joints.chest.matrixWorld.clone().invert();
  let deepest: Deepest | null = null;
  for (const point of clothPoints(hood, hoodRows(hood))) {
    const read = overAt(point, body, ray, THROUGH_LOOK);
    if (!read || read.off >= 0 || read.facing < LEAST_FACING) continue;
    if (deepest && -read.off <= deepest.through) continue;
    const inChest = point.at.clone().applyMatrix4(toChest);
    deepest = { through: -read.off, region: regionOf(inChest), point: { off: read.off, over: read.over, row: point.row, inChest } };
  }
  return deepest;
}

/** The deepest his body comes through the hood above its capelet (`when`: standing, walking) as a line, and a problem
 *  past the limit. */
export function hoodThroughLine(deepest: Deepest | null, when: string, problems: string[]): string {
  const what = `${when}, his body through the hood above the capelet (below the jaw)`;
  if (!deepest) return `${what} nowhere`;
  const read = `${deepest.through.toFixed(1)} cm at worst, his ${deepest.region}: ${pointWords(deepest.point)}`;
  if (deepest.through > MOST_THROUGH) problems.push(`hood: ${what} ${read}`);
  return `${what} ${read} (${MOST_THROUGH} at most)`;
}

/** The canary for his body through the hood above the capelet: its front below the jaw sunk into him, which must read
 *  as his body come through. Returns its line; a miss is a problem. */
export function hoodThroughCanary(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[], problems: string[]): string {
  const inFront = (inChest: THREE.Vector3) => regionOf(inChest) === 'front';
  const undo = moveRows(lab, hood, -CANARY_HOOD_SINK, hoodRows(hood), inFront);
  try {
    const through = hoodThroughOf(lab, hood, held)?.through ?? 0;
    const read = `canary, the hood's front below the jaw sunk ${CANARY_HOOD_SINK} cm into him: his body `
      + `${through.toFixed(1)} cm through it`;
    if (through < CANARY_LEAST_HOOD_SINK) problems.push(`missed: ${read}`);
    return read;
  } finally {
    undo();
  }
}

/** The capelet's outside moved along its normals by `cm` where `moved` says (in the chest's space); returns the undo. */
function moveCapelet(lab: Lab, hood: CapeletMesh, cm: number, moved: (inChest: THREE.Vector3) => boolean): () => void {
  return moveRows(lab, hood, cm, capeletRows(hood), moved);
}

/** The hood's outside over rows `from` to `to` moved along its normals by `cm` where `moved` says (in the chest's
 *  space); returns the undo. */
function moveRows(lab: Lab, hood: CapeletMesh, cm: number, [from, to]: [number, number],
  moved: (inChest: THREE.Vector3) => boolean): () => void {
  const geometry = hood.mesh.geometry;
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal;
  const kept = (position.array as Float32Array).slice();
  const toChest = new THREE.Matrix4().copy(lab.joints.chest.matrixWorld).invert().multiply(hood.mesh.matrixWorld);
  const scale = hood.mesh.getWorldScale(new THREE.Vector3()).x;
  const point = new THREE.Vector3();
  const facing = new THREE.Vector3();
  for (let k = from * hood.across; k < to * hood.across; k++) {
    if (!moved(point.fromBufferAttribute(position, k).applyMatrix4(toChest))) continue;
    facing.fromBufferAttribute(normal, k).multiplyScalar(cm / 100 / scale);
    position.setXYZ(k, position.getX(k) + facing.x, position.getY(k) + facing.y, position.getZ(k) + facing.z);
  }
  position.needsUpdate = true;
  return () => {
    (position.array as Float32Array).set(kept);
    position.needsUpdate = true;
  };
}

/** The lie with the capelet moved as `moveCapelet` moves it, put back after. */
function lieMoved(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[], cm: number,
  moved: (inChest: THREE.Vector3) => boolean): Lie {
  const undo = moveCapelet(lab, hood, cm, moved);
  try {
    return lieOf(lab, hood, held);
  } finally {
    undo();
  }
}

/** How much further off the lifted capelet reads than before, in the region it grew least (cm), of those it lies over;
 *  null if it lies over none. */
function leastGrowth(before: Lie, lifted: Lie): number | null {
  const growths: number[] = [];
  for (const { name } of REGIONS) {
    const was = readingOf(before.regions[name]);
    const now = readingOf(lifted.regions[name]);
    if (was && now) growths.push(now.typical - was.typical);
  }
  return growths.length ? Math.min(...growths) : null;
}

/** The canary: the capelet lifted off him, which must read as standing further off everywhere it lies, then its back
 *  sunk into him, which must read as his back come through. Returns its line; a miss is a problem. */
export function lieCanary(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[], before: Lie, problems: string[]): string {
  const grew = leastGrowth(before, lieMoved(lab, hood, held, CANARY_LIFT, () => true));
  const onBack = (inChest: THREE.Vector3) => regionOf(inChest) === 'back';
  const sunk = readingOf(lieMoved(lab, hood, held, -CANARY_SINK, onBack).regions.back);
  const through = sunk?.through ?? 0;
  const further = grew === null ? 'nothing read' : `${grew.toFixed(1)} cm`;
  const read = `canary, the capelet lifted ${CANARY_LIFT} cm off him: ${further} further off at least; `
    + `its back sunk ${CANARY_SINK} cm into him: his back ${through.toFixed(1)} cm through it`;
  if (grew === null || grew < CANARY_LEAST_LIFT || through < CANARY_LEAST_SINK) problems.push(`missed: ${read}`);
  return read;
}
