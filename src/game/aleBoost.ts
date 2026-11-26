// The Ember & Oak's ale, drunk to the end, fortifies the hero for his next run (from Kenneth's round 3: "+5% max
// health for the next run", "Cant stack health boosts btw, only one. But after battle you can drink another and
// increase health"): his life's most `ALE_BOOST.life` more, from the run's start for `ALE_BOOST.waves` waves or until
// the run ends, whichever is first. One at a time: a second ale before the run adds nothing, and once that run is over
// a fresh one fortifies him again. Each game its own hero's (`Player.recomputeStats` reads `aleLifeShare` for the
// local hero alone); kept for the visit, not saved.
import { ALE_BOOST } from '../data/tavern';
import { G } from '../state';
import { on } from '../events';

/** the boost: waiting for the next run (`waiting`), or how many of the run's waves it still lasts (`waves`) */
export const aleBoost = { waiting: false, waves: 0 };

/** (a switch for `lab tavern --canary`: a second ale stacked on the first, which its check must catch) */
export const ALE_STACKS = { canary: false };

/** an ale drunk to the end by the local hero: whether it fortified him (false: he already was, it isn't stacked) */
export function aleDrunk(): boolean {
  if (ALE_STACKS.canary && aleBoost.waiting) {
    aleBoost.waves = -1;
    return true;
  }
  if (aleBoost.waiting || aleBoost.waves > 0) return false;
  aleBoost.waiting = true;
  return true;
}

/** the share of his life's most the boost gives the local hero now (1: none) */
export function aleLifeShare(): number {
  // (the canary's stacked second ale: two boosts, one on the other)
  if (aleBoost.waves === -1) return (1 + ALE_BOOST.life) ** 2;
  return aleBoost.waves > 0 ? 1 + ALE_BOOST.life : 1;
}

/** a run begins for the local hero (not training, not a duel): a waiting boost taken into it, before his stats are
 *  made (`startRun`) */
export function aleRunBegins(): void {
  if (aleBoost.waves === -1) {
    aleBoost.waiting = false;
    return;
  }
  if (!aleBoost.waiting) return;
  aleBoost.waiting = false;
  aleBoost.waves = ALE_BOOST.waves;
}

/** the local hero's run is over (banked or lost): what's left of the boost gone, his stats made again without it */
export function aleRunEnds(): void {
  if (aleBoost.waves === 0) return;
  aleBoost.waves = 0;
  G.player?.recomputeStats(G.player.equipped);
}

// (a wave won uses one of its waves up; the last, and his life's most is his own again, his life's share kept)
on('waveCleared', () => {
  if (aleBoost.waves <= 0 || G.run?.training || G.run?.duel) return;
  aleBoost.waves--;
  if (aleBoost.waves === 0) G.player?.recomputeStats(G.player.equipped);
});
