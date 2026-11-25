// Co-op's protocol: which messages and roster a game speaks, so incompatible games don't play together. It is made
// of parts, one line each, kept sorted: a PR whose messages change adds its own line (or bumps its own `-N`), so two
// PRs that both change messages touch different lines instead of fighting over one number (the number it was, bumped
// by every co-op PR, conflicted in 7 of the PRs that rebased in Oct-Nov 2026 and in 5 PRs open at once).

/** what this game's messages are, a part a line, sorted (`scripts/sorted.mjs` checks): `<feature>-<n>: what` */
// sorted
const PARTS = [
  'afk-1: a player away from the game, StateMsg afk (net/afk.ts)',
  'base-41: every message as of PROTOCOL 41, the last number bumped by hand (net/AGENTS.md tells their history)',
  'bellwarden-2: the Bell-Warden as the Cantor guard alone, its toll and its swing, enemy fx toll and bellSwing (entities/bosses/bellwarden.ts)',
  'belt-skulls-1: the Ossuary Twins belt skulls thrown, the enemy fx `beltSkull` (entities/twinSkulls.ts)',
  'bosses-1: the weak-spot window of a boss, enemy fx bossWeak (entities/bossKit.ts)',
  'cantor-2: an encounter, its guards and its boss ward, the Cantor chant, its warnings (graveRing), grave hands and dirge, its choir\'s ring (choirRing), its risen graves (graveStone, graveLife), enemy fx (entities/bosses/cantor.ts)',
  'colour-wheel-1: a hero colour may be picked on the wheel, said as its #rrggbb (data/heroColours.ts customColourId)',
  'floor-1: a drop on the lobby floor carries its seconds left, GroundDrop left (game/groundItems.ts)',
  'frenzy-1: the Frenzy stacks of a warrior, StateMsg fz (combat/frenzy.ts)',
  'friends-1: the welcome says the room as its host opened it, kind, name, max and fr (net/friends.ts)',
  'houses-1: a house said by its index in ROOM_IDS, now in the order of its file in data/houses/',
  'lobby-1: a room has no lobby of its own (the village is every game\'s): none in hello, refuse or a room\'s card',
  'party-room-1: welcome carries the host\'s house (rm) so joiners spawn in the same building',
  'rarity-1: the rarity of an item can be Ultimate, a tier above Ascendant (data/items.ts)',
  'rootmother-2: the Rootmother vines, burrow, heart, pods, thorns, cracks, eruptions, spores, thrown branches and their bramble, root cage and its great root, enemy fx (entities/bosses/rootmother.ts)',
  'sit-1: how far a hero is sat on a seat, StateMsg sw, sh, sf, sb, sa (entities/sitting.ts)',
  'ward-1: the Hedgeward rising, struck and breaking, the enemy fx `ward` (combat/skills/hedgeward.ts)',
];

/** FNV-1a of the parts, as a number the relay keeps on a room's card (it reads `v` as a count under a million) */
function protocolOf(parts: readonly string[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('\n')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1_000_000;
}

/** the protocol two games must share to play together */
export const PROTOCOL = protocolOf(PARTS);
