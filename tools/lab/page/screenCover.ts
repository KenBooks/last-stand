// How much of the screen a mesh's triangles cover as a camera sees them, each triangle clipped to the screen and
// their areas summed: the pixels its draw shades where nothing hides it, layer over layer (2.0: twice the screen's
// pixels). A mesh's box says far more: a village's merged roofs' box spans the screen, its triangles a tenth of it.
import * as THREE from 'three';

/** a mesh of more triangles than this in all its places is measured by its box (`undefined` from `trianglesCover`) */
const TRIANGLES_MOST = 200_000;

type Point = [number, number];

/** A polygon cut to the side of a line where `inside` holds, `cross` giving where an edge meets the line. */
function cut(polygon: Point[], inside: (point: Point) => boolean, cross: (from: Point, to: Point) => Point): Point[] {
  const kept: Point[] = [];
  for (let at = 0; at < polygon.length; at++) {
    const from = polygon[at];
    const to = polygon[(at + 1) % polygon.length];
    if (inside(from)) kept.push(from);
    if (inside(from) !== inside(to)) kept.push(cross(from, to));
  }
  return kept;
}

/** Where the edge from `from` to `to` meets the line where coordinate `axis` is `value`. */
function meets(axis: 0 | 1, value: number): (from: Point, to: Point) => Point {
  return (from, to) => {
    const along = (value - from[axis]) / (to[axis] - from[axis]);
    const other = axis === 0 ? 1 : 0;
    const point: Point = [0, 0];
    point[axis] = value;
    point[other] = from[other] + (to[other] - from[other]) * along;
    return point;
  };
}

/** A polygon's area, signed: positive where its corners go counter-clockwise. */
function areaOf(polygon: Point[]): number {
  let twice = 0;
  for (let at = 0; at < polygon.length; at++) {
    const [x, y] = polygon[at];
    const [nextX, nextY] = polygon[(at + 1) % polygon.length];
    twice += x * nextY - nextX * y;
  }
  return twice / 2;
}

/** A triangle of the view's own square (-1 to 1 each way) cut to it: its area there, signed as it faces. */
export function onScreenArea(triangle: Point[]): number {
  let polygon = triangle;
  polygon = cut(polygon, (point) => point[0] >= -1, meets(0, -1));
  polygon = cut(polygon, (point) => point[0] <= 1, meets(0, 1));
  polygon = cut(polygon, (point) => point[1] >= -1, meets(1, -1));
  polygon = cut(polygon, (point) => point[1] <= 1, meets(1, 1));
  return polygon.length < 3 ? 0 : areaOf(polygon);
}

const corner = new THREE.Vector3();
const placedAt = new THREE.Matrix4();

/** The cover of one placing of a geometry (`trianglesCover`): its triangles as `camera` sees them under `matrix`. */
function coverUnder(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, camera: THREE.Camera, both: boolean): number {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const count = geometry.index ? geometry.index.count : positions.count;
  const placed = new Float32Array(positions.count * 2);
  const behind = new Uint8Array(positions.count);
  for (let at = 0; at < positions.count; at++) {
    corner.fromBufferAttribute(positions, at).applyMatrix4(matrix).project(camera);
    placed[at * 2] = corner.x;
    placed[at * 2 + 1] = corner.y;
    behind[at] = corner.z > 1 || corner.z < -1 ? 1 : 0;
  }
  let covered = 0;
  for (let at = 0; at + 2 < count; at += 3) {
    const corners = [0, 1, 2].map((of) => (geometry.index ? geometry.index.getX(at + of) : at + of));
    if (corners.some((one) => behind[one])) continue;
    const area = onScreenArea(corners.map((one) => [placed[one * 2], placed[one * 2 + 1]] as Point));
    covered += both ? Math.abs(area) : Math.max(area, 0);
  }
  // (the view's square is 2 by 2)
  return covered / 4;
}

/**
 * The share of the screen the triangles of `mesh` cover as `camera` sees it, summed: those facing the camera, or
 * both ways for a material drawn on both sides (`both`); an instanced mesh's at each of its places. A triangle with
 * a corner behind the camera counts for nothing. Undefined for a mesh past `TRIANGLES_MOST` in all.
 */
export function trianglesCover(mesh: THREE.Mesh, camera: THREE.Camera, both: boolean): number | undefined {
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!positions) return undefined;
  const instanced = mesh as THREE.InstancedMesh;
  const places = instanced.isInstancedMesh ? instanced.count : 1;
  const triangles = (geometry.index ? geometry.index.count : positions.count) / 3;
  if (triangles * places > TRIANGLES_MOST) return undefined;
  if (!instanced.isInstancedMesh) return coverUnder(geometry, mesh.matrixWorld, camera, both);
  let covered = 0;
  for (let place = 0; place < places; place++) {
    instanced.getMatrixAt(place, placedAt);
    covered += coverUnder(geometry, placedAt.premultiply(mesh.matrixWorld), camera, both);
  }
  return covered;
}
