// What each kind of village object does when the hero uses it (data/village.ts `VillageUse`): opened, put away as he
// walks off, and whether it's still up. Each kind registers here from the module that owns it (main.ts the lobby's
// own, ui/talk.ts a talk, ui/merchant.ts Odo's counter), so a new kind of object touches neither main.ts nor anything
// shared: each was a case in three switches of main.ts, and every PR adding one conflicted there. A module that imports
// nothing at run time: the owners register as they load, whatever loaded first.
import type { VillageObject, VillageUse } from '../data/village';

/** What a kind of object does. */
export interface UseOf {
  /** the hero used `o` */
  use(o: VillageObject): void;
  /** he walked off from `o` while what it opened was up */
  leave?(o: VillageObject): void;
  /** whether what `o` opened is still up */
  shows(o: VillageObject): boolean;
}

const USES: Partial<Record<VillageUse, UseOf>> = {};

/** What `kind` does, registered by its owner as it loads. */
export function villageUse(kind: VillageUse, does: UseOf): void { USES[kind] = does; }

/** What `kind` does (every kind an object has is registered by the time the village can be used). */
export function useOf(kind: VillageUse): UseOf {
  const does = USES[kind];
  if (!does) throw new Error(`no village use registered for "${kind}" (game/villageUses.ts)`);
  return does;
}
