// tools/lab `seams`: the hero's sewn seams as he moves, frame by frame. Two pieces of his skinned cloth sewn together
// (a sleeve's top into its armhole, `models/tunic.ts`) share their points at rest; each piece is carried by its own
// share of the joints, so a seam holds only while both give the same point the same share. Every point two skinned
// pieces share as built is followed standing, walking, attacking and through each skill's cast, and how far apart the
// pieces are there as drawn: a seam open by more than `GAP_FROM` is a problem. From play: "there is currently a hole
// where the armpit area is... visible when the archer does any movement for drawing a bow or shooting it" (the coat's
// armhole kept to the chest under the shoulder joint and the sleeve's top went up with the arm: 5 cm of forest seen
// through the coat behind the drawing arm). The canary moves one sewn piece's points a centimetre for a frame's measure.
import * as THREE from 'three';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { G } from '../../../src/state';
import type { Frame, Lab, Report } from './lab';
import { holdFor, pressing } from './cast';
import { meshLabeller, placeVertices } from './geometry';

/** What `lab seams` takes. */
export interface SeamsOptions {
  /** list every seam's worst gap, not the worst alone */
  each?: boolean;
  canary?: boolean;
}

/** two pieces further apart than this at a point they share are an open seam (m): a pixel of the close views */
const GAP_FROM = 0.002;
/** points nearer than this as built are one point (m): two pieces' own arithmetic of the same place */
const SAME_PLACE = 5e-5;
/** frames standing and walking, the attack held, and each skill's cast followed once its key is let go */
const STAND_FRAMES = 30;
const WALK_FRAMES = 90;
const ATTACK_FRAMES = 150;
const CAST_FRAMES = 90;
const FRAME_SECONDS = 1 / 60;
/** the canary: the frame of the stand it plants its fault in, and how far it moves a piece (m) */
const CANARY_FRAME = 10;
const CANARY_MOVE = 0.01;
/** the heroes with sleeves set into their coats (`SetInShoulders`): one with no seam found measured nothing */
const SEWN = ['ranger', 'mage'];

/** A sewn piece: a skinned mesh with points it shares with another, and where its vertices are this frame. */
interface Piece {
  mesh: THREE.SkinnedMesh;
  label: string;
  placed: Float32Array;
}

/** A point two or more pieces share as built: a vertex of each (a piece's own copies of it kept once). */
interface Stitch {
  ends: { piece: Piece; vertex: number }[];
  /** its height over the hero's feet as built (m) */
  height: number;
}

/** A seam: the stitches between the same pieces, and its worst gap so far. */
interface Seam {
  name: string;
  stitches: Stitch[];
  worst: number;
  worstIn: string;
}

const mm = (metres: number): string => (metres * 1000).toFixed(1);

/** the hero's skinned meshes' vertices as built, in the frame they were bound in: [mesh, vertex, x, y, z] a point */
function builtPoints(meshes: THREE.SkinnedMesh[]): { mesh: number; vertex: number; at: THREE.Vector3 }[] {
  const points: { mesh: number; vertex: number; at: THREE.Vector3 }[] = [];
  meshes.forEach((mesh, index) => {
    const position = mesh.geometry.attributes.position;
    for (let vertex = 0; vertex < position.count; vertex++) {
      points.push({ mesh: index, vertex, at: new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.bindMatrix) });
    }
  });
  return points;
}

/** a vertex's joints and its share of each, as text: two vertices of one mesh with the same are carried alike */
function carriedBy(mesh: THREE.SkinnedMesh, vertex: number): string {
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const parts: string[] = [];
  for (let k = 0; k < 4; k++) {
    const weight = skinWeight.getComponent(vertex, k);
    if (weight > 0) parts.push(`${skinIndex.getComponent(vertex, k)}:${weight.toFixed(4)}`);
  }
  return parts.sort().join(' ');
}

/**
 * The points the hero's skinned pieces share as built, by the pieces that share them. Points are found in a grid of
 * `SAME_PLACE` cells (each looked for in the cells round its own, so two either side of a cell's edge still meet).
 */
