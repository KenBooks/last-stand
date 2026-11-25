// The guide's foes and bosses: every foe a wave brings, its figures from the game's data (data/enemies.ts, its growth
// by wave, the biome that brings it and from which wave, how it throws, dodges and calls help) and how to fight it
// (data/guide.ts). Its blow against the hero's own armour and resistance is worked out as the page opens.
import { BIOMES, BIOME_IDS, bossOfWave, type BiomeId } from '../../data/biomes';
import { BOSS_AI, ENEMIES, HERO, SCALING, type EnemyId } from '../../data/enemies';
import { TWINS } from '../../data/foes/twins';
import { BELL_WARDEN } from '../../data/foes/bellwarden';
import { CANTOR } from '../../data/foes/cantor';
import { ROOTMOTHER } from '../../data/foes/rootmother';
import { WAVES } from '../../data/waves';
import { DAMAGE_COLORS, partyScale, COOP } from '../../data/balance';
import { AI_NOTES, FOE_NOTES, type FoeNote } from '../../data/guide';
import { CLASSES } from '../../data/classes/index';
import { G } from '../../state';
import type { EnemyDef } from '../../types';
import { css, head, pic, metres, num, para, pct, points, secs, tile, tiles, whole } from './parts';
import { bars, partyBars, summonTimeline } from './diagrams';

/** the wave a foe's figures are shown at besides the first, to show how it grows */
const LATER = 10;
/** the furthest wave looked through for the first a foe comes in */
const LAST_LOOKED = 60;

/** A foe a wave brings: its id, its data, its note, and where it's met first. */
export interface Foe {
  id: Exclude<EnemyId, 'dummy'>; def: EnemyDef; note: FoeNote; biome: BiomeId; from: number;
  /** the boss it comes beside as a guard, where that's the only way it comes */
  guards?: EnemyId;
}

/** Every foe a wave brings, by the biome that brings it first and the wave it comes in, the bosses apart. */
export function foes(): { common: Foe[]; bosses: Foe[] } {
  const common: Foe[] = [], bosses: Foe[] = [];
  for (const [id, def] of Object.entries(ENEMIES) as [EnemyId, EnemyDef][]) {
    if (id === 'dummy' || def.dummy) continue;
    const met = metAt(id);
    if (!met) continue;
    const foe: Foe = { id, def: met.guards ? asGuard(def) : def, note: FOE_NOTES[id], ...met };
    (def.boss ? bosses : common).push(foe);
  }
  // (by where they're met, then the cheaper first: each foe's file in data/foes/ comes in the folder's order)
  const order = (a: Foe, b: Foe): number => BIOME_IDS.indexOf(a.biome) - BIOME_IDS.indexOf(b.biome) || a.from - b.from
    || a.def.cost - b.def.cost;
  return { common: common.sort(order), bosses: bosses.sort(order) };
}

/** `def` as it comes as a guard: its `asGuard` share of its life and damage, and no speed where it stands. */
const asGuard = (def: EnemyDef): EnemyDef => ({
  ...def, life: def.life * (def.asGuard?.life ?? 1), damage: def.damage * (def.asGuard?.damage ?? 1),
  // (a guard that hovers where it rises drifts nowhere)
  speed: def.asGuard?.stands ? 0 : def.speed,
});

/** Where `id` is met first: the first biome whose pool or boss has it, and the first wave there (and the boss it
 *  guards, where it comes on its ladder as a guard alone); a foe a boss brings (`broughtBy`: the Rootmother's seed
 *  pods, in no pool) where its boss is. */
function metAt(id: EnemyId): { biome: BiomeId; from: number; guards?: EnemyId } | null {
  const by = ENEMIES[id].broughtBy as EnemyId | undefined;
  if (by && by !== id) return metAt(by);
  for (const biome of BIOME_IDS) {
    const first = bossWavesOf(biome, id)[0];
    if (first) {
      const boss = bossOfWave(biome, first)!;
      return { biome, from: first, ...(boss.guards?.id === id ? { guards: boss.id } : {}) };
    }
    for (let w = 1; w <= LAST_LOOKED; w++) if (BIOMES[biome].pool(w).some(([e]) => e === id)) return { biome, from: w };
  }
  return null;
}

