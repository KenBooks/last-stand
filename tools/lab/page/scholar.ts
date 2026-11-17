// `lab scholar`: the library's Brother Hollis (`src/entities/models/scholar.ts`, seated by `src/world/library.ts`) as
// a player meets him. Walked into the library by its door; then his reading loop posed a frame at a time through the
// whole of it, the wrap included, as the game poses it: every joint's turn a frame (a snap is one turned further in a
// frame than his moves ever turn one) and how far his head and his page-turning hand move over it (a loop that never
// moved would be a statue); a hero stood near him looked up at, and looked away from once he walks off; talked to, the
// hero held in his eye. His sleeves' cloth read against his table every frame of the loop: none of it through the
// table's top (wide bells hung free from forearms laid on it went through it, from play). Pictured at points of the
// loop (reading, a page turned, the beard stroked, the spectacles pushed up, leaning in) from the front, each side,
// above and over his shoulder, close up and as the player sees him. `--canary` jumps his loop forward mid-way, a snap
// that must be found, and reads his sleeves against a table 8 cm higher, which they must be found through.
import * as THREE from 'three';
import type { Lab, Pictured, Report, ViewName } from './lab';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { SCHOLAR_DESK } from '../../../src/data/houses';
import { SCHOLAR_LOOP, type Scholar } from '../../../src/entities/models/scholar';
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

/** His loop posed through, a frame at a time, from its start past its wrap: the most any joint turned in a frame and
 *  where, the turn across the wrap, and how far his head turned and each hand went. */
function walkLoop(s: Scholar, canary: boolean): { lines: string[]; problems: string[]; caught: boolean } {
  const joints = jointsOf(s), head = s.root.getObjectByName('scholar cap')!.parent!, hands = joints.filter((j) => j.userData.drawnHand);
  const before = joints.map((j) => j.quaternion.clone()), was = new THREE.Quaternion();
  s.loopAt = SCHOLAR_LOOP - 4;
  s.update(0, null, false);
  joints.forEach((j, i) => before[i].copy(j.quaternion));
  let worst = 0, worstAt = '', wrap = 0, snapped = false, deepest = 0, deepestAt = '';
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
    + (spans.length ? `; through it ${spans.map((x) => `${x.from.toFixed(1)}-${x.to.toFixed(1)} s (${x.mesh}, ${(x.depth * 100).toFixed(1)} cm)`).join(', ')}` : '')];
  const problems: string[] = [];
  const caught = canary && worst > SNAP;
  if (!canary && worst > SNAP) problems.push(`a snap in his loop: ${worstAt} turned ${worst.toFixed(1)}° in a frame (most ${SNAP})`);
  if (wrap > SNAP) problems.push(`his loop snaps at its wrap: ${wrap.toFixed(1)}° in a frame`);
  if (deepest > THROUGH.most) problems.push(`his sleeves go through the table: ${(deepest * 100).toFixed(1)} cm below its top (${deepestAt})`);
  // (the canary's other fault: a table 8 cm higher, which his sleeves at rest must be found through)
  if (canary) {
    s.loopAt = 5;
    s.update(0, null, false);
    const raised = throughTable(s, RAISED);
    lines.push(`canary: against a table ${RAISED * 100} cm higher his sleeves go ${(raised.depth * 100).toFixed(1)} cm below its top`);
    return { lines, problems, caught: caught && raised.depth > THROUGH.most };
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

  // --- the loop, posed through ---
  const loop = walkLoop(s, options.canary);
  lines.push(...loop.lines);
  problems.push(...loop.problems);
  if (options.canary) {
    lines.push(`canary: his loop jumped 20 s at once ${loop.caught ? 'found' : 'unseen'}`);
    if (!loop.caught) problems.push('canary: a snap in his loop went unseen');
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
    moments.push(lab.picture(`scholar-${what.replace(/\s+/g, '-')}-table`, ['above'], [`${what}: from above, ahead of him`], { at: arms, distance: 1.4 }));
    G.player.place(placed, turn);
  }
  return { text: lines.join('\n'), problems, moments };
}
