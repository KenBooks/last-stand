// `passesHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PassesCommand } from '../gpuPasses';

/** `lab passes`, one place: what each of the frame's passes takes of the GPU, as the engine times them. */
export async function passesHere(lab: Lab, command: PassesCommand): Promise<Report> {
  const { gpuPasses } = await import('../gpuPasses');
  return gpuPasses(lab, command);
}
