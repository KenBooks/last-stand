// The guide's heroes: each class's page, made from its data (data/classes): its own figures, every skill as its
// tooltip states it (ui/tooltip.ts: the hero's own figures for the class played, the base ones for the others), the
// ways of holding its gear and the skills each gives (loot/loadout.ts, with gear made from its own item bases), its
// staffs' schools, the gear it wears, and the loadouts and combos of data/guide.ts whose skills it has.
import { SLOTS, SLOT_INFO } from '../../data/items';
import { SCHOOLS } from '../../data/schools';
import { CLASS_NOTES, SCHOOL_NOTES, STYLE_NOTES, STYLE_TRIES, type ClassNote } from '../../data/guide';
import { basesFor, gearOf, makeItem } from '../../loot/items';
import { SKILL_KEYS, defaultLoadout, forStyle, weaponStyle, type Loadout } from '../../loot/loadout';
import { G } from '../../state';
import { skillTooltip } from '../tooltip';
import { skillIconHTML } from '../skillArt';
import { itemIconSVG } from '../itemIcons';
import type { ClassDef, Item, Profile, SkillDef, SkillKey } from '../../types';
import { esc, head, pic, keyCap, keyName, num, para, points, secs, whole } from './parts';
import { bars, keySequence } from './diagrams';
import { skillHits } from '../skillDamage';
import { CLASSES } from '../../data/classes/index';

const EMPTY_NOTE: ClassNote = { overview: '', tips: [], skills: {}, loadouts: [], combos: [] };

/** A class's notes (none yet: an empty one, its page made from its data alone). */
export const classNote = (cls: ClassDef): ClassNote => CLASS_NOTES[cls.id] ?? EMPTY_NOTE;

/** Each of the class's skills once (the draught is listed under several keys' defaults alike). */
const skillsOf = (cls: ClassDef): SkillDef[] => cls.skills.filter((s, i) => cls.skills.findIndex((o) => o.impl === s.impl) === i);
const skillOf = (cls: ClassDef, impl: string | null): SkillDef | undefined => (impl ? cls.skills.find((s) => s.impl === impl) : undefined);
/** whether the page is of the hero being played: his own figures then */
const played = (cls: ClassDef): boolean => G.player?.cls.id === cls.id;

/** A skill's chip: its icon and name. */
function chip(def: SkillDef | undefined): string {
  if (!def) return '<span class="gd-chip none">—</span>';
  return `<span class="gd-chip" style="--c:${def.icon.color}"><span class="gd-ic">${skillIconHTML(def)}</span>${def.name}</span>`;
}

/** A loadout as a row of keys, each with its skill. */
function keysRow(cls: ClassDef, l: Partial<Loadout>): string {
  return `<div class="gd-keys">${SKILL_KEYS.filter((k) => k in l).map((k) => `<div class="gd-kslot">${keyCap(k)}${chip(skillOf(cls, l[k] ?? null))}</div>`).join('')}</div>`;
}

/** The class's own figures, each a bar against the largest of every hero's. */
function baseFigures(cls: ClassDef): string {
  const b = cls.base;
  const most = (get: (x: ClassDef['base']) => number): number => Math.max(...Object.values(CLASSES).map((c) => get(c.base)), 1e-6);
  const bar = (label: string, get: (x: ClassDef['base']) => number, text: string, colour: string) =>
    ({ label, share: get(b) / most(get), text, colour });
  return head('Against the other heroes') + bars([
    bar('Health', (x) => x.life, `${whole(b.life)} · +${num(b.lifeRegen)}/s`, 'var(--life-bar)'),
    bar('Energy', (x) => x.energy, `${whole(b.energy)} · +${num(b.energyRegen)}/s`, 'var(--energy-bar)'),
    bar('Speed', (x) => x.moveSpeed, `${num(b.moveSpeed)} m/s`, 'var(--highlight)'),
    bar('Critical', (x) => x.crit, `${num(b.crit)}% · +${whole(b.critDmg)}%`, 'var(--accent)'),
    bar('Armour', (x) => x.armor, `${num(b.armor)}% physical`, 'var(--frame)'),
    bar('Resistance', (x) => x.resist, `${num(b.resist)}% magic`, 'var(--ally)'),
  ]) + (cls.hall ? `<div class="gd-traits">${cls.hall.traits.map((t) => `<span>${t.label} <i style="--v:${t.value}"></i></span>`).join('')}</div>` : '');
}

