// tools/lab `scholar`'s rounds: Brother Hollis let go from his table (src/world/scholarRounds.ts) and followed a frame at
// a time through a browse (to a case, a book taken off its shelf, looked over, read standing, put back, and back to
// his table), then a restock (a book kept on a stack first, then the top of a stack shelved in a gap). Each frame: his
// body clear of what stands in the room while he's up; a book in his hands always at one of them (never in the air);
// its shelf's book hidden while it's off the shelf, and the room's gaps none once he's back at his table, sat. A hero
// stood close as he browses must not stop him (his task goes on), and he glances up at him; talked to, he stops where
// he is and turns to the hero, and goes on once the talk ends. From play: "have him walking around... an actual book
// from a shelf that actually leaves the shelf... If player comes in does not mean he stops, only if he interacts".
// Then his other tasks, each back at his table at its end and clear of what stands in the room: a case dusted (his cloth
// in his right hand throughout, its dust let off), a row squared, the globe set turning. From play: "have him do more
// tasks like dusting and so on".
// Its canary holds the book he carries half a metre off his hands, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, saveCamera, settleCamera } from '../../../src/core/renderer';
import { objectNear } from '../../../src/game/village';
import { closeTalk, talkOpen } from '../../../src/ui/screens/talk/talk';
import type { Scholar } from '../../../src/entities/models/scholar';
import type { Rounds } from '../../../src/world/scholarRounds';
import { jointsOf, offHero } from './scholar';
import { scholarPlant } from '../../../src/entities/models/scholar';

/** the most frames a round may take (a minute and a half at 60 a second), how far a book may be from his nearer hand
 *  (m), how near what stands in the room his middle may come (m past its circle), how far off the hero his face must
 *  come while the hero stands close (deg), and how still he must keep while talked to (m) */
const ROUND_FRAMES = 6000;
const HAND_MOST = 0.1;
const CLEAR_LEAST = 0.08;
const GLANCED = 40;
const STILL_MOST = 0.02;
/** how far his dusting cloth may be from his right palm (m), and how far the globe must turn once he's set it turning
 *  (rad) */
const CLOTH_MOST = 0.08;
/** the most any joint of him may turn in a frame over his rounds (deg: getting up, sitting down, walking, and where one
 *  beat hands on to the next; from play, "like he teleports a bit into these different poses"), the most his head may
 *  be turned off the way he walks (deg, while he walks: "looking sideways when walking forwards"), how fast he walks
 *  before that's read (m/s), and how far a shoe may come out through his robe above its hem (m: "they go through his
 *  clothing when walking") */
const JOINT_MOST = 8;
const HEAD_OFF_MOST = 15;
const WALKING = 0.45;
/** how far his body may face off the way he goes (deg) for his walk to be read as straight */
const STRAIGHT = 8;
/** how near the hero may be (m) for his head to be read on his way */
const HERO_NEAR = 2.2;
const SHOE_OUT_MOST = 0.004;
const GLOBE_TURNS = 1;

/** Where the middle of each of his palms is (world): 7 cm down the hand from its joint at the wrist, the way his fingers
 *  point (the hand's -y). Measured from the wrist, a hand holding a book's edge was 8 to 10 cm off it. */
function hands(s: Scholar): THREE.Vector3[] {
  return ['scholar handL', 'scholar handR'].map((n) => s.root.getObjectByName(n)!.localToWorld(new THREE.Vector3(0, -0.07, 0)));
}

/** How far `hand` is from the book `book` (m): from its box's surface, 0 inside it. Its box is its geometry's at its
 *  scale (a shelf's book is a unit box scaled to its size; a stack's its own size). Measured from its middle, a hand
 *  holding a book by its edge was its half's length off. */
function fromBook(book: THREE.Mesh, hand: THREE.Vector3): number {
  if (!book.geometry.boundingBox) book.geometry.computeBoundingBox();
  const local = book.worldToLocal(hand.clone()), box = book.geometry.boundingBox!;
  const inside = local.clone().clamp(box.min, box.max);
  return book.localToWorld(inside).distanceTo(hand);
}

