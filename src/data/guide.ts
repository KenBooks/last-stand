// The guide's words (ui/guide/): what a figure can't say, how to fight each foe, how to play each hero. No figure is
// written here: the guide takes every number from the game's data as it renders (life, damage, cooldowns...), so
// these notes say how and why, never how much. A foe without a note fails the typecheck (`FOE_NOTES`); a skill,
// class or weapon style without one still shows from its data, and a dev build warns of it (`ui/guide/index.ts`).
// Any change adding or changing a foe, boss, skill, weapon style, item base or mechanic updates these notes in the
// same PR (root AGENTS.md); the tips' own words are in ui/guide/tips.ts, written round the figures they show.
import type { EnemyId } from './enemies';
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

/** Every foe a wave can bring (the training dummy is no foe). */
export const FOE_NOTES: Record<Exclude<EnemyId, 'dummy'>, FoeNote> = {
  imp: {
    role: 'Swarmer',
    does: 'Small, quick void-spawn that rush in, in numbers, and claw at whoever is closest. Alone it is little; a pack of them surrounding you is how most runs end early.',
    strengths: ['About as quick as a hero on foot: walking away rarely shakes them.', 'Packs flank and surround you instead of queueing in a line.', 'The Hollow Colossus keeps calling more of them.'],
    weaknesses: ['Very little Health: any area skill clears a pack.', 'Light: knocked back and thrown by every blow.'],
    beat: ['Let them come to you and answer with an area skill rather than chasing single ones.', 'Back against a wall or a pillar so the pack cannot close the circle.', 'Kill them first in a mixed group: they deal more together than one big foe.'],
    vs: {
      warrior: 'Rending Cleave hits the whole pack and refills your Energy for every one it touches.',
      mage: 'A Cinderburst or a charged Stormcall into the middle of the pack, or Glacial Nova when they reach you.',
      ranger: 'Briarflight\'s fan at close range, or Strawman to bunch them up for a Hailfletch.',
    },
  },
  husk: {
    role: 'Bruiser',
    does: 'A slow, shambling corpse with a long reach and a heavy blow. It walks straight at you and swings once in range.',
    strengths: ['Hits hard for a common foe and takes a while to bring down.', 'Its reach is longer than it looks.'],
    weaknesses: ['Slow on its feet: you can kite it forever.', 'Its swing has a clear wind-up you can step out of.'],
    beat: ['Step back as its arm rises, then punish the recovery.', 'Deal with the fast foes around it first; it will arrive later.', 'Ranged heroes: walk backwards and keep shooting.'],
    vs: { warrior: 'A raised shield takes its blow easily; Power Strike knocks it far back.' },
  },
  witch: {
    role: 'Caster',
    does: 'Keeps its distance and hurls dark void orbs at you, backing off when you close in. It sees attacks coming and may blink out of their way.',
    strengths: ['Hits hard from range, and its orbs are aimed ahead of where you are running.', 'Blinks aside from many attacks it sees coming at it.', 'Backs away and strafes, hiding behind the melee foes.'],
    weaknesses: ['Little Health for its threat.', 'Its blink only dodges what comes at it from the front: attacks from the side or while it is busy land.', 'It must stop to cast: the wind-up is your warning.'],
    beat: ['Move sideways when it raises its arms: the orb flies where you were heading.', 'Put a pillar between you to stop its shots, then close in.', 'Use attacks it cannot blink from, or hit it while it is mid-cast.'],
    vs: {
      warrior: 'Bull Rush closes the gap; dragged along, it cannot blink away.',
      mage: 'Veilstep next to it, or catch it in Maelstrom\'s pull.',
      ranger: 'Quarry Mark it and finish it with a drawn Nockshot from the side.',
    },
  },
  brute: {
    role: 'Heavy',
    does: 'A huge molten brute that slams the ground in front of it. Too far away to slam, it lobs chunks of lava at where you stand, which burst and leave a burning pool.',
    strengths: ['A slam that can take a large share of your Health at once, over a wide area.', 'Lots of Health, and hard to knock back.', 'Punishes standing still at range with lava.'],
    weaknesses: ['Its slam is marked by a red ring on the ground long before it lands.', 'Slow to turn and to walk.', 'The lava\'s landing is marked too: keep moving and it misses.'],
    beat: ['Watch for the red ring and step out of it, then hit it while it recovers.', 'Never stand in a burning pool; move as soon as a lava chunk is in the air.', 'Daze, freeze or lure it to stop the slam before it lands.'],
    vs: {
      warrior: 'Do not try to block the slam with a lowered shield; raise it or step out.',
      mage: 'Glacial Nova stops its slam cold; Starfall\'s chill slows it further.',
      ranger: 'Lancewood Shot through the brute and whatever stands behind it.',
    },
  },
  colossus: {
    role: 'Boss of the Crypt',
    does: 'A towering lord of the crypt. Up close it slams the ground all around itself; at range it looses fans of burning magma bolts; and every so often it roars and calls Voidlings to its side.',
    strengths: ['An enormous amount of Health, growing with the wave and the party.', 'Its slam covers a wide circle round its whole body.', 'Two volleys of bolts in quick succession: the second one aims ahead of you.', 'Cannot be knocked back and shakes off freezes quickly.'],
    weaknesses: ['Every slam is marked by a ring first.', 'Its volleys need a clear line: a pillar blocks them.', 'Slow, and its summons come at a steady pace you can plan around.'],
    beat: ['Fight at medium range: close enough that it does not volley often, far enough to leave its ring.', 'When it roars, turn on the Voidlings at once before they surround you.', 'Strafe across its volleys; hide behind pillars when you need a breather.', 'Save your burst (cooldowns, the draught) for after a slam lands.'],
    vs: {
      warrior: 'Iron Bellow\'s ward soaks a volley; strike in the gap after each slam.',
      mage: 'Void Lance through it and its summons in one line.',
      ranger: 'Quarry Mark it: when it dies marked, your cooldowns come back for the next wave.',
    },
  },
  thornling: {
    role: 'Swarmer',
    does: 'Small, darting creatures of thorn and bark that rush in packs and scratch at you from every side.',
    strengths: ['Quicker than most heroes on foot: hard to outrun.', 'Packs spread out round you.', 'The Elder Thornheart calls more of them.'],
    weaknesses: ['Fragile: any area attack shreds a pack.', 'Easily knocked back.'],
    beat: ['Stand your ground and use area skills as they arrive.', 'Do not chase stragglers: let them come.', 'Clear them before the slow heavies reach you.'],
    vs: { warrior: 'Steel Tempest through the middle of the pack.', mage: 'Glacial Nova as they close, then a Cinderburst.', ranger: 'Briarflight at point blank.' },
  },
  mossback: {
    role: 'Bruiser',
    does: 'A hulking, moss-grown beast that plods towards you and lands heavy blows at a long reach.',
    strengths: ['Tough and hard-hitting for a common foe.', 'Resists being knocked back a little.'],
    weaknesses: ['Slow: easy to kite.', 'Telegraphs its swing.'],
    beat: ['Step out of its swing and strike back while it recovers.', 'Keep moving: it rarely catches a hero who walks away.', 'Kill the fast and ranged foes first.'],
  },
  sporecaller: {
    role: 'Caster',
    does: 'A fungal caster that stays back and lobs swirling spore orbs at you, ducking under shots it sees coming.',
    strengths: ['Strong ranged hits that lead your movement.', 'Ducks under projectiles from the front.', 'Keeps its distance and strafes behind its allies.'],
    weaknesses: ['Low Health.', 'Its duck only avoids shots: melee blows, areas and beams still land.', 'Must stop to cast.'],
    beat: ['Sidestep when it winds up a throw.', 'Use areas, beams or melee instead of single shots, or hit it while it is ducking out of something else.', 'Break line of sight with a tree or a stone to stop its throws.'],
    vs: { ranger: 'Its duck makes arrows unreliable from the front: Hailfletch from above, or wait until it casts.', mage: 'Starfall drops from above; it cannot duck that.' },
  },
  barkhulk: {
    role: 'Heavy',
    does: 'A walking tree that slams the ground in front of it. Out of reach, it sends a vine creeping along the floor towards you that pins you to the spot if its tip catches you.',
    strengths: ['A crushing slam over a wide area.', 'Very tough, and hard to knock back.', 'Its vine passes through anything in its way and roots you in place for the rest of the pack.'],
    weaknesses: ['Its slam is marked by a ring.', 'The vine creeps in a straight line: step aside.', 'Slow on its feet.'],
    beat: ['Step out of the ring, then punish the recovery.', 'When the vine comes, move across its path, not away along it.', 'Caught? A dash or a blink tears you free.'],
    vs: { warrior: 'Bull Rush breaks a vine\'s hold.', mage: 'Veilstep breaks a vine\'s hold and crosses the slam.' },
  },
  thornheart: {
    role: 'Boss of the Thornwood',
    does: 'The ancient heart of the forest. Up close it slams the earth around itself; at range it looses fans of spore bolts; and it roars to call Thornlings from the undergrowth.',
    strengths: ['A vast amount of Health, growing with the wave and the party.', 'A wide slam round its whole body.', 'Two volleys of bolts, the second aimed ahead of you.', 'Cannot be knocked back; shakes off freezes quickly.'],
    weaknesses: ['Every slam is marked first.', 'Its volleys need a clear line: break it with a tree or a stone.', 'Slow, with summons on a steady clock.'],
    beat: ['Keep to medium range and leave the ring when it appears.', 'Turn on the Thornlings the moment it roars.', 'Strafe across volleys rather than running from them.', 'Spend your cooldowns in the gap after a slam.'],
    vs: { ranger: 'Strawman pulls its Thornlings off you while you keep shooting the boss.' },
  },
};

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
    strengths: ['Raise Shield and the shield\'s own chance to block, as with a weapon.', 'Quick punches that keep your Energy coming.'],
    weaknesses: ['The lightest blows of any style: no weapon damage behind them.', 'Short reach: you must stand right on top of a foe.'],
  },
  bare: {
    name: 'Bare hands',
    how: 'Nothing in either hand: the weapon skills give way to the fists\' own. Quick punches, foes seized and hurled, a foe swung round as a club, and both fists driven into the ground.',
    strengths: ['The fastest attacks and the most Energy a second.', 'Throws: Heave and Living Flail move foes where you want them.', 'Groundbreaker hits everything round the blow and throws it back.'],
    weaknesses: ['No block.', 'Less damage in each blow and a short reach.', 'Elites and bosses are too heavy to seize or swing.'],
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
      knuckles: 'Fast and short: step right up to the foe. Each punch refills Energy, as Rending Cleave does.',
      heave: 'Throw a foe into the pack: it hurts the one you throw and everything it lands among.',
      livingFlail: 'Seize a light foe and swing it through the pack, then let go towards the next group. Bigger foes hit harder.',
      groundbreaker: 'Your heaviest blow with empty hands: wait for the pack to close in, then break the ground under them.',
    },
    loadouts: [
      { name: 'The bulwark', keys: { mouse0: 'cleave', mouse2: 'raiseShield', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'Sword and shield: block the big hits, spin through packs, and keep Iron Bellow for emergencies. The easiest way to survive deep waves.' },
      { name: 'The executioner', keys: { mouse0: 'cleave', mouse2: 'crescent', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'A two-handed weapon: rush in, Power Strike the gathered pack, and clean up with Thunder Crescent.' },
      { name: 'The whirlwind', keys: { mouse0: 'cleave', mouse2: 'twinFangs', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'Two weapons: quick swings keep Energy topped up for Steel Tempest, Twin Fangs to reach the casters.' },
      { name: 'The brawler', keys: { mouse0: 'knuckles', mouse2: 'heave', '1': 'livingFlail', '2': 'bullRush', '3': 'groundbreaker', '4': 'ironBellow' }, why: 'Bare hands: grab, swing and throw foes, and break the ground under the pack.' },
      { name: 'The shieldbearer', keys: { mouse0: 'knuckles', mouse2: 'raiseShield', '1': 'tempest', '2': 'bullRush', '3': 'powerStrike', '4': 'ironBellow' }, why: 'A shield and no weapon: punch for Energy, block the big hits, and let Bull Rush and Iron Bellow do the heavy work.' },
    ],
    combos: [
      { name: 'Rush and crush', steps: ['powerStrike', 'bullRush'], how: 'Start Power Strike, then Bull Rush while it winds up: you charge in carrying the pack, and the blow lands on them as the charge ends.' },
      { name: 'Spinning charge', steps: ['tempest', 'bullRush'], how: 'Hold Steel Tempest, then Bull Rush: you charge through the pack still spinning.' },
      { name: 'Gather and sweep', steps: ['bullRush', 'cleave'], how: 'Bull Rush throws everything it swept up together where you stop: turn and Cleave the whole heap, refilling your Energy.' },
      { name: 'Breathing room', steps: ['ironBellow', 'potion'], how: 'Surrounded and low: Iron Bellow hurls them back and wards you, then drink while they come back.' },
      { name: 'The double punch', steps: ['groundbreaker', 'bullRush'], how: 'Bare hands: start Groundbreaker, then Bull Rush while the fists rise: you charge in and both fists come down on what you carried.' },
      { name: 'Throw and break', steps: ['heave', 'groundbreaker'], how: 'Bare hands: Heave a foe into the pack, walk in after it, and drive both fists into the ground among them.' },
      { name: 'Living battering ram', steps: ['livingFlail', 'bullRush'], how: 'Bare hands: swing a foe round you to clear space, throw it at the next group, and Bull Rush in behind it.' },
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
