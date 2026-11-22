// A frame's pixels summed over a grid's cells on the GPU (page/screenCells.ts): each cell's brightness, light and
// bright pixels as whole numbers, so only the grid comes back. Read back whole, the canvas's 8 MB a frame was 70% of a
// `cast`; its every second pixel picked on the GPU and summed on the CPU, 2 MB, half of what was left. Exact: the
// canvas is copied as it is and each pixel fetched by its whole coordinates, its stored values summed as whole
// numbers (`Grid`), the same ones `screenCells.ts` sums from the whole canvas read back, which it checks once a page.
// Drawn by WebGL of its own beside three's, three's state reset after it, so three compiles no program for it (a
// program compiled after loading fails a `cast`).
//
// Read without waiting (`sumGrid`, then `gridSums`): the sums go into a buffer of their own on the GPU, read once the
// next frame has been sent, its work on the CPU done while the GPU finishes this one's (read at once, the page waited
// for the GPU to finish the frame, about 9 ms of every frame of a cast).
import { G } from '../../../src/state';
import { frameRect } from '../../../src/core/renderer';

/** What a grid sums over the canvas: the pixels each of its cells takes, and what each pixel adds. */
export interface Grid {
  /** the cells across and down */
  across: number;
  down: number;
  /** every this many pixels each way is summed */
  step: number;
  /** each column of cells' picked columns, from the left: `[from, to)` pairs, in picked pixels */
  columnSpans: Int32Array;
  /** each row of cells' picked rows, from the top, as the canvas reads (from its bottom row up): `[from, to)` pairs */
  rowSpans: Int32Array;
  /** a pixel's brightness: its stored red, green and blue each times its whole weight, summed */
  weights: [number, number, number];
  /** a pixel this bright or more, in the weights' units, counts as bright */
  brightFrom: number;
  /** a channel's light in whole units, by its stored value: red's, green's, then blue's, 256 each */
  lights: Uint32Array;
}

/** Sums on their way back from the GPU (`sumGrid`): read them with `gridSums`. */
export interface Summing {
  buffer: WebGLBuffer;
  done: WebGLSync;
  size: number;
}

const VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

/** the most cells across or down a grid's program takes */
const MOST_CELLS = 64;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D canvasCopy;
uniform usampler2D lights;
uniform int step;
uniform ivec2 columnSpans[${MOST_CELLS}];
uniform ivec2 rowSpans[${MOST_CELLS}];
uniform uvec3 weights;
uniform uint brightFrom;
out uvec4 sums;

uint lightOf(uvec3 stored) {
  return texelFetch(lights, ivec2(stored.r, 0), 0).r
    + texelFetch(lights, ivec2(stored.g, 0), 0).g
    + texelFetch(lights, ivec2(stored.b, 0), 0).b;
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  ivec2 columns = columnSpans[cell.x];
  ivec2 rows = rowSpans[cell.y];
  uvec4 total = uvec4(0u);
  for (int row = rows.x; row < rows.y; row++) {
    for (int column = columns.x; column < columns.y; column++) {
      vec3 colour = texelFetch(canvasCopy, ivec2(column, row) * step, 0).rgb;
      uvec3 stored = uvec3(colour * 255.0 + 0.5);
      uint brightness = weights.r * stored.r + weights.g * stored.g + weights.b * stored.b;
      total.x += brightness;
      total.y += lightOf(stored);
      total.z += brightness >= brightFrom ? 1u : 0u;
    }
  }
  sums = total;
}`;

/** What the summing draws with, made once a page. */
interface Summer {
  program: WebGLProgram;
  at: Record<'canvasCopy' | 'lights' | 'step' | 'columnSpans' | 'rowSpans' | 'weights' | 'brightFrom',
    WebGLUniformLocation>;
  canvasCopy: WebGLTexture;
  lights: WebGLTexture;
  /** the light table uploaded, kept to upload another */
  lightsOf: Uint32Array | null;
  sums: WebGLTexture;
  target: WebGLFramebuffer;
  /** the sums' texture's size, made again when it changes */
  across: number;
  down: number;
}

let summer: Summer | null = null;
/** the buffers read back, free to take the next sums */
const freeBuffers: WebGLBuffer[] = [];
/** each buffer's size in bytes */
const bufferSizes = new WeakMap<WebGLBuffer, number>();

/** A shader of `type` compiled from `source`, throwing with its log if it won't. */
function compiled(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`lab: gridSums: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** The summer's program, textures and target. */
function summerOf(gl: WebGL2RenderingContext): Summer {
  const program = gl.createProgram()!;
  gl.attachShader(program, compiled(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compiled(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`lab: gridSums: ${gl.getProgramInfoLog(program)}`);
  }
  const uniform = (name: string): WebGLUniformLocation => gl.getUniformLocation(program, name)!;
  return {
    program,
    at: {
      canvasCopy: uniform('canvasCopy'),
      lights: uniform('lights'),
      step: uniform('step'),
      columnSpans: uniform('columnSpans'),
      rowSpans: uniform('rowSpans'),
      weights: uniform('weights'),
      brightFrom: uniform('brightFrom'),
    },
    canvasCopy: gl.createTexture()!,
    lights: gl.createTexture()!,
    lightsOf: null,
    sums: gl.createTexture()!,
    target: gl.createFramebuffer()!,
    across: 0,
    down: 0,
  };
}

/** `texture` bound to `unit`, read whole texels at a time. */
function bindNearest(gl: WebGL2RenderingContext, unit: number, texture: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

/** The sums' texture and its target sized for `grid`. */
function sizeSums(gl: WebGL2RenderingContext, own: Summer, grid: Grid): void {
  if (own.across === grid.across && own.down === grid.down) return;
  bindNearest(gl, 0, own.sums);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, grid.across, grid.down, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, own.target);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, own.sums, 0);
  own.across = grid.across;
  own.down = grid.down;
}