/** how many frames the frame's cost is timed over, sat and walking */
const COST_FRAMES = 90;

/** The frame's mean time (ms, the browser's clock: a game frame drawn and a browser frame each) over `COST_FRAMES`. */
async function frameCost(lab: Lab): Promise<number> {
  const drawing = lab.drawing;
  lab.drawing = true;
  let total = 0;
  for (let i = 0; i < COST_FRAMES; i++) {
    const from = window.__labClock.realNow();
    await lab.step(1);
    await window.__labClock.realFrame();
    total += window.__labClock.realNow() - from;
  }
  lab.drawing = drawing;
  return total / COST_FRAMES;
}

/** how far back from upright the open book may be held to read (deg: a reader's 30 to 45, and some), how squarely its
 *  pages must face his eyes (deg off), and how far past its boards a palm may be (m) */
const READ_TILT = { least: 25, most: 42 };
const PAGES_OFF = 40;
const PAST_BOARDS = 0.03;
/** how far his fingertips are down the hand from its joint (m), and how far past the book's edges they may reach (m):
 *  over its pages' edges a thumb's length, no more (up past its edges, his fingers stood up like claws) */
const FINGERTIP = 0.17;
const TIPS_PAST = 0.025;
/** how far behind the boards his fingertips may stand (m): fingers lying along them, a little curled */
const TIPS_OFF = 0.04;

/** The open book as he reads it standing: how far back from upright it's held (deg), how far its pages face off his
 *  eyes (deg), and how far each palm is from behind its boards (m past them: in front of the pages, or out past an
 *  edge; 0 where it's behind them within their outline). */
function readHold(s: Scholar): { tilt: number; off: number; palms: number[]; tips: number; tipsOff: number } | null {
  let book: THREE.Object3D | undefined;
  G.scene.traverse((o) => { if (o.name === 'library open held book' && o.visible) book = o; });
  if (!book) return null;
  book.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(book.matrixWorld);
  const at = book.getWorldPosition(new THREE.Vector3());
  const eyes = s.root.getObjectByName('scholar cap')!.parent!.getWorldPosition(new THREE.Vector3());
  const tilt = 90 - THREE.MathUtils.radToDeg(Math.asin(Math.min(1, normal.y)));
  const off = THREE.MathUtils.radToDeg(normal.angleTo(eyes.sub(at).normalize()));
  // (its boards' outline in its own frame: halves along x either side of the spine, z its height, its pages +y)
  const half = { x: 0.135, z: 0.095 };
  const palms = hands(s).map((h) => {
    const p = book!.worldToLocal(h.clone());
    const outside = Math.max(0, Math.abs(p.x) - half.x, Math.abs(p.z) - half.z);
    return Math.max(outside, p.y - 0.01);
  });
  // (each hand's fingertips, out past the book's outline in its own plane)
  let tips = 0, tipsOff = 0;
  for (const n of ['scholar handL', 'scholar handR']) {
    const tip = book.worldToLocal(s.root.getObjectByName(n)!.localToWorld(new THREE.Vector3(0, -FINGERTIP, 0)));
    tips = Math.max(tips, Math.abs(tip.x) - half.x, Math.abs(tip.z) - half.z);
    // (and out behind its boards: fingers standing up off them, as claws, not lying along them)
    tipsOff = Math.max(tipsOff, -tip.y);
  }
  return { tilt, off, palms, tips, tipsOff };
}

/** What a round did, frame by frame: also the most a joint turned in a frame (deg, which and in what beat), his head
 *  off his way as he walked (deg) and a shoe out through his robe above its hem (m). */
interface Followed {
  frames: number; beats: string[]; farthest: number; farAt: string; tightest: number; tightAt: string; gapsAtEnd: number; satAtEnd: number;
  turned: number; turnedAt: string; headOff: number; shoeOut: number; shoeAt: string;
}