const life = (def: EnemyDef, w: number): number => def.life * SCALING.life(w);
const damage = (def: EnemyDef, w: number): number => def.damage * SCALING.damage(w);

/** A damage type's name in its colour. */
const typed = (def: EnemyDef): string => `<span style="color:${css(DAMAGE_COLORS[def.damageType])}">${def.damageType}</span>`;

/** What a blow of `amount` of the foe's type leaves of the hero's Health now, past his armour or resistance. */
function againstHero(def: EnemyDef, amount: number): string {
  const s = G.player?.stats;
  if (!s) return '';
  const physical = def.damageType === 'physical';
  const reduce = Math.max(0, Math.min(100, physical ? s.armor : s.resist));
  const taken = amount * (1 - reduce / 100);
  const share = s.maxLife > 0 ? ` (${pct(taken / s.maxLife)} of your Health)` : '';
  return `${whole(taken)}${share}, after your ${num(reduce)}% ${physical ? 'armour' : 'resistance'}`;
}

/** How its speed compares with the hero's own. */
function pace(def: EnemyDef): string {
  const hero = G.player?.stats.moveSpeed;
  if (!hero || def.speed <= 0) return '';
  const r = def.speed / hero;
  return r > 1.02 ? 'faster than you' : r < 0.98 ? `${pct(1 - r)} slower than you` : 'as fast as you';
}

/** The foe's figures as tiles. */
function figures(foe: Foe): string {
  const d = foe.def;
  const items = [
    tile('Health', whole(life(d, foe.from)), `wave ${foe.from} · ${whole(life(d, LATER))} at wave ${LATER}`),
    tile('Damage', `${whole(damage(d, foe.from))} ${typed(d)}`, `a blow · ${whole(damage(d, LATER))} at wave ${LATER}`),
    tile('Speed', d.speed > 0 ? `${num(d.speed)} m/s` : 'stands', d.speed > 0 ? pace(d) : 'where it rises'),
    tile('Reach', metres(d.range), d.ai === 'ranged' ? `keeps ${metres(d.keepAway ?? 8)} away` : 'its blow'),
    tile('Wind-up', secs(d.windup), 'your time to get out of it'),
    tile('Between attacks', secs(d.cooldown)),
  ];
  if (d.knockbackResist) items.push(tile('Knockback', `${pct(d.knockbackResist)} resisted`, d.knockbackResist >= 1 ? 'never moved' : ''));
  if (d.freezeResist) items.push(tile('Freezes, dazes', `${pct(d.freezeResist)} shorter`));
  if (d.boss) items.push(tile('Comes', ...comes(foe)));
  else items.push(tile('First seen', `wave ${foe.from}`, BIOMES[foe.biome].title));
  return tiles(items);
}

/** the waves the guide looks through for a boss's first coming and its return */
const LOOKED_THROUGH = 200;

/** The boss waves of `biome` that `id` holds, first to last within `LOOKED_THROUGH` (its ladder's rung or an exception
 *  over it, a twin with the boss it rises with: data/biomes.ts `bossOfWave`). */
function bossWavesOf(biome: BiomeId, id: EnemyId): number[] {
  const waves: number[] = [];
  for (let wave = WAVES.bossEvery; wave <= LOOKED_THROUGH; wave += WAVES.bossEvery) {
    const boss = bossOfWave(biome, wave);
    if (boss && (boss.id === id || boss.twin === id || boss.guards?.id === id)) waves.push(wave);
  }
  return waves;
}

