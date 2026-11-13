// tools/lab `coat`: the hero's skirts (models/armor.ts `Skirt`: the ranger's coat, the mage's robe, the warrior's mail)
// and his hood (models/hood.ts `HoodCloth`: the mage's) as he stands at idle, dressed in his head item and body armour,
// frame by frame: every point of the cloth in its own space (a skirt hung from the hips, a hood from the head, so the
// body's own sway is taken out), and where one jerks, its move a frame changing by more than `JERK_FROM` from the frame
// before. From play: "range[r] has a clothing bug, behind that right arm, in idle", "you should observe 3-5sec of
// frames to see it moving unnaturally", "under left arm/hand too, but less". The canary kicks one point out for a
// frame. It stands once at each frame rate (`rates`): the cloth steps at 1/60 s, so on a faster screen most frames
// step it none and some once, which a 60 Hz clock never shows ("the hood is jerking when idle").
import * as THREE from 'three';
import * as armor from '../../../src/entities/models/armor';
import type { WeaponStyle } from '../../../src/loot/loadout';
import type { Joints } from '../../../src/entities/models/rig';
import type { Lab, Report } from './lab';

/** The cloth's rest (models/armor.ts `CLOTH_REST`, #590), or none in a tree from before it. */
interface ClothRest { on: boolean; rested: number; laid: number }
const clothRest = (): ClothRest | undefined => (armor as { CLOTH_REST?: ClothRest }).CLOTH_REST;
/** the frame rate from which a standing hero's cloth must rest on most of its updates, and that share */
const RESTS_FROM_HZ = 100;
const RESTS_MOST = 0.5;
/** the canary's frames with the rest held off */
const REST_CANARY_FRAMES = 60;

/** The share of the cloth's updates that left it as it lay, since `from`'s counts. */
function restedShare(rest: ClothRest, from: { rested: number; laid: number }): number {
  const rested = rest.rested - from.rested;
  const all = rested + rest.laid - from.laid;
  return all > 0 ? rested / all : 0;
}

/** How much of his standing the cloth rested through, into `report`: at a fast screen's rate, most of it. With the
 *  canary the rest is held off for some frames more, which must read as none rested. */
async function restReport(lab: Lab, rate: number, from: { rested: number; laid: number }, canary: boolean,
  report: Report): Promise<void> {
  const rest = clothRest();
  if (!rest) return;
  const share = restedShare(rest, from);
  const lines = [`  the cloth rested through ${(share * 100).toFixed(0)}% of its updates`];
  if (rate >= RESTS_FROM_HZ && share < RESTS_MOST) {
    const said = `${(share * 100).toFixed(0)}% of its updates`;
    report.problems.push(`coat: at ${rate} Hz his cloth rested through ${said} standing`);
  }
  if (canary) {
    const held = { rested: rest.rested, laid: rest.laid };
    rest.on = false;
    await lab.step(REST_CANARY_FRAMES);
    rest.on = true;
    const caught = restedShare(rest, held) === 0;
    lines.push(`canary, the cloth's rest held off: ${caught ? 'caught' : 'MISSED'}`);
    if (!caught) report.problems.push('coat: the canary (the rest held off) was missed');
  }
  report.text += `\n${lines.join('\n')}`;
}

/** What `lab coat` takes. */
export interface CoatOptions {
  gear?: WeaponStyle;
  weapon?: string;
  /** how long he stands (s) */
  seconds?: number;
  /** list every frame a point jerked */
  frames?: boolean;
  /** the frame rates (Hz) he stands at, once each */
  rates?: number[];
  canary?: boolean;
}

/** a point's move a frame changing by this much from the frame before is a jerk (m): standing, the cloth sways a few
 *  millimetres a frame with his weight, and a point snapped behind a hand jumps by its width */
const JERK_FROM = 0.01;
/** how long he stands by default (s), and the frames let go first for the pose to settle */
const SECONDS = 5;
const SETTLE = 30;
/** the canary's frame (after `SETTLE`) and how far it kicks a point out (m) */
const CANARY_FRAME = 120;
const CANARY_KICK = 0.03;
/** the frame rates he stands at by default (Hz): the lab's, and a fast desktop screen's */
const RATES = [60, 144];
/** how many of the frames are listed with `--frames` */
const LISTED = 40;
/** the least share of a cloth's normals facing out from its middle (its folds turn a few in): the hood's pointed in,
 *  and every light behind it lit it in pink and green blotches */
const FACING_OUT = 0.8;

/** One skirt followed: its mesh and geometry, its points over the last two frames, and its jerks. */
interface Followed {
  name: string;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  cols: number;
  last: Float32Array;
  before: Float32Array;
  frames: number;
  worst: number;
  worstAt: string;
  /** the largest jerk of any frame judged, over `JERK_FROM` or not */
  most: number;
  listed: string[];
}

const cm = (metres: number): string => (metres * 100).toFixed(1);
/** a frame's length at `rate` Hz (ms), in steps the clock adds exactly */
const frameMs = (rate: number): number => Math.round((1000 / rate) * 1024) / 1024;