/** A part of him by name, or by its parents' where it has none. */
function partName(o: THREE.Object3D): string {
  const path: string[] = [];
  for (let p: THREE.Object3D | null = o; p && path.length < 4; p = p.parent) path.push(p.name || `(${p.type})`);
  return path.join(' < ');
}

/** His head's way (world, level) against `way`, the way he went this frame: how far apart (deg). */
function headOffWay(s: Scholar, way: THREE.Vector3): number {
  const head = s.root.getObjectByName('scholar head')!;
  const h = new THREE.Vector3(0, 0, 1).transformDirection(head.matrixWorld).setY(0).normalize();
  return THREE.MathUtils.radToDeg(h.angleTo(way.clone().setY(0).normalize()));
}

/** How far out through his robe a point of a shoe is, the furthest (m, 0 for none): a point above the robe's hem, out
 *  past its surface at its height and side. The robe's points are its rows round him (`dressRobe`: 27 rows of 41, its
 *  top first), as his legs have pushed them out this frame. */
export function shoeThroughRobe(s: Scholar, where?: { at: THREE.Vector3; row: number }): number {
  const robe = s.root.getObjectByName('scholar robe') as THREE.Mesh | undefined;
  if (!robe?.visible) return 0;
  const pos = robe.geometry.attributes.position, N = 41, K = Math.round(pos.count / N);
  if (K * N !== pos.count) return 0;
  const hem = pos.getY((K - 1) * N);
  // (the robe's radius round its middle, at row k and column i)
  const radius = (k: number, i: number) => Math.hypot(pos.getX(k * N + i), pos.getZ(k * N + i) - 0.01);
  let worst = 0;
  const p = new THREE.Vector3(), toRobe = new THREE.Matrix4();
  robe.updateWorldMatrix(true, false);
  const inverse = robe.matrixWorld.clone().invert();
  s.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name !== 'scholar shoe' || !m.visible) return;
    toRobe.multiplyMatrices(inverse, m.matrixWorld);
    const sp = m.geometry.attributes.position;
    for (let v = 0; v < sp.count; v++) {
      p.fromBufferAttribute(sp, v).applyMatrix4(toRobe);
      if (p.y <= hem + 0.004 || p.y >= pos.getY(0)) continue;
      // (the rows above and below its height, and the columns either side of its way round)
      let k = 0;
      while (k < K - 2 && pos.getY((k + 1) * N) > p.y) k++;
      const y0 = pos.getY(k * N), y1 = pos.getY((k + 1) * N), ty = THREE.MathUtils.clamp((y0 - p.y) / (y0 - y1 || 1), 0, 1);
      const th = Math.atan2(p.x, p.z - 0.01), at = ((th + Math.PI) / (Math.PI * 2)) * (N - 1), i = Math.min(N - 2, Math.floor(at)), ti = at - i;
      const r = THREE.MathUtils.lerp(THREE.MathUtils.lerp(radius(k, i), radius(k, i + 1), ti), THREE.MathUtils.lerp(radius(k + 1, i), radius(k + 1, i + 1), ti), ty);
      const out = Math.hypot(p.x, p.z - 0.01) - r;
      if (out > worst) { worst = out; if (where) { where.at.copy(p); where.row = k; } }
    }
  });
  return worst;
}

/** A round followed until he's back reading at his table: what he did, how far a book he held strayed from his hands,
 *  how near he came to what stands in the room. `each` runs every frame (a hero stood close, a talk). */
