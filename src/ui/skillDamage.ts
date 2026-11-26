// A skill's damage as its tooltip shows it: what each kind of its hits deals the hero now, the roll's spread from his
// modifiers, a crit's chance and share, and what it's made of. The hits come from the skill's own code (`hits` in
// combat/skills), the modifiers from the damage roll's own (`damageBonuses`), so what the tooltip says is what lands.
import { SKILL_IMPLS } from '../combat/skills';
import { DAMAGE_ROLL, damageBonuses, damageScale } from '../combat/damage';
import { NUMBER_COLORS } from '../data/balance';
import { threadHeal } from '../combat/skills/lifethread';
import type { SkillHit } from '../combat/skills/types';
import type { DerivedStats, SkillDef } from '../types';

/** A hero with no modifiers at all: a skill's base figures (another save's, whose gear isn't the hero's). */
const BARE: DerivedStats = {
  maxLife: 0, maxEnergy: 0, lifeRegen: 0, energyRegen: 0, moveSpeed: 0, crit: 0, critDmg: 0, armor: 0, resist: 0,
  damagePct: 0, arcanePct: 0, elementalPct: 0, castSpeed: 0, cdr: 0, leech: 0, block: 0, blockAmount: 0,
};

const whole = (v: number): string => String(Math.round(v));
/** a share as a percentage, to a tenth where it has one (0.01: 1, 0.025: 2.5) */
const pctOf = (share: number): string => String(Number((share * 100).toFixed(1)));
/** `v` rolled from its low to its high share, as `low–high` */
const rolled = (v: number): string => `${whole(v * DAMAGE_ROLL.low)}–${whole(v * DAMAGE_ROLL.high)}`;
/** a time in s, to two places at most */
const secs = (v: number): string => `${Number(v.toFixed(2))} s`;

/** The kinds of hit `def` deals a hero of `stats` (none for a skill that deals no damage). */
export function skillHits(def: SkillDef, stats: DerivedStats | null): SkillHit[] {
  return SKILL_IMPLS[def.impl]?.hits?.(def, stats ?? BARE) ?? [];
}

/** One kind of hit's line: its damage per hit as it rolls (and, dealt over time, a second), of its type. */
function hitLine(hit: SkillHit, scale: number): string {
  const each = hit.base * scale;
  const type = `<span style="color:${NUMBER_COLORS[hit.type]}">${hit.type}</span>`;
  const per = `<b class="tt-each">${rolled(each)}</b>`;
  const line = hit.rate
    ? `<b class="tt-second">${rolled(each * hit.rate)}</b> ${type} damage a second: ${per} per ${hit.per}, every ${secs(1 / hit.rate)}`
    : `${per} ${type} damage per ${hit.per}`;
  // (the least share a hit of it deals, which its note tells in words, for a harness: tools/lab `tooltips`)
  const least = hit.least !== undefined && hit.least < 1 ? ` data-least="${hit.least}"` : '';
  return `<div class="tt-hit"${least}>${line}</div>${hit.note ? `<div class="tt-note">${hit.note}</div>` : ''}`;
}

/** What the figures are made of: each hit's base, the modifiers its tags take, the roll's spread. */
function madeOf(def: SkillDef, hits: SkillHit[], stats: DerivedStats): string {
  // (a skill's hits all take its tags but Iron Bellow's, whose one hit takes a blow's)
  const bonuses = damageBonuses(stats, hits[0].tags ?? def.tags);
  const bases = hits.map((hit) => (hit.rate ? `${whole(hit.base * hit.rate)} a second` : `${whole(hit.base)} per ${hit.per}`));
  // (what the weapons held add to its base, where its style says: Bull Rush's shield)
  const style = def.styleNote ? ` (${def.styleNote})` : '';
  const parts = [`Base ${bases.join(', ')}${style}`];
  if (bonuses.all) parts.push(`+${whole(bonuses.all)}% all damage`);
  if (bonuses.arcane) parts.push(`+${whole(bonuses.arcane)}% arcane`);
  if (bonuses.elemental) parts.push(`+${whole(bonuses.elemental)}% elemental`);
  const spread = Math.round((DAMAGE_ROLL.high - 1) * 100);
  parts.push(`±${spread}%`);
  return `<div class="tt-made">${parts.join(' · ')}</div>`;
}

/**
 * The damage block of `def`'s tooltip for a hero of `stats` (null: its base figures alone): each kind of its hits
 * with what it deals now, what that's made of, and a crit's chance and share. Empty for a skill that deals none.
 */
export function skillDamageHTML(def: SkillDef, stats: DerivedStats | null): string {
  const s = stats ?? BARE;
  const hits = skillHits(def, s);
  if (!hits.length) return '';
  let html = '<div class="tt-dmg">';
  for (const hit of hits) html += hitLine(hit, damageScale(s, hit.tags ?? def.tags));
  html += madeOf(def, hits, s);
  if (s.crit > 0) {
    html += `<div class="tt-crit">Critical hit: <b>${Number(s.crit.toFixed(1))}%</b> chance for <b>+${whole(s.critDmg)}%</b> damage</div>`;
  }
  return html + '</div>';
}

