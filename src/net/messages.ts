// The control messages a feature hears for itself (chat, pings, trades, a duel's hits...): each registers its kinds
// here from its own module, and session.ts hands every such message on, so a feature's new message touches neither
// session.ts's dispatch nor anything shared (each was another `if (m.t === ...)` there, and PRs adding messages
// conflicted on it). Its messages also add a line to net/protocol.ts's parts. A module that imports nothing at run
// time: the features register as they load, whatever loaded first.
import type { Player } from '../entities/player';

/** A message heard: what it says, its sender's id and that sender's hero here (none yet: not in the room's lists). */
export type Heard = (m: Record<string, unknown>, from: string, by: Player | undefined) => void;

const HEARD = new Map<string, Heard>();

/** `kinds` of control message (`t`) handed to `heard`, registered by the feature that owns them as it loads. */
export function onMessages(kinds: readonly string[], heard: Heard): void {
  for (const kind of kinds) {
    if (HEARD.has(kind)) throw new Error(`net/messages.ts: "${kind}" registered twice`);
    HEARD.set(kind, heard);
  }
}

/** Who hears a control message of kind `kind`, if a feature registered it. */
export const hearerOf = (kind: unknown): Heard | undefined => (typeof kind === 'string' ? HEARD.get(kind) : undefined);
