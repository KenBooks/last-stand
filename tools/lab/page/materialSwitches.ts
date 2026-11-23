// The materials a frame switches between. They were counted draw by draw as three's WebGL renderer was given them
// (`renderBufferDirect`): a draw whose material isn't the last draw's made it set the material's uniforms again. The
// frame is the Rust engine's now (`src/engine`), whose draws don't go that way, so there is nothing here to count:
// the count stays 0 for the measures that print it beside the programs switched (`programSwitches.ts`).

/** The switches counted so far, a running count to take differences of: 0, the engine's draws aren't three's. */
export function materialSwitches(): number {
  return 0;
}
