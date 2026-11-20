// The guide's words (ui/guide/): what a figure can't say, how to fight each foe, how to play each hero. No figure is
// written here: the guide takes every number from the game's data as it renders (life, damage, cooldowns...), so
// these notes say how and why, never how much. A foe without a note fails the typecheck (its file in data/foes/, `FoeEntry`); a skill,
// class or weapon style without one still shows from its data, and a dev build warns of it (`ui/guide/index.ts`).
// Any change adding or changing a foe, boss, skill, weapon style, item base or mechanic updates these notes in the
// same PR (root AGENTS.md); the tips' own words are in ui/guide/tips.ts, written round the figures they show.
import { FOE_ENTRIES, type EnemyId } from './enemies';
import type { SkillKey } from '../types';

/** How to fight a foe: what it does in a sentence or two, what makes it dangerous, where it's weak, how to beat it,
 *  and a word for each hero (by class id) where one plays it otherwise. */
export interface FoeNote {
  /** its part in a wave, in a few words */
  role: string;
  does: string;
  strengths: string[];
  weaknesses: string[];
  beat: string[];
  /** a hero's own way with it, by class id */
  vs?: Record<string, string>;
}

/** Every foe a wave can bring (the training dummy is no foe): each foe's note is in its file in data/foes/. */
export const FOE_NOTES = Object.fromEntries(
  Object.entries(FOE_ENTRIES).filter(([, entry]) => entry.note).map(([id, entry]) => [id, entry.note]),
) as Record<Exclude<EnemyId, 'dummy'>, FoeNote>;


/** What every foe's way of fighting means for you, by its `ai` (each foe's page says it, with its figures). */
export const AI_NOTES: Record<string, string> = {
  melee: 'Walks up and strikes whoever it is after once in reach.',
  ranged: 'Keeps its distance and throws from afar, backing off when you close in.',
  slam: 'Slams the ground in front of it once in reach, a ring on the floor marking where first.',
  boss: 'Slams all round itself up close, looses volleys at range, and calls help.',
};

/** A weapon way of holding the warrior's gear (or any class whose skills follow its gear): its name, how it plays,
 *  its good and bad sides. The skills each brings come from the class data. */
export interface StyleNote { name: string; how: string; strengths: string[]; weaknesses: string[] }

/** The ways of holding gear the guide shows for a class with gear-driven skills, each tried with gear made from its
 *  bases (`ui/guide/heroes.ts`): one shows only where it gives a loadout another hasn't already. */
export const STYLE_TRIES: { id: string; weapon?: 'one' | 'two'; off?: 'shield' | 'one' }[] = [
  { id: 'shield', weapon: 'one', off: 'shield' },
  { id: 'twoHanded', weapon: 'two' },
  { id: 'dual', weapon: 'one', off: 'one' },
  { id: 'oneHanded', weapon: 'one' },
  { id: 'shieldBare', off: 'shield' },
  { id: 'bare' },
];

export const STYLE_NOTES: Record<string, StyleNote> = {
  shield: {
    name: 'Weapon and shield',
    how: 'The safest way to fight. The shield can block a blow on its own, and right click raises it to block everything from the front.',
    strengths: ['Raise Shield turns away almost anything from the front.', 'The shield adds armour and a chance to block every hit.'],
    weaknesses: ['The lowest damage of the styles.', 'A blow bigger than your guard breaks it and staggers you.', 'Blows from behind still land.'],
  },
  twoHanded: {
    name: 'Two-handed weapon',
    how: 'Slow, heavy swings and Thunder Crescent on right click: a line of lightning that tears through a whole pack.',
    strengths: ['Each blow hits much harder.', 'Thunder Crescent reaches far down a line.', 'A two-hander rolls a much bigger damage bonus.'],
    weaknesses: ['No block at all.', 'Slower swings leave you open between them.'],
  },
  dual: {
    name: 'A weapon in each hand',
    how: 'Fast, light swings, and Twin Fangs on right click: a lunge and two quick cuts.',
    strengths: ['The quickest attacks, and the most Energy back over time.', 'Twin Fangs closes a gap instantly.'],
    weaknesses: ['No block.', 'Light blows knock foes back less.'],
  },
  oneHanded: {
    name: 'A lone one-handed weapon',
    how: 'Nothing in the off-hand: right click is empty until you bind a skill to it in the loadout. Usually a step on the way to a shield or a second weapon.',
    strengths: ['A free key for any skill you like.'],
    weaknesses: ['No block, no right-click attack of its own.'],
  },
  shieldBare: {
    name: 'Shield and no weapon',
    how: 'A shield on one arm and an empty fist: left click punches with the free hand, a little lighter than two fists, and right click still raises the shield. The safest way to fight, if the slowest to kill.',
    strengths: ['Raise Shield and the shield\'s own chance to block, as with a weapon.', 'Punches that keep your Energy coming.'],
    weaknesses: ['The lightest blows of any style: no weapon damage behind them.', 'Short reach: you must stand right on top of a foe.'],
  },
  bare: {
    name: 'Bare hands',
    how: 'Nothing in either hand: you fight as a berserker, and the weapon skills give way to the fists\' own. Every blow that lands builds Frenzy (the pips over your skill bar): each stack makes you attack faster and heals you for a share of the damage you deal, but you take more damage too. Stop landing blows and it drains away. Wrath spends it all in one blow.',
    strengths: ['Heavy punches that quicken as Frenzy builds, and the most Energy a second.', 'Frenzy heals you as you hit: keep hitting and you keep standing.', 'Pounce and Bloodrush get you onto a foe at once.'],
    weaknesses: ['No block.', 'Less damage in each blow and a short reach.', 'At high Frenzy you take a lot more damage: spend it with Wrath before a big hit lands.'],
  },
};

