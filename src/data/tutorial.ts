// The village's tutorial (game/tutorial.ts keeps it, ui/training.ts shows it in the training's tracker, the notice
// board starts it): a walk round the village in stations, each a short row of steps taken in order, one thing shown
// and done at a time. A step says what to do, how with a keyboard and mouse and how on touch, and the rule behind it
// in a line, written to stand as that subject's Codex entry later (#407: the tutorial is the doing, the Codex the
// reference). Words in braces are filled in from the hero's own skills and keys (ui/training.ts `said`), so a
// renamed or rebound skill is named as it is.

/** A station of the tutorial. */
export type StationId = 'items' | 'combat' | 'hero' | 'runs' | 'together';

/** A step of the tutorial (its id is what's saved: never reuse one for another step). */
export type TutorialStepId =
  | 'bag' | 'throw' | 'take' | 'stash' | 'wear'
  | 'yard' | 'strike' | 'skills' | 'block' | 'break' | 'daze' | 'lure' | 'draught'
  | 'bind' | 'hall' | 'chronicle' | 'portal' | 'bank' | 'campfire';

/** Where a step's marker stands over the village: the training yard, the sparring shade, or one of the village's
 *  objects by its id (data/village.ts `VILLAGE_OBJECTS`: the stash's chest, the hall, a portal...). */
export type TutorialPlace = 'yard' | 'shade' | 'chest' | 'hall' | 'chronicle' | 'crypt' | 'campfire';

export interface TutorialStep {
  id: TutorialStepId;
  /** what to do */
  title: string;
  /** how, with a keyboard and mouse */
  how: string;
  /** said after `how` to a hero whose main attack is drawn (a bow's: held, then let go) */
  drawn?: string;
  /** how on touch, where it differs */
  touch?: string;
  /** the rule behind it */
  why: string;
  /** where its marker stands, if it has a place */
  at?: TutorialPlace;
  /** the skill behaviours (`SkillDef.impl`) it teaches: shown to a hero who can use one of them with the gear held
   *  alone (a shield's block to a warrior carrying one), and `{skills}` names those he can */
  skills?: readonly string[];
  /** the sparring shade spars with him while it's the step */
  shade?: boolean;
  /** how many times it's done before it's ticked */
  count?: number;
}

export interface Station { id: StationId; name: string; covers: string; steps: readonly TutorialStep[] }

/** The stations, in the order of the walk. In text: `{attack}` the main attack's key and name, `{keys}` the other
 *  skills' keys, `{skills}` the step's skills he can use by name, `{key:impl}` and `{name:impl}` a skill's. */
