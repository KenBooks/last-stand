// The game's ambience module (`src/core/ambience.ts`) where the tree has it: found by `import.meta.glob`, which finds
// nothing in a commit without it (an A/B's other side copies the lab's page code into a tree that may have none, and
// an import of a file that isn't there stops the command's page loading).

/** What the lab reads of the ambience: its recordings decoded, and the levels it asks of its layers now. */
export interface AmbienceModule {
  ambienceLoaded?: (c: BaseAudioContext) => Promise<void>;
  ambienceNow?: () => { fires?: readonly number[] };
}

const found = import.meta.glob<AmbienceModule>('../../../src/core/ambience.ts');

/** The ambience module, or null where this tree has none. */
export async function ambienceModule(): Promise<AmbienceModule | null> {
  const load = Object.values(found)[0];
  return load ? load() : null;
}
