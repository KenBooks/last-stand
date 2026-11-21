// A scanned hand (a .glb, read here and never shipped) made into the studio's reference: its triangles in a hand
// file as `ourHand.ts` writes one, its frame from the landmarks marked on it (`scans/<name>.json`).
//   node tools/handref/scan.mjs <scan.glb> --marks tools/handref/scans/<name>.json   the reference's hand file
//   node tools/handref/scan.mjs <scan.glb> [--view back] [--size 800]                the scan in its own axes, gridded
//   node tools/handref/scan.mjs <scan.glb> --view back --pick 412,230 [--pick ...]   the surface's point at a pixel
//   node tools/handref/scan.mjs <scan.glb> --stand 0.5,0.2,-1                        from a camera of your own
// Marking a scan: picture it in its own axes, read each landmark's pixel off the grid (a line every tenth of the
// picture), `--pick` it, and write the points into its marks file. The marks are on the skin; a joint's middle is
// under it, so each is moved `inward` (m in the scan's units) against the surface's own way out there.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { png } from '../lab/node/png.mjs';
import { VIEWS, draw, pointAt, shaded, tiled } from './studio.mjs';

const OUT = 'tools/handref/out';
const GLB_JSON = 0x4e4f534a;
const FLOAT = 5126;
const INDEX_TYPES = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array };
const TRIANGLES = 4;
/** the grid's lines over a gridded picture: one every this share of its side */
const GRID_EVERY = 0.1;
const GRID_COLOUR = [40, 40, 40];

/** The command line's values after each `--name`. */
function optionsNamed(args, name) {
  return args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
}

/** A .glb's JSON and its binary chunk. */
function readGlb(path) {
  const file = readFileSync(path);
  const jsonLength = file.readUInt32LE(12);
  if (file.readUInt32LE(16) !== GLB_JSON) throw new Error(`${path}: its first chunk is not JSON`);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));
  const binary = file.subarray(20 + jsonLength + 8);
  return { json, binary };
}

/** An accessor's numbers, copied out of the binary chunk. */
function numbersOf(glb, accessorIndex, Type, perItem) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? Type.BYTES_PER_ELEMENT * perItem;
  const out = new Type(accessor.count * perItem);
  const bytes = new DataView(glb.binary.buffer, glb.binary.byteOffset + start);
  const read = {
    Float32Array: (at) => bytes.getFloat32(at, true),
    Uint32Array: (at) => bytes.getUint32(at, true),
    Uint16Array: (at) => bytes.getUint16(at, true),
    Uint8Array: (at) => bytes.getUint8(at),
  }[Type.name];
  for (let item = 0; item < accessor.count; item++) {
    for (let part = 0; part < perItem; part++) {
      out[item * perItem + part] = read(item * stride + part * Type.BYTES_PER_ELEMENT);
    }
  }
  return out;
}

/** A column-major 4x4 times another. */
function times(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Every mesh of the scan's scene as one, its points where its nodes put them: `{ positions, index }`. */
function meshOf(glb) {
  const positions = [];
  const index = [];
  const visit = (nodeIndex, parent) => {
    const node = glb.json.nodes[nodeIndex];
    if (node.translation || node.rotation || node.scale) throw new Error('a node placed by parts: not read yet');
    const world = times(parent, node.matrix ?? IDENTITY);
    if (node.mesh !== undefined) addMesh(glb, glb.json.meshes[node.mesh], world, positions, index);
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of glb.json.scenes[glb.json.scene ?? 0].nodes) visit(root, IDENTITY);
  return { positions, index };
}

/** One mesh's triangles added to the lists, its points moved by `world`. */
function addMesh(glb, mesh, world, positions, index) {
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? TRIANGLES) !== TRIANGLES) throw new Error('a primitive that is not triangles');
    const accessor = glb.json.accessors[primitive.attributes.POSITION];
    if (accessor.componentType !== FLOAT) throw new Error('positions that are not floats');
    const points = numbersOf(glb, primitive.attributes.POSITION, Float32Array, 3);
    const first = positions.length / 3;
    for (let v = 0; v < points.length; v += 3) {
      const [x, y, z] = [points[v], points[v + 1], points[v + 2]];
      positions.push(
        world[0] * x + world[4] * y + world[8] * z + world[12],
        world[1] * x + world[5] * y + world[9] * z + world[13],
        world[2] * x + world[6] * y + world[10] * z + world[14],
      );
    }
    const Type = INDEX_TYPES[glb.json.accessors[primitive.indices].componentType];
    for (const corner of numbersOf(glb, primitive.indices, Type, 1)) index.push(first + corner);
  }
}

/** The mesh as a hand in its own axes, sized to fit a picture whole: for marking it. */
function inOwnAxes(mesh) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.positions.length; v++) {
    low[v % 3] = Math.min(low[v % 3], mesh.positions[v]);
    high[v % 3] = Math.max(high[v % 3], mesh.positions[v]);
  }
  const middle = low.map((value, axis) => (value + high[axis]) / 2);
  const span = Math.max(...high.map((value, axis) => value - low[axis]));
  console.log(`extent ${low.map((v) => v.toFixed(3))} to ${high.map((v) => v.toFixed(3))}`);
  return { ...mesh, axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], knuckles: middle, breadth: span * 0.75 };
}