/** When a boss comes: its first boss wave, then how often it comes again. */
function comes(foe: Foe): [string, string] {
  const [first, next] = bossWavesOf(foe.biome, foe.id);
  const again = next ? `then every ${next - first} waves` : 'once';
  const beside = foe.guards ? `, guarding ${ENEMIES[foe.guards].name}` : '';
  return [`wave ${first}`, `${again}${beside}· ${BIOMES[foe.biome].title}`];
}

/** Its attacks, each with its figures. */
function attacks(foe: Foe): string[] {
  const d = foe.def, out: string[] = [];
  const hit = whole(damage(d, foe.from));
  if (d.ai === 'melee') out.push(`<b>Strike:</b> ${hit} ${typed(d)} damage to whoever it is after, within ${metres(d.range)}, ${secs(d.windup)} after it starts the swing.`);
  if (d.ai === 'ranged' && d.projectile) {
    out.push(`<b>Bolt:</b> ${hit} ${typed(d)} damage from up to ${metres(d.range)} away, flying at ${num(d.projectile.speed)} m/s and aimed ahead of where you run. It needs a clear line to you.`);
  }
  if (d.ai === 'slam') {
    out.push(`<b>Slam:</b> ${hit} ${typed(d)} damage to everyone within ${metres(d.slamRadius ?? 3)} of where it lands, just in front of it. A red ring marks the spot ${secs(d.windup)} before it lands.`);
  }
  const th = d.throws;
  if (th?.what === 'lava' && th.splash && th.pool) {
    out.push(`<b>Lava:</b> from ${metres(th.from)} to ${metres(th.reach)} away it lobs a chunk at where you stand: ${whole(damage(d, foe.from) * th.splash[1])} damage within ${metres(th.splash[0])} where it bursts, and a pool ${metres(th.pool[0])} wide that burns for ${whole(damage(d, foe.from) * th.pool[2])} a second for ${secs(th.pool[1])}.`);
  }
  if (th?.what === 'vine' && th.creep) {
    out.push(`<b>Vine:</b> from ${metres(th.from)} to ${metres(th.reach)} away it sends a vine creeping along the floor at ${num(th.creep[0])} m/s, through anything in its way. If its tip comes within ${metres(th.creep[1])} of you, you are held to the spot for ${secs(th.creep[2])}; a dash or a blink tears you free.`);
  }
  if (d.ai === 'twins') out.push(...twinsAttacks(foe));
  if (d.ai === 'bellWarden') out.push(...bellWardenAttacks(foe));
  if (d.ai === 'cantor') out.push(...cantorAttacks(foe));
  if (d.ai === 'rootmother') out.push(...rootmotherAttacks(foe));
  if (d.boss && d.ai === 'boss') {
    const radius = d.slamRadius ?? 5;
    out.push(`<b>Slam:</b> up close (within ${metres(d.range + BOSS_AI.slamReach)}) it slams all round itself: ${hit} ${typed(d)} damage within ${metres(radius)}, marked by a ring ${secs(d.windup)} before it lands.`);
    if (d.projectile) {
      const [a, b] = BOSS_AI.volleys;
      out.push(`<b>Volleys:</b> within ${metres(BOSS_AI.volleyReach)}, with a clear line, a fan of ${a.bolts} bolts at where you are, then ${b.bolts} more aimed ahead of you, ${hit} damage each.`);
    }
    if (d.summon && d.summon in ENEMIES) {
      const name = ENEMIES[d.summon as EnemyId].name;
      out.push(`<b>Call for help:</b> it roars and calls ${BOSS_AI.summonCount} ${name}s to its side, first ${secs(BOSS_AI.summonFirst)} into the fight and then every ${secs(BOSS_AI.summonEvery)}, while fewer than ${BOSS_AI.crowd} foes stand.`);
    }
  }
  const ev = d.evade;
  if (ev) {
    const what = ev.how === 'blink' ? 'blinks aside' : 'ducks';
    const from = ev.from.map((k) => ({ shot: 'shots', wave: 'waves', rush: 'charges', beam: 'beams', area: 'areas' } as Record<string, string>)[k] ?? k);
    out.push(`<b>Evasion:</b> it ${what} from ${pct(ev.chance)} of the ${from.join(', ')} it sees coming at it from the front.`);
  }
  return out;
}

