// The programs a frame switches between, counted as the GPU is told of each (`useProgram` on the page's WebGL
// context; three asks for one only when it changes). Each switch makes three set every uniform of the material and
// of the scene's lights again (`setProgram`'s `refreshLights`): in the village's frame that upload was the render's
// largest part on the CPU (`lab perf --village --profile`), more than the draws themselves.
import { G } from '../../../src/state';
import { WEBGPU } from '../../../src/core/webgpu';

/** the switches counted since the page's context was first wrapped */
let switches = 0;
/** the context wrapped, so it's wrapped once */
let wrapped: WebGL2RenderingContext | null = null;

/** Starts counting on the renderer's context (WebGL alone: WebGPU has pipelines, not programs). */
function wrap(): void {
  if (WEBGPU) return;
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  if (wrapped === gl) return;
  const use = gl.useProgram.bind(gl);
  gl.useProgram = (program: WebGLProgram | null): void => {
    switches++;
    use(program);
  };
  wrapped = gl;
}

/** The switches counted so far, a running count to take differences of (0 on WebGPU). */
export function programSwitches(): number {
  wrap();
  return switches;
}
