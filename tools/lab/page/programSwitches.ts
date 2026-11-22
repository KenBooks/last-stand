// The programs a frame switches between. They were counted as the GPU was told of each (`useProgram` on the page's
// WebGL context). The page draws on WebGPU alone now, which has pipelines, not programs, so there is nothing here to
// count: the count stays 0 for the measures that print it.

/** The switches counted so far, a running count to take differences of: 0, WebGPU has no programs to switch. */
export function programSwitches(): number {
  return 0;
}
