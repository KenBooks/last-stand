// tools/lab readme: the README's pictures (docs/screenshots), each a moment of the game posed and pictured as the
// player sees it, the page's UI over the frame: the village at dusk, the party round its campfire, the hall of
// heroes, the stash, a fight in each battleground, the choice after a wave, a party of four in a fight and one of
// them down. The lobby's shots come first, on the page as it booted; a fight's sets its run up itself. The partners
// of a party are heroes built as a room builds them (net/session.ts `makePlayer`) and stood where the shot wants
// them: one page, no room, so nothing here says anything of the link. A picture is for showing, not a measure: each
// shot says what it posed, and its only problem is a state that never came.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import type { BiomeId } from '../../../src/data/biomes';
import { CLASSES } from '../../../src/data/classes';
import type { HeroColourId } from '../../../src/data/heroColours';
import { SLOTS } from '../../../src/data/items';
import { CAMPFIRE, START_SPOTS, VILLAGE_OBJECTS } from '../../../src/data/village';
import { Player } from '../../../src/entities/player';
import { holdHour } from '../../../src/game/clock';
import { gainLoot } from '../../../src/game/run';
import { makeItem } from '../../../src/loot/items';
import { role } from '../../../src/net/role';
import { session } from '../../../src/net/session';
import type { Item, RarityId, Slot } from '../../../src/types';
import { showDecision } from '../../../src/ui/hud';
import * as menus from '../../../src/ui/menus';
import { groundHeight } from '../../../src/world/arena';
import { foesAhead, pressing, skillNamed } from './cast';
import type { Lab, Pictured, Report } from './lab';
import { lookAlong, standIn } from './light';
import { panelsBack, showPanels } from './lobbyPanels';
import { closeDecision } from './uiDecision';
import { closeHeroes, openHeroes } from './uiHeroes';

/** The shots, in the order they're taken: the lobby's first, then the fights'. */
export const SHOTS = ['village', 'campfire', 'hall', 'stash', 'forest', 'crypt', 'choice', 'party', 'down'] as const;
export type ShotName = (typeof SHOTS)[number];

/** `lab readme`'s options. */
export interface ReadmeOptions {
  /** the shots taken (all by default) */
  shots?: ShotName[];
  /** frames from a fight's skill let go to its picture, in place of the shot's own (to choose a moment) */
  after?: number;
}

/** frames for the hero, the camera and the cloth to come to rest after he's placed */
const SETTLE = 90;
/** the hours the village is pictured at: late afternoon's long light, and the night round the fire */
const DUSK = 17.5;
const NIGHT = 21.5;
/** the level of the gear the shots roll */
const ITEM_LEVEL = 24;
/** every rarity, the least first */
const RARITIES: RarityId[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'ascendant'];
/** a half turn: the way that faces -z, the hall's side of the village and the dais's of an arena */
const NORTH = Math.PI;

/** A partner of the party: its class, name tag, colour and its gear's rarity. */
interface Partner {
  cls: string;
  tag: string;
  colour: HeroColourId;
  rarity: RarityId;
}

/** the local hero's tag and colour in a party, and his three partners */
const OWN = { tag: 'Asha', colour: 'red' as HeroColourId };
const PARTNERS: Partner[] = [
  { cls: 'warrior', tag: 'Brandt', colour: 'blue', rarity: 'legendary' },
  { cls: 'ranger', tag: 'Corin', colour: 'green', rarity: 'epic' },
  { cls: 'mage', tag: 'Dunya', colour: 'gold', rarity: 'ascendant' },
];

/** what is no part of the game as a player in it meets it: the dev build's tab, the beta's notice, and the close
 *  views' hint to click, which a player looking round has clicked away */
const NOT_SHOWN = '#dev-tab, #beta-notice, #look-hint { display: none !important; }';

/** `NOT_SHOWN` kept off the page from here on. */
function hideWhatPlayersDontSee(): void {
  const style = document.createElement('style');
  style.textContent = NOT_SHOWN;
  document.head.appendChild(style);
}

/** The lobby seen over the shoulder, the camera looking `facing`'s way. */
async function overTheShoulder(lab: Lab, facing: number): Promise<void> {
  for (let press = 0; press < 3 && renderer.viewMode() !== 'third'; press++) {
    await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(1);
  }
  if (renderer.viewMode() !== 'third') throw new Error('lab: readme: V never gave the view over the shoulder');
  await lookAlong(lab, facing);
}

