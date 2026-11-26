// What `lab tavern` reads of the keeper's shirt (page/tavern.ts's `Watch`): its stripes meeting across the seams
// between its pieces, the chest's over the belly's and the collar's over the chest's, read every so many frames through
// his whole day (standing, walking, bent over a table, his arms raised to sweep). From Victor's review of #704: "why
// stripes not matching /aligned". All round each seam, a ray from outside a little above it and one a little below
// meet the two pieces, and the stripes' phase is read off each hit's place in the cloth's map (its u, a repeat of the
// stripes a unit of it): the two must agree within a share of a repeat.
import * as THREE from 'three';
import type { Keeper } from '../../../src/entities/models/keeper';

/** the most the stripes may step across a seam (a share of the stripes' repeat: a tenth, about 9 mm on his chest) */
export const STRIPE_STEP_MOST = 0.1;
/** the most the two pieces' faces may stand apart across a seam (m: half a narrow stripe's width) */
export const SEAM_GAP_MOST = 0.004;
/** how square to the ray both faces must stand for their gap to be read (the cosine of their angle to it) */
const UPRIGHT = 0.7;
/** how far above and below a seam its faces' gap is read (m) */
const GAP_OFF = 0.004;
/** how often it's read (frames), how far above and below a seam the rays meet the pieces (m), and how many places
 *  round him */
const EVERY = 20, OFF = 0.014, ROUND = 32;

/** A seam: the piece above it, the piece below, and the row of the upper piece's points along it (their indices). */
/** `flat`: its two pieces lie on one another, their faces' gap read (the chest over the belly); a standing collar is a
 *  band folded up off his shoulders, its stripes' angle alone read */
interface Seam { name: string; upper: THREE.Mesh; lower: THREE.Mesh; row: number[]; gap: Worst; flat: boolean }

/** The worst of something seen, and where. */
class Worst {
  value = 0;
  at = '';
  see(value: number, at: () => string): void {
    if (value <= this.value) return;
    this.value = value;
    this.at = at();
  }
}

export class ShirtSeams {
  readonly step = new Worst();
  reads = 0;
  private frame = 0;
  private seams: Seam[] | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly at = new THREE.Vector3();
  private readonly out = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly from = new THREE.Vector3();

  read(keeper: Keeper, doing: string): void {
    if (this.frame++ % EVERY) return;
    this.seams ??= seamsOf(keeper);
    keeper.root.updateMatrixWorld(true);
    for (const seam of this.seams) {
      const piece = seam.upper, pos = piece.geometry.attributes.position, parent = piece.parent!;
      const q = parent.getWorldQuaternion(new THREE.Quaternion());
      this.up.set(0, 1, 0).applyQuaternion(q);
      for (let k = 0; k < ROUND; k++) {
        const index = seam.row[Math.floor((k / ROUND) * (seam.row.length - 1))];
        this.at.fromBufferAttribute(pos, index);
        this.out.set(this.at.x, 0, this.at.z).normalize().applyQuaternion(q);
        piece.localToWorld(this.at);
        const above = this.phase(piece, this.at, OFF);
        const below = this.phase(seam.lower, this.at, -OFF);
        if (above === null || below === null) continue;
        this.reads++;
        const apart = Math.abs(((above.u - below.u) % 1 + 1.5) % 1 - 0.5);
        const round = `${seam.name}, ${(k / ROUND * 360).toFixed(0)}° round him from his front`;
        this.step.see(apart, () => `${round}, the stripes ${(apart * 100).toFixed(0)}% of a repeat apart, ${doing}`);
        // (the two pieces' faces apart across the seam: a stripe at the same angle round him on a wider piece stands
        // further out, and seen from beside it steps sideways by as much)
        // (only where both faces stand up to the ray: over his shoulders a level ray skims the cloth and meets it far off)
        if (!seam.flat) continue;
        // (and read close either side of it, or the cloth's own taper over the probes' span reads as a gap)
        const nearAbove = this.phase(piece, this.at, GAP_OFF), nearBelow = this.phase(seam.lower, this.at, -GAP_OFF);
        if (!nearAbove || !nearBelow || nearAbove.upright < UPRIGHT || nearBelow.upright < UPRIGHT) continue;
        const gap = Math.abs(nearAbove.far - nearBelow.far);
        seam.gap.see(gap, () => `${round}, its faces ${(gap * 1000).toFixed(1)} mm apart, ${doing}`);
      }
    }
  }

  problems(): string[] {
    const out: string[] = [];
    if (!this.reads) out.push('the shirt\'s seams were never read');
    if (this.step.value > STRIPE_STEP_MOST) out.push(`his shirt's stripes stepped across a seam: ${this.step.at}`);
    for (const seam of this.seams ?? []) {
      if (seam.gap.value > SEAM_GAP_MOST) out.push(`his shirt's stripes stepped sideways at a seam, its faces apart: ${seam.gap.at}`);
    }
    return out;
  }

  said(): string {
    return `his shirt: its stripes across its seams at most ${(this.step.value * 100).toFixed(0)}% of a repeat apart${this.step.at ? ` (${this.step.at})` : ''}, `
      + (this.seams ?? []).filter((seam) => seam.flat).map((seam) => `${seam.name}'s faces at most ${(seam.gap.value * 1000).toFixed(1)} mm apart${seam.gap.at ? ` (${seam.gap.at})` : ''}, `).join('')
      + `read ${this.reads} times`;
  }

  /** the stripes' phase where a ray from outside, `up` m above `at`, meets `mesh` (its u, a repeat a unit) and how far
   *  along the ray it meets it, or null */
  private phase(mesh: THREE.Mesh, at: THREE.Vector3, up: number): { u: number; far: number; upright: number } | null {
    this.from.copy(at).addScaledVector(this.up, up).addScaledVector(this.out, 0.12);
    this.ray.set(this.from, this.out.clone().negate());
    this.ray.far = 0.2;
    const hit = this.ray.intersectObject(mesh, false)[0];
    if (!hit?.uv || !hit.face) return null;
    const facing = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
    return { u: hit.uv.x, far: hit.distance, upright: Math.abs(facing.dot(this.out)) };
  }
}

/** the shirt's seams on the keeper as built: the chest's piece's lowest row over the belly's, the collar's lowest over
 *  the chest's */
function seamsOf(keeper: Keeper): Seam[] {
  const named = (name: string) => {
    const mesh = keeper.parts.find((part) => part.name === `keeper ${name}`);
    if (!mesh) throw new Error(`lab: the keeper has no ${name}`);
    return mesh;
  };
  const chest = named('shirt chest'), belly = named('shirt belly'), collar = named('shirt collar');
  /** a piece's lowest row of points (`rowsSurface`'s first row: the first `n`) */
  const lowestRow = (mesh: THREE.Mesh, n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => i < mesh.geometry.attributes.position.count);
  return [
    { name: 'the chest\'s piece over the belly\'s', upper: chest, lower: belly, row: lowestRow(chest, 41), gap: new Worst(), flat: true },
    { name: 'the collar over the chest\'s piece', upper: collar, lower: chest, row: lowestRow(collar, 25), gap: new Worst(), flat: false },
  ];
}

/** The belly's piece of the shirt shifted round by `by` of a repeat (the canary's: its stripes stepping at the seam),
 *  or put back. */
export function shiftBelly(keeper: Keeper, by: number): void {
  const belly = keeper.parts.find((part) => part.name === 'keeper shirt belly');
  if (!belly) return;
  const uv = belly.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + by);
  uv.needsUpdate = true;
}
