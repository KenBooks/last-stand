// `lab columns`: the crypt's broken columns as built, roll after roll (tools/lab). Each column's mesh is welded by its
// positions and every edge only one triangle uses above the shaft's foot is an open edge: a hole the sky shows through.
// The break's face is read too: its steepest triangle inside the rim, where a cliff between two chips drew a dark
// slit down across the top ("still seeing holes in concrete pillars"). `--canary` takes a triangle out of the first
// column's break: its open edges must be found.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';

export interface ColumnsOptions {
  /** the runs' seeds the columns are rolled from, each in turn (1 to 12 by default) */
  seeds?: number[];
  canary: boolean;
}

/** the shaft's foot over the base (m): the base's mouldings under it are closed by the floor */
const ABOVE = 0.6;
/** positions this near (m) are one vertex */
const WELD = 1e-4;
/** a triangle inside this radius (m) is the break's face, inside the flutes */
const FACE_INSIDE = 0.3;
/** the steepest a face's triangle may stand (deg): its roughness stands facets to 67, the slit stood at 90 */
const STEEPEST = 75;
const SEEDS = Array.from({ length: 12 }, (_, k) => k + 1);

/** What one column's mesh reads. */
interface Read {
  open: number;
  steepest: number;
}

/** The crypt's columns' meshes. */
function columns(): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  G.arena.groupOf('crypt').traverse((object) => {
    if (object.name === 'column' && (object as THREE.Mesh).isMesh) found.push(object as THREE.Mesh);
  });
  return found;
}

/** A vertex's key once welded. */
function keyOf(pos: THREE.BufferAttribute, i: number): string {
  return [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v / WELD)).join(',');
}

/** The vertices of a geometry's triangles, as a non-indexed or an indexed one has them. */
function corners(geometry: THREE.BufferGeometry): number[] {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  return Array.from({ length: count }, (_, k) => (geometry.index ? geometry.index.getX(k) : k));
}

/** The open edges above the shaft's foot and the face's steepest triangle of one geometry. */
function readColumn(geometry: THREE.BufferGeometry): Read {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const at = corners(geometry);
  const edges = new Map<string, number>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let steepest = 0;
  for (let t = 0; t + 2 < at.length; t += 3) {
    const tri = [at[t], at[t + 1], at[t + 2]];
    const keys = tri.map((i) => keyOf(pos, i));
    if (new Set(keys).size < 3) continue;
    for (let e = 0; e < 3; e++) {
      const edge = [keys[e], keys[(e + 1) % 3]].sort().join('|');
      const high = pos.getY(tri[e]) > ABOVE && pos.getY(tri[(e + 1) % 3]) > ABOVE;
      if (high) edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    a.fromBufferAttribute(pos, tri[0]);
    b.fromBufferAttribute(pos, tri[1]);
    c.fromBufferAttribute(pos, tri[2]);
    const inside = [a, b, c].every((v) => Math.hypot(v.x, v.z) < FACE_INSIDE);
    if (!inside || a.y < ABOVE) continue;
    THREE.Triangle.getNormal(a, b, c, normal);
    steepest = Math.max(steepest, THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(normal.y)))));
  }
  const open = [...edges.values()].filter((uses) => uses === 1).length;
  return { open, steepest };
}

/** The first column's break with one of its face's triangles taken out. */
function plantHole(mesh: THREE.Mesh): void {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const inside = [0, 1, 2].every((k) => Math.hypot(pos.getX(t + k), pos.getZ(t + k)) < FACE_INSIDE);
    if (!inside || pos.getY(t) < ABOVE) continue;
    for (let k = 1; k < 3; k++) pos.setXYZ(t + k, pos.getX(t), pos.getY(t), pos.getZ(t));
    return;
  }
}

export async function columnsCheck(_lab: Lab, options: ColumnsOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const arena = G.arena as Omit<typeof G.arena, 'rollProps'> & { rollProps?: (seed: number) => void };
  // (a tree whose columns aren't rolled reads its boot's)
  const seeds = arena.rollProps ? (options.seeds ?? SEEDS) : [0];
  for (const seed of seeds) {
    arena.rollProps?.(seed);
    const meshes = columns();
    if (options.canary && seed === seeds[0] && meshes[0]) plantHole(meshes[0]);
    const reads = meshes.map((mesh) => readColumn(mesh.geometry));
    const open = reads.reduce((sum, read) => sum + read.open, 0);
    const steepest = Math.max(0, ...reads.map((read) => read.steepest));
    const face = `face's steepest ${steepest.toFixed(0)} deg`;
    lines.push(`seed ${seed}: ${meshes.length} columns, ${open} open edges, ${face}`);
    reads.forEach((read, k) => {
      const column = `seed ${seed}, column ${k}`;
      if (read.open) problems.push(`${column}: ${read.open} open edges`);
      if (read.steepest > STEEPEST) problems.push(`${column}: a cliff in its face (${read.steepest.toFixed(0)} deg)`);
    });
  }
  if (!options.canary) return { text: lines.join('\n'), problems };
  // (the planted hole is the first seed's first column's: caught, it's no problem, the rest still are)
  const planted = (p: string): boolean => p.startsWith(`seed ${seeds[0]}, column 0:`) && p.includes('open edges');
  const caught = problems.some(planted);
  lines.push(`canary: a triangle out of a break ${caught ? 'found' : 'unseen'}`);
  const others = problems.filter((p) => !planted(p));
  return { text: lines.join('\n'), problems: caught ? others : [...others, 'canary: a planted hole went unseen'] };
}
