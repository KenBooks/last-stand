// What the village's folk say when talked to (ui/talk.ts shows it): each speaker's name, what he is, and his talk as
// nodes, each a few lines he says and the replies the hero can pick, each leading to another node or ending it. The
// first node is `start`. The library's Brother Hollis (entities/models/scholar.ts) is the first; his `rumour` hints at a
// place behind the hall of heroes that isn't built yet.

/** A reply the hero can pick: what he says, and the node it leads to (none: the talk ends). */
export interface TalkReply { text: string; to: string | null }
/** A node of a talk: what's said, and the replies to it. */
export interface TalkNode { says: string[]; replies: TalkReply[] }
/** Someone talked to: his name, what he is, and his talk (`start` first). */
export interface Speaker { id: string; name: string; title: string; nodes: Record<string, TalkNode> }

const BYE: TalkReply = { text: 'Farewell, Brother.', to: null };

export const HOLLIS: Speaker = {
  id: 'scholar',
  name: 'Brother Hollis',
  title: 'Keeper of the Library',
  nodes: {
    start: {
      says: ['Mm? Ah. A visitor.', 'Mind the candle, if you would. These pages are older than the village.'],
      replies: [
        { text: 'What are you reading?', to: 'reading' },
        { text: 'Who are you?', to: 'who' },
        { text: 'Heard anything strange lately?', to: 'rumour' },
        BYE,
      ],
    },
    reading: {
      says: ['The Concordance of the Wardens. Half of it is prayers, and the other half is arguments about the prayers.',
        'The arguments are better written.'],
      replies: [{ text: 'Something else...', to: 'more' }, BYE],
    },
    who: {
      says: ['Hollis. I keep the books, and the books keep me.',
        'Whatever you fight out there, write it down, or tell me and I will. The Codex at the back wall remembers what we forget.'],
      replies: [{ text: 'Something else...', to: 'more' }, BYE],
    },
    rumour: {
      says: ['Strange? Lean closer. The walls of a library have very good ears.',
        'The oldest charters speak of a door behind the great hall. Not its front: behind it, where the hall backs onto the hill.',
        'Sealed since before my time. The masons swear there is nothing there. Masons swear a great deal.'],
      replies: [{ text: 'What lies behind it?', to: 'behind' }, { text: 'Something else...', to: 'more' }, BYE],
    },
    behind: {
      says: ['If I knew, I would not be whispering.',
        'Every book that mentions it has a page torn out. Every one. When I find the key, you will be the first to hear of it.',
        'Until then, keep it between us.'],
      replies: [{ text: 'Something else...', to: 'more' }, { text: 'Between us. Farewell.', to: null }],
    },
    more: {
      says: ['Ask, then. I have all the time in the world, and most of it in writing.'],
      replies: [
        { text: 'What are you reading?', to: 'reading' },
        { text: 'Who are you?', to: 'who' },
        { text: 'The door behind the hall...', to: 'rumour' },
        BYE,
      ],
    },
  },
};

export const SPEAKERS: Record<string, Speaker> = { scholar: HOLLIS };