/** One of the Ossuary Twins' fight, each with its figures (data/foes/twins.ts `TWINS` and its boss kit): its own attacks,
 *  and what the pair shares (one life, the chain). */
function twinsAttacks(foe: Foe): string[] {
  const d = foe.def, t = TWINS, kit = d.bossKit!, hit = damage(d, foe.from);
  const brother = d.shares ? ENEMIES[d.shares].name : 'its brother';
  const slab = foe.id === 'twinslab';
  const warn = (name: string): number => kit.attacks?.[name]?.warn ?? d.windup;
  const own = slab ? [
    `<b>Grave slam:</b> he lifts the tombstone for ${secs(warn('slam'))} over a ring ${metres(t.slam.radius * 2)} across, ${metres(t.slam.ahead)} before him, then brings it down for ${whole(hit)} ${typed(d)} damage.`,
    `<b>Shoulder charge:</b> at a hero up to ${metres(t.charge.reach)} away: its line is ringed for ${secs(warn('charge'))}, then he runs it at ${num(t.charge.speed)} m/s for ${whole(hit * t.charge.hurt)} damage to whoever he meets.`,
  ] : [
    `<b>Skull volley:</b> ${t.volley.least} to ${t.volley.most} skulls after ${secs(warn('volley'))}, each curving in on its own arc to where you stood, at ${num(t.volley.speed)} m/s, ${whole(hit)} damage each. It keeps 9 to 13 m off you.`,
    `<b>Mend:</b> once ${brother} has stood hurt and unhit for ${secs(t.mend.untouched)}, it raises its casket for ${secs(warn('mend'))} and mends the pair by ${pct(t.mend.heal)} of their life. A stun or a freeze breaks it.`,
  ];
  const belt = t.belt, bomb = t.bomb, poison = t.poison;
  const skulls = slab
    ? `<b>Bomb skulls:</b> ${belt.skulls} small skulls hang on a rope at his waist, and none come back. Every ${secs(belt.every)} at most, at a hero ${metres(belt.reach[0])} to ${metres(belt.reach[1])} away, he unhooks one and throws it on an arc to where you stood, a glow on the floor where it lands. It lies there ${secs(bomb.fuse)} rocking and glowing hotter as the glow draws in on it, then bursts for ${whole(hit * bomb.hurt)} damage within ${metres(bomb.radius)} and stuns you for ${secs(bomb.stun)}, no sooner than ${secs(bomb.rest)} after the last stun ends. A raised shield turned to it takes the blast and the stun. While it holds you, nothing else of the pair lands on you.`
    : `<b>Poison skulls:</b> ${belt.skulls} small skulls hang on a rope at its waist, and none come back. Every ${secs(belt.every)} at most, at a hero ${metres(belt.reach[0])} to ${metres(belt.reach[1])} away, it unhooks one and throws it on an arc to where you stood, a glow on the floor where it lands. It lies in a green cloud ${metres(poison.radius * 2)} across for ${secs(poison.life)}, letting gas out of its eyes and jaw and hurting a hero inside it ${whole(hit * poison.hurt)} damage every ${secs(poison.every)}.`;
  return [
    `<b>One life:</b> it shares its life with ${brother}: every hit on either takes it from both. At ${pct(0.5)} the one that has taken more falls, and the other moves ${pct(t.alone.faster - 1)} faster, attacks sooner and takes up its brother's attack too, and its brother's belt: it throws both kinds of skull, as many as its brother had left.`,
    ...own,
    skulls,
    `<b>The chain:</b> if the two drift more than ${metres(t.chain.max)} apart it snaps tight, dragging them together and dealing ${whole(damage(ENEMIES.twinslab, foe.from) * t.chain.hurt)} damage to a hero within ${metres(t.chain.reach)} of its line.`,
  ];
}

