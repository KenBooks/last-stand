// The ground's value noise read from a table: the village's paving and meadow made their noise of `fract(sin(...))`
// hashes, four a value, 32 a pixel of the sward and 20 of the paving, a phone's lit pass paying each in full (the
// S25 at Very low, SBW3-8M8S: the paving 1.57 ms and the sward 1.51 of a 22 ms frame). Here both hashes are worked
// out once for a 256 by 256 lattice, red the paving's and the blades' (127.1, 311.7), green the meadow's mask's
// (269.5, 183.3), and a value is one gather of its four corners, eased between them as before.
// Its pattern repeats every 256 cells (42 m at the sward's finest, 6.1 a metre), and its corners are a GPU's own
// rounding of the same formula no longer: the same on every device.
import * as THREE from 'three';

/** cells a side of the table, which the noise repeats after */
const SIDE = 256;

const hashOf = (x: number, y: number, a: number, b: number): number => {
  const s = Math.sin(x * a + y * b) * 43758.5453;
  return s - Math.floor(s);
};

let table: THREE.DataTexture | null = null;

/** The table (64 thousand cells, 256 KB as bytes on the GPU), made the first time it's asked for. */
export function noiseTable(): THREE.DataTexture {
  if (table) return table;
  const data = new Uint8Array(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const at = (y * SIDE + x) * 4;
      data[at] = Math.round(hashOf(x, y, 127.1, 311.7) * 255);
      data[at + 1] = Math.round(hashOf(x, y, 269.5, 183.3) * 255);
      data[at + 3] = 255;
    }
  }
  table = new THREE.DataTexture(data, SIDE, SIDE, THREE.RGBAFormat);
  table.wrapS = table.wrapT = THREE.RepeatWrapping;
  table.needsUpdate = true;
  return table;
}

/** WGSL: `<name>_r(p)` and `<name>_g(p)`, the value noise at `p` of the table's red (the paving's and the blades'
 *  hash) and green (the mask's), from the table bound as `map`. One gather a value brings its four corners as they
 *  are, blended here in full precision: the sampler's own blend weighs them in 256ths, steps the paving's choice
 *  between its stones' offsets would show. */
export const noiseWgsl = (name: string, map: string): string => /* wgsl */ `
fn ${name}_mix(c: vec4f, p: vec2f) -> f32 {
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  // (a gather's corners: w at i, z at i + x, x at i + y, y at i + x + y)
  return mix(mix(c.w, c.z, f.x), mix(c.x, c.y, f.x), f.y);
}
fn ${name}_r(p: vec2f) -> f32 {
  return ${name}_mix(textureGather(0, ${map}, samp, (floor(p) + 1.0) / ${SIDE.toFixed(1)}), p);
}
fn ${name}_g(p: vec2f) -> f32 {
  return ${name}_mix(textureGather(1, ${map}, samp, (floor(p) + 1.0) / ${SIDE.toFixed(1)}), p);
}
`;