/** A mage's staff school (or none): how the spell it gives plays. */
export interface SchoolNote { how: string; strengths: string[]; weaknesses: string[] }

export const SCHOOL_NOTES: Record<string, SchoolNote> = {
  arcane: {
    how: 'Quick seeking bolts that split on impact and find more foes. Steady, forgiving damage that needs little aim.',
    strengths: ['Bolts seek: you hardly need to aim.', 'Splits spread damage over a pack.', 'Fast to cast, easy to move between shots.'],
    weaknesses: ['Each bolt is light: slow against a boss.'],
  },
  fire: {
    how: 'A slow, heavy orb that bursts where it lands, scorching everything round it and maybe setting it alight.',
    strengths: ['The best spell against packs: a big burst on every foe it reaches.', 'Burning keeps hurting after the hit.'],
    weaknesses: ['Slow to cast: you stand still for it.', 'The orb flies straight: it can miss a moving foe.'],
  },
  lightning: {
    how: 'Hold to gather a charge, let go to strike at your aim. The longer you hold, the harder and wider it hits, and it dazes the foe at its middle.',
    strengths: ['A full charge is the strongest single hit the mage has.', 'Dazes: stops a foe\'s attack in its tracks.', 'Strikes where you aim, no travel time.'],
    weaknesses: ['Taps are weak: it wants patience.', 'Elites and bosses are not dazed.'],
  },
  healing: {
    how: 'A beam of light that heals the ally nearest your aim, or yourself with no ally before you. A support staff for co-op.',
    strengths: ['Keeps a whole party standing.', 'Heals you alone too.'],
    weaknesses: ['Deals no damage: your other keys must do the killing.'],
  },
  bare: {
    how: 'No staff at all: Void Lance is cast from your hands. Bind it to two keys and hold both for a stronger lance from both hands.',
    strengths: ['Both hands together hit harder than one.'],
    weaknesses: ['Drains Energy fast, and you move slowly while channelling.', 'No staff damage bonus.'],
  },
};

/** A loadout or a combo names skills by their `impl`; one whose skills a class doesn't have (a skill still in an open
 *  PR, or taken out) isn't shown. */
export interface LoadoutNote { name: string; keys: Partial<Record<SkillKey, string>>; why: string }
export interface ComboNote { name: string; steps: string[]; how: string }

export interface ClassNote {
  /** how the class plays, in a few sentences */
  overview: string;
  tips: string[];
  /** a skill's own advice, by `impl`, beyond what its description says */
  skills: Record<string, string>;
  loadouts: LoadoutNote[];
  combos: ComboNote[];
}

