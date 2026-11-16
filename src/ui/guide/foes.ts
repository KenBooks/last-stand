// The guide's foes and bosses: every foe a wave brings, its figures from the game's data (data/enemies.ts, its growth
// by wave, the biome that brings it and from which wave, how it throws, dodges and calls help) and how to fight it
// (data/guide.ts). Its blow against the hero's own armour and resistance is worked out as the page opens.
import { BIOMES, BIOME_IDS, type BiomeId } from '../../data/biomes';
import { BOSS_AI, ENEMIES, HERO, SCALING, type EnemyId } from '../../data/enemies';
import { WAVES } from '../../data/waves';
import { DAMAGE_COLORS, partyScale, COOP } from '../../data/balance';
import { AI_NOTES, FOE_NOTES, type FoeNote } from '../../data/guide';
import { CLASSES } from '../../data/classes/index';
import { G } from '../../state';
import type { EnemyDef } from '../../types';
import { css, head, metres, num, para, pct, points, secs, tile, tiles, whole } from './parts';
import { bars, partyBars, summonTimeline, telegraph } from './diagrams';

/** the wave a foe's figures are shown at besides the first, to show how it grows */
const LATER = 10;
/** the furthest wave looked through for the first a foe comes in */
const LAST_LOOKED = 60;

/** A foe a wave brings: its id, its data, its note, and where it's met first. */
export interface Foe { id: Exclude<EnemyId, 'dummy'>; def: EnemyDef; note: FoeNote; biome: BiomeId; from: number }

/** Every foe a wave brings, by the biome that brings it first and the wave it comes in, the bosses apart. */
export function foes(): { common: Foe[]; bosses: Foe[] } {
  const common: Foe[] = [], bosses: Foe[] = [];
  for (const [id, def] of Object.entries(ENEMIES) as [EnemyId, EnemyDef][]) {
    if (id === 'dummy' || def.dummy) continue;
    const met = metAt(id);
    if (!met) continue;
    const foe: Foe = { id, def, note: FOE_NOTES[id], ...met };
    (def.boss ? bosses : common).push(foe);
  }
  return { common, bosses };
}

/** Where `id` is met first: the first biome whose pool or boss has it, and the first wave there. */
function metAt(id: EnemyId): { biome: BiomeId; from: number } | null {
  for (const biome of BIOME_IDS) {
    if (BIOMES[biome].boss === id) return { biome, from: WAVES.bossEvery };
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
    tile('Speed', `${num(d.speed)} m/s`, pace(d)),
    tile('Reach', metres(d.range), d.ai === 'ranged' ? `keeps ${metres(d.keepAway ?? 8)} away` : 'its blow'),
    tile('Wind-up', secs(d.windup), 'your time to get out of it'),
    tile('Between attacks', secs(d.cooldown)),
  ];
  if (d.knockbackResist) items.push(tile('Knockback', `${pct(d.knockbackResist)} resisted`, d.knockbackResist >= 1 ? 'never moved' : ''));
  if (d.freezeResist) items.push(tile('Freezes, dazes', `${pct(d.freezeResist)} shorter`));
  if (d.boss) items.push(tile('Comes', `every ${WAVES.bossEvery}th wave`, BIOMES[foe.biome].title));
  else items.push(tile('First seen', `wave ${foe.from}`, BIOMES[foe.biome].title));
  return tiles(items);
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
  if (d.boss) {
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
  const summon = foe.def.summon && foe.def.summon in ENEMIES ? ENEMIES[foe.def.summon as EnemyId].name : '';
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
    { label: 'Speed', share: d.speed / fastest, text: `${num(d.speed)} m/s`, colour: 'var(--highlight)',
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
  let html = `<div class="gd-top"><img class="gd-portrait" data-foe="${foe.id}" alt="" width="160" height="160">`
    + `<div class="gd-title"><h2 style="${d.accent ? `color:${css(d.accent)}` : ''}">${d.name}</h2>`
    + `<div class="gd-sub">${note.role} · ${BIOMES[foe.biome].title}</div>`
    + `<p class="gd-p">${note.does}</p>`
    + `<p class="gd-ai">${AI_NOTES[d.ai] ?? ''}</p></div></div>`;
  const summon = d.summon && d.summon in ENEMIES ? ENEMIES[d.summon as EnemyId].name : '';
  html += `<div class="gd-pair"><div>${glance(foe)}</div><div>${head('Its attacks, seen from above')}${telegraph(d, summon)}</div></div>`;
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
