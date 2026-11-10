// Makes a hero's head geometry off the main thread while the game loads (models/head.ts `preloadHeads`): the worker's
// name is the hero's model and the detail he's built at, `mage@0.35`. Kept across visits (core/kept.ts): a return
// reads it back in a few ms, where its sculpt held the boot's hero 0.5 s behind the workers.
import { keepAll, kept } from '../../core/kept';
import { setHeroDetail } from './armor';
import { HERO_HEADS, headShapes, packHeadShapes, type PackedHeads } from './head';

const [model, detail] = self.name.split('@');
/** what it's kept under: the head and its detail (the build is the worker's script, `kept`) */
const KEY = `head:${self.name}`;

async function makeHead(): Promise<void> {
  const had = await kept<PackedHeads>(KEY);
  if (had) {
    self.postMessage(had);
    self.close();
    return;
  }
  setHeroDetail(Number(detail));
  const { who, ...style } = HERO_HEADS[model as keyof typeof HERO_HEADS];
  headShapes(who, style);
  const { packed, buffers } = packHeadShapes();
  // (sent first, then kept: kept before it was sent, a first visit's head waited 2 s behind the maps' writes to the
  // store. Copied as it's kept, so its buffers go on; the worker ends itself once it's written)
  const keeping = keepAll([[KEY, packed]]);
  self.postMessage(packed, { transfer: buffers });
  await keeping;
  self.close();
}

void makeHead();