/** Every skill as its tooltip states it, with the class's own advice under it. */
function skillCards(cls: ClassDef, note: ClassNote): string {
  const mine = played(cls);
  const cards = skillsOf(cls).map((def) => {
    const card = skillTooltip(def, mine)().html;
    const tip = note.skills[def.impl];
    return `<div class="gd-skill"><div class="gd-skey">${keyCap(def.key)}<span class="gd-ic big">${skillIconHTML(def)}</span></div>`
      + `<div class="gd-scard">${card}${tip ? `<div class="gd-tip">${tip}</div>` : ''}</div></div>`;
  });
  const whose = mine ? 'Figures are yours now, with your gear and attributes.' : `Base figures, before gear. Play the ${cls.name} to see your own.`;
  return head('Skills') + para(`<span class="gd-dim">${whose}</span>`) + `<div class="gd-skills">${cards.join('')}</div>`;
}

/** An item of `base` for its icon. */
const sample = (cls: ClassDef, slot: Item['slot'], base: string): Item => makeItem({ slot, cls, base, rarity: 'rare' });

/** The item bases' icons and names. */
const baseRow = (cls: ClassDef, slot: Item['slot'], bases: string[]): string =>
  `<div class="gd-bases">${bases.map((b) => `<span class="gd-base"><span class="gd-bic">${itemIconSVG(sample(cls, slot, b))}</span>${b}</span>`).join('')}</div>`;