export const CLASS_NOTES: Record<string, ClassNote> = {
  warrior: {
    overview: 'The warrior fights up close and lives through what would kill anyone else. Your basic attack refills your Energy, so the more foes you hit the more skills you can use. What you hold decides several of your skills: a shield, a great weapon, a weapon in each hand, or nothing at all.',
    tips: [
      'Keep swinging: Rending Cleave restores Energy for every foe it hits, so a big pack is fuel.',
      'Bull Rush can be used while another skill winds up or is held, and the other skill carries on.',
      'Raise your shield against a big hit you see coming, not all the time: it drains Energy and slows you.',
      'Iron Bellow is both an escape (it hurls foes back) and a second Health bar. Use it before a boss slam, not after.',
      'Elites and bosses are not carried by Bull Rush, only driven back.',
      'With empty hands, never stop hitting: Frenzy drains once you go two seconds without landing a blow.',
    ],
    skills: {
      cleave: 'Your Energy engine. Hit as many foes as possible with each swing.',
      raiseShield: 'Turn to face the danger: only blows from the front are blocked.',
      crescent: 'Line up a pack before you loose it: it hits everything along its path.',
      twinFangs: 'Instant: use it to close a gap or finish a caster.',
      tempest: 'Walk into a pack while spinning. Stop before your Energy runs dry.',
      bullRush: 'A gap closer, an escape and a crowd-gatherer: everything swept up is thrown together where you stop.',
      powerStrike: 'Start it before the foe arrives: the blow lands after the wind-up.',
      ironBellow: 'Use it when surrounded, or just before a hit you cannot avoid.',
      potion: 'You can move while drinking. Drink early rather than late.',
      savageFists: 'Heavy and short: step right up to the foe, a punch landing hardest at full stretch. Each punch refills Energy and builds Frenzy.',
      pounce: 'Aim at a foe up to 8 m off: you land on it and pin it while you pound it. Elites and bosses are not pinned.',
      rampage: 'Hold it and walk into the pack, punching all the way: the longer you hold it, the harder it hits and the more Energy it burns. Frenzy does not drain while you hold it.',
      bloodrush: 'Dash through a line of foes: each one you pass through is struck and adds a stack of Frenzy.',
      wrath: 'Spend your Frenzy: the more you have, the harder it hits. From 5 it slams everything round you, at 10 it cracks the ground and throws them back.',
      unchained: 'Use it at full Frenzy: for 8 s it cannot drain and can climb to 15, then finish with Wrath.',
    },
    loadouts: [
      { name: 'The bulwark', keys: { mouse0: 'cleave', mouse2: 'raiseShield', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'Sword and shield: block the big hits, spin through packs, and keep Iron Bellow for emergencies. The easiest way to survive deep waves.' },
      { name: 'The executioner', keys: { mouse0: 'cleave', mouse2: 'crescent', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'A two-handed weapon: rush in, Power Strike the gathered pack, and clean up with Thunder Crescent.' },
      { name: 'The whirlwind', keys: { mouse0: 'cleave', mouse2: 'twinFangs', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'Two weapons: quick swings keep Energy topped up for Steel Tempest, Twin Fangs to reach the casters.' },
      { name: 'The berserker', keys: { mouse0: 'savageFists', mouse2: 'rampage', '1': 'pounce', '2': 'bloodrush', '3': 'wrath', '4': 'unchained' }, why: 'Bare hands: pounce in, build Frenzy with every blow, and spend it all with Wrath.' },
      { name: 'The shieldbearer', keys: { mouse0: 'savageFists', mouse2: 'raiseShield', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'A shield and no weapon: punch for Energy, block the big hits, and let Bull Rush and Iron Bellow do the heavy work.' },
    ],
    combos: [
      { name: 'Rush and crush', steps: ['powerStrike', 'bullRush'], how: 'Start Power Strike, then Bull Rush while it winds up: you charge in carrying the pack, and the blow lands on them as the charge ends.' },
      { name: 'Spinning charge', steps: ['tempest', 'bullRush'], how: 'Hold Steel Tempest, then Bull Rush: you charge through the pack still spinning.' },
      { name: 'Gather and sweep', steps: ['bullRush', 'cleave'], how: 'Bull Rush throws everything it swept up together where you stop: turn and Cleave the whole heap, refilling your Energy.' },
      { name: 'Breathing room', steps: ['ironBellow', 'potion'], how: 'Surrounded and low: Iron Bellow hurls them back and wards you, then drink while they come back.' },
      { name: 'Into the pack', steps: ['bloodrush', 'wrath'], how: 'Bare hands: Bloodrush through a line of foes for up to five stacks of Frenzy, then turn and spend them all with Wrath.' },
      { name: 'Unchained wrath', steps: ['unchained', 'rampage', 'wrath'], how: 'Bare hands: Unchained, then Rampage through the pack to climb past 10 Frenzy, and end it with the strongest Wrath there is.' },
    ],
  },
  mage: {
    overview: 'The mage deals the most damage from range but has the least Health. Your staff decides your left click: each school gives a different spell, and with no staff at all you channel Void Lance from your hands. Keep moving, keep foes at a distance, and use your control spells to stop the dangerous ones.',
    tips: [
      'Your staff\'s spell costs no Energy: Energy is for the number keys.',
      'Glacial Nova and Veilstep are your escapes. Do not spend them both at once.',
      'Void Lance pierces everything in its line: line foes up before you channel it.',
      'Maelstrom drags foes in as it rolls: cast it ahead of a pack, not on top of it.',
      'Bosses shake off freezes and are not dazed: save those for the pack around them.',
    ],
    skills: {
      splinterBolt: 'Bolts seek on their own: keep moving and keep firing.',
      cinderburst: 'Aim at the middle of a pack, not at a single foe.',
      stormcall: 'Hold for a full charge on a big target; tap only to finish.',
      lifethread: 'Aim near the ally you want: it picks the one nearest your aim.',
      starfall: 'The crystals land scattered round your aim: best on a pack.',
      voidLance: 'Slow to move while channelling: start it from a safe spot.',
      glacialNova: 'Cast it as they reach you, then walk away or hit them while frozen.',
      maelstrom: 'It pulls: cast it so it rolls through the pack.',
      blink: 'Hold to pick the spot. Nothing hits you on the way, so blink through attacks.',
      potion: 'You can move while drinking.',
    },
    loadouts: [
      { name: 'The battle mage', keys: { mouse0: 'cinderburst', mouse2: 'voidLance', '1': 'starfall', '2': 'glacialNova', '3': 'maelstrom', '4': 'blink' }, why: 'A fire staff and the default kit: bursts for packs, the lance for lines, two escapes.' },
      { name: 'The storm', keys: { mouse0: 'stormcall', mouse2: 'voidLance', '1': 'starfall', '2': 'glacialNova', '3': 'maelstrom', '4': 'blink' }, why: 'A lightning staff: full charges daze the dangerous foes, the rest is area damage.' },
      { name: 'The healer', keys: { mouse0: 'lifethread', mouse2: 'voidLance', '1': 'starfall', '2': 'glacialNova', '3': 'maelstrom', '4': 'blink' }, why: 'A healing staff for co-op: keep the party alive, and let your keys do the damage.' },
    ],
    combos: [
      { name: 'Freeze and burn', steps: ['glacialNova', 'cinderburst'], how: 'Freeze the pack round you, step back, and burst them while they cannot move.' },
      { name: 'Into the storm', steps: ['maelstrom', 'starfall'], how: 'Maelstrom drags the pack together; drop Starfall on the knot it makes.' },
      { name: 'Out and through', steps: ['blink', 'voidLance'], how: 'Veilstep out of the pack, turn, and lance the line that follows you.' },
    ],
  },
  ranger: {
    overview: 'The ranger kills from the furthest away and moves the fastest. Every shot is drawn: hold to draw, let go to loose, and a fuller draw flies faster and hits harder. Mark the biggest threat, keep the pack busy with your Strawman, and never let foes reach you.',
    tips: [
      'Draw fully when you can: a full draw is faster and harder.',
      'Quarry Mark the toughest foe: everyone hits it harder, and if it dies marked your cooldowns come back.',
      'Strawman pulls the common foes off you for a few seconds: shoot them while they gather round it.',
      'Hailfletch roots you while you shoot: use it from a safe spot or behind a Strawman.',
      'Casters dodge or duck single arrows they see coming: hit them from the side or from above.',
    ],
    skills: {
      nockShot: 'Your bread and butter: draw to full on tough foes, loose early on weak ones.',
      fanShot: 'Up close, every arrow of the fan can hit the same big foe.',
      piercingShot: 'Line foes up: it goes through all of them.',
      arrowRain: 'Arrows fall at random across the area: best on a packed group.',
      quarryMark: 'Mark the one you are about to kill to get your cooldowns back.',
      strawman: 'Place it between you and the pack. Elites and bosses ignore it.',
      potion: 'You can move while drinking.',
    },
    loadouts: [
      { name: 'The hunter', keys: { mouse0: 'nockShot', mouse2: 'fanShot', '1': 'piercingShot', '2': 'arrowRain', '3': 'quarryMark', '4': 'strawman' }, why: 'The default kit covers everything: single targets, lines, packs and a lure.' },
      { name: 'The warden', keys: { mouse0: 'nockShot', mouse2: 'fanShot', '1': 'piercingShot', '2': 'arrowRain', '3': 'hedgeward', '4': 'strawman' }, why: 'Swap the mark for Hedgeward\'s walls to hold the pack back.' },
    ],
    combos: [
      { name: 'Lure and rain', steps: ['strawman', 'arrowRain'], how: 'Raise the Strawman, let the pack gather round it, and rain arrows on the knot.' },
      { name: 'Reset', steps: ['quarryMark', 'piercingShot'], how: 'Mark a wounded foe and finish it: every cooldown but the draught\'s comes back at once.' },
      { name: 'Skewer the line', steps: ['strawman', 'piercingShot'], how: 'Foes walking to the Strawman form a line: drive a Lancewood Shot down it.' },
    ],
  },
};