/** The Bell-Warden, the Ossuary Cantor's guard: its toll, its size, its ghost's dive and its dead, each with its
 *  figures (data/foes/bellwarden.ts `BELL_WARDEN`, its boss kit and its `asGuard`). */
function bellWardenAttacks(foe: Foe): string[] {
  const d = foe.def, b = BELL_WARDEN, t = b.toll, g = b.dive, r = b.raise, hit = damage(d, foe.from);
  const warn = d.bossKit?.attacks?.toll?.warn ?? d.windup;
  return [
    `<b>Toll:</b> the bell swings back and glows for ${secs(warn)}, then a ring rolls out to ${metres(t.reach)}. Within ${metres(t.stunsTo)} it stuns whoever it reaches for ${secs(t.stun)} and deals ${whole(hit * t.hurt)} ${typed(d)} damage. A shield raised towards it, a dash or a leap carries you through.`,
    `<b>A lesser bell:</b> well under half its Cantor's height, hovering where it rises; it never grows stronger as it is hurt.`,
    `<b>Its ghost:</b> come within ${metres(g.near)} of the bell and its ghost rises over you shrieking for ${secs(g.warn)}, then swoops down over ${secs(g.swoop)}. Still within ${metres(g.catch)} of where you stood, you're carried off and dropped for ${whole(hit * b.carry.hurt)} damage. Step aside as it swoops; it rests ${secs(g.every)} after each dive.`,
    `<b>It raises the dead:</b> ${secs(r.first)} after it rises, then every ${secs(r.every[0])} to ${secs(r.every[1])} while it stands, ${r.count[0]} to ${r.count[1]} ${ENEMIES[(d.summon ?? 'husk') as EnemyId].name}s climb out of the floor round it, at most ${r.ownMost} of its own up at once. They stop when it falls.`,
  ];
}

/** The Ossuary Cantor's fight, each with its figures (data/enemies.ts `CANTOR` and its boss kit). */
function cantorAttacks(foe: Foe): string[] {
  const d = foe.def, c = CANTOR, kit = d.bossKit!, hit = damage(d, foe.from);
  const hands = kit.attacks?.graveHands?.warn ?? d.windup, dirge = kit.attacks?.dirge?.warn ?? d.windup;
  const [, second, last] = kit.phases;
  const guard = BIOMES[foe.biome].bosses.find((rung) => rung.id === foe.id)?.guards;
  return [
    guard && kit.ward ? `<b>Warded:</b> while any of its ${guard.count} ${ENEMIES[guard.id].name}s stands it takes only ${pct(kit.ward.taken)} of the damage, a pale shell round it.` : '',
    `<b>Grave hands:</b> a ring of grave light ${metres(c.hands.radius * 2)} across under every hero, then ${secs(hands)} later bone hands tear up through it for ${whole(hit * c.hands.hurt)} ${typed(d)} damage. Step out of the ring.`,
    second ? `<b>The dirge</b> (under ${pct(second.below)}, in turn with the hands): ${c.dirge.count} rings marching out along a line to you, ${metres(c.dirge.apart)} apart, the first ${secs(dirge)} after it begins and each ${secs(c.dirge.step)} after the last, ${whole(hit * c.dirge.hurt)} damage each.` : '',
    last ? `<b>Under ${pct(last.below)}:</b> a dirge at every hero, a cast every ${secs(c.lastEvery)}.` : '',
    choirLine(foe, hit),
    `<b>Rising graves:</b> with each grave hands or dirge, ${c.graves.perVerse} gravestones push up out of the floor where a ring of grave light warns of them, at most ${c.graves.most} standing. They block your way and your shots as any prop does, break under ${c.graves.life} hits' wear, and sink back as it falls.`,
    `<b>Its bell-heart:</b> with its guards down, each cast leaves its ribs open and its heart bared for ${secs(c.bared)}, taking ${num(kit.weak?.taken ?? 2)}× damage.`,
    `<b>Never together:</b> its casts and its guards' tolls land at least ${secs(c.beat)} apart.`,
  ].filter(Boolean);
}

