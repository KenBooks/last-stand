// `sound`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SoundOptions } from '../sound';

/**
 * `lab sound`: a skill's sounds rendered offline as the game plays them, measured and sent back as WAV files; a
 * sample not a number, a clip, a note over the noise, a sound left playing, or a canary unseen, is a problem.
 */
export async function sound(_lab: Lab, command: SoundOptions): Promise<Report> {
  const { sound: soundRound } = await import('../sound');
  return soundRound(command);
}
