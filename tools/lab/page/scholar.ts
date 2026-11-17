// `lab scholar`: the library's Brother Hollis (`src/entities/models/scholar.ts`, seated by `src/world/library.ts`) as
// a player meets him. Walked into the library by its door; then his reading loop posed a frame at a time through the
// whole of it, the wrap included, as the game poses it: every joint's turn a frame (a snap is one turned further in a
// frame than his moves ever turn one) and how far his head and his page-turning hand move over it (a loop that never
// moved would be a statue); a hero stood near him looked up at, and looked away from once he walks off; talked to, the
// hero held in his eye. His sleeves' cloth read against his table every frame of the loop: none of it through the
// table's top (wide bells hung free from forearms laid on it went through it, from play); the page he turns against
// his book's two halves, at every frame of each turn, its landing included: none of it under either half's print (it
// lifted out from under them, "1/4 of it is under another white piece", and landed through the book, from play), and
// lying flat on the left half as it lands; the book's printed pages reaching the spine on both halves, the halves
// meeting there ("fill in the pages... they should reach the middle"); his fingers on the page's outer edge while he
// holds it ("he grabs it from thin air, there is nothing on the edges"); his fingertips resting on the book and the
// table, not sunk into them. Pictured at points of the
// loop (reading, a page turned, the beard stroked, the spectacles pushed up, leaning in) from the front, each side,
// above and over his shoulder, close up and as the player sees him. `--canary` jumps his loop forward mid-way, a snap
// that must be found, reads his sleeves against a table 8 cm higher, which they must be found through, turns a page
// from a spine 1 cm lower, which must be found under the book, and draws the prints 2 cm back from the spine, a gap
// that must be found.
import * as THREE from 'three';
import type { Lab, Pictured, Report, ViewName } from './lab';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { SCHOLAR_DESK } from '../../../src/data/houses';
import { SCHOLAR_LOOP, type Scholar } from '../../../src/entities/models/scholar';
import { pageHeight } from '../../../src/entities/models/book';
import { toVillage } from './village';
import { DOOR_FRAMES, stand, useByE, viewAs } from './houses';

export interface ScholarOptions {
  /** the views of the close-ups (`front,left,right,back,above` by default) */
  views?: string[];
  /** the points of his loop pictured (s) */
  at?: number[];
  canary: boolean;
}

/** the frame a pose is stepped by (s): the game at 60 a second */
const FRAME = 1 / 60;
/** the most a joint may turn in a frame of his loop (deg): his quickest moves (the page lifted over, a hand back to
 *  the table) turn about 2.5; a snap turns many times that */
const SNAP = 5;
/** how far his head must turn and his hand go over the loop (deg, m), or he's a statue */
const MOVES = { head: 8, hand: 0.15 };
/** how far off the hero his face may point while he's looked at (deg) and how far off it must point once he's not */
const LOOKED = { at: 25, away: 35 };
/** where the hero stands to talk to him as the player is pictured doing it (the room's frame): beside his table on its
 *  right, a step back, so the camera behind him sees the scholar's face ahead and to the left, within his reach */
const SEEN_FROM: [number, number] = [-1.6, 2.4];
/** how far his sleeves' cloth may come below the table's top inside its edges (m), and how far below the top a point
 *  is still read as through it (further down, it's cloth hanging past the table's edge, under it) */
const THROUGH = { most: 0.004, depth: 0.2 };
/** the canary's table: this much higher than his (m) */
const RAISED = 0.08;
/** the canary's page: its spine this much lower (m), about where it was when it lifted from under the blocks */
const LOWERED = 0.01;
/** how far a fingertip's pad may sink into what it rests on (m) */
const SINK = 0.003;
/** how far a printed page may stop short of the spine (m), and the halves stand apart at it */
const SPINE_GAP = 0.003;
/** how far over the left half's print the page he turns may lie as it lands (m): flat on it, not floating */
const LANDED = 0.004;
/** how far his nearest fingertip may be from the page's outer edge while he has it in hand (m) */
const AT_EDGE = 0.05;
/** the canary's prints: drawn back from the spine this far (m) */
const DRAWN_BACK = 0.02;