/** a commit from before skirts were named finds the ranger's coat by its mesh's name (an A/B against one) */
const OLD_NAMES = ['tunic hem'];

/** the cloth followed: a skirt's (`Skirt.geo`) and a hood's (`HoodCloth`'s outside) geometry names */
const CLOTHS = ['skirt', 'hood'];

/** Each skirt and hood the hero wears that's shown. */
function skirtsOf(root: THREE.Object3D): Followed[] {
  const found: Followed[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (!CLOTHS.includes(mesh.geometry.name) && !OLD_NAMES.includes(mesh.name))) return;
    const count = mesh.geometry.attributes.position.array.length;
    const name = mesh.name || (mesh.geometry.name === 'hood' ? 'hood' : `skirt ${found.length + 1}`);
    // (its first triangle runs from a point to the one below it, a row on: `Skirt`'s index, and `HoodCloth`'s)
    const index = mesh.geometry.getIndex()!;
    const cols = index.getX(1) - index.getX(0);
    found.push({
      name, mesh, geometry: mesh.geometry, cols, last: new Float32Array(count), before: new Float32Array(count),
      frames: 0, worst: 0, worstAt: '', most: 0, listed: [],
    });
  });
  return found;
}

/** Where point `point` of a skirt with `cols` points a row is, in words: its height down the cloth and its side. */
function placeOf(point: number, cols: number, rows: number): string {
  const row = Math.floor(point / cols);
  const angle = ((point % cols) / (cols - 1)) * 360;
  // (0 is his front, +x his left: the cloth's angle runs from the front round by his left)
  const side = angle < 22.5 || angle >= 337.5 ? 'front' : angle < 67.5 ? 'front left' : angle < 112.5 ? 'left side'
    : angle < 157.5 ? 'back left' : angle < 202.5 ? 'back' : angle < 247.5 ? 'back right' : angle < 292.5
      ? 'right side' : 'front right';
  return `row ${row} of ${rows - 1}, ${angle.toFixed(0)}° round (his ${side})`;
}

const _point = new THREE.Vector3();
const _hand = new THREE.Vector3();

/** Which of the hero's hands point `point` of `skirt` is nearest, and how far (in words). */
function nearestHand(skirt: Followed, point: number, joints: Joints): string {
  const at = skirt.geometry.attributes.position;
  skirt.mesh.localToWorld(_point.fromBufferAttribute(at, point));
  const left = _point.distanceTo(joints.handL.getWorldPosition(_hand));
  const right = _point.distanceTo(joints.handR.getWorldPosition(_hand));
  return left < right ? `his left hand ${cm(left)} cm off` : `his right hand ${cm(right)} cm off`;
}

/** The frame's jerks of `skirt` (`judged`: the frame counts), its points moved on. Returns the largest. */
function follow(skirt: Followed, frame: number, judged: boolean, listing: boolean, joints: Joints): number {
  const now = skirt.geometry.attributes.position.array as Float32Array;
  const { last, before, cols } = skirt;
  const rows = now.length / 3 / cols;
  let largest = 0;
  let largestAt = -1;
  for (let i = 0; i < now.length; i += 3) {
    const jx = now[i] - 2 * last[i] + before[i];
    const jy = now[i + 1] - 2 * last[i + 1] + before[i + 1];
    const jz = now[i + 2] - 2 * last[i + 2] + before[i + 2];
    const jerk = Math.hypot(jx, jy, jz);
    if (jerk > largest) {
      largest = jerk;
      largestAt = i / 3;
    }
  }
  before.set(last);
  last.set(now);
  if (judged) skirt.most = Math.max(skirt.most, largest);
  if (!judged || largest <= JERK_FROM) return largest;
  skirt.frames++;
  const at = `frame ${frame}, ${placeOf(largestAt, cols, rows)}, ${nearestHand(skirt, largestAt, joints)}`;
  if (listing && skirt.listed.length < LISTED) skirt.listed.push(`  ${skirt.name} ${cm(largest)} cm (${at})`);
  if (largest > skirt.worst) {
    skirt.worst = largest;
    skirt.worstAt = at;
  }
  return largest;
}

/** The share of `cloth`'s normals facing away from its points' middle (`turned`: as if each were turned in). */
function facingOut(cloth: Followed, turned: boolean): number {
  const at = cloth.geometry.attributes.position;
  const normal = cloth.geometry.attributes.normal;
  const middle = new THREE.Vector3();
  for (let i = 0; i < at.count; i++) middle.add(_point.fromBufferAttribute(at, i));
  middle.multiplyScalar(1 / at.count);
  let out = 0;
  for (let i = 0; i < at.count; i++) {
    _point.fromBufferAttribute(at, i).sub(middle);
    const facing = _point.dot(_hand.fromBufferAttribute(normal, i)) * (turned ? -1 : 1);
    if (facing > 0) out++;
  }
  return out / at.count;
}

