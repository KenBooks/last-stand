// What the village's folk say when talked to (ui/talk.ts shows it): each speaker's name, what he is, where his talk
// starts (a first meeting's node, another for a visit after), and his talk as nodes, each a few lines he says and the
// replies the hero can pick, each leading to another node or ending it. A line or a reply may read the talk's context
// (whether they've met, what's been asked before, the hero's class and records: `TalkContext`), and a node asked before
// may say something else the second time (`again`). What's been asked is kept in the hero's profile (`Profile.talk`).
// The library's Brother Hollis (entities/models/scholar.ts) is the first; his `rumour` hints at a place behind the
// hall of heroes that isn't built yet. The village's names are read from its data, so none goes stale.
import { HOUSES } from './houses';
import { BIOMES } from './biomes';
import { ENEMIES } from './enemies';
import type { ClassDef, Profile } from '../types';

/** What a talk knows as it's had: whether this is the first meeting, how many times they've talked before, whether a
 *  node was heard (in an earlier talk or this one), the hero's class and his records. */
export interface TalkContext {
  first: boolean;
  visits: number;
  heard: (node: string) => boolean;
  cls: ClassDef;
  records: Profile['records'];
}
/** A line, as it is or as the talk's context has it. */
export type Said = string | ((c: TalkContext) => string);
/** A reply the hero can pick: what he says, the node it leads to (none: the talk ends), and when it's offered. */
export interface TalkReply { text: Said; to: string | null; when?: (c: TalkContext) => boolean }
/** A node of a talk: what's said (`again` instead when it was heard before), and the replies to it. */
export interface TalkNode { says: Said[]; again?: Said[]; replies: TalkReply[] }
/** Someone talked to: his name, what he is, the node his talk starts at, and his nodes. */
export interface Speaker {
  id: string; name: string; title: string;
  /** his portrait's picture, made of his own model (ui/guide/portraits.ts) */
  portrait?: 'scholar';
  start: (c: TalkContext) => string;
  nodes: Record<string, TalkNode>;
}

/** what a line or a reply says in `c` */
export const said = (s: Said, c: TalkContext): string => (typeof s === 'string' ? s : s(c));

const BYE: TalkReply = { text: 'Farewell, Brother.', to: null };
const MORE: TalkReply = { text: 'Something else...', to: 'more' };
/** the topics he can be asked about, the third the rumour (lab `houses` asks it by its key) */
const TOPICS: TalkReply[] = [
  { text: 'Tell me about yourself.', to: 'self' },
  { text: 'Tell me about the village.', to: 'village' },
  { text: 'Heard anything strange lately?', to: 'rumour' },
  { text: 'What waits on the battlegrounds?', to: 'fields' },
  // (once the hero has fought: there's something to say of him)
  { text: 'What do you make of me?', to: 'me', when: (c) => c.records.runs > 0 },
  BYE,
];

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** what he makes of each class on sight (a class not here: what he says of anyone) */
const OF_CLASS: Record<string, string> = {
  mage: 'One of the arcane sort. You smell faintly of thunder. Kindly keep it away from the paper.',
  warrior: 'Plate and steel. You clank, you know. In a library.',
  ranger: 'A hunter, by the bow. You walk softly, at least. The books are grateful.',
};
const ofClass = (c: TalkContext): string => OF_CLASS[c.cls.id] ?? 'You have the look of someone who argues with monsters.';

/** his greeting on a visit after the first: by how often they've talked, and what's been asked */
function welcomeBack(c: TalkContext): string {
  if (c.heard('behind')) return 'Ah, my fellow conspirator. Any word of that door? No? Nor from me.';
  if (c.visits === 1) return 'Back so soon? Good. Most people visit a library once, to be polite.';
  if (c.visits < 5) return 'You again. Sit, if you can find a chair that is not holding a book.';
  return 'My most faithful reader. The shelves have started to expect you.';
}

/** what he makes of the hero's records */
function ofRecords(c: TalkContext): string {
  const r = c.records;
  if (r.bestWave === 0) return `${plural(r.runs, 'venture')} out, and no wave cleared yet. Every chronicle begins with a blank page.`;
  const banked = r.banked ? `and your spoils banked ${plural(r.banked, 'time')}` : 'and nothing banked yet. Brave, or careless';
  return `${plural(r.runs, 'venture')}, wave ${r.bestWave} at your best, ${banked}. ${HOUSES.records.name} keeps the sums; I keep the gossip.`;
}