/** a page turn of his loop (s, from and to: `BEATS.turnA` in the model) */
const BEATS_TURN = [20, 24.5] as const;
/** what's pictured at each point of the loop */
const BEATS: readonly [number, string][] = [[5, 'reading'], [12.2, 'musing'], [22.4, 'turning a page'], [34, 'stroking his beard'],
  [45, 'pushing his spectacles up'], [52, 'leaning in']];

/** His joints (every group under him, a finger's and an eye's too), by name and place among them. */
function jointsOf(s: Scholar): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  s.root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) out.push(o); });
  return out;
}

/** His sleeves' cloth (the upper sleeves, the bells, their linings and cuffs), as posed now: how deep its deepest point
 *  inside the table's edges is below its top (m, 0 for none), and which mesh, with the table raised by `raise`. */
function throughTable(s: Scholar, raise = 0): { depth: number; mesh: string } {
  const { x0, x1, z0, z1, top } = s.table, p = new THREE.Vector3(), toRoot = new THREE.Matrix4();
  const height = top + raise, inset = 0.01;
  s.root.updateMatrixWorld(true);
  const rootInverse = s.root.matrixWorld.clone().invert();
  let depth = 0, mesh = '';
  for (const m of s.parts) {
    if (!/sleeve|bell|lining|cuff/.test(m.name)) continue;
    toRoot.multiplyMatrices(rootInverse, m.matrixWorld);
    const at = m.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      p.fromBufferAttribute(at, i).applyMatrix4(toRoot);
      if (p.x < x0 + inset || p.x > x1 - inset || p.z < z0 + inset || p.z > z1 - inset) continue;
      const below = height - p.y;
      if (below > depth && below < THROUGH.depth) { depth = below; mesh = m.name; }
    }
  }
  return { depth, mesh };
}

/** How far a point (world) is over a half of the book's print (m, below it if less than 0), and whether it's over the
 *  half at all, in that half's frame (x from the spine to its edge). */
function overHalf(s: Scholar, block: THREE.Object3D, p: THREE.Vector3, q = new THREE.Vector3()): number | null {
  const b = s.book.shape;
  block.worldToLocal(q.copy(p));
  if (q.x < 0 || q.x > b.half || Math.abs(q.z) > b.depth / 2 || q.y < -0.01) return null;
  return q.y - (pageHeight(b, q.x / b.half) + b.printed);
}

/** The page he turns, as posed now, against his book's two halves: the deepest any point of it is under either's print
 *  (m, 0 for none), the share of its points under one, and the most any point lies over the left half's print (where
 *  it lands; null where none is over it). Nothing while the page isn't shown. */
function pageUnder(s: Scholar): { depth: number; share: number; overLeft: number | null } {
  if (!s.page.visible) return { depth: 0, share: 0, overLeft: null };
  s.root.updateMatrixWorld(true);
  const at = s.page.geometry.attributes.position, p = new THREE.Vector3();
  let depth = 0, under = 0, overLeft: number | null = null;
  for (let i = 0; i < at.count; i++) {
    p.fromBufferAttribute(at, i).applyMatrix4(s.page.matrixWorld);
    let most = 0;
    for (const [h, block] of s.book.blocks.entries()) {
      const over = overHalf(s, block, p);
      if (over === null) continue;
      most = Math.max(most, -over);
      if (h === 1) overLeft = Math.max(overLeft ?? -Infinity, over);
    }
    if (most > 0) { under++; depth = Math.max(depth, most); }
  }
  return { depth, share: under / at.count, overLeft };
}

/** How far each half's printed page stops short of the spine (m, the most of the two), and how far apart the halves
 *  stand at it. */