/** A style's figures changed from the skill's own (a great weapon's slower, heavier blows...). */
function tuned(cls: ClassDef, style: string, l: Loadout): string {
  const out: string[] = [];
  for (const k of SKILL_KEYS) {
    const def = skillOf(cls, l[k]);
    const t = def?.styles?.[style as keyof NonNullable<SkillDef['styles']>];
    if (!def || !t) continue;
    const as = forStyle(def, style as never);
    const bits = [as.damage !== def.damage && `base damage ${whole(as.damage ?? 0)} (from ${whole(def.damage ?? 0)})`,
      as.castTime !== def.castTime && `${secs(as.castTime)} a swing (from ${secs(def.castTime)})`,
      as.gain !== def.gain && `+${as.gain} Energy a hit`, as.spin !== def.spin && `spins at ${num(as.spin ?? 0)} rad/s (from ${num(def.spin ?? 0)})`].filter(Boolean);
    if (bits.length) out.push(`<b>${def.name}:</b> ${bits.join(', ')}.`);
  }
  return out.length ? `<ul class="gd-list plain">${out.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
}

/** The ways of holding a class's gear that change its skills: tried with gear of its own bases, each shown where it
 *  gives a loadout no way before it has. */
function styles(cls: ClassDef): string {
  if (cls.schools || !cls.skills.some((s) => s.needs)) return '';
  const weapons = basesFor('weapon', cls);
  const two = weapons.filter((b) => cls.twoHanded?.includes(b)), one = weapons.filter((b) => !cls.twoHanded?.includes(b));
  const shields = basesFor('offhand', cls);
  const seen = new Set<string>();
  const out: string[] = [];
  const cols: { name: string; l: Loadout }[] = [];
  for (const t of STYLE_TRIES) {
    if ((t.weapon === 'two' && !two.length) || (t.weapon === 'one' && !one.length)) continue;
    if (t.off === 'one' && !(cls.dualWield && one.length)) continue;
    if (t.off === 'shield' && !shields.length) continue;
    const equipped: Profile['equipped'] = {};
    if (t.weapon) equipped.weapon = sample(cls, 'weapon', t.weapon === 'two' ? two[0] : one[0]);
    if (t.off === 'shield') equipped.offhand = sample(cls, 'offhand', shields[0]);
    if (t.off === 'one') equipped.offhand = { ...sample(cls, 'weapon', one[0]) };
    const gear = gearOf(cls, equipped);
    const style = weaponStyle(cls, gear) ?? '';
    const l = defaultLoadout(cls, gear);
    const sig = JSON.stringify(l);
    if (seen.has(sig)) continue;
    seen.add(sig);
    const note = STYLE_NOTES[t.id] ?? STYLE_NOTES[style];
    cols.push({ name: note?.name ?? t.id, l });
    const held = [t.weapon === 'two' ? baseRow(cls, 'weapon', two) : t.weapon === 'one' ? baseRow(cls, 'weapon', one) : '',
      t.off === 'shield' ? baseRow(cls, 'offhand', shields) : t.off === 'one' ? '<span class="gd-dim">and a second one-handed weapon</span>' : ''].join('');
    out.push(`<div class="gd-style"><h4>${note?.name ?? esc(t.id)}</h4>${note?.how ? para(note.how) : ''}`
      + (held ? `<div class="gd-held">${held}</div>` : `<div class="gd-dim">Nothing in either hand.</div>`)
      + keysRow(cls, l) + tuned(cls, style, l)
      + `<div class="gd-pros">${points('Strengths', note?.strengths ?? [], 'good')}${points('Weaknesses', note?.weaknesses ?? [], 'bad')}</div></div>`);
  }
  return out.length ? head('Weapon styles') + para('What you hold changes some of your skills. Equip a different weapon or off-hand and those keys change with it; each style keeps its own loadout.')
    + compare(cols.map((c) => c.name), SKILL_KEYS.map((k) => ({ label: keyCap(k), cells: cols.map((c) => chip(skillOf(cls, c.l[k] ?? null))), differs: new Set(cols.map((c) => c.l[k])).size > 1 })))
    + out.join('') : '';
}

/** A class whose weapons have schools (the mage's staffs): each school's spell, and none held. */
function schools(cls: ClassDef): string {
  const sc = cls.schools;
  if (!sc) return '';
  const mine = played(cls);
  const bases = basesFor('weapon', cls);
  const cols: { title: string; colour: string; spell?: SkillDef }[] = [];
  const rows = [...sc.roll, 'bare' as const].map((school) => {
    const equipped: Profile['equipped'] = school === 'bare' ? {} : { weapon: makeItem({ slot: 'weapon', cls, base: bases[0], school }) };
    const l = defaultLoadout(cls, gearOf(cls, equipped));
    const spell = skillOf(cls, school === 'bare' ? sc.bare : l.mouse0);
    const note = SCHOOL_NOTES[school];
    const colour = school === 'bare' ? 'var(--ink)' : '#' + SCHOOLS[school].color.toString(16).padStart(6, '0');
    const title = school === 'bare' ? 'No staff' : `School of ${SCHOOLS[school].name}`;
    const card = spell ? skillTooltip(spell, mine)().html : '';
    cols.push({ title, colour, spell });
    return `<div class="gd-style" style="--c:${colour}"><h4 style="color:${colour}">${title}</h4>${note ? para(note.how) : ''}`
      + `<div class="gd-scard">${card}</div>`
      + `<div class="gd-pros">${points('Strengths', note?.strengths ?? [], 'good')}${points('Weaknesses', note?.weaknesses ?? [], 'bad')}</div></div>`;
  });
  return head('Staffs and their schools')
    + para(`Every weapon you find is attuned to a school, shown by its crystal's colour and its tooltip. The school, not the weapon's name, decides the spell on your left click: any of ${bases.join(', ')} can carry any school.`)
    + baseRow(cls, 'weapon', bases) + schoolTable(cols)
    + '<p class="gd-note">A second on one foe: a hit over its cast (a held charge at its fullest), before gear; splits, bursts on a pack and burns add more.</p>'
    + rows.join('');
}

/** The schools' spells side by side: what each deals a second on one foe (its first kind of hit as the skill's own code
 *  states it, `skillHits`, over its cast and draw), how it's cast, how wide, and its cost. */
function schoolTable(cols: { title: string; colour: string; spell?: SkillDef }[]): string {
  const hits = (d?: SkillDef): number => {
    const h = d ? skillHits(d, null)[0] : undefined;
    if (!d || !h) return 0;
    return h.rate ? h.base * h.rate : h.base / Math.max(0.1, d.castTime + (d.draw ?? 0));
  };
  const most = Math.max(...cols.map((c) => hits(c.spell)), 1);
  const cast = (d?: SkillDef): string => (!d ? '—' : d.channel ? 'held, a beam' : d.draw ? `held up to ${secs(d.draw)}` : secs(d.castTime));
  const what = (d?: SkillDef): string => {
    if (!d) return '—';
    if (d.heal && !d.damage) return `<span class="gd-heal">heals ${whole(d.heal)}/s</span>`;
    return `${whole(hits(d))}<span class="gd-cell-bar" style="--v:${(hits(d) / most) * 100}%"></span>`;
  };
  return compare(cols.map((c) => `<span style="color:${c.colour}">${c.title.replace('School of ', '')}</span>`), [
    { label: 'Left click', cells: cols.map((c) => chip(c.spell)) },
    { label: 'A second, one foe', cells: cols.map((c) => what(c.spell)) },
    { label: 'Cast', cells: cols.map((c) => cast(c.spell)) },
    { label: 'Area', cells: cols.map((c) => (c.spell?.radius ? `${num(c.spell.radius)} m round` : c.spell?.width ? `a ${num(c.spell.width)} m line` : c.spell?.splitCount ? `splits in ${c.spell.splitCount}` : 'one target')) },
    { label: 'Energy', cells: cols.map((c) => (!c.spell?.cost ? 'none' : `${c.spell.cost}${c.spell.channel ? '/s' : ''}`)) },
  ]);
}

/** A table of things side by side: a column each, a row each, the rows that differ marked. */
function compare(titles: string[], rows: { label: string; cells: string[]; differs?: boolean }[]): string {
  return `<div class="gd-compare"><table><thead><tr><th></th>${titles.map((t) => `<th>${t}</th>`).join('')}</tr></thead><tbody>`
    + rows.map((r) => `<tr${r.differs ? ' class="differs"' : ''}><th>${r.label}</th>${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
    + '</tbody></table></div>';
}

/** The gear the class wears: each slot's bases, and what each slot gives of its own. */
function gear(cls: ClassDef): string {
  const rows = SLOTS.filter((s) => !cls.excludeSlots?.includes(s)).map((slot) => {
    const bases = basesFor(slot, cls);
    const two = slot === 'weapon' ? bases.filter((b) => cls.twoHanded?.includes(b)) : [];
    const twoNote = two.length === bases.length && two.length ? ' (two-handed)' : two.length ? ` (${two.join(', ')} two-handed)` : '';
    return `<div class="gd-gslot"><span class="gd-tl">${SLOT_INFO[slot].label}${twoNote}</span>${baseRow(cls, slot, bases)}</div>`;
  });
  return head('Gear') + `<div class="gd-gear">${rows.join('')}</div>`;
}

/** The loadouts of the notes whose every skill the class has. */
function loadouts(cls: ClassDef, note: ClassNote): string {
  const has = (impl: string): boolean => cls.skills.some((s) => s.impl === impl);
  const ok = note.loadouts.filter((l) => Object.values(l.keys).every((impl) => !impl || has(impl)));
  if (!ok.length) return '';
  return head('Loadouts that work') + para('<span class="gd-dim">Bind any skill to any key in the inventory: click a key, then a skill.</span>')
    + ok.map((l) => `<div class="gd-load"><h4>${l.name}</h4>${keysRow(cls, l.keys as Partial<Loadout>)}${para(l.why)}</div>`).join('');
}

/** The combos of the notes whose every skill the class has, each step by the key it's on by default. */
function combos(cls: ClassDef, note: ClassNote): string {
  const ok = note.combos.filter((c) => c.steps.every((impl) => skillOf(cls, impl)));
  if (!ok.length) return '';
  const step = (impl: string) => { const def = skillOf(cls, impl)!; return { key: keyName(def.key as SkillKey), icon: skillIconHTML(def), name: def.name, colour: def.icon.color }; };
  return head('Combos') + ok.map((c) => `<div class="gd-combo"><h4>${c.name}</h4>${keySequence(c.steps.map(step))}${para(c.how)}</div>`).join('');
}

/** A class's page. */
export function heroPage(cls: ClassDef): string {
  const note = classNote(cls);
  let html = `<div class="gd-top">${pic(`hero:${cls.id}`, 'gd-portrait')}`
    + `<div class="gd-title"><h2 style="color:${cls.accent}">${cls.name}</h2>`
    + `<div class="gd-sub">${cls.hall?.role ?? ''}</div><p class="gd-p"><i>${cls.tagline}</i></p></div></div>`;
  html += baseFigures(cls);
  if (note.overview) html += head('How to play') + para(note.overview);
  html += points('Tips', note.tips);
  html += skillCards(cls, note);
  html += styles(cls) + schools(cls);
  html += loadouts(cls, note) + combos(cls, note);
  html += gear(cls);
  return html;
}

/** What a class's notes are missing (a skill with no advice, no notes at all), for the dev build's warning. */
export function missingNotes(cls: ClassDef): string[] {
  const note = CLASS_NOTES[cls.id];
  if (!note) return [`class ${cls.id}`];
  return skillsOf(cls).filter((s) => !note.skills[s.impl]).map((s) => `${cls.id} skill ${s.impl}`);
}