/** The hero put at (x, z) on the village's ground, still, seen over the shoulder looking `look`'s way. */
async function standInVillage(lab: Lab, [x, z]: readonly number[], facing: number, look = facing): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  await overTheShoulder(lab, look);
  await lab.step(SETTLE);
}

/** A full set of `cls`'s gear of `rarity`, by slot. */
function gearOf(cls: string, rarity: RarityId): Partial<Record<Slot, Item>> {
  const def = CLASSES[cls];
  const slots = SLOTS.filter((slot) => !def.excludeSlots?.includes(slot));
  const items = slots.map((slot) => [slot, makeItem({ slot, rarity, ilvl: ITEM_LEVEL, cls: def })]);
  return Object.fromEntries(items);
}

/** The party's partners built as a room builds them, each in a slot, tag and colour of its own. */
function joinParty(): Player[] {
  role.current = 'host';
  session.tag = OWN.tag;
  G.player.setColour(OWN.colour);
  return PARTNERS.map((partner, index) => {
    const hero = new Player(partner.cls, gearOf(partner.cls, partner.rarity) as never, false);
    hero.slot = index + 1;
    hero.tag = partner.tag;
    hero.setColour(partner.colour);
    G.players.push(hero);
    hero.reset();
    return hero;
  });
}

/** The partners gone, the game solo again. */
function leaveParty(partners: Player[]): void {
  for (const hero of partners) {
    hero.dispose();
    G.players.splice(G.players.indexOf(hero), 1);
  }
  role.current = 'solo';
  session.tag = '';
  G.player.setColour(null);
}

/** A partner stood at (x, z), facing `facing`, as its game's reports would have it. */
function standPartner(hero: Player, x: number, z: number, facing: number): void {
  Object.assign(hero.remote, { x, z, vx: 0, vz: 0, f: facing });
}

/** The village at dusk: the hero before the fountain, the hall beyond it. */
async function village(lab: Lab): Promise<Pictured> {
  holdHour(DUSK);
  const spot = START_SPOTS[0];
  await standInVillage(lab, spot.at, spot.facing);
  return lab.screen('village', [`the village at ${DUSK} h, over the shoulder: ${spot.name}`]);
}

/** how far from the campfire the party stands, and the turns round it of the local hero and his partners (rad from
 *  +z: he stands this side of it, they across it, none behind him) */
const FIRE_RING = 2.3;
const FIRE_TURNS = [0, 1.9, 3.0, 4.4];

/** The party round the campfire by night, each facing it, the village beyond. */
async function campfire(lab: Lab): Promise<Pictured> {
  holdHour(NIGHT);
  const partners = joinParty();
  const [fireX, fireZ] = CAMPFIRE;
  const seats = FIRE_TURNS.map((turn) => {
    return { x: fireX + Math.sin(turn) * FIRE_RING, z: fireZ + Math.cos(turn) * FIRE_RING, facing: turn + Math.PI };
  });
  partners.forEach((hero, index) => {
    const seat = seats[index + 1];
    standPartner(hero, seat.x, seat.z, seat.facing);
  });
  await standInVillage(lab, [seats[0].x, seats[0].z], seats[0].facing, NORTH);
  const pictured = await lab.screen('campfire', [`the party round the campfire at ${NIGHT} h`]);
  leaveParty(partners);
  await lab.step(2);
  return pictured;
}

/** The hall of heroes, the hero selection screen over it. */
async function hall(lab: Lab): Promise<Pictured> {
  holdHour(DUSK);
  await openHeroes(lab);
  const pictured = await lab.screen('hall', ['the hall of heroes, the lobby\'s own hero in focus']);
  await closeHeroes(lab);
  return pictured;
}

/** how many items the stash is shown with */
const STASH_ITEMS = 34;

/** The chest's panels on the hall's porch: the hero's gear and a stash of every rarity. */
async function stash(lab: Lab): Promise<Pictured> {
  const kept = { stash: G.profile.stash, equipped: G.profile.equipped };
  const cls = G.player.cls;
  const chest = VILLAGE_OBJECTS.find((object) => object.id === 'chest')!;
  holdHour(DUSK);
  G.profile.equipped = gearOf(cls.id, 'epic') as never;
  const slots = SLOTS.filter((slot) => !cls.excludeSlots?.includes(slot));
  G.profile.stash = Array.from({ length: STASH_ITEMS }, (_, index) => makeItem({
    slot: slots[index % slots.length],
    rarity: RARITIES[(index * 5 + 2) % RARITIES.length],
    ilvl: ITEM_LEVEL,
    cls,
  }));
  menus.renderMenu();
  await standInVillage(lab, chest.stand, NORTH);
  showPanels('chest');
  await lab.step(SETTLE);
  const pictured = await lab.screen('stash', ['the chest: equipment and a stash of every rarity']);
  G.profile.stash = kept.stash;
  G.profile.equipped = kept.equipped;
  menus.renderMenu();
  panelsBack();
  return pictured;
}

