// Every cull or merge of what's drawn that can be held off live, each registered by its own module: what a frame
// leaves out because it can't be seen (the hall's doorway, the grass behind walls) or draws as fewer meshes (the
// heroes held still). Each must change nothing on screen, so the lab draws frames with them all and with none, and
// holds the two to the same pixels wherever it stands (`lab village --only sweepWithinBudgets`): a new cull
// registered here is checked from every stand without a check of its own, and one that hides what's seen fails there.

/** a cull's hold: off (drawn as if it never ran) or back on */
type Hold = (off: boolean) => void;

const holds = new Map<string, Hold>();

/** A cull called `name`, held off (and back on) by `hold`. */
export function registerCull(name: string, hold: Hold): void {
  holds.set(name, hold);
}

/** Every cull held off, or let run again (the lab). */
export function holdCullsOff(off: boolean): void {
  for (const hold of holds.values()) hold(off);
}

/** The culls registered, by name. */
export const cullNames = (): string[] => [...holds.keys()];
