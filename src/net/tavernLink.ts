// The tavern's keeper's way to the party (world/tavernKeeper.ts), set by net/session.ts as it loads, as a ping's is
// (`setPingNet`). The keeper imports this, never the session: the session reads every house's data (data/houses),
// and so the keeper's own house, and that cycle, in the part of the game the hands' worker reaches through a dynamic
// import (engine/said.ts), kept Vite from bundling the worker ("UMD and IIFE are not supported for code-splitting").
import type { Player } from '../entities/player';

/** What the keeper asks of the party. */
export interface TavernLink {
  /** a tavern message sent to `to`, or to every game */
  send(m: Record<string, unknown>, to?: string): void;
  /** this game's own id in the room ('' alone) */
  self(): string;
  /** the host's id ('' alone) */
  host(): string;
  /** the partners' players standing in the tavern now, by id */
  inTavern(): { id: string; player: Player }[];
  /** a partner's player by id */
  partner(id: string): Player | null;
}

/** alone: nothing sent, no one else */
const ALONE: TavernLink = { send: () => {}, self: () => '', host: () => '', inTavern: () => [], partner: () => null };

/** the party as the session has it (alone until it's set) */
export let tavernLink: TavernLink = ALONE;

/** The session's way to the party, for the keeper. */
export function setTavernLink(link: TavernLink): void {
  tavernLink = link;
}