/** A fight's scene: where, how seen, the skill cast and how long after its press it's pictured. */
interface Fight {
  biome: BiomeId;
  view: renderer.ViewMode;
  skill: string;
  foes: number;
  /** frames the skill's key is held from its press, and frames from letting it go to the picture */
  held: number;
  after: number;
  wave: number;
  /** where the hero stands and the way he faces (deg), and the top view's zoom (the game's own by default) */
  at?: [number, number];
  facing?: number;
  zoom?: number;
}

/** The way the hero faces, as a step of 1 m. */
const ahead = (): THREE.Vector3 => new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));

/** The local hero's skill pressed and held for `held` frames, aimed `reach` m ahead of him, then let go for `after`
 *  more (a skill aimed by holding casts as it's let go). */
async function castAhead(lab: Lab, skill: string, held: number, after: number, reach: number): Promise<void> {
  const hero = G.player;
  const { key } = skillNamed(skill);
  const aim = hero.pos.clone().add(ahead().multiplyScalar(reach));
  hero.cooldowns.clear();
  hero.energy = hero.stats.maxEnergy;
  await lab.step(held, () => pressing(key, aim, true));
  await lab.step(after, () => ({ aim }));
}

/** how far ahead of the hero a fight's skill is aimed (m: where `foesAhead` raises its foes) */
const AIM_AHEAD = 7;

/** The hero in `fight`'s battleground, its foes risen ahead of him and the wave fought as a run fights it. */
async function fightScene(lab: Lab, fight: Fight): Promise<void> {
  G.arena.restoreProps();
  const { biome, view, at, zoom, facing = 0 } = fight;
  await standIn(lab, { biome, view, at, zoom, facing, rarity: 'legendary' } as never);
  const run = G.run!;
  run.wave = fight.wave;
  await foesAhead(lab, fight.biome, fight.foes);
  // (the wave as a fight has it: its foes these, none more to come)
  lab.letWavesCome();
  run.queue = [];
  run.phase = 'fighting';
}

/** `--after`, if it's given */
let afterAsked: number | undefined;

/** A fight pictured: `fight`'s scene as its skill lands. */
async function fought(lab: Lab, label: ShotName, fight: Fight): Promise<Pictured> {
  await fightScene(lab, fight);
  const after = afterAsked ?? fight.after;
  await castAhead(lab, fight.skill, fight.held, after, AIM_AHEAD);
  const cast = `${fight.skill} held ${fight.held} frames and let go for ${after}`;
  const what = `${cast}, at ${fight.foes} foes, wave ${fight.wave}`;
  return lab.screen(label, [`${fight.biome}, ${fight.view}: ${what}`]);
}

/** The skill a class's fight shows, by class. */
const SHOWN_SKILL: Record<string, string> = { mage: 'Starfall', warrior: 'Rending Cleave', ranger: 'Briarflight' };
const shownSkill = (): string => SHOWN_SKILL[G.player.cls.id] ?? G.player.cls.skills[0].name;
/** how each is cast for its picture: frames held, and frames from letting go to the picture (Starfall's crystals
 *  landing, the cleave's blow struck, the fan in flight) */
const SHOWN_CAST: Record<string, { held: number; after: number }> = {
  mage: { held: 30, after: 55 },
  warrior: { held: 20, after: 0 },
  ranger: { held: 45, after: 6 },
};
const shownCast = (): { held: number; after: number } => SHOWN_CAST[G.player.cls.id] ?? { held: 20, after: 0 };

/** The Thornwood over the shoulder. */
function forest(lab: Lab): Promise<Pictured> {
  const cast = { skill: shownSkill(), ...shownCast() };
  return fought(lab, 'forest', { biome: 'forest', view: 'third', foes: 7, wave: 3, ...cast });
}

/** where the crypt's fights stand, before the dais and facing it, and the top view brought in close (the game's own
 *  closer pitch) */
const CRYPT = { at: [0, 9.5] as [number, number], facing: 180, zoom: 0.42 };

/** The Crypt from above, close. */
function crypt(lab: Lab): Promise<Pictured> {
  const cast = { skill: shownSkill(), ...shownCast() };
  return fought(lab, 'crypt', { biome: 'crypt', view: 'top', foes: 9, wave: 4, ...cast, ...CRYPT });
}

