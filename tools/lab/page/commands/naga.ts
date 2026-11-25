// `naga`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { ShaderModulesMade } from '../shaderModules';

/** `lab naga`: every shader module the page made, for the Node side to check as Firefox's WebGPU would. */
export async function naga(lab: Lab): Promise<ShaderModulesMade> {
  const { shaderModulesMade } = await import('../shaderModules');
  return shaderModulesMade(lab);
}
