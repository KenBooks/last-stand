// `maps`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { MapsOptions } from '../maps';

/** `lab maps`: each procedural map made, timed, and its pixels' digest. */
export async function maps(lab: Lab, command: MapsOptions): Promise<Report> {
  const { maps: mapsOf } = await import('../maps');
  return mapsOf(lab, command);
}
