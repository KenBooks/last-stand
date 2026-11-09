// Simulates the fire once off the main thread (world/fireBake.ts), and keeps it across visits (core/kept.ts): a return
// reads in a few ms what took a first visit's worker seconds.
import { keepAll, keepAs, kept } from '../core/kept';
import { bakeFlames, type BakedFlames as Baked } from './fireBake';


const KEY = 'fire-loop-runs';

self.onmessage = async (e: MessageEvent<{ keepName?: string }>) => {
  if (e.data.keepName) keepAs(e.data.keepName);
  const had = await kept<Baked>(KEY);
  if (had) {
    self.postMessage(had, { transfer: [had.data.buffer, had.starts.buffer] });
    return;
  }
  const made = bakeFlames();
  await keepAll([[KEY, made]]);
  self.postMessage(made, { transfer: [made.data.buffer, made.starts.buffer] });
};
