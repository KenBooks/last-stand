// Who runs what in co-op. The host's game simulates the fight (enemies, loot, waves) and the guests
// show it; everyone moves and casts their own character, and each game judges its own character's
// hits on the foes and the foes' hits on it, as its own screen shows them (at a high ping, judged on
// the host, an arrow that struck on the guest's screen missed the foe there, which had moved on, and
// a blow the guest had dodged on its screen still hurt it). Solo is a host with no guests.
import { G } from '../state';
import type { Player } from '../entities/player';

export type Role = 'solo' | 'host' | 'guest';

export const role = { current: 'solo' as Role };

export const isCoop = (): boolean => role.current !== 'solo';
export const isGuest = (): boolean => role.current === 'guest';
export const isHost = (): boolean => role.current === 'host';
/** The guests a host started a run with that aren't in it yet (still readying it: net/session.ts), by name. */
export const readying = { guests: [] as string[] };

/** This game runs the world: always in the lobby (each practises on its own dummies), in a run unless a guest. */
export const simulates = (): boolean => G.mode === 'menu' || role.current !== 'guest';

/** Whether a player's skill deals its damage to the foes here: only its own game's (a partner's casts
 *  are replayed for show; its own game reports what they hit, net/sync). */
export const dealsDamage = (by: Player): boolean => by.local;

/** Whether a heal on `on` counts here: a hero is healed by his own game, as its screen shows the heal on him (a
 *  partner's healing beam is replayed here as every skill is), the way a blow on him is his own game's. */
export const healsHere = (on: Player): boolean => on.local;

/** Whether a player's skill wears the props down here: in a run where the fight is simulated (the
 *  props are the host's), in the lobby only the local player's. */
export const hurtsProps = (by: Player): boolean => (G.mode === 'run' ? role.current !== 'guest' : by.local);

/** The nearest player an enemy can go for from (x, z), or null. */
export function nearestPlayer(x: number, z: number): Player | null {
  let best: Player | null = null, bd = Infinity;
  for (const p of G.players) {
    if (!p.active) continue;
    const d = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