/** The light table `grid` sums by, uploaded unless it is already (one row: each texel a value's three lights). */
function uploadLights(gl: WebGL2RenderingContext, own: Summer, grid: Grid): void {
  bindNearest(gl, 1, own.lights);
  if (own.lightsOf === grid.lights) return;
  const texels = new Uint32Array(256 * 4);
  for (let value = 0; value < 256; value++) {
    for (let channel = 0; channel < 3; channel++) texels[value * 4 + channel] = grid.lights[channel * 256 + value];
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, 256, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texels);
  own.lightsOf = grid.lights;
}

/** The canvas as last drawn summed over `grid`'s cells into the summer's target, left bound for a read. */
function drawSums(gl: WebGL2RenderingContext, grid: Grid): void {
  if (grid.across > MOST_CELLS || grid.down > MOST_CELLS) throw new Error('lab: gridSums: too many cells');
  summer ??= summerOf(gl);
  const own = summer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  bindNearest(gl, 0, own.canvasCopy);
  const { left, bottom, width, height } = frameRect();
  // (its colour alone: the canvas has no alpha of its own, and a copy asking for one is refused)
  gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB8, left, bottom, width, height, 0);
  uploadLights(gl, own, grid);
  sizeSums(gl, own, grid);
  gl.bindFramebuffer(gl.FRAMEBUFFER, own.target);
  gl.viewport(0, 0, grid.across, grid.down);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.CULL_FACE);
  gl.colorMask(true, true, true, true);
  gl.bindVertexArray(null);
  gl.useProgram(own.program);
  // (sized for the first time, the sums' texture was bound in the copy's place)
  bindNearest(gl, 0, own.canvasCopy);
  gl.uniform1i(own.at.canvasCopy, 0);
  gl.uniform1i(own.at.lights, 1);
  gl.uniform1i(own.at.step, grid.step);
  gl.uniform2iv(own.at.columnSpans, grid.columnSpans);
  gl.uniform2iv(own.at.rowSpans, grid.rowSpans);
  gl.uniform3ui(own.at.weights, ...grid.weights);
  gl.uniform1ui(own.at.brightFrom, grid.brightFrom);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * The canvas as last drawn summed over `grid`'s cells, read later (`gridSums`): the read goes into a buffer on the
 * GPU, and the page goes on without waiting for it. Sum it in the frame it was drawn in: the canvas is cleared after.
 */
export function sumGrid(grid: Grid): Summing {
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  try {
    drawSums(gl, grid);
    const buffer = freeBuffers.pop() ?? gl.createBuffer()!;
    const size = grid.across * grid.down * 4;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    if (bufferSizes.get(buffer) !== size * 4) {
      gl.bufferData(gl.PIXEL_PACK_BUFFER, size * 4, gl.STREAM_READ);
      bufferSizes.set(buffer, size * 4);
    }
    gl.readPixels(0, 0, grid.across, grid.down, gl.RGBA_INTEGER, gl.UNSIGNED_INT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const done = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    return { buffer, done, size };
  } finally {
    G.renderer.resetState();
  }
}

/**
 * The sums of `summing` (waiting for the GPU if it hasn't finished them), its buffer freed: four a cell, row by row
 * from the grid's top: the brightness, the light, the bright pixels and a 0.
 */
export function gridSums(summing: Summing): Uint32Array {
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  const sums = new Uint32Array(summing.size);
  gl.clientWaitSync(summing.done, 0, 0);
  gl.deleteSync(summing.done);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, summing.buffer);
  gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, sums);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  freeBuffers.push(summing.buffer);
  return sums;
}