/** the bag the choice after a wave is shown with, by rarity */
const BAG: RarityId[] = ['legendary', 'epic', 'epic', 'rare', 'rare', 'rare', 'magic', 'magic', 'common'];

/** The choice after a wave, the bag's spoils counted by rarity and unseen. */
async function choice(lab: Lab): Promise<Pictured> {
  await standIn(lab, { biome: 'crypt', view: 'top', rarity: 'legendary', ...CRYPT, zoom: 0.5 } as never);
  const run = G.run!;
  run.wave = 3;
  lab.letWavesCome();
  run.phase = 'cleared';
  for (const rarity of BAG) gainLoot(makeItem({ rarity, ilvl: ITEM_LEVEL, cls: G.player.cls }));
  await lab.step(SETTLE);
  showDecision();
  const box = document.getElementById('decision')!;
  for (const animation of box.getAnimations({ subtree: true })) animation.finish();
  const pictured = await lab.screen('choice', [`the choice after wave ${run.wave}, ${BAG.length} items in the bag`]);
  closeDecision();
  return pictured;
}

/** where the partners stand from the local hero in a fight (m to his right, m ahead of him) */
const PARTY_PLACES = [[-2.6, 1.6], [2.4, 1.0], [1.2, -1.6]];

/** The party's fight set up: the local hero before the crypt's dais with its foes on him, his partners round him. */
async function partyScene(lab: Lab, foes: number, zoom: number): Promise<Player[]> {
  const uncast = { skill: shownSkill(), held: 0, after: 0 };
  await fightScene(lab, { biome: 'crypt', view: 'top', foes, wave: 6, ...uncast, ...CRYPT, zoom });
  const partners = joinParty();
  const hero = G.player;
  const forward = ahead();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  partners.forEach((partner, index) => {
    const [across, along] = PARTY_PLACES[index];
    const at = hero.pos.clone().addScaledVector(right, across).addScaledVector(forward, along);
    standPartner(partner, at.x, at.z, hero.facing);
  });
  await lab.step(30);
  return partners;
}

/** A party of four in a fight, each in a colour and gear of its own. */
async function party(lab: Lab): Promise<Pictured> {
  const partners = await partyScene(lab, 9, CRYPT.zoom);
  const cast = shownCast();
  await castAhead(lab, shownSkill(), cast.held, afterAsked ?? cast.after, AIM_AHEAD);
  const pictured = await lab.screen('party', ['a party of four in the Crypt, its foes on it']);
  leaveParty(partners);
  return pictured;
}

/** frames the local hero holds E by his fallen partner before the picture (a revive takes 3 s) */
const REVIVE_HELD = 100;

/** One of the party down in a fight, the local hero beside him holding E to raise him. */
async function down(lab: Lab): Promise<Pictured> {
  const partners = await partyScene(lab, 6, 0.3);
  const fallen = partners[2];
  const hero = G.player;
  standPartner(fallen, hero.pos.x + 1.3, hero.pos.z - 1.5, hero.facing);
  await lab.step(20);
  // (as a blow that takes his last Health leaves him in co-op: fallen, then down)
  fallen.die();
  fallen.goDown();
  await lab.step(REVIVE_HELD, () => ({ keys: ['e'] }));
  const problems = fallen.downed ? [] : ['down: the partner was not down as the picture was taken'];
  const notes = ['one of the party down, the local hero holding E to raise him', ...problems];
  const pictured = await lab.screen('down', notes);
  leaveParty(partners);
  return pictured;
}

const TAKE: Record<ShotName, (lab: Lab) => Promise<Pictured>> = {
  village, campfire, hall, stash, forest, crypt, choice, party, down,
};

/** `lab readme`: each shot asked for, pictured in turn. */
export async function readme(lab: Lab, options: ReadmeOptions): Promise<Report> {
  const asked = SHOTS.filter((shot) => (options.shots ?? SHOTS).includes(shot));
  afterAsked = options.after;
  hideWhatPlayersDontSee();
  const moments: Pictured[] = [];
  for (const shot of asked) moments.push(await TAKE[shot](lab));
  holdHour(null);
  const lines = moments.map((moment) => `${moment.label}: ${moment.notes.join('; ')}`);
  const problems = moments.flatMap((moment) => moment.notes.filter((note) => note.startsWith('down: ')));
  return { text: lines.join('\n'), problems, moments };
}
