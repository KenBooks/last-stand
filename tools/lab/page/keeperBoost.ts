// What `lab tavern` reads of the ale's health boost (game/aleBoost.ts; Kenneth's round 3: "+5% max health for the next
// run", "Cant stack health boosts btw, only one. But after battle you can drink another and increase health"): after the
// command's real drinks (several ales, each drunk to the end), the hero's life's most as a run begins with them, wave by
// wave until the boost is spent, and again after a fresh ale once that run is over. Read off his stats as the HUD shows
// them, the run's start and its waves played through the game's own calls (`aleRunBegins`, the `waveCleared` event).
import { G } from '../../../src/state';
import { emit } from '../../../src/events';
import { ALE_BOOST } from '../../../src/data/tavern';
import { aleBoost, aleDrunk, aleRunBegins, aleRunEnds } from '../../../src/game/aleBoost';

/** how far the boost's share may be from what it should be (float) */
const SLACK = 1e-6;

/** His life's most now over `base`. */
function share(base: number): number {
  G.player.recomputeStats(G.player.equipped);
  return G.player.stats.maxLife / base;
}

/**
 * The boost read through a run after the drinks already drunk: `base` is his life's most before any ale. Returns its
 * lines and problems.
 */
export function boostRead(base: number): { lines: string[]; problems: string[] } {
  const lines: string[] = [], problems: string[] = [];
  const want = 1 + ALE_BOOST.life;
  const waited = aleBoost.waiting, inLobby = share(base);
  aleRunBegins();
  const inRun = share(base);
  const byWave: string[] = [];
  for (let wave = 1; wave <= ALE_BOOST.waves; wave++) {
    emit('waveCleared', wave);
    byWave.push(share(base).toFixed(3));
  }
  aleRunEnds();
  const fresh = aleDrunk();
  aleRunBegins();
  const again = share(base);
  aleRunEnds();
  const after = share(base);
  lines.push(`the ale's boost: waiting after the ales ${waited ? 'yes' : 'NO'}, his life's most x${inLobby.toFixed(3)} in the `
    + `village, x${inRun.toFixed(3)} as the run began, after each of ${ALE_BOOST.waves} waves ${byWave.join(' ')}; a fresh `
    + `ale after it ${fresh ? 'taken' : 'REFUSED'}, x${again.toFixed(3)} in the next run, x${after.toFixed(3)} after`);
  if (!waited) problems.push('the ales drunk left no boost waiting for the next run');
  if (Math.abs(inLobby - 1) > SLACK) problems.push(`the boost raised his life before the run (x${inLobby.toFixed(3)})`);
  if (Math.abs(inRun - want) > SLACK) problems.push(`several ales gave x${inRun.toFixed(4)} as the run began, not x${want} (stacked)`);
  if (byWave.slice(0, -1).some((s) => Math.abs(Number(s) - want) > 1e-3)) problems.push(`the boost ended before its ${ALE_BOOST.waves} waves`);
  if (Math.abs(Number(byWave[byWave.length - 1]) - 1) > 1e-3) problems.push(`the boost outlasted its ${ALE_BOOST.waves} waves`);
  if (!fresh || Math.abs(again - want) > SLACK) problems.push(`a fresh ale after the run didn't give x${want} again (x${again.toFixed(4)})`);
  if (Math.abs(after - 1) > SLACK) problems.push(`the boost outlasted the run (x${after.toFixed(3)})`);
  return { lines, problems };
}