function findSeams(lab: Lab): { seams: Seam[]; pieces: Piece[] } {
  const meshes: THREE.SkinnedMesh[] = [];
  lab.model.root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh && mesh.geometry.attributes.skinIndex) meshes.push(mesh);
  });
  const points = builtPoints(meshes);
  const cell = (value: number) => Math.round(value / SAME_PLACE);
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const grid = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = keyOf(cell(point.at.x), cell(point.at.y), cell(point.at.z));
    const held = grid.get(key);
    if (held) held.push(index);
    else grid.set(key, [index]);
  });
  // each point joined to those within reach of it: a group is one place
  const group = points.map((_, index) => index);
  const rootOf = (index: number): number => {
    while (group[index] !== index) index = group[index] = group[group[index]];
    return index;
  };
  points.forEach((point, index) => {
    const [cx, cy, cz] = [cell(point.at.x), cell(point.at.y), cell(point.at.z)];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const other of grid.get(keyOf(cx + dx, cy + dy, cz + dz)) ?? []) {
        if (other > index && points[other].at.distanceTo(point.at) < SAME_PLACE) group[rootOf(other)] = rootOf(index);
      }
    }
  });
  const places = new Map<number, number[]>();
  points.forEach((_, index) => {
    const root = rootOf(index);
    const held = places.get(root);
    if (held) held.push(index);
    else places.set(root, [index]);
  });

  const label = meshLabeller(lab.joints);
  const pieces = new Map<number, Piece>();
  const pieceOf = (index: number): Piece => {
    let piece = pieces.get(index);
    if (!piece) {
      const mesh = meshes[index];
      piece = { mesh, label: label(mesh), placed: new Float32Array(mesh.geometry.attributes.position.count * 3) };
      pieces.set(index, piece);
    }
    return piece;
  };
  const feet = lab.model.root.getWorldPosition(new THREE.Vector3()).y;
  const seams = new Map<string, Seam>();
  for (const place of places.values()) {
    // (a piece's own copies of a point, one for each face round it, are carried alike: one of each kept; a geometry
    // drawn by two meshes, a hand's skin and its outline, is one piece)
    const kept = new Map<string, number>();
    for (const index of place) {
      const { mesh, vertex } = points[index];
      const how = `${meshes[mesh].geometry.uuid}|${carriedBy(meshes[mesh], vertex)}`;
      if (!kept.has(how)) kept.set(how, index);
    }
    const sewn = new Set([...kept.values()].map((index) => meshes[points[index].mesh].geometry));
    if (sewn.size < 2) continue;
    const ends = [...kept.values()].map((index) => ({ piece: pieceOf(points[index].mesh), vertex: points[index].vertex }));
    const name = [...new Set(ends.map((end) => end.piece.label))].sort().join(' to ');
    let seam = seams.get(name);
    if (!seam) {
      seam = { name, stitches: [], worst: 0, worstIn: '' };
      seams.set(name, seam);
    }
    seam.stitches.push({ ends, height: points[place[0]].at.y - feet });
  }
  return { seams: [...seams.values()], pieces: [...pieces.values()] };
}

/** how far apart a stitch's pieces are there as placed (m): the furthest any two of its ends are */
function gapAt(stitch: Stitch): number {
  let gap = 0;
  for (let a = 0; a < stitch.ends.length; a++) {
    for (let b = a + 1; b < stitch.ends.length; b++) {
      const p = stitch.ends[a].piece.placed;
      const q = stitch.ends[b].piece.placed;
      const i = stitch.ends[a].vertex * 3;
      const j = stitch.ends[b].vertex * 3;
      gap = Math.max(gap, Math.hypot(p[i] - q[j], p[i + 1] - q[j + 1], p[i + 2] - q[j + 2]));
    }
  }
  return gap;
}

/**
 * Moves every vertex of `mesh` by `metres` (as drawn) along x in its geometry; returns the undo. (The mesh itself
 * moved does nothing: a skinned mesh is drawn where its bones are, wherever it is.)
 */
function plantMove(mesh: THREE.SkinnedMesh, metres: number): () => void {
  const position = mesh.geometry.attributes.position;
  const shift = metres / mesh.getWorldScale(new THREE.Vector3()).x;
  const move = (by: number) => { for (let vertex = 0; vertex < position.count; vertex++) position.setX(vertex, position.getX(vertex) + by); };
  move(shift);
  return () => move(-shift);
}