async function follow(lab: Lab, s: Scholar, rounds: Rounds, canary: boolean, each?: (f: number) => Promise<void> | void): Promise<Followed> {
  const beats: string[] = [];
  let farthest = 0, farAt = '', tightest = Infinity, tightAt = '', frames = 0;
  let turned = 0, turnedAt = '', headOff = 0, shoeOut = 0, shoeAt = '';
  const obstacles = G.arena.obstacles.filter((o) => o !== rounds.body);
  const joints = jointsOf(s), before = joints.map((o) => o.quaternion.clone());
  const at = s.root.getWorldPosition(new THREE.Vector3()), was = at.clone(), way = new THREE.Vector3();
  for (; frames < ROUND_FRAMES; frames++) {
    await each?.(frames);
    // (read from here: what `each` stepped (a picture's frames) isn't this frame's turn)
    joints.forEach((o, i) => before[i].copy(o.quaternion));
    s.root.getWorldPosition(was);
    await lab.step(1);
    if (beats[beats.length - 1] !== rounds.doing) beats.push(rounds.doing);
    // (each joint's turn in the frame: getting up, sitting down, and where one beat hands on to the next)
    joints.forEach((o, i) => {
      const deg = THREE.MathUtils.radToDeg(before[i].angleTo(o.quaternion));
      if (deg > turned) { turned = deg; turnedAt = `${partName(o)}, ${rounds.doing} (sit ${s.act.sit.toFixed(2)})`; }
    });
    s.root.updateMatrixWorld(true);
    s.root.getWorldPosition(at);
    way.subVectors(at, was);
    // (but where the hero is near: he may look at whoever stands in his way)
    if (s.act.walk > WALKING && way.length() > 0.003 && G.player.pos.distanceTo(at) > HERO_NEAR) {
      const body = new THREE.Vector3(0, 0, 1).transformDirection(s.root.matrixWorld).setY(0).normalize();
      if (THREE.MathUtils.radToDeg(body.angleTo(way.clone().setY(0).normalize())) < STRAIGHT) headOff = Math.max(headOff, headOffWay(s, way));
    }
    if (s.act.sit < 0.5) {
      const out = shoeThroughRobe(s);
      if (out > shoeOut) { shoeOut = out; shoeAt = rounds.doing; }
    }
    if (frames > 30 && rounds.doing === 'reading at his table' && s.act.sit >= 1) break;
    // (the book he carries, but while he reads it open: the closed one waits hidden meanwhile)
    const carried = rounds.carried;
    if (carried?.visible) {
      if (canary) carried.position.y += 0.5;
      carried.updateMatrixWorld(true);
      const near = Math.min(...hands(s).map((h) => fromBook(carried as THREE.Mesh, h)));
      if (s.act.grip >= 1 && near > farthest) { farthest = near; farAt = rounds.doing; }
      if (canary) carried.position.y -= 0.5;
    }
    // (his middle against what stands in the room, while he's up and clear of his own table)
    if (s.act.sit <= 0) {
      const me = rounds.body;
      for (const o of obstacles) {
        const room = Math.hypot(me.x - o.x, me.z - o.z) - o.r;
        if (room < tightest) { tightest = room; tightAt = rounds.doing; }
      }
    }
  }
  return { frames, beats, farthest, farAt, tightest, tightAt, gapsAtEnd: rounds.gaps, satAtEnd: s.act.sit, turned, turnedAt, headOff, shoeOut, shoeAt };
}

/** What's wrong with a round. */
function problemsOf(name: string, r: Followed): string[] {
  const problems: string[] = [];
  if (r.frames >= ROUND_FRAMES) problems.push(`rounds (${name}): not back at his table in ${ROUND_FRAMES} frames (last: ${r.beats[r.beats.length - 1]})`);
  if (r.farthest > HAND_MOST) problems.push(`rounds (${name}): a book he held ${r.farthest.toFixed(2)} m from his nearer hand, ${r.farAt} (at most ${HAND_MOST})`);
  if (r.tightest < CLEAR_LEAST) problems.push(`rounds (${name}): his middle ${r.tightest.toFixed(2)} m past what stands in the room's circle, ${r.tightAt} (at least ${CLEAR_LEAST} clear)`);
  if (r.gapsAtEnd && name === 'browse') problems.push(`rounds (${name}): ${r.gapsAtEnd} books still off their shelves once he's back at his table`);
  if (r.satAtEnd < 1) problems.push(`rounds (${name}): not sat at his table at its end`);
  if (r.turned > JOINT_MOST) problems.push(`rounds (${name}): a joint turned ${r.turned.toFixed(1)}° in a frame (${r.turnedAt}; at most ${JOINT_MOST})`);
  if (r.headOff > HEAD_OFF_MOST) problems.push(`rounds (${name}): his head ${r.headOff.toFixed(0)}° off the way he walked (at most ${HEAD_OFF_MOST})`);
  if (r.shoeOut > SHOE_OUT_MOST) problems.push(`rounds (${name}): a shoe ${(r.shoeOut * 100).toFixed(1)} cm out through his robe above its hem, ${r.shoeAt} (at most ${SHOE_OUT_MOST * 100})`);
  return problems;
}

