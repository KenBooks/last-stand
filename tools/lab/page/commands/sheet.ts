// `sheet`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Fixture, ViewName } from '../lab';
import type { Joints } from '../../../../src/entities/models/rig';
import type { Sheet } from '../sheet';

export interface SheetCommand {
  states: string[];
  views: ViewName[];
  fixture: Fixture;
  focus?: keyof Joints;
  skill?: string;
  shares?: number[];
}

/** `lab sheet`: the pictures and their notes. */
export async function sheet(lab: Lab, command: SheetCommand): Promise<Sheet> {
  const { sheet: pictureSheet } = await import('../sheet');
  return pictureSheet(lab, command);
}