export const HOLLIS: Speaker = {
  id: 'scholar',
  name: 'Brother Hollis',
  title: 'Keeper of the Library',
  portrait: 'scholar',
  start: (c) => (c.first ? 'meet' : 'back'),
  nodes: {
    meet: {
      says: ['Mm? Ah. A visitor. A new face, too.',
        'Hollis. Brother Hollis, keeper of these shelves. Mind the candle, if you would: these pages are older than the village.',
        ofClass],
      replies: TOPICS,
    },
    back: {
      says: [welcomeBack, 'What shall it be today?'],
      replies: TOPICS,
    },
    more: {
      says: ['Ask, then. I have all the time in the world, and most of it in writing.'],
      replies: TOPICS,
    },

    // --- himself, and his scripture ---
    self: {
      says: ['I keep the books, and the books keep me.',
        'I came up the valley road as a novice, with a satchel of candles and a borrowed pen. That was forty winters ago. I still have the pen.'],
      again: ['Still Hollis. Still keeping the books. The pen is still borrowed.'],
      replies: [{ text: 'What are you reading?', to: 'scripture' }, { text: 'Why stay here?', to: 'stay' }, MORE, BYE],
    },
    scripture: {
      says: ['The Concordance of the Wardens. Half of it is prayers, and the other half is arguments about the prayers.',
        'The arguments are better written. Brother Ansel\'s margins alone run to three volumes, mostly insults.'],
      replies: [{ text: 'What do the Wardens teach?', to: 'wardens' }, MORE, BYE],
    },
    wardens: {
      says: ['That a light kept is worth more than a light carried. That every wall was a door once.',
        'And that one should never lend a book to a mason. That last is not scripture. It is experience.'],
      replies: [{ text: 'Every wall was a door?', to: 'rumour' }, MORE, BYE],
    },
    stay: {
      says: ['Where else? The battlegrounds take the brave and give back stories. Someone must write them down before they grow in the telling.',
        'Tell me what you fight out there, and I will. The Codex at the back wall remembers what we forget.'],
      replies: [MORE, BYE],
    },

    // --- the village and its houses ---
    village: {
      says: ['Wardenhollow. Small, stubborn, and older than it looks. Most of its stones were something else before they were walls.'],
      replies: [{ text: 'And its houses?', to: 'houses' }, { text: 'The great hall on the terrace?', to: 'hall' }, MORE, BYE],
    },
    houses: {
      says: [
        `${HOUSES.records.name}, across the square: the ledgers of every run banked, kept by people who cannot keep their own accounts.`,
        `${HOUSES.tavern.name} pours a fair ale and a poor philosophy. Odo trades gear for gear at ${HOUSES.merchant.name}, no coin. Count your fingers after.`,
        'And this one you know. Mind the third shelf. It bites.'],
      replies: [{ text: 'The great hall on the terrace?', to: 'hall' }, MORE, BYE],
    },
    hall: {
      says: ['The great hall keeps the heroes who have stood in this village. You may find a familiar face among them.',
        'Change your road there, if you tire of the one you walk. I am told it is a very modern custom.'],
      replies: [{ text: 'And behind the hall?', to: 'rumour' }, MORE, BYE],
    },

    // --- the secret behind the great hall ---
    rumour: {
      says: ['Strange? Lean closer. The walls of a library have very good ears.',
        'The oldest charters speak of a door behind the great hall. Not its front: behind it, where the hall backs onto the hill.',
        'Sealed since before my time. The masons swear there is nothing there. Masons swear a great deal.'],
      again: ['The door again? You have the itch, then. So have I.',
        'Still sealed, still behind the great hall, still sworn at by masons.'],
      replies: [{ text: 'What lies behind it?', to: 'behind' }, { text: 'Who sealed it?', to: 'sealed' }, MORE, BYE],
    },
    behind: {
      says: ['If I knew, I would not be whispering.',
        'Every book that mentions it has a page torn out. Every one. When I find the key, you will be the first to hear of it.'],
      replies: [{ text: 'Can I help you find the key?', to: 'key' }, { text: 'Who sealed it?', to: 'sealed' }, MORE,
        { text: 'Between us. Farewell.', to: null }],
    },
    sealed: {
      says: ['The charters say the Wardens did, the year the first battleground opened. They say it in very small letters, as if hoping no one would read that far.',
        'I read that far. I always read that far.'],
      replies: [{ text: 'What lies behind it?', to: 'behind', when: (c) => !c.heard('behind') }, MORE, BYE],
    },
    key: {
      says: ['Help? Bring me what you learn out there, and listen when I read it back. Keys are rarely keys. Usually they are a sentence someone did not finish.',
        'And keep it between us. The masons talk.'],
      replies: [MORE, { text: 'Between us. Farewell.', to: null }],
    },

    // --- the battlegrounds and their bosses ---
    fields: {
      says: [`Two are open to us: ${BIOMES.crypt.title}, under the old chapel, and ${BIOMES.forest.title}, past the campfire road.`,
        'Each gives up its spoils for a while. Then something larger comes to take them back.'],
      replies: [{ text: `${BIOMES.crypt.title}?`, to: 'crypt' }, { text: `${BIOMES.forest.title}?`, to: 'forest' },
        { text: 'Why bank, and not press on?', to: 'bank' }, MORE, BYE],
    },
    crypt: {
      says: [`${BIOMES.crypt.title} was a resting place before it was a battleground. Now nothing rests there.`,
        `At its deepest waits ${ENEMIES.colossus.name}. Bones, mostly, but organised. I find that the worst kind.`],
      replies: [{ text: `${BIOMES.forest.title}?`, to: 'forest' }, MORE, BYE],
    },
    forest: {
      says: [`${BIOMES.forest.title} grew over a road the Wardens built. The road is still under there, being strangled politely.`,
        `Its heart is ${ENEMIES.thornheart.name}: old wood, and an older temper. Bring fire, and bring friends.`],
      replies: [{ text: `${BIOMES.crypt.title}?`, to: 'crypt' }, MORE, BYE],
    },
    bank: {
      says: ['Because the dead keep nothing. After every wave you choose: carry home what you have, or go deeper for better.',
        'I have written a great many stories that ended one wave too late. Write me one that ends at the right moment.'],
      replies: [MORE, BYE],
    },

    // --- the hero himself ---
    me: {
      says: [ofClass, ofRecords],
      replies: [MORE, BYE],
    },
  },
};

export const SPEAKERS: Record<string, Speaker> = { scholar: HOLLIS };