const lineOf = (name: string, r: Followed) => `his rounds, ${name}: ${r.beats.join(' > ')}; ${r.frames} frames; a held book at most `
  + `${r.farthest.toFixed(2)} m from his nearer hand; his middle at least ${r.tightest.toFixed(2)} m clear of what stands in the room; `
  + `a joint at most ${r.turned.toFixed(1)}° in a frame (${r.turnedAt}); his head at most ${r.headOff.toFixed(0)}° off his way walking; `
  + `a shoe at most ${(r.shoeOut * 100).toFixed(1)} cm out through his robe`;

/**
 * His rounds checked: a browse, with a hero stood close as he looks for a book (he glances up and goes on), then talked
 * to as he reads standing (he stops, turned to the hero, and goes on after); then a keep and a restock. Pictured from
 * the open room as he walks, takes a book and reads it.
 */
export async function roundsChecked(lab: Lab, s: Scholar, rounds: Rounds, canary: boolean): Promise<{ lines: string[]; problems: string[]; moments: Pictured[] }> {
  const lines: string[] = [], problems: string[] = [], moments: Pictured[] = [];
  const hero = G.player;
  // (in the room's front half, off the door and clear of his ways)
  const away = new THREE.Vector3(1.6, 0, 2.5);
  hero.place(away, Math.PI);
  const programs = G.renderer.info.programs!.length;
  const sat = await frameCost(lab);
  rounds.hold = false;
  rounds.begin('browse');
  // (the canary: one browse, a book he carries held off his hands, which must be found)
  if (canary) {
    const drawingC = lab.drawing;
    lab.drawing = false;
    scholarPlant.noSeatBlend = true;
    const planted = await follow(lab, s, rounds, true);
    scholarPlant.noSeatBlend = false;
    lab.drawing = drawingC;
    rounds.hold = true;
    const caught = planted.farthest > HAND_MOST, jumped = planted.turned > JOINT_MOST;
    lines.push(`canary: a book he carries held half a metre off his hands ${caught ? 'caught' : 'went unseen'} (${planted.farthest.toFixed(2)} m)`);
    lines.push(`canary: his pose jumped from sat to standing, not followed, ${jumped ? 'caught' : 'went unseen'} (${planted.turned.toFixed(1)}° in a frame, ${planted.turnedAt})`);
    if (!caught) problems.push('rounds: the canary\'s book off his hands went unseen');
    if (!jumped) problems.push('rounds: the canary\'s jump from sat to standing went unseen');
    return { lines, problems, moments };
  }
  // (followed undrawn, a frame at a time: drawn, its 7000 frames took over three minutes; each picture draws its own)
  const drawing = lab.drawing;
  lab.drawing = false;
  /** him as a player sees him: the hero stood `off` m from him towards the room's middle, facing him, the game's own
   *  camera over his shoulder, a few frames drawn for it to settle; the hero put back after */
  const picture = async (label: string, note: string, off = 3) => {
    const at = s.root.getWorldPosition(new THREE.Vector3()), was = hero.pos.clone(), wasFacing = hero.facing, restore = saveCamera();
    const toMiddle = new THREE.Vector3(-at.x, 0, -at.z).normalize();
    const stood = at.clone().addScaledVector(toMiddle, off).setY(0);
    // (the camera turned to him, a little aside: it turns as the player turns it, not with the hero, and straight at him
    // the hero's own back stood in front of him)
    const facing = Math.atan2(at.x - stood.x, at.z - stood.z);
    hero.place(stood, facing);
    faceCamera(facing - 0.62);
    settleCamera(hero.pos);
    const drawing = lab.drawing;
    lab.drawing = true;
    await lab.step(20);
    moments.push(await lab.screen(label, [note]));
    lab.drawing = drawing;
    hero.place(was, wasFacing);
    restore();
  };
  let pictured = new Set<string>(), glance = 180, continued = false, stillFrom: THREE.Vector3 | null = null, moved = 0, faced = 180;
  let nearAtE = '', opened = false, readTilt = [Infinity, -Infinity], readOff = 0, palmPast = 0, readFrames = 0, tipsPast = 0, tipsOff = 0;
  let scanFrames = 0, talkFrames = 0, talked = false, walkFrames = 0, blockedAt: THREE.Vector3 | null = null, wentRound = false;
  let walking = 0;
  const browse = await follow(lab, s, rounds, canary, async (f) => {
    const doing = rounds.doing;
    // (the frame's cost as he walks, drawn)
    if (doing === 'walking to a case' && !walking && f > 100) walking = await frameCost(lab);
    for (const [beat, label, off] of [['walking to a case', 'rounds-walking', 3.4], ['taking a book', 'rounds-taking', 2.6],
      ['reading a book standing', 'rounds-reading', 2.6]] as const) {
      if (doing.startsWith(beat) && !pictured.has(label) && f % 45 === 44) { pictured.add(label); await picture(label, `as the player sees him ${doing}`, off); }
    }
    // (a hero stood a metre from him as he looks for a book: he goes on looking, and glances up)
    if (doing === 'looking for a book') {
      scanFrames++;
      const me = s.root.getWorldPosition(new THREE.Vector3());
      // (before him and off to his side, where he can turn his head to: behind him, his neck can't)
      if (scanFrames === 1) {
        const q = s.root.getWorldQuaternion(new THREE.Quaternion());
        hero.place(me.clone().add(new THREE.Vector3(0, 0, 1.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1).applyQuaternion(q)), 0);
      }
      glance = Math.min(glance, offHero(s));
      if (scanFrames === 75) {
        const drawing = lab.drawing, restore = saveCamera();
        faceCamera(Math.atan2(me.x - hero.pos.x, me.z - hero.pos.z) - 0.62);
        settleCamera(hero.pos);
        lab.drawing = true;
        await lab.step(1);
        moments.push(await lab.screen('rounds-looks-up', ['a hero come close as he looks for a book: he looks up at him, and goes on']));
        lab.drawing = drawing;
        restore();
      }
    } else if (scanFrames && !continued) { continued = true; hero.place(away, Math.PI); }
    // (the open book as he reads it: its pages to his face, tilted back as a reader's, his palms behind its boards)
    if (doing === 'reading a book standing') {
      const held = readHold(s);
      if (held) {
        readFrames++;
        readTilt = [Math.min(readTilt[0], held.tilt), Math.max(readTilt[1], held.tilt)];
        readOff = Math.max(readOff, held.off);
        palmPast = Math.max(palmPast, ...held.palms);
        tipsPast = Math.max(tipsPast, held.tips);
        tipsOff = Math.max(tipsOff, held.tipsOff);
      }
    }
    // (talked to as he reads standing: still, turned to the hero; let go after two seconds)
    if (doing === 'reading a book standing' && !talked) {
      talkFrames++;
      // (the hero walked up to him where he stands and pressed E, as a player talks to him: the spot he's talked at
      // follows him; Esc ends it)
      if (talkFrames === 30) {
        const me = s.root.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion()));
        const at = me.clone().addScaledVector(f, 1.2);
        hero.place(at, Math.atan2(me.x - at.x, me.z - at.z));
        nearAtE = objectNear()?.id ?? 'nothing';
        await lab.step(1, () => ({ keys: ['e'] }));
        opened = talkOpen();
        stillFrom = me;
      }
      if (stillFrom && talkFrames < 150) moved = Math.max(moved, s.root.getWorldPosition(new THREE.Vector3()).distanceTo(stillFrom));
      if (talkFrames === 149) faced = offHero(s);
      if (talkFrames === 150) {
        await lab.step(1, () => ({ keys: ['escape'] }));
        talked = !talkOpen();
        hero.place(away, Math.PI);
      }
    }
  });
  if (talkOpen()) closeTalk();
  lines.push(lineOf('browse', browse));
  problems.push(...problemsOf('browse', browse));
  lines.push(`the open book as he read it (${readFrames} frames): ${readTilt[0].toFixed(0)} to ${readTilt[1].toFixed(0)}° back from upright, its pages at most `
    + `${readOff.toFixed(0)}° off his eyes, a palm at most ${(palmPast * 100).toFixed(1)} cm past its boards, a fingertip at most `
    + `${(tipsPast * 100).toFixed(1)} cm out past its edges and ${(tipsOff * 100).toFixed(1)} cm out behind its boards`);
  if (tipsOff > TIPS_OFF) problems.push(`rounds: a fingertip ${(tipsOff * 100).toFixed(1)} cm out behind the open book's boards (at most ${TIPS_OFF * 100}: his fingers standing up off it like claws)`);
  if (tipsPast > TIPS_PAST) problems.push(`rounds: a fingertip ${(tipsPast * 100).toFixed(1)} cm out past the open book's edges (at most ${TIPS_PAST * 100}: his fingers up past it like claws)`);
  if (!readFrames) problems.push('rounds: he never read a book standing (nothing measured)');
  if (readTilt[0] < READ_TILT.least || readTilt[1] > READ_TILT.most) problems.push(`rounds: the open book held ${readTilt[0].toFixed(0)} to ${readTilt[1].toFixed(0)}° from upright (a reader's ${READ_TILT.least} to ${READ_TILT.most})`);
  if (readOff > PAGES_OFF) problems.push(`rounds: the open book's pages ${readOff.toFixed(0)}° off his eyes (at most ${PAGES_OFF})`);
  if (palmPast > PAST_BOARDS) problems.push(`rounds: a palm ${(palmPast * 100).toFixed(1)} cm past the open book's boards (in front of its pages or out past an edge; at most ${PAST_BOARDS * 100})`);
  lines.push(`a hero stood a metre off as he looked for a book: ${continued ? 'he went on to take one' : 'he never went on'}, his face at least `
    + `${glance.toFixed(0)}° off the hero meanwhile`);
  if (!continued) problems.push('rounds: a hero stood close as he looked for a book, and he never went on');
  if (glance > GLANCED) problems.push(`rounds: a hero stood close and he never looked up at him (${glance.toFixed(0)}° off)`);
  lines.push(`walked up to as he read standing (the object near: ${nearAtE}) and E pressed: the talk ${opened ? 'opened' : 'never opened'}; `
    + `he moved ${moved.toFixed(3)} m, his face ${faced.toFixed(0)}° off the hero; Esc, ${talked ? 'the talk closed and he went on' : 'the talk stayed open'}`);
  if (!opened) problems.push(`rounds: E by him as he read standing opened no talk (the object near: ${nearAtE})`);
  if (!talked) problems.push('rounds: Esc left the talk with him open');
  if (moved > STILL_MOST) problems.push(`rounds: talked to, he moved ${moved.toFixed(2)} m (at most ${STILL_MOST})`);
  if (faced > GLANCED) problems.push(`rounds: talked to, his face ${faced.toFixed(0)}° off the hero`);
  pictured = new Set();
  // (a book kept on a stack, then one shelved from a stack in its gap. As he walks to a case for the keep, the hero steps
  // into his way and stands there: he waits a moment, then goes round, or waits on where there's no way round. Tried in
  // the browse, it used up his glance just before the hero stood close)
  rounds.begin('keep');
  const keep = await follow(lab, s, rounds, canary, () => {
    if (rounds.doing !== 'walking to a case') return;
    walkFrames++;
    const me = s.root.getWorldPosition(new THREE.Vector3());
    if (walkFrames === 40) {
      const ahead = new THREE.Vector3(0, 0, 0.85).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion()));
      blockedAt = me.clone().add(ahead);
      hero.place(blockedAt, 0);
    }
    if (blockedAt && walkFrames === 400) hero.place(away, Math.PI);
    if (blockedAt && walkFrames < 400 && me.distanceTo(blockedAt) > 1.3) wentRound = true;
  });
  lines.push(lineOf('keep', keep));
  problems.push(...problemsOf('keep', keep));
  // (round him where there's a way; where there's none, he waits, and goes on as the hero steps aside: either way, never
  // through what stands in the room, and never stood there for good)
  lines.push(`the hero stood in his way as he walked to a case for 6 s: ${!blockedAt ? 'never stood there' : wentRound ? 'he went round him' : 'no way round: he waited, and went on as the hero stepped aside'}`);
  if (!blockedAt) problems.push('rounds: the hero never stood in his way (nothing measured)');
  const gaps = rounds.gaps;
  rounds.begin('restock');
  const restock = await follow(lab, s, rounds, canary);
  lines.push(lineOf('restock', restock));
  problems.push(...problemsOf('restock', restock));
  lines.push(`books off their shelves: ${gaps} after he kept one, ${rounds.gaps} after he restocked`);
  // (his other tasks: a case dusted, a row squared, the globe set turning)
  const cloth = G.scene.getObjectByName('library dusting cloth')!, ball = G.scene.getObjectByName('library globe')!;
  let clothFar = 0, clothFrames = 0;
  rounds.begin('dust');
  const dust = await follow(lab, s, rounds, canary, () => {
    if (!cloth.visible || rounds.doing !== 'dusting a case') return;
    clothFrames++;
    const palm = hands(s)[1], at = cloth.getWorldPosition(new THREE.Vector3());
    clothFar = Math.max(clothFar, palm.distanceTo(at));
  });
  lines.push(lineOf('dust', dust), `his dusting cloth shown ${clothFrames} frames, at most ${clothFar.toFixed(2)} m from his right palm`);
  problems.push(...problemsOf('dust', dust));
  if (!clothFrames) problems.push('rounds: he dusted with no cloth shown');
  if (clothFar > CLOTH_MOST) problems.push(`rounds: his dusting cloth ${clothFar.toFixed(2)} m from his right palm (at most ${CLOTH_MOST})`);
  rounds.begin('tidy');
  const tidy = await follow(lab, s, rounds, canary);
  lines.push(lineOf('tidy', tidy));
  problems.push(...problemsOf('tidy', tidy));
  const last = ball.quaternion.clone();
  let turned = 0;
  rounds.begin('globe');
  const globe = await follow(lab, s, rounds, canary, () => { turned += last.angleTo(ball.quaternion); last.copy(ball.quaternion); });
  lines.push(lineOf('globe', globe), `the globe turned ${turned.toFixed(1)} rad in all`);
  problems.push(...problemsOf('globe', globe));
  if (turned < GLOBE_TURNS) problems.push(`rounds: the globe he set turning turned ${turned.toFixed(2)} rad (at least ${GLOBE_TURNS})`);
  const compiled = G.renderer.info.programs!.length - programs;
  lines.push(`programs the game's renderer compiled over his rounds (pictured as he walks, takes and reads a book): ${compiled}`);
  if (compiled) problems.push(`rounds: the game's renderer compiled ${compiled} programs over his rounds (none may be)`);
  lines.push(`the frame (drawn, and the browser's): ${sat.toFixed(1)} ms as he sits reading, ${walking ? walking.toFixed(1) : '?'} ms as he walks`);
  if (gaps < 1) problems.push('rounds: he kept a book, and no shelf had a gap for it');
  if (rounds.gaps >= gaps) problems.push('rounds: he restocked, and no gap was filled');
  rounds.hold = true;
  lab.drawing = drawing;
  return { lines, problems, moments };
}
