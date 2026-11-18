// `music`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { MusicOptions } from '../music';

/**
 * `lab music`: each biome's music played through as the player hears it (its lobby, a run's waves, a hidden tab, the
 * bank back), every frame judged by what the game sends to WebAudio; a fault the judge finds, or a canary it missed,
 * is a problem.
 */
export async function music(lab: Lab, command: MusicOptions): Promise<Report> {
  const { music: musicRound } = await import('../music');
  return musicRound(lab, command);
}
