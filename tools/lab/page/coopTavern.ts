// `lab coop --scenarios tavern`' side on each page (node/coopTavern.mjs): the tavern's keeper and his mugs as two games
// share them: a hero stood at the bar and asking for ale, and what this game shows of the mugs and the drinks.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { partnersInTavern, selfId } from '../../../src/net/session';
import { MUG_COUNT } from '../../../src/data/tavern';
import type { Lab } from './lab';

/** This game's hero stood at the bar's front, `side` m along it from the keeper's stand, facing it. */
export function coopTavernStand(_lab: Lab, { side }: { side: number }): void {
  const him = villageObject('keeper')!;
  const x = him.stand[0], z = him.stand[1] + side;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, 0, z), Math.PI / 2);
}

/** This game's hero asks the keeper for ale (as the talk's first reply asks). */
export function coopTavernAsk(): void {
  G.arena.rooms?.tavern?.serveAle?.(G.player);
}

/** The canary: the host's game keeps the mugs to itself, telling its guests nothing more. */
export function coopTavernMute(): void {
  G.arena.rooms?.tavern?.tavern?.().mute();
}

/** What this game shows: each mug's place and fill as one line, the counts, how far into a drink its hero is, the mug
 *  he drinks from, and whether a partner here is drinking. */
export interface TavernSeen {
  places: string; clean: number; sum: number; count: number; drinking: number; myMug: number; partnerDrinking: boolean;
  /** what the keeper is doing on this game (job: step) */
  doing: string;
}

export function coopTavernSeen(): TavernSeen {
  const tv = G.arena.rooms?.tavern?.tavern?.();
  const c = G.player.casting, drinking = c?.skill.def.ale ? c.t / c.dur : -1;
  if (!tv) return { places: 'none', clean: 0, sum: 0, count: MUG_COUNT, drinking, myMug: -1, partnerDrinking: false, doing: '' };
  const me = selfId();
  // (where a mug is, said alike on both games: a hero's hand by whether it's this game's or not, the bar's place to a cm)
  const place = (m: (typeof tv.mugs.mugs)[number]) => {
    const p = m.place;
    if (p.at === 'hero') return 'hero';
    if (p.at === 'bar' || p.at === 'table') return `${p.at}`;
    return p.at === 'shelf' ? `shelf${p.slot}` : p.at;
  };
  const counts = tv.mugs.counts();
  const mine = tv.mugs.mugs.find((m) => m.place.at === 'hero' && m.place.who === me);
  const partners = G.players.filter((p) => !p.local);
  return {
    places: tv.mugs.mugs.map(place).join(' '), clean: counts.clean, sum: counts.total, count: MUG_COUNT, drinking,
    doing: `${tv.doing().job}: ${tv.doing().step} at ${tv.keeper()?.root.position.x.toFixed(2)},${tv.keeper()?.root.position.z.toFixed(2)} facing ${tv.keeper()?.root.rotation.y.toFixed(2)}`, myMug: mine?.id ?? -1, partnerDrinking: partners.some((p) => !!p.casting?.skill.def.ale) || partnersInTavern().some((p) => !!p.player.casting?.skill.def.ale),
  };
}