export const TUTORIAL: readonly Station[] = [
  {
    id: 'items', name: 'Items', covers: 'Your bag, throwing gear down, picking it up, the stash',
    steps: [
      {
        id: 'bag', title: 'Open your bag',
        how: 'Press I.', touch: 'Tap the bag button.',
        why: 'What you wear, your attributes and your skills are in it. It opens anywhere in the village.',
      },
      {
        id: 'throw', title: 'Throw an item on the ground',
        how: 'Drag an item you wear out of the bag and let it go over the ground.',
        touch: 'Tap an item you wear, then Drop.',
        why: 'Gear on the ground can be picked up again, by you or by a friend. Whatever lies there when a run starts is lost.',
      },
      {
        id: 'take', title: 'Pick it up again',
        how: 'Click its name on the ground.', touch: 'Tap its name on the ground, then tap it again. Under the move stick\'s half of the screen it takes no tap: step round it.',
        why: 'It goes into your stash, not back onto you.',
      },
      {
        id: 'stash', title: 'Open the stash', at: 'chest',
        how: 'Click the chest by the hall\'s door, or walk to it and press E.',
        touch: 'Tap the chest by the hall\'s door, or walk to it and tap Use.',
        why: 'Gear is put on and taken off at the stash alone.',
      },
      {
        id: 'wear', title: 'Wear it again',
        how: 'Right-click it in the stash, or drag it onto its slot.', touch: 'Tap it in the stash, then Equip.',
        why: 'An item\'s card compares it with what you wear.',
      },
    ],
  },
  {
    id: 'combat', name: 'Combat', covers: 'Attacking, your skills, defending yourself, healing',
    steps: [
      {
        id: 'yard', title: 'Walk into the training yard', at: 'yard',
        how: 'Follow the marker to its gate.',
        why: 'Skills are cast in the yard alone: the rest of the village is at peace.',
      },
      {
        id: 'strike', title: 'Strike a dummy',
        how: 'Aim with the mouse and press {attack}.', drawn: 'Hold it to draw, let it go to loose.',
        touch: 'Tap the largest button. Drag it to aim, let go to strike.',
        why: 'The plate over a dummy counts the damage you do each second.',
      },
      {
        id: 'skills', title: 'Use three other skills', count: 3,
        how: 'They are on the bar below: {keys}. Hover one to read it.',
        touch: 'They are the smaller buttons: tap one, or drag it to aim.',
        why: 'Each skill waits out its own cooldown, and a held one drains Energy.',
      },
      {
        id: 'block', title: 'Block a blow', at: 'shade', shade: true, skills: ['raiseShield'],
        how: 'Hold {key:raiseShield} ({name:raiseShield}) and face the sparring shade as it strikes.',
        touch: 'Hold the {name:raiseShield} button and face the sparring shade as it strikes.',
        why: 'A raised shield stops every blow from the front, for three times your Block Amount. It drains Energy and slows your step. Lowered, it still blocks now and then, by your Block chance.',
      },
      {
        id: 'break', title: 'Have your guard broken', at: 'shade', shade: true, skills: ['raiseShield'],
        how: 'Keep the shield up: the shade\'s next blows are too heavy to hold.',
        why: 'A blow bigger than the shield can hold breaks your guard. You stagger for a moment and a half: you can walk, but not block, strike or cast. Step out of the heaviest blows.',
      },
      {
        id: 'daze', title: 'Daze or freeze the shade', at: 'shade', shade: true, skills: ['stormcall', 'glacialNova', 'blink'],
        how: 'Use {skills} on the sparring shade.',
        why: 'A dazed or frozen foe does nothing until it wears off. Elites and bosses shake it off sooner, or are not dazed at all.',
      },
      {
        id: 'lure', title: 'Lure the shade away', at: 'shade', shade: true, skills: ['strawman'],
        how: 'Cast {name:strawman} ({key:strawman}) a few steps from you.',
        touch: 'Drag the {name:strawman} button to a spot a few steps from you.',
        why: 'Foes leave you for it for a few seconds: time to step back and shoot. Elites and bosses ignore it.',
      },
      {
        id: 'draught', title: 'Drink your draught', skills: ['potion'],
        how: 'Press {key:potion}.', touch: 'Tap the {name:potion} button.',
        why: 'It heals at once, then needs a long while before the next. Keep it for when it counts.',
      },
    ],
  },
  {
    id: 'hero', name: 'Your hero', covers: 'Your keys, the three heroes, the save slots',
    steps: [
      {
        id: 'bind', title: 'Put a skill on another key',
        how: 'Open your bag (I). Click a key on the bar at its foot, then a skill in the book that opens.',
        touch: 'Tap Bag, then Skills. Tap a key, then a skill in the book.',
        why: 'A skill can sit on several keys, which share its cooldown. Your keys are kept from visit to visit.',
      },
      {
        id: 'hall', title: 'Visit the Hall of Heroes', at: 'hall',
        how: 'Walk in through its door to the dais and press E, or click the dais from anywhere.',
        touch: 'Walk in through its door to the dais and tap Use, or tap the dais from anywhere.',
        why: 'Each hero keeps their own gear, stash and records: changing hero loses nothing.',
      },
      {
        id: 'chronicle', title: 'Open the Chronicle', at: 'chronicle',
        how: 'It stands left of the hall\'s door: click it, or walk to it and press E.',
        touch: 'It stands left of the hall\'s door: tap it, or walk to it and tap Use.',
        why: 'Three save slots, each with heroes of its own. Signed in, slot 1 is kept for every device you play on.',
      },
    ],
  },
  {
    id: 'runs', name: 'Runs', covers: 'The portals, bank or continue, what a fall costs',
    steps: [
      {
        id: 'portal', title: 'Look into a portal', at: 'crypt',
        how: 'Click a portal, or walk to it and press E.', touch: 'Tap a portal, or walk to it and tap Use.',
        why: 'Its card names the wave you start from: any you have banked from in that battleground. Enter begins the run.',
      },
      {
        id: 'bank', title: 'Clear a wave and bank',
        how: 'Enter, survive a wave, then press B.', touch: 'Enter, survive a wave, then tap Bank.',
        why: 'After every wave you choose: Bank keeps all you carry and ends the run, Continue brings a harder wave and better loot. You see only the rarity of what you carry until you bank. Fall, and all of it is lost. A boss comes every fifth wave.',
      },
    ],
  },
  {
    id: 'together', name: 'Playing together', covers: 'Rooms, sharing gear, raising a fallen friend',
    steps: [
      {
        id: 'campfire', title: 'Sit at the campfire', at: 'campfire',
        how: 'Click the campfire, or walk to it and press E.', touch: 'Tap the campfire, or walk to it and tap Use.',
        why: 'Open a room and give a friend its code, or join theirs: up to four heroes. Each keeps their own spoils, gear thrown on the ground can be taken by a friend, and a fallen hero can be raised by a teammate before bleeding out.',
      },
    ],
  },
];

/** The sparring shade (game/tutorial.ts): the foe it is (a first wave's, striking by hand), its name, where it comes up
 *  in the yard's own frame (x across, z from its middle), and its blows as shares of what the hero's raised shield
 *  holds: one it holds, and a heavy one that breaks the guard. */
export const SHADE = { foe: 'husk', name: 'Sparring Shade', at: [0, -1.5], blow: 0.5, heavy: 1.5 } as const;