export async function seams(lab: Lab, options: SeamsOptions): Promise<Report> {
  const { seams: found, pieces } = findSeams(lab);
  const problems: string[] = [];
  const lines: string[] = [];
  const stitches = found.reduce((sum, seam) => sum + seam.stitches.length, 0);
  lines.push(`${found.length} seams between skinned pieces, ${stitches} points sewn`);
  if (stitches === 0) {
    const hero = G.player.cls.id;
    if (SEWN.includes(hero)) problems.push(`no seam found on the ${hero}, whose sleeves are set in: nothing was measured`);
    if (options.canary) problems.push('the canary has no seam to open');
    return { text: lines.join('\n'), problems };
  }

  /** every seam's gaps read this frame, `during` what */
  const measure = (during: string): number => {
    for (const piece of pieces) placeVertices(piece.mesh, piece.placed);
    let worst = 0;
    for (const seam of found) {
      for (const stitch of seam.stitches) {
        const gap = gapAt(stitch);
        worst = Math.max(worst, gap);
        if (gap > seam.worst) {
          seam.worst = gap;
          seam.worstIn = `${during}, ${(stitch.height * 100).toFixed(0)} cm up`;
        }
      }
    }
    return worst;
  };

  // the canary first, read apart from the seams' own worsts: the piece with the most stitches moved for one measure
  let planted = -1;
  const canaryPiece = pieces.reduce((most, piece) => {
    const count = (each: Piece) => found.reduce((sum, seam) => sum + seam.stitches.filter((stitch) => stitch.ends.some((end) => end.piece === each)).length, 0);
    return count(piece) > count(most) ? piece : most;
  });
  await lab.step(CANARY_FRAME);
  if (options.canary) {
    const kept = found.map((seam) => [seam.worst, seam.worstIn] as const);
    const undo = plantMove(canaryPiece.mesh, CANARY_MOVE);
    planted = measure('canary');
    undo();
    found.forEach((seam, index) => { [seam.worst, seam.worstIn] = kept[index]; });
  }

  const start = lab.player.pos.clone();
  const follow = async (what: string, frames: number, input: (frame: number) => Frame): Promise<void> => {
    await lab.step(frames, input, () => measure(what));
  };
  await follow('standing', STAND_FRAMES, () => ({}));
  await follow('walking', WALK_FRAMES, () => ({ keys: ['w'] }));
  if (lab.player.pos.distanceTo(start) < 1) problems.push('the hero never walked');
  await lab.step(STAND_FRAMES);

  // each skill on a key cast ahead of him: its key held as long as it's held to cast, then followed through
  const cast: string[] = [];
  for (const key of SKILL_KEYS) {
    const def = G.player.skillAt(key)?.def;
    if (!def) continue;
    const hold = key === 'mouse0' ? ATTACK_FRAMES : Math.max(2, Math.ceil(holdFor(def) / FRAME_SECONDS));
    let began = false;
    await lab.step(hold + CAST_FRAMES, (frame) => pressing(key, lab.aim, frame < hold), () => {
      if (lab.player.casting) began = true;
      measure(def.name);
    });
    if (began) cast.push(def.name);
    else if (key === 'mouse0') problems.push(`the hero never attacked (${def.name})`);
    await lab.step(STAND_FRAMES);
  }
  lines.push(`followed standing, walking and casting ${cast.join(', ') || 'nothing'}`);

  const sorted = [...found].sort((a, b) => b.worst - a.worst);
  for (const seam of options.each ? sorted : sorted.slice(0, 4)) {
    lines.push(`  ${seam.name} (${seam.stitches.length} points): at most ${mm(seam.worst)} mm apart${seam.worstIn ? ` (${seam.worstIn})` : ''}`);
  }
  for (const seam of sorted) {
    if (seam.worst > GAP_FROM) problems.push(`the seam ${seam.name} opens ${mm(seam.worst)} mm (${seam.worstIn})`);
  }
  if (options.canary) {
    lines.push(`canary: ${canaryPiece.label} moved ${mm(CANARY_MOVE)} mm, its seams read ${mm(planted)} mm apart`);
    if (planted < CANARY_MOVE * 0.9) problems.push(`the canary's ${mm(CANARY_MOVE)} mm move read ${mm(planted)} mm`);
  }
  return { text: lines.join('\n'), problems };
}