/** A tile's bytes with the grid's lines over it. */
function gridded(rgb, size) {
  for (let line = 1; line * GRID_EVERY < 0.999; line++) {
    const at = Math.round(line * GRID_EVERY * size);
    for (let along = 0; along < size; along++) {
      rgb.set(GRID_COLOUR, (at * size + along) * 3);
      rgb.set(GRID_COLOUR, (along * size + at) * 3);
    }
  }
  return rgb;
}

/** The scan pictured in its own axes (one view, gridded, or all six), and the points picked off it printed. */
function picture(mesh, name, args) {
  const size = Number(optionsNamed(args, 'size')[0] ?? 800);
  const hand = inOwnAxes(mesh);
  const [stand] = optionsNamed(args, 'stand');
  // (a camera of the marker's own: `--stand x,y,z[,upx,upy,upz]`, where the scan lies askew in its axes)
  if (stand) {
    const numbers = stand.split(',').map(Number);
    VIEWS.own = { stand: numbers.slice(0, 3), up: numbers.length > 3 ? numbers.slice(3) : [0, 1, 0], down: 0.5 };
  }
  const [view] = stand ? ['own'] : optionsNamed(args, 'view');
  const views = view ? [view] : Object.keys(VIEWS);
  const drawn = views.map((each) => draw(hand, each, view ? size : Math.round(size / 2)));
  for (const pick of optionsNamed(args, 'pick')) {
    const [x, y] = pick.split(',').map(Number);
    const point = pointAt(hand, view, drawn[0], x, y);
    console.log(`${pick}: ${point ? JSON.stringify(point.map((value) => Number(value.toFixed(4)))) : 'nothing there'}`);
  }
  const tiles = drawn.map((drawing) => (view ? gridded(shaded(drawing), drawing.size) : shaded(drawing)));
  const sheet = tiled([tiles], drawn[0].size);
  const out = `${OUT}/scan-${name}-${view ? view.replace(' ', '-') : 'own-axes'}.png`;
  writeFileSync(out, png(sheet.rgb, sheet.width, sheet.height));
  console.log(out);
}

/** The surface's way out at the point of the mesh nearest `at`: the mean of the normals of the triangles round it. */
function wayOutAt(mesh, at) {
  let nearest = 0;
  let least = Infinity;
  for (let v = 0; v < mesh.positions.length; v += 3) {
    const d = Math.hypot(mesh.positions[v] - at[0], mesh.positions[v + 1] - at[1], mesh.positions[v + 2] - at[2]);
    if (d < least) [least, nearest] = [d, v / 3];
  }
  const sum = [0, 0, 0];
  const corner = (i) => mesh.positions.slice(i * 3, i * 3 + 3);
  for (let t = 0; t < mesh.index.length; t += 3) {
    const triangle = mesh.index.slice(t, t + 3);
    if (!triangle.includes(nearest)) continue;
    const [a, b, c] = triangle.map(corner);
    const u = b.map((value, i) => value - a[i]);
    const w = c.map((value, i) => value - a[i]);
    sum[0] += u[1] * w[2] - u[2] * w[1];
    sum[1] += u[2] * w[0] - u[0] * w[2];
    sum[2] += u[0] * w[1] - u[1] * w[0];
  }
  const length = Math.hypot(...sum) || 1;
  return sum.map((value) => value / length);
}

/** The scan as the studio's hand file: its joints the marks moved under the skin, a left hand mirrored to a right. */
function handFile(mesh, name, marksPath) {
  const marks = JSON.parse(readFileSync(marksPath, 'utf8'));
  const joints = {};
  for (const [joint, at] of Object.entries(marks.marks)) {
    const out = wayOutAt(mesh, at);
    const inward = marks.inward?.[joint] ?? 0;
    joints[joint] = at.map((value, i) => value - out[i] * inward);
  }
  let { positions } = mesh;
  if (marks.mirror) {
    positions = positions.map((value, i) => (i % 3 === 0 ? -value : value));
    for (const joint of Object.values(joints)) joint[0] = -joint[0];
  }
  const out = `${OUT}/scan-${name}.json`;
  writeFileSync(out, JSON.stringify({ positions, index: mesh.index, joints }));
  console.log(`${out}: ${mesh.index.length / 3} triangles (${marks.source}, ${marks.author}, ${marks.licence})`);
}

function main() {
  const args = process.argv.slice(2);
  const path = args[0];
  const name = basename(path, '.glb');
  mkdirSync(dirname(`${OUT}/x`), { recursive: true });
  const mesh = meshOf(readGlb(path));
  const [marks] = optionsNamed(args, 'marks');
  if (marks) handFile(mesh, name, marks);
  else picture(mesh, name, args);
}

main();