function spineGaps(s: Scholar): { print: number; halves: number } {
  s.root.updateMatrixWorld(true);
  let print = 0;
  const q = new THREE.Vector3();
  for (const [h, printed] of s.book.prints.entries()) {
    const at = printed.geometry.attributes.position, block = s.book.blocks[h];
    let least = Infinity;
    for (let i = 0; i < at.count; i++) {
      block.worldToLocal(printed.localToWorld(q.fromBufferAttribute(at, i)));
      least = Math.min(least, q.x);
    }
    print = Math.max(print, least);
  }
  const [a, b] = s.book.blocks.map((block) => block.getWorldPosition(new THREE.Vector3()));
  return { print, halves: a.distanceTo(b) };
}

/** How far his right hand's nearest fingertip is from the page's outer edge (m). */
function fromEdge(s: Scholar): number {
  s.root.updateMatrixWorld(true);
  const at = s.page.geometry.attributes.position, p = new THREE.Vector3(), tip = new THREE.Vector3();
  // (the edge: the page's points furthest from the spine, round which it turns)
  let far = 0;
  for (let i = 0; i < at.count; i++) far = Math.max(far, Math.hypot(at.getX(i), at.getY(i)));
  const edge: THREE.Vector3[] = [];
  for (let i = 0; i < at.count; i++) {
    if (Math.hypot(at.getX(i), at.getY(i)) > far - 0.002) edge.push(p.fromBufferAttribute(at, i).applyMatrix4(s.page.matrixWorld).clone());
  }
  const hand = s.hands[1];
  let near = Infinity;
  for (const digit of [...hand.f.slice(0, 3), hand.thumb]) {
    digit.j[digit.j.length - 1].localToWorld(tip.set(0, -digit.len[digit.len.length - 1], 0));
    // (the distance to the edge's line between its two ends)
    const [a, b] = edge, ab = b.clone().sub(a), u = clamp01(tip.clone().sub(a).dot(ab) / ab.lengthSq());
    near = Math.min(near, tip.distanceTo(a.clone().addScaledVector(ab, u)));
  }
  return near;
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** His fingertips, as posed now, against what's under them (a page block's print, else the table's top): how far the
 *  deepest pad sinks into it (m, 0 for none) and whose. A pad is the tip less the finger's radius. */
function tipsSunk(s: Scholar): { depth: number; finger: string } {
  s.root.updateMatrixWorld(true);
  const { x0, x1, z0, z1, top } = s.table, rootInverse = s.root.matrixWorld.clone().invert();
  const tip = new THREE.Vector3(), q = new THREE.Vector3(), scale = new THREE.Vector3();
  let depth = 0, finger = '';
  for (const [h, hand] of s.hands.entries()) {
    for (const [d, digit] of [...hand.f, hand.thumb].entries()) {
      const last = digit.j[digit.j.length - 1];
      last.localToWorld(tip.set(0, -digit.len[digit.len.length - 1], 0));
      const r = digit.r * hand.vis.getWorldScale(scale).x;
      let sunk = -Infinity;
      for (const block of s.book.blocks) {
        const over = overHalf(s, block, tip, q);
        if (over !== null) sunk = Math.max(sunk, r - over);
      }
      q.copy(tip).applyMatrix4(rootInverse);
      if (sunk === -Infinity && q.x > x0 && q.x < x1 && q.z > z0 && q.z < z1) sunk = top - (q.y - r);
      if (sunk > depth) { depth = sunk; finger = `${h ? 'right' : 'left'} ${d === hand.f.length ? 'thumb' : `finger ${d + 1}`}`; }
    }
  }
  return { depth, finger };
}

/** His loop posed through, a frame at a time, from its start past its wrap: the most any joint turned in a frame and
 *  where, the turn across the wrap, and how far his head turned and each hand went. */
function walkLoop(s: Scholar, canary: boolean): { lines: string[]; problems: string[]; caught: boolean } {
  const joints = jointsOf(s), head = s.root.getObjectByName('scholar cap')!.parent!, hands = joints.filter((j) => j.userData.drawnHand);
  const before = joints.map((j) => j.quaternion.clone()), was = new THREE.Quaternion();
  s.loopAt = SCHOLAR_LOOP - 4;
  s.update(0, null, false);
  joints.forEach((j, i) => before[i].copy(j.quaternion));
  let worst = 0, worstAt = '', wrap = 0, snapped = false, deepest = 0, deepestAt = '';
  let pageDeepest = 0, pageShare = 0, pageAt = '', pageFrames = 0, tipDeepest = 0, tipAt = '';
  /** how far over the left half the page lay at each turn's last frame shown (m), and the farthest his fingers were
   *  from its edge while he held it (m, and when) */
  const landings: number[] = [];
  let lastOverLeft: number | null = null, wasShown = false, edgeFar = 0, edgeAt = '', heldFrames = 0;
  /** the stretches of the loop his sleeves were through the table (s, from and to, and the deepest in it, m) */
  const spans: { from: number; to: number; depth: number; mesh: string }[] = [];
  const headTurn = { min: Infinity, max: -Infinity }, handAt = new THREE.Vector3();
  const handFrom = hands.map(() => new THREE.Vector3()), handWent = hands.map(() => 0);
  const frames = Math.round((SCHOLAR_LOOP + 8) / FRAME);
  hands.forEach((h, i) => h.getWorldPosition(handFrom[i]));
  for (let f = 0; f < frames; f++) {
    const t = s.loopAt;
    // (the canary's snap: his loop jumped on 20 s at once, half way)
    if (canary && f === frames >> 1) { s.loopAt = t + 20; snapped = true; }
    s.update(FRAME, null, false);
    let most = 0, which = '';
    joints.forEach((j, i) => {
      was.copy(before[i]);
      const turn = THREE.MathUtils.radToDeg(was.angleTo(j.quaternion));
      if (turn > most) { most = turn; which = j.name || `joint ${i}`; }
      before[i].copy(j.quaternion);
    });
    const crossed = s.loopAt < t;
    if (crossed && !snapped) wrap = Math.max(wrap, most);
    if (most > worst) { worst = most; worstAt = `${which} at ${t.toFixed(2)} s`; }
    const yaw = new THREE.Euler().setFromQuaternion(head.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
    headTurn.min = Math.min(headTurn.min, yaw.x); headTurn.max = Math.max(headTurn.max, yaw.x);
    hands.forEach((h, i) => { h.getWorldPosition(handAt); handWent[i] = Math.max(handWent[i], handAt.distanceTo(handFrom[i])); });
    // (the page he turns against the blocks, and his fingertips against what they rest on)
    if (s.page.visible) {
      pageFrames++;
      const under = pageUnder(s);
      if (under.depth > pageDeepest) { pageDeepest = under.depth; pageShare = under.share; pageAt = `${t.toFixed(2)} s`; }
      lastOverLeft = under.overLeft;
      // (his fingers on its edge while it's fully in his hand)
      if (s.holding > 0.95) {
        heldFrames++;
        const from = fromEdge(s);
        if (from > edgeFar) { edgeFar = from; edgeAt = `${t.toFixed(2)} s`; }
      }
    } else if (wasShown && lastOverLeft !== null) landings.push(lastOverLeft);
    wasShown = s.page.visible;
    const sunk = tipsSunk(s);
    if (sunk.depth > tipDeepest) { tipDeepest = sunk.depth; tipAt = `${sunk.finger} at ${t.toFixed(2)} s`; }
    // (his sleeves against the table, but where the canary's jump has posed him: that's the snap's to find)
    const through = throughTable(s);
    if (through.depth > deepest) { deepest = through.depth; deepestAt = `${through.mesh} at ${t.toFixed(2)} s`; }
    if (through.depth > THROUGH.most) {
      const last = spans[spans.length - 1];
      if (last && t - last.to < FRAME * 2 && t >= last.to) {
        last.to = t;
        if (through.depth > last.depth) { last.depth = through.depth; last.mesh = through.mesh; }
      } else spans.push({ from: t, to: t, depth: through.depth, mesh: through.mesh });
    }
  }
  const headDeg = THREE.MathUtils.radToDeg(headTurn.max - headTurn.min);
  const lines = [`loop: ${SCHOLAR_LOOP} s posed at 60 a second; the most a joint turned in a frame ${worst.toFixed(2)}° (${worstAt}), `
    + `across the wrap ${wrap.toFixed(2)}°; his head's pitch over it ${headDeg.toFixed(1)}°, his hands went ${handWent.map((d) => d.toFixed(2)).join(' and ')} m (the left first)`,
    `his sleeves below the table's top: ${deepest > 0 ? `${(deepest * 100).toFixed(1)} cm at the deepest (${deepestAt})` : 'none'}`
    + (spans.length ? `; through it ${spans.map((x) => `${x.from.toFixed(1)}-${x.to.toFixed(1)} s (${x.mesh}, ${(x.depth * 100).toFixed(1)} cm)`).join(', ')}` : ''),
    `the page he turns, over ${pageFrames} frames: ${pageDeepest > 0 ? `under the page blocks by ${(pageDeepest * 1000).toFixed(1)} mm at the deepest, ${(pageShare * 100).toFixed(0)}% of it under them then (${pageAt})` : 'never under the page blocks'}`,
    `his fingertips: ${tipDeepest > 0 ? `sunk ${(tipDeepest * 1000).toFixed(1)} mm at the deepest (${tipAt})` : 'never sunk into the book or the table'}`,
    `the page landing: ${landings.length ? landings.map((h) => `${(h * 1000).toFixed(1)} mm`).join(', ') : 'never'} over the left half's print at each turn's last frame`,
    `his fingers on its edge while he holds it (${heldFrames} frames): ${(edgeFar * 100).toFixed(1)} cm from it at the farthest (${edgeAt})`];
  const problems: string[] = [];
  const caught = canary && worst > SNAP;
  if (canary) lines.push(`canary: his loop jumped 20 s at once ${caught ? 'found' : 'unseen'} (${worst.toFixed(0)}° in a frame)`);
  if (!canary && worst > SNAP) problems.push(`a snap in his loop: ${worstAt} turned ${worst.toFixed(1)}° in a frame (most ${SNAP})`);
  if (wrap > SNAP) problems.push(`his loop snaps at its wrap: ${wrap.toFixed(1)}° in a frame`);
  if (deepest > THROUGH.most) problems.push(`his sleeves go through the table: ${(deepest * 100).toFixed(1)} cm below its top (${deepestAt})`);
  if (!pageFrames) problems.push('the page he turns was never shown over the loop');
  if (pageDeepest > 0 && !canary) problems.push(`the page he turns goes under the book's page blocks: ${(pageDeepest * 1000).toFixed(1)} mm, ${(pageShare * 100).toFixed(0)}% of it (${pageAt})`);
  if (tipDeepest > SINK) problems.push(`his fingertips sink into what they rest on: ${(tipDeepest * 1000).toFixed(1)} mm (${tipAt})`);
  if (landings.length < 2) problems.push(`the page landed ${landings.length} times over the loop, not at each of its 2 turns`);
  for (const h of landings) if (h > LANDED || h < 0) problems.push(`the page doesn't land flat on the left half: ${(h * 1000).toFixed(1)} mm over its print`);
  if (!heldFrames) problems.push('he never had the page in hand');
  if (edgeFar > AT_EDGE) problems.push(`he holds the page away from its edge: his fingers ${(edgeFar * 100).toFixed(1)} cm from it (${edgeAt})`);
  // (the canary's other fault: a table 8 cm higher, which his sleeves at rest must be found through)
  if (canary) {
    s.loopAt = 5;
    s.update(0, null, false);
    const raised = throughTable(s, RAISED);
    lines.push(`canary: against a table ${RAISED * 100} cm higher his sleeves go ${(raised.depth * 100).toFixed(1)} cm below its top`);
    // (a page turned from a spine 1 cm lower, half way through lifting)
    const pivot = s.page.parent!;
    pivot.position.y -= LOWERED;
    // (early in its lift, where its root lies nearest the blocks: 40% of the way into the turn)
    s.loopAt = BEATS_TURN[0] + (BEATS_TURN[1] - BEATS_TURN[0]) * 0.4;
    s.update(0, null, false);
    const lowered = pageUnder(s);
    pivot.position.y += LOWERED;
    lines.push(`canary: a page turned from a spine ${LOWERED * 100} cm lower is under the blocks by ${(lowered.depth * 1000).toFixed(1)} mm`);
    // (the prints drawn back from the spine)
    for (const printed of s.book.prints) printed.position.x += DRAWN_BACK;
    const drawn = spineGaps(s);
    for (const printed of s.book.prints) printed.position.x -= DRAWN_BACK;
    lines.push(`canary: prints drawn ${DRAWN_BACK * 100} cm back stop ${(drawn.print * 1000).toFixed(1)} mm short of the spine`);
    return { lines, problems, caught: caught && raised.depth > THROUGH.most && lowered.depth > 0 && drawn.print > SPINE_GAP };
  }
  if (headDeg < MOVES.head) problems.push(`his head hardly moves over the loop: ${headDeg.toFixed(1)}° (at least ${MOVES.head})`);
  for (const [i, went] of handWent.entries()) {
    if (went < MOVES.hand) problems.push(`his ${i ? 'right' : 'left'} hand hardly moves over the loop: ${went.toFixed(2)} m (at least ${MOVES.hand})`);
  }
  return { lines, problems, caught };
}

/** How far off the hero his face points (deg). */
function offHero(s: Scholar): number {
  const head = s.root.getObjectByName('scholar cap')!.parent!;
  s.root.updateMatrixWorld(true);
  const from = head.getWorldPosition(new THREE.Vector3()), facing = new THREE.Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const to = G.player.pos.clone().setY(G.player.pos.y + 1.55).sub(from).normalize();
  return THREE.MathUtils.radToDeg(facing.angleTo(to));
}

/** `lab scholar`. */
export async function scholar(lab: Lab, options: ScholarOptions): Promise<Report> {
  await toVillage(lab);
  const room = G.arena.rooms?.library;
  if (!room) return { text: 'no library: the lobby is not the village', problems: ['no rooms built'] };
  lab.drawing = true;
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  await viewAs(lab, 'third');
  const door = villageObject('libraryDoor')!;
  await stand(lab, door.stand, 0);
  await useByE(lab, door, problems);
  await lab.until(() => G.arena.room === 'library', DOOR_FRAMES, "the library's door never took him in");
  await lab.step(15);
  const s = room.folk?.();
  if (!s) return { text: 'the library has no scholar seated', problems: ['no scholar seated'] };
  let triangles = 0;
  s.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
  lines.push(`Brother Hollis seated, ${Math.round(triangles / 1000)}k triangles`);

  // --- the book: its printed pages to the spine, its halves meeting there ---
  const gaps = spineGaps(s);
  lines.push(`the book: its prints stop ${(gaps.print * 1000).toFixed(1)} mm short of the spine, its halves ${(gaps.halves * 1000).toFixed(1)} mm apart at it`);
  if (gaps.print > SPINE_GAP) problems.push(`the book's printed pages stop ${(gaps.print * 1000).toFixed(1)} mm short of the spine (at most ${SPINE_GAP * 1000})`);
  if (gaps.halves > SPINE_GAP) problems.push(`the book's halves stand ${(gaps.halves * 1000).toFixed(1)} mm apart at the spine`);

  // --- the loop, posed through ---
  const loop = walkLoop(s, options.canary);
  lines.push(...loop.lines);
  problems.push(...loop.problems);
  if (options.canary) {
    lines.push(`canary: ${loop.caught ? 'every planted fault found' : 'a planted fault went unseen'}`);
    if (!loop.caught) problems.push('canary: a planted fault went unseen');
    return { text: lines.join('\n'), problems, moments };
  }

  // --- glanced at as the hero comes near; looked away from as he goes ---
  const him = villageObject('scholar')!, facingHim = Math.atan2(him.at[0] - him.stand[0], him.at[1] - him.stand[1]);
  await stand(lab, him.stand, facingHim);
  await lab.step(60);
  const glanced = offHero(s);
  await stand(lab, [0, -2.2], 0);
  await lab.step(300);
  const away = offHero(s);
  lines.push(`a hero come near: his face ${glanced.toFixed(0)}° off him; walked off and 5 s on, ${away.toFixed(0)}° off him`);
  if (glanced > LOOKED.at) problems.push(`he never looked up at a hero come near: his face ${glanced.toFixed(0)}° off him`);
  if (away < LOOKED.away) problems.push(`he kept looking at the hero after he walked off: ${away.toFixed(0)}° off him`);

  // --- talked to: held in his eye (stood beside his table, the over the shoulder camera looking past him: it looks
  // down the room, to its back wall, whichever way the hero faces) ---
  await stand(lab, SEEN_FROM, Math.PI);
  await lab.step(400);
  await useByE(lab, him, problems);
  await lab.step(90);
  const talking = offHero(s);
  lines.push(`talked to: his face ${talking.toFixed(0)}° off the hero`);
  if (talking > LOOKED.at) problems.push(`talked to, he didn't look at the hero: ${talking.toFixed(0)}° off him`);
  moments.push(await lab.screen('scholar-talk', ['talked to, as the player sees it']));
  await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(240);
  moments.push(await lab.screen('scholar-third', ['as the player sees him from his table']));

  // --- pictured at points of his loop, the hero by the door facing as he does ---
  const { x, z, turn } = SCHOLAR_DESK;
  const placed = new THREE.Vector3(3.5, 0, 3.2);
  G.player.place(placed, turn);
  await lab.step(400);
  const views = (options.views ?? ['front', 'left', 'right', 'back', 'above']) as ViewName[];
  const ahead = (d: number, y: number) => new THREE.Vector3(x + Math.sin(turn) * d, y, z + Math.cos(turn) * d);
  // (his arms on the table: framed on its near edge, as from play the sleeves were seen through it)
  const chest = ahead(0, 1.0), face = ahead(0.08, 1.2), arms = ahead(0.3, s.table.top + 0.05);
  // (his book, from above: framed on its spine, close enough to see a page lying on the blocks or under them)
  const book = s.page.parent!.getWorldPosition(new THREE.Vector3());
  const beats = options.at ? options.at.map((t): [number, string] => [t, `${t} s`]) : BEATS;
  for (const [t, what] of beats) {
    s.loopAt = t;
    s.update(0, null, false);
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}`, views, [`${what} (${t} s of ${SCHOLAR_LOOP})`], { at: chest, distance: 1.7 }));
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-face`, ['front', 'left'], [`${what}: his face`], { at: face, distance: 0.75 }));
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-arms`, ['front', 'left', 'right'], [`${what}: his arms on the table`], { at: arms, distance: 1.1 }));
    // (and from above ahead of him, as a player standing at his table looks down at it: the close-ups turn with the
    // hero's facing, so the hero turned round makes their view from above and behind one from above and ahead)
    G.player.place(placed, turn + Math.PI);
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-table`, ['above'], [`${what}: his book from above, ahead of him`], { at: book, distance: 0.8 }));
    G.player.place(placed, turn);
  }
  return { text: lines.join('\n'), problems, moments };
}