/** A healing skill's figure for a hero of `stats`: what it restores now (empty without a hero: its text says how). */
export function skillHealHTML(def: SkillDef, stats: DerivedStats | null): string {
  if (!stats || !def.heal) return '';
  // (a healing beam: a second's healing, its flat part raised by the healer's All Damage and its share of the healed
  // one's most Health not, then by its ramp held on one ally, as skills/lifethread.ts heals)
  if (def.channel) {
    const each = threadHeal({ heal: def.heal }, stats.damagePct, 0);
    const by = stats.damagePct ? ` · +${whole(stats.damagePct)}% all damage` : '';
    const pct = def.healPct ?? 0;
    const share = pct ? ` and <b class="tt-heal">${pctOf(pct)}%</b> of their most Health` : '';
    const onSelf = pct ? ` (${whole(each + stats.maxLife * pct)} a second on you)` : '';
    const ramp = def.ramp;
    const grows = ramp
      ? `<div class="tt-note">Held on one ally, +${pctOf(ramp.perSecond)}% a second, up to ×${ramp.most} after `
        + `${Number(((ramp.most - 1) / ramp.perSecond).toFixed(1))} s; another ally starts it again</div>`
      : '';
    const bonus = def.passBonus ? `, +${pctOf(def.passBonus)}% for each healer it passes` : '';
    const passes = `<div class="tt-note">A healer at full Health passes it on down their own beam${bonus}</div>`;
    return `<div class="tt-dmg"><div class="tt-hit">Restores <b class="tt-heal">${whole(each)}</b> Health a second`
      + `${share}${onSelf}</div>${grows}${passes}<div class="tt-note">Base ${def.heal} a second${by}</div></div>`;
  }
  const pct = def.healPct ?? 0;
  const healed = def.heal + stats.maxLife * pct;
  const of = pct ? `: ${def.heal} and ${Math.round(pct * 100)}% of your ${whole(stats.maxLife)}` : '';
  return `<div class="tt-dmg"><div class="tt-hit">Restores <b class="tt-heal">${whole(healed)}</b> Health${of}</div></div>`;
}

/** A charge's trade-offs (`SkillDef.push`, `SkillDef.ram`, combat/ram.ts): how much it carries before it stops and
 *  what each foe takes of its speed, and the stun ramming a crowd leaves the hero in, as the weapons held tune it (a
 *  shield's is shorter). Empty for a skill that doesn't ram. */
export function skillRamHTML(def: SkillDef): string {
  const { push, ram } = def;
  if (!push && !ram) return '';
  const lines: string[] = [];
  if (push) {
    lines.push(`Each foe carried slows you by ${Math.round(push.slow * 100)}%, and ${push.most} of them stop you; a boss stops you`
      + ' at once. Your All Damage lightens the load.');
  }
  if (ram) {
    lines.push(`Ramming ${Math.ceil(ram.at)} foes or more staggers you as you stop for ${secs(ram.least)}, up to`
      + ` ${secs(ram.most)}: you can't move, attack or cast. Elites, big foes and bosses count for more, a foe it`
      + ' kills less.');
  }
  return `<div class="tt-foot tt-ram">${lines.join(' ')}</div>`;
}

/** A wall's figures (the ranger's Hedgeward, `SkillDef.wall`): a breakable prop's, so its life in the props' own hits,
 *  how long it stands and how wide it is. */
export function skillWallHTML(def: SkillDef, _wave: number): string {
  if (!def.wall) return '';
  const lasts = def.duration ? ` for ${secs(def.duration)}` : ' until broken or the wave is cleared';
  return `<div class="tt-dmg"><div class="tt-hit">Stands${lasts}, broken as any prop: <b class="tt-wall">${whole(def.wall.life)}</b>`
    + ' arrows or blows, fewer blasts; a big foe walking into it breaks it</div>'
    + `<div class="tt-note">${def.wall.width} m wide, ${def.wall.height} m tall</div></div>`;
}

/** A warding skill's figure for a hero of `stats`: the blows its ward absorbs now (Iron Bellow's, a share of his most
 *  Health; empty without a hero: its text says how). */
export function skillWardHTML(def: SkillDef, stats: DerivedStats | null): string {
  if (!stats || !def.absorbPct) return '';
  const ward = stats.maxLife * def.absorbPct;
  const of = `${Math.round(def.absorbPct * 100)}% of your ${whole(stats.maxLife)} Health`;
  const lasts = def.duration ? ` for ${secs(def.duration)}` : '';
  return `<div class="tt-dmg"><div class="tt-hit">Absorbs <b class="tt-ward">${whole(ward)}</b> damage${lasts}: ${of}</div></div>`;
}
