// What stands on the meadow, as its grass meets it: over each 12.5 cm cell of the meadow's square, the lowest solid
// above the ground there (m), read once at build from every mesh built but the ground (its triangles laid over the
// cells: their faces' and their edges', so an upright face's foot counts as much as a log's underside). Each blade is
// held under it (`VERTEX_BLADE` in meadow.ts, `bladeNodes` in meadowNodes.ts): one rooted under a log lies under it,
// one beside a post grows up beside it, and one leaning into a post is bent down where it meets it. From play,
// "grass grows through logs" and the lamps' feet; cleared round each prop by hand, the grass stood back from them, as
// grass in life doesn't ("let grass be closer to props, like real life. Just not going through them"). What's built
// later is met the same way, with nothing to add for it.
//
// Its size: one byte a cell, 768 x 768 over the village's 96 m, 576 KB on the GPU and as much in memory while it's
// built, read by every grass ring's vertices (nearest, no mipmaps). Nothing is kept across visits.
import * as THREE from 'three';
import { shapesOf } from './simpleTrees';
import type { MeadowMask } from './meadow';

/** a cell's size (m), and the heights a solid is read over (m: from the ground to past the tallest blade's top) */
export const SOLID_CELL = 0.125;
export const SOLID_RANGE = 1.5;
/** the least room a blade needs under a solid (m): with less, none grows there, and any part of one reaching in under
 *  a lower solid narrows to nothing. Pressed flat to the ground under a seat log instead, its blades lay a hair over
 *  the ground and fought it for the depth, a flickering green patch under the log (from review, "z fighting under
 *  log") */
export const BLADE_ROOM = 0.1;
/** where any grass grows, read from the mask in cells of `cell` m, each grown by `margin` (a blade leans that far) */
const GRASS_NEAR = { cell: 0.5, margin: 1 };
/** a cell with nothing solid over it within `SOLID_RANGE` */
const OPEN = 255;

/** The cells, as they're filled: each the lowest solid's height over it, a byte of `SOLID_RANGE`. */
class SolidCells {
  readonly side: number;
  readonly bytes: Uint8Array;

  /** `grows`: whether any grass reaches over the box (x0, z0)..(x1, z1) (none on the paving, the terrace, a house) */
  constructor(readonly half: number, private readonly grows: (x0: number, z0: number, x1: number, z1: number) => boolean) {
    this.side = Math.round((half * 2) / SOLID_CELL);
    this.bytes = new Uint8Array(this.side * this.side).fill(OPEN);
  }

  /** A solid at height `y` (m) over (x, z): kept if it's lower than what the cell has. */
  meet(x: number, z: number, y: number): void {
    if (y >= SOLID_RANGE) return;
    this.meetCell(Math.floor((x + this.half) / SOLID_CELL), Math.floor((z + this.half) / SOLID_CELL), y);
  }

  /** The edge from `a` to `b` over every cell it crosses, at its lowest within that cell (met every so far along it, a
   *  slanted trunk's edge crossing a cell's corner for less than the step left a blade through its bark). */
  edge(a: THREE.Vector3, b: THREE.Vector3): void {
    if (Math.min(a.y, b.y) >= SOLID_RANGE || Math.max(a.y, b.y) < 0) return;
    const shares = [0, 1];
    const crossings = (from: number, to: number): void => {
      if (from === to) return;
      const low = Math.ceil((Math.min(from, to) + this.half) / SOLID_CELL);
      const high = Math.floor((Math.max(from, to) + this.half) / SOLID_CELL);
      for (let k = low; k <= high; k++) shares.push((k * SOLID_CELL - this.half - from) / (to - from));
    };
    crossings(a.x, b.x);
    crossings(a.z, b.z);
    shares.sort((p, q) => p - q);
    for (let k = 1; k < shares.length; k++) {
      const t0 = shares[k - 1];
      const t1 = shares[k];
      const mid = (t0 + t1) / 2;
      const lowest = a.y + (b.y - a.y) * (b.y > a.y ? t0 : t1);
      this.meet(a.x + (b.x - a.x) * mid, a.z + (b.z - a.z) * mid, lowest);
    }
  }

  /** A solid at height `y` (m) over the cell at (`col`, `row`). */
  meetCell(col: number, row: number, y: number): void {
    if (col < 0 || row < 0 || col >= this.side || row >= this.side) return;
    const byte = Math.min(OPEN - 1, Math.round((Math.max(0, y) / SOLID_RANGE) * OPEN));
    const at = row * this.side + col;
    if (byte < this.bytes[at]) this.bytes[at] = byte;
  }