/** Runs `lab coat`: he stands at each frame rate in turn. */
export async function coat(lab: Lab, options: CoatOptions): Promise<Report> {
  const reports: Report[] = [];
  for (const rate of options.rates ?? RATES) reports.push(await standAt(lab, options, rate));
  return { text: reports.map((each) => each.text).join('\n'), problems: reports.flatMap((each) => each.problems) };
}

/** He stands at `rate` Hz, every frame of his cloth followed. */
async function standAt(lab: Lab, options: CoatOptions, rate: number): Promise<Report> {
  await lab.setup({ at: [14, 17], facing: 0, gear: options.gear, weapon: options.weapon, wear: ['helm', 'chest'] });
  const clock = window.__labClock;
  const wasFrame = clock.frame;
  clock.frame = frameMs(rate);
  try {
    return await stand(lab, options, rate);
  } finally {
    clock.frame = wasFrame;
  }
}

async function stand(lab: Lab, options: CoatOptions, rate: number): Promise<Report> {
  await lab.step(SETTLE);
  const skirts = skirtsOf(lab.model.root);
  if (!skirts.length) return { text: `the ${lab.player.cls.id} wears no skirt`, problems: [] };
  const frames = Math.round((options.seconds ?? SECONDS) * rate);
  let frame = 0;
  let canaryJerk: number | null = null;
  const rest = clothRest();
  const restFrom = { rested: rest?.rested ?? 0, laid: rest?.laid ?? 0 };
  await lab.step(frames, undefined, () => {
    const planted = !!options.canary && frame === CANARY_FRAME;
    const kicked = skirts[0].geometry.attributes.position.array as Float32Array;
    const { cols } = skirts[0];
    // (a point half way down his right side, kicked out for this frame and back)
    const point = Math.floor(kicked.length / 3 / cols / 2) * cols + Math.round(cols * 0.75);
    if (planted) kicked[point * 3] -= CANARY_KICK;
    // (the canary's frame and the two after it are its own)
    const judged = frame >= 2 && !(options.canary && frame >= CANARY_FRAME && frame <= CANARY_FRAME + 2);
    lab.model.root.updateMatrixWorld(true);
    for (const skirt of skirts) {
      const jerk = follow(skirt, frame, judged, !!options.frames, lab.model.joints!);
      if (planted && skirt === skirts[0]) canaryJerk = jerk;
    }
    if (planted) kicked[point * 3] += CANARY_KICK;
    frame++;
  });
  const report = reportOf(lab.player.cls.id, rate, frames, skirts, canaryJerk);
  facingReport(skirts, !!options.canary, report);
  await restReport(lab, rate, restFrom, !!options.canary, report);
  return report;
}

/** Each cloth's normals facing out, into `report` (with the canary, the first one's turned in too). */
function facingReport(cloths: Followed[], canary: boolean, report: Report): void {
  const lines: string[] = [];
  for (const cloth of cloths) {
    const out = facingOut(cloth, false);
    lines.push(`  ${cloth.name}: ${(out * 100).toFixed(0)}% of its normals facing out`);
    if (out < FACING_OUT) report.problems.push(`coat: the ${cloth.name}'s normals face in (${(out * 100).toFixed(0)}% out)`);
  }
  if (canary) {
    const caught = facingOut(cloths[0], true) < FACING_OUT;
    lines.push(`canary, the ${cloths[0].name}'s normals turned in: ${caught ? 'caught' : 'MISSED'}`);
    if (!caught) report.problems.push('coat: the canary (normals turned in) was missed');
  }
  report.text += '\n' + lines.join('\n');
}

/** The report: each skirt's jerks, the frames listed, and the canary. */
function reportOf(id: string, rate: number, frames: number, skirts: Followed[], canaryJerk: number | null): Report {
  const text = [`the ${id} standing at idle at ${rate} Hz, ${frames} frames (${(frames / rate).toFixed(1)} s)`];
  const problems: string[] = [];
  for (const skirt of skirts) {
    if (!skirt.frames) {
      text.push(`  ${skirt.name}: no point jerked over ${cm(JERK_FROM)} cm (the most ${cm(skirt.most)})`);
      continue;
    }
    const worst = `the worst ${cm(skirt.worst)} cm (${skirt.worstAt})`;
    text.push(`  ${skirt.name}: jerked on ${skirt.frames} frames, ${worst}`);
    problems.push(`coat: at ${rate} Hz the ${skirt.name} jerked on ${skirt.frames} frames, ${worst}`);
  }
  for (const skirt of skirts) text.push(...skirt.listed);
  if (canaryJerk !== null) {
    const caught = canaryJerk > JERK_FROM;
    text.push(`canary, a point kicked out for a frame: ${caught ? 'caught' : 'MISSED'} (${cm(canaryJerk)} cm)`);
    if (!caught) problems.push('coat: the canary (a point kicked out for a frame) was missed');
  }
  return { text: text.join('\n'), problems };
}