/** The Ossuary Cantor's choir's ring, with its figures, from the phase it begins in. */
function choirLine(foe: Foe, hit: number): string {
  const c = CANTOR.choir, kit = foe.def.bossKit!, from = kit.phases[c.fromPhase];
  if (!from) return '';
  const warn = kit.attacks?.choir?.warn ?? foe.def.windup;
  return `<b>The choir's ring</b> (under ${pct(from.below)}, every ${secs(c.every)} at most): ${c.singers} ghostly singers rise in a ring ${metres(c.radius)} round it over ${secs(warn)}; then for ${secs(c.lasts)} the ground outside the ring deals ${whole(hit * c.hurt)} ${typed(foe.def)} damage every ${secs(c.tick)}, as the ring tightens to ${metres(c.least)}. The ring stays where it rose, and it floats to its middle: fight it up close inside.`;
}

/** The Rootmother's fight, each with its figures (data/enemies.ts `ROOTMOTHER` and her boss kit). */
function rootmotherAttacks(foe: Foe): string[] {
  const d = foe.def, r = ROOTMOTHER, kit = d.bossKit!, hit = damage(d, foe.from);
  const warn = (name: string): number => kit.attacks?.[name]?.warn ?? d.windup;
  const [, late, rage] = kit.phases;
  const B = r.branch, chase = r.rage.chase;
  const brood = ENEMIES[(d.summon ?? 'thornling') as EnemyId].name;
  const spot = kit.weak?.spot?.taken ?? 1;
  return [
    `<b>Creeping vines:</b> her arms drawn back for ${secs(warn('vines'))}, then ${r.vines.count[0]} to ${r.vines.count[1]} vines crawl out from her roots along the floor at ${num(r.vines.speed)} m/s, each after a hero, turning slowly. Any of it that touches you holds you for ${secs(r.vines.hold)}; a dash or a blink tears you free, and one arrow cuts a vine whole.`,
    `<b>Thrown branches:</b> at a hero ${metres(B.near)} or more from her, or one a vine holds, her hand grows a thorned branch, her arm goes back for ${secs(warn('branch'))} and she hurls it end over end to where you stood; its landing is ringed on the floor while it flies. It deals ${whole(hit * B.hurt)} damage ${metres(B.splash)} round where it lands; step off the ring, or raise a shield towards her.`,
    `<b>Root cage:</b> at a hero who has stood within ${metres(r.cage.still.radius)} of one spot for ${secs(r.cage.still.time)}, at most every ${secs(r.cage.every)}, the earth cracks in a ring ${metres(r.cage.radius)} round him for ${secs(warn('cage'))}: walk out before it shuts. Then ${r.cage.roots} roots burst up and close over the ring for ${secs(r.cage.life)}; each breaks in ${r.cage.hits} hits (an arrow or a swing is one; Bull Rush breaks one outright), and one broken is a gap to step out by. A blink passes through, a charge breaks out, and a partner outside can cut you free. A great root rises beside it and falls across it ${secs(warn('crush'))} after it shuts, for ${whole(hit * r.cage.blow.hurt)} damage to whoever is still inside; a shield raised towards her blocks it as any blow.`,
    `<b>Her burrow:</b> she never walks. When the hero she goes for has been ${metres(r.burrow.far)} or more off for ${secs(r.burrow.farFor)}, or between sets of her attacks at most every ${secs(r.burrow.every)}, she drives her roots into the earth and sinks after them over ${secs(r.burrow.sink)}. A ridge of soil travels over her way under the floor at ${num(r.burrow.speed)} m/s; the ground where she will rise bulges and cracks for ${secs(r.burrow.warn)}, then her roots burst out and she rises over ${secs(r.burrow.rise)}, ${metres(r.burrow.ring[0])} to ${metres(r.burrow.ring[1])} from you, never on you. Rising harms no one. From half under until she rises nothing strikes her, and she attacks nothing.`,
    `<b>Seed pods:</b> she flings ${r.seeds.count} pods across the arena; each one left ${secs(r.seeds.hatch)} bursts into ${r.seeds.brood} ${brood}s. One hit of anything pops a pod.`,
    `<b>Thorns:</b> while you stand within ${metres(r.thorns.near)} of her, her arms rise for ${secs(warn('thorns'))} and thorns burst from the earth out to ${metres(r.thorns.radius)} for ${secs(r.thorns.last)}, dealing ${whole(hit * r.thorns.hurt)} ${typed(d)} damage every ${secs(r.thorns.tick)} to whoever stands in them.`,
    `<b>Her heart:</b> ${secs(r.heart.first)} after she rises and every ${secs(r.heart.every)} after, it opens in her trunk for ${secs(r.heart.open)}. Shots that strike it deal ${num(spot)}× damage; she attacks nothing meanwhile, flinging ${r.heart.pods} pods round the arena instead.`,
    late ? `<b>Under ${pct(late.below)}:</b> the canopy closes. Spore clouds ${metres(r.spores.radius)} wide drift over the floor, dealing ${whole(hit * r.spores.hurt)} damage every ${secs(r.spores.tick)} to whoever stands in one, and the earth cracks under a hero for ${secs(warn('erupt'))} before spikes burst from it, ${metres(r.erupt.radius)} round, for ${whole(hit * r.erupt.hurt)} damage. Her branches come three at a time, ${metres(B.apart)} apart across where you stood, ${whole(hit * B.fanHurt)} each.` : '',
    rage ? `<b>Under ${pct(rage.below)}, she rages:</b> her attacks come quicker; a line of ${5} branches lands across her line to you, ${whole(hit * B.lineHurt)} each, and stays ${secs(B.bramble)} as bramble that hurts ${whole(hit * B.brambleHurt)} every ${secs(B.brambleTick)}; and the earth bursts under you ${chase.count} times running, each ${secs(chase.warn)} after it cracks where you stand, for ${whole(hit * chase.hurt)}: keep running.` : '',
  ].filter(Boolean);
}