  /** The triangle (a, b, c) over every cell it covers, at its lowest there: a plane's lowest over a cell is at a corner
   *  of what of it the cell holds, so its edges (each in every cell it crosses) and the cells' corners inside it. */
  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    if (Math.min(a.y, b.y, c.y) >= SOLID_RANGE || Math.max(a.y, b.y, c.y) < 0) return;
    if (!this.grows(Math.min(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.x, b.x, c.x), Math.max(a.z, b.z, c.z))) return;
    this.edge(a, b);
    this.edge(b, c);
    this.edge(c, a);
    const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    // (seen edge on from above: its edges are all it covers)
    if (Math.abs(area) < 1e-9) return;
    const firstCorner = (v: number): number => Math.ceil((v + this.half) / SOLID_CELL);
    const lastCorner = (v: number): number => Math.floor((v + this.half) / SOLID_CELL);
    for (let row = firstCorner(Math.min(a.z, b.z, c.z)); row <= lastCorner(Math.max(a.z, b.z, c.z)); row++) {
      const z = row * SOLID_CELL - this.half;
      for (let col = firstCorner(Math.min(a.x, b.x, c.x)); col <= lastCorner(Math.max(a.x, b.x, c.x)); col++) {
        const x = col * SOLID_CELL - this.half;
        const u = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / area;
        const v = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / area;
        const w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const y = a.y * u + b.y * v + c.y * w;
        if (y >= SOLID_RANGE) continue;
        this.meetCell(col - 1, row - 1, y);
        this.meetCell(col, row - 1, y);
        this.meetCell(col - 1, row, y);
        this.meetCell(col, row, y);
      }
    }
  }
}

/** Whether `mesh` is solid to the grass: shown, its colour and depth drawn whole (not a fire's flames, water, a glow,
 *  a ghost's twin or leaf cards cut out by their picture). Not by `transparent`: what thins as it hides him (`seeThrough`)
 *  blends but stands solid, the seat logs among it, and left out by it they stood out of the map, blades up through their
 *  tops (from review, "Not fixed"). */
export function solid(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((m) => m.depthWrite && m.colorWrite && m.visible && m.alphaTest === 0);
}

/** `mesh`'s triangles placed by `matrix`, met by `cells`. */
function meetMesh(cells: SolidCells, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 2 < count; i += 3) {
    for (let k = 0; k < 3; k++) {
      corners[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(matrix);
    }
    cells.triangle(corners[0], corners[1], corners[2]);
  }
}

/**
 * The lowest solid over each cell of `mask`'s square (-half..half m on x and z) as a texture a byte a cell
 * (`SOLID_RANGE` at 1, rows running with z), from every mesh under `root` but those under `ground` (what the grass
 * grows on), its instances each where they stand, where any grass grows near.
 */
export function solidsOver(root: THREE.Object3D, ground: ReadonlySet<THREE.Object3D>, mask: MeadowMask): THREE.DataTexture {
  const grown = mask.grassCells(GRASS_NEAR.cell, GRASS_NEAR.margin);
  const at = (v: number): number => Math.max(0, Math.min(grown.n - 1, Math.floor((v + mask.half) / grown.cell)));
  const grows = (x0: number, z0: number, x1: number, z1: number): boolean => {
    for (let row = at(z0); row <= at(z1); row++) {
      for (let col = at(x0); col <= at(x1); col++) if (grown.has[row * grown.n + col]) return true;
    }
    return false;
  };
  const cells = new SolidCells(mask.half, grows);
  const box = new THREE.Box3();
  const placed = new THREE.Matrix4();
  const instance = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  const visit = (object: THREE.Object3D): void => {
    if (ground.has(object) || !object.visible) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry.attributes.position && solid(mesh)) {
      // (a tree's trunk in both its shapes, grown and simple: a level switches them live)
      for (const geometry of shapesOf(mesh)) {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const instanced = mesh as THREE.InstancedMesh;
        const count = instanced.isInstancedMesh ? instanced.count : 1;
        for (let i = 0; i < count; i++) {
          placed.copy(mesh.matrixWorld);
          if (instanced.isInstancedMesh) placed.multiply(instanced.getMatrixAt(i, instance) as unknown as THREE.Matrix4);
          box.copy(geometry.boundingBox!).applyMatrix4(placed);
          if (box.min.y < SOLID_RANGE && box.max.y >= 0) meetMesh(cells, geometry, placed);
        }
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  const texture = new THREE.DataTexture(cells.bytes, cells.side, cells.side, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
