// A hero's look (data/heroLooks.ts) where the game needs it: as a profile keeps it, as the head a build makes, whether
// a build of it would paint or sculpt anything on the page, and made ready by the workers when it would. Each class's
// look in the save slot in play is what the loading workers make (`chooseLooks`, at the boot and a slot's switch);
// another (a look picked in the hall, a partner's) is made by a worker of its own before a hero is built in it, as a
// face painted on the page held its main thread 1.5 s and a head's hair 200 to 270 ms.
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { lookOf, looksOf, type HeroLook } from '../data/heroLooks';
import { chooseHead, headMade, headOfPreset, readyHead, type HeadSpec } from '../entities/models/head';
import { heroDetail } from '../entities/models/armor';
import { faceComing, readyFace } from '../core/textures';
import { peekProfile, saveProfile } from '../loot/profile';
import type { FaceId } from '../entities/models/face';
import type { Profile } from '../types';

/** The look `profile` keeps (its class's first and his own hair colour where it keeps none). */
export const profileLook = (profile: Profile): HeroLook => lookOf(CLASSES[profile.classId].model, profile.look);

/** The head class `classId`'s hero is built with in look `look`. */
export const lookHead = (classId: string, look: HeroLook): HeadSpec => headOfPreset(CLASSES[classId].model, look.preset)!;

/** Whether a build of class `classId`'s hero in look `look` paints and sculpts nothing on the page: its face made or
 *  coming from the workers, its head's geometry made at this detail. */
export function lookReady(classId: string, look: HeroLook): boolean {
  const head = lookHead(classId, look);
  return faceComing(head.who) && headMade(head);
}

/** Class `classId`'s look `look` made by the workers (its face's maps, its head at this detail): resolved once it is. */
export function readyLook(classId: string, look: HeroLook): Promise<void> {
  const head = lookHead(classId, look);
  return Promise.all([readyFace(head.who), readyHead(head, heroDetail())]).then(() => undefined);
}

/**
 * Look `look` where a build of it is ready, else the first of the class's looks that is (its hair colour kept: a
 * uniform's, nothing to make), else `look` (built on the page as a last resort). A partner's look, or one switched to,
 * is made by `readyLook` meanwhile, and the hero built again in it once it's come.
 */
export function buildableLook(classId: string, look: HeroLook): HeroLook {
  if (lookReady(classId, look)) return look;
  const ready = looksOf(CLASSES[classId].model).find((def) => lookReady(classId, { preset: def.id, hair: look.hair }));
  return ready ? { preset: ready.id, hair: look.hair } : look;
}

/** Each class's look in save slot `slot` made the head its builds take where they're given none (the warm-ups', the
 *  hall's), and the faces the loading workers paint: returned, each hero's (the class `shown`'s first). */
export function chooseLooks(slot: number, shown: string): FaceId[] {
  const faces: FaceId[] = [];
  for (const id of [shown, ...CLASS_IDS.filter((c) => c !== shown)]) {
    const model = CLASSES[id].model;
    const head = lookHead(id, lookOf(model, peekProfile(id, slot)?.look));
    chooseHead(model, head);
    faces.push(head.who);
  }
  return faces;
}

/** `look` kept as `profile`'s (in the save slot in play, and so its cloud save), and his class's builds that are given
 *  no look take it from now on (`chooseHead`: the warm-ups', the workers' heads). */
export function pickLook(profile: Profile, look: HeroLook): void {
  profile.look = { preset: look.preset, hair: look.hair };
  saveProfile(profile);
  chooseHead(CLASSES[profile.classId].model, lookHead(profile.classId, look));
}