/** Elites: any common foe may come as one, from the wave they start to show. */
function eliteLine(foe: Foe): string {
  if (foe.def.boss) return '';
  const first = Array.from({ length: LAST_LOOKED }, (_, i) => i + 1).find((w) => WAVES.heroChance(w) > 0);
  if (!first) return '';
  return para(`<b>As an elite</b> (a glowing aura and a title such as "${HERO.prefixes[0]}"), from wave ${first}: ${whole(life(foe.def, Math.max(first, foe.from)) * HERO.lifeMult)} Health and ${whole(damage(foe.def, Math.max(first, foe.from)) * HERO.damageMult)} damage a blow at wave ${Math.max(first, foe.from)}, ${num(HERO.lifeMult)}× the Health and ${num(HERO.damageMult)}× the damage. Elites and bosses are not lured or carried off, and lightning does not daze them.`);
}

/** A boss's Health with a party, as bars, and its calls for help along a fight's first minute. */
function bossParty(foe: Foe): string {
  if (!foe.def.boss) return '';
  const lives = Array.from({ length: COOP.maxPlayers }, (_, i) => life(foe.def, foe.from) * partyScale(i + 1).boss);
  // (the boss behaviour's calls for help alone: a guard raises its dead on a clock of its own, told in its attacks)
  const summon = foe.def.ai === 'boss' && foe.def.summon && foe.def.summon in ENEMIES ? ENEMIES[foe.def.summon as EnemyId].name : '';
  return head(`Health with a party, wave ${foe.from}`) + partyBars(lives)
    + (summon ? head('Calls for help') + summonTimeline(summon) : '');
}

