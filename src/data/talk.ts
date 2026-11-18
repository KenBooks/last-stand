// What the village's folk say when talked to (ui/talk.ts shows it): each speaker's name, what he is, and his talk as
// nodes, each a few lines he says and the replies the hero can pick, each leading to another node or ending it. The
// first node is `start`. The library's Brother Hollis (entities/models/scholar.ts) is the first; his `rumour` hints at a
// place behind the hall of heroes that isn't built yet.

/** What a reply does besides leading on (ui/talk.ts tells main.ts): `ale`, the tavern's keeper pours one. */
export type TalkAct = 'ale';
import { KEEPER } from './tavern';

/** A reply the hero can pick: what he says, the node it leads to (none: the talk ends), and what it does. */
export interface TalkReply { text: string; to: string | null; act?: TalkAct }
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

/** The tavern's keeper (entities/models/keeper.ts): a free ale offered, and a word about himself and his house. */
const BEER: TalkReply = { text: 'A free beer? Aye, pour me one!', to: null, act: 'ale' };
const DONE: TalkReply = { text: 'Another time, Bertram.', to: null };
export const TUNWELL: Speaker = {
  id: 'keeper',
  name: KEEPER.name,
  title: KEEPER.title,
  nodes: {
    start: {
      says: ['Well now! Come in, come in, shut that door on the cold.',
        'You\'ve the look of someone just back through a portal. First one\'s on the house: a free beer?'],
      replies: [BEER, { text: 'Who are you?', to: 'who' }, { text: 'Tell me about this place.', to: 'house' }, DONE],
    },
    who: {
      says: ['Bertram Tunwell. Twenty winters behind this bar, and my father thirty before me.',
        'Heroes come in muddy and go out singing. Keeping it that way is the whole of the job.'],
      replies: [BEER, { text: 'Tell me about this place.', to: 'house' }, DONE],
    },
    house: {
      says: ['The Ember & Oak. The fire\'s never once gone out, and the oak is the bar you\'re leaning on.',
        'Parties gather at the round table by the hearth, and the board by the door has their notices. And the ale is my own brew.'],
      replies: [BEER, { text: 'Who are you?', to: 'who' }, DONE],
    },
  },
};

export const SPEAKERS: Record<string, Speaker> = { scholar: HOLLIS, keeper: TUNWELL };
