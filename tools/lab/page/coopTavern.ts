// `lab coop --scenarios tavern`' side on each page (node/coopTavern.mjs): the tavern's keeper and his mugs as two games
// share them: a hero stood at the bar and asking for ale, and what this game shows of the mugs and the drinks.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { villageObject } from '../../../src/game/village';
import { partnersInTavern, selfId } from '../../../src/net/session';
import { MUG_COUNT } from '../../../src/data/tavern';
import { leaveRoom } from '../../../src/game/rooms';
import { choosingAle, pickAle, takeMug, waitingMug } from './takeAle';
import { drinkChoice } from '../../../src/game/drinkChoice';
import type { Lab } from './lab';

/** This game's hero stood at the bar's front, `side` m along it from the keeper's stand, facing it. */
export function coopTavernStand(_lab: Lab, { side }: { side: number }): void {
  const him = villageObject('keeper')!;
  const x = him.stand[0], z = him.stand[1] + side;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, 0, z), Math.PI / 2);
}

/** This game's hero stood at (x, z) of the tavern's own floor (room m), facing `facing`: by a table to put his mug
 *  down on it, or to take one up from it. */
export function coopTavernStandAt(_lab: Lab, { x, z, facing }: { x: number; z: number; facing: number }): void {
  const room = G.arena.rooms!.tavern.group;
  G.player.walkTo = null;
  G.player.place(room.localToWorld(new THREE.Vector3(x, 0, z)), facing);
}

/** This game's hero puts the mug in his hand down by F, its choice answered (Kenneth's round 5: on the nearest top). */
export async function coopTavernPutDown(lab: Lab): Promise<void> {
  await pickAle(lab, 'down');
}

/** Where mug `id` stands on this game: its place and, on a top, where on it (room m, to a cm). */
export function coopTavernMug(_lab: Lab, { id }: { id: number }): string {
  const tv = G.arena.rooms?.tavern?.tavern?.();
  if (!tv) return 'none';
  const p = tv.mugs.get(id).place;
  if (p.at === 'bar' || p.at === 'table') return `${p.at} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
  return p.at;
}

/** This game's hero asks the keeper for ale (as the talk's first reply asks). */
export function coopTavernAsk(): void {
  G.arena.rooms?.tavern?.serveAle?.(G.player);
}

/** This game's hero takes up mug `id` (the nearest waiting one by default) by E, the pointer on it, as a player does
 *  (`takeAle.ts`): this page's frames alone run meanwhile. */
export async function coopTavernTake(lab: Lab, { id = -1 }: { id?: number } = {}): Promise<void> {
  const tv = G.arena.rooms?.tavern?.tavern?.();
  if (tv) await takeMug(lab, tv, id >= 0 ? id : waitingMug(tv));
}

/** This game's hero leaves the tavern for the village, whatever he holds. */
export function coopTavernLeave(): void {
  leaveRoom(true);
}

/** This game's hero drinks the mug in his hand by E, its choice answered. */
export async function coopTavernDrink(lab: Lab): Promise<void> {
  await pickAle(lab, 'drink');
}

/** The canary: the host's game keeps the mugs to itself, telling its guests nothing more. */
export function coopTavernMute(): void {
  G.arena.rooms?.tavern?.tavern?.().mute();
}

/** What this game shows: each mug's place and fill as one line, the counts, how far into a drink its hero is, the mug
 *  he drinks from, and whether a partner here is drinking. */
export interface TavernSeen {
  places: string; clean: number; sum: number; count: number; drinking: number; myMug: number; partnerDrinking: boolean;
  /** the full mug waiting on a top within this game's hero's reach (-1: none), and whether his choice is shown */
  waiting: number; choosing: boolean;
  /** whether a partner here holds a mug of the tavern's, undrunk (his drink held at the lift) */
  partnerHolding: boolean;
  /** what the keeper is doing on this game (job: step) */
  doing: string;
  /** whether this game offers F a top in his reach to put his mug down on, and his hero's place in the room (m) */
  downable: boolean; at: string;
  /** the last mug put down as this game had it */
  downSaid: string;
}

export function coopTavernSeen(): TavernSeen {
  const tv = G.arena.rooms?.tavern?.tavern?.();
  const c = G.player.casting, drinking = c?.skill.def.ale ? c.t / c.dur : -1;
  if (!tv) return { places: 'none', clean: 0, sum: 0, count: MUG_COUNT, drinking, myMug: -1, partnerDrinking: false, waiting: -1, choosing: false, partnerHolding: false, doing: '', downable: false, at: '', downSaid: '' };
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
    waiting: waitingMug(tv), choosing: choosingAle(), downable: drinkChoice.downable, downSaid: tv.doing().downSaid,
    at: (() => { const p = G.arena.rooms!.tavern.group.worldToLocal(G.player.pos.clone()); return `${p.x.toFixed(2)}, ${p.z.toFixed(2)}`; })(),
    partnerHolding: tv.mugs.mugs.some((m) => m.place.at === 'hero' && m.place.who !== me && !!m.held),
    doing: `${tv.doing().job}: ${tv.doing().step} at ${tv.keeper()?.root.position.x.toFixed(2)},${tv.keeper()?.root.position.z.toFixed(2)} facing ${tv.keeper()?.root.rotation.y.toFixed(2)}`, myMug: mine?.id ?? -1, partnerDrinking: partners.some((p) => !!p.casting?.skill.def.ale) || partnersInTavern().some((p) => !!p.player.casting?.skill.def.ale),
  };
}