/** The foe at a glance: its Health, its blow, how much it deals a second, its speed (the hero's own marked) and its
 *  reach, each a bar against the largest of its kind (the common foes', or the bosses'), at wave 1. */
function glance(foe: Foe): string {
  const all = foes();
  const peers = (foe.def.boss ? all.bosses : all.common).map((p) => p.def);
  const most = (get: (d: EnemyDef) => number): number => Math.max(...peers.map(get), 1e-6);
  const d = foe.def;
  const dps = (x: EnemyDef): number => x.damage / Math.max(0.1, x.cooldown);
  const reach = (x: EnemyDef): number => (x.ai === 'slam' && x.throws ? x.throws.reach : x.range);
  const hero = G.player?.stats.moveSpeed;
  const fastest = Math.max(most((x) => x.speed), hero ?? 0);
  return head('At a glance') + bars([
    { label: 'Health', share: d.life / most((x) => x.life), text: whole(d.life), colour: 'var(--life-bar)' },
    { label: 'Blow', share: d.damage / most((x) => x.damage), text: whole(d.damage), colour: 'var(--danger)' },
    { label: 'A second', share: dps(d) / most(dps), text: whole(dps(d)), colour: 'var(--danger)' },
    { label: 'Speed', share: d.speed / fastest, text: d.speed > 0 ? `${num(d.speed)} m/s` : 'stands', colour: 'var(--highlight)',
      mark: hero ? { share: hero / fastest, label: 'you' } : undefined },
    { label: 'Reach', share: reach(d) / most(reach), text: metres(reach(d)), colour: 'var(--ally)' },
  ]) + `<p class="gd-note">At wave 1, against the ${foe.def.boss ? 'other bosses' : 'other foes'}; damage a second is a blow over the time between attacks.</p>`;
}

/** The words for each hero against it, the hero played first. */
function heroWays(note: FoeNote): string {
  if (!note.vs) return '';
  const mine = G.player?.cls.id;
  const ids = Object.keys(note.vs).filter((id) => CLASSES[id]).sort((a, b) => (a === mine ? -1 : b === mine ? 1 : 0));
  if (!ids.length) return '';
  return head('By hero') + `<ul class="gd-list plain">${ids.map((id) => `<li><b style="color:${CLASSES[id].accent}">${CLASSES[id].name}:</b> ${note.vs![id]}</li>`).join('')}</ul>`;
}

/** A foe's page. */
export function foePage(foe: Foe): string {
  const d = foe.def, note = foe.note;
  const hit = damage(d, foe.from);
  const you = againstHero(d, hit);
  let html = `<div class="gd-top">${pic(foe.id, 'gd-portrait')}`
    + `<div class="gd-title"><h2 style="${d.accent ? `color:${css(d.accent)}` : ''}">${d.name}</h2>`
    + `<div class="gd-sub">${note.role} · ${BIOMES[foe.biome].title}</div>`
    + `<p class="gd-p">${note.does}</p>`
    + `<p class="gd-ai">${AI_NOTES[d.ai] ?? ''}</p></div></div>`;
  html += `<div class="gd-glance">${glance(foe)}</div>`;
  html += head('Figures') + figures(foe);
  if (you) html += para(`<b>Its blow against you now:</b> ${you} at wave ${foe.from}.`);
  html += points('Attacks', attacks(foe));
  html += eliteLine(foe) + bossParty(foe);
  html += points('Strengths', note.strengths, 'bad');
  html += points('Weaknesses', note.weaknesses, 'good');
  html += points('How to beat it', note.beat);
  html += heroWays(note);
  return html;
}
