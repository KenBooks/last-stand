// Cloth hung stiff from the hips (the tavern's keeper's leather apron, models/keeper.ts) pushed out by the legs under it
// each frame: its points kept outside a capsule round each thigh and shin, the push spread over its neighbours so the
// leather bends rather than dents, and what's sewn onto it (a pocket, its stitching) carried with the points nearest
// it. Hung rigid on the hips, the apron's skirt had his thighs through it as he bent and walked (from play: "it goes
// through his legs when he bends and walks"), where the library's Hollis has his robe pushed by his legs.
import * as THREE from 'three';

/** A leg's part as a capsule: a joint to the next, and how thick round it the cloth keeps (m). */
export interface LegPart { from: THREE.Object3D; to: THREE.Object3D; r: number }

/** How many times the push is spread over each point's neighbours, and how much of a neighbour's it takes each time. */
const SPREAD = { passes: 6, share: 0.7 };

/** One mesh carried by the cloth: each of its points moved as the mean of its nearest cloth points' moves. */
interface Rider { mesh: THREE.Mesh; rest: Float32Array; near: Int32Array; weight: Float32Array }

/** How many cloth points carry each point of a sewn-on piece. */
const RIDE = 4;

export class LegCloth {
  private readonly rest: Float32Array;
  private readonly moved: Float32Array;
  private readonly spread: Float32Array;
  private readonly riders: Rider[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly c = new THREE.Vector3();

  /** `cloth` a grid of `rows` by `cols` points (merchant.ts `rowsSurface`'s order), on `hips` */
  constructor(private readonly cloth: THREE.Mesh, private readonly cols: number, private readonly hips: THREE.Object3D,
    private readonly legs: readonly LegPart[]) {
    const pos = cloth.geometry.attributes.position as THREE.BufferAttribute;
    this.rest = Float32Array.from(pos.array as Float32Array);
    this.moved = new Float32Array(this.rest.length);
    this.spread = new Float32Array(this.rest.length);
  }

  /** `mesh` (on the same joint) carried by the cloth from now: each point by the cloth points nearest it as built */
  carry(mesh: THREE.Mesh): void {
    const rest = Float32Array.from((mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array);
    const n = rest.length / 3, near = new Int32Array(n * RIDE), weight = new Float32Array(n * RIDE);
    const points = this.rest.length / 3;
    for (let i = 0; i < n; i++) {
      const best: [number, number][] = [];
      for (let k = 0; k < points; k++) {
        const d = Math.hypot(rest[i * 3] - this.rest[k * 3], rest[i * 3 + 1] - this.rest[k * 3 + 1], rest[i * 3 + 2] - this.rest[k * 3 + 2]);
        best.push([d, k]);
      }
      best.sort((x, y) => x[0] - y[0]);
      let total = 0;
      for (let r = 0; r < RIDE; r++) total += 1 / (best[r][0] + 1e-3);
      for (let r = 0; r < RIDE; r++) {
        near[i * RIDE + r] = best[r][1];
        weight[i * RIDE + r] = 1 / (best[r][0] + 1e-3) / total;
      }
    }
    this.riders.push({ mesh, rest, near, weight });
  }

  /** The cloth laid for the frame, the legs posed and their world matrices up to date. */
  lay(): void {
    const rest = this.rest, moved = this.moved, points = rest.length / 3;
    moved.fill(0);
    // --- each point's push out of each leg's capsule, in the hips' frame ---
    for (const leg of this.legs) {
      this.hips.worldToLocal(leg.from.getWorldPosition(this.a));
      this.hips.worldToLocal(leg.to.getWorldPosition(this.b));
      for (let i = 0; i < points; i++) {
        this.p.set(rest[i * 3] + moved[i * 3], rest[i * 3 + 1] + moved[i * 3 + 1], rest[i * 3 + 2] + moved[i * 3 + 2]);
        nearestOnSegment(this.p, this.a, this.b, this.c);
        const off = this.p.sub(this.c), d = off.length();
        if (d >= leg.r) continue;
        // (moved straight forward, off the front of the leg: the leather hangs before the legs, and pushed out all
        // round them it wrapped each thigh in a tube with a hollow round it)
        const side = Math.hypot(off.x, off.y);
        if (side >= leg.r) continue;
        const ahead = Math.sqrt(leg.r * leg.r - side * side);
        if (off.z >= ahead) continue;
        moved[i * 3 + 2] += ahead - off.z;
      }
    }
    // --- the push spread over each point's neighbours on the grid, never less than its own ---
    const cols = this.cols, rows = points / cols, spread = this.spread;
    for (let pass = 0; pass < SPREAD.passes; pass++) {
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const i = r * cols + q;
          for (let axis = 0; axis < 3; axis++) {
            let sum = 0, count = 0;
            for (const [dr, dq] of NEIGHBOURS) {
              const rr = r + dr, qq = q + dq;
              if (rr < 0 || rr >= rows || qq < 0 || qq >= cols) continue;
              sum += moved[(rr * cols + qq) * 3 + axis];
              count++;
            }
            const own = moved[i * 3 + axis], mean = count ? sum / count : own;
            spread[i * 3 + axis] = Math.abs(own) >= Math.abs(mean * SPREAD.share) ? own : mean * SPREAD.share;
          }
        }
      }
      moved.set(spread);
    }
    write(this.cloth, rest, moved);
    // --- the pieces sewn on it carried with it ---
    for (const rider of this.riders) {
      const n = rider.rest.length / 3, out = new Float32Array(rider.rest.length);
      for (let i = 0; i < n; i++) {
        for (let r = 0; r < RIDE; r++) {
          const k = rider.near[i * RIDE + r], w = rider.weight[i * RIDE + r];
          out[i * 3] += moved[k * 3] * w;
          out[i * 3 + 1] += moved[k * 3 + 1] * w;
          out[i * 3 + 2] += moved[k * 3 + 2] * w;
        }
      }
      write(rider.mesh, rider.rest, out);
    }
  }
}

/** a point's four neighbours on the grid */
const NEIGHBOURS: readonly [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** `mesh`'s points set to `rest` moved by `moved`, its normals made again */
function write(mesh: THREE.Mesh, rest: Float32Array, moved: Float32Array): void {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute, arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i++) arr[i] = rest[i] + moved[i];
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

/** the point of the segment a to b nearest `p`, into `out` */
function nearestOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
}
