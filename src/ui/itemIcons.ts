// Hand-authored SVG item icons (64x64), one per item base type. Icons share a
// single hidden <defs> block of gradients and filters (injected once), so each
// icon is a small string of shapes. Gems and glows take the item's rarity color.
import { RARITIES, SLOT_INFO } from '../data/items';
import { rarityOf, basesFor } from '../loot/items';
import { schoolCss } from '../data/schools';
import type { ClassDef, Item, RarityId, School, Slot } from '../types';

const RARITY_IDS: RarityId[] = RARITIES.map((r) => r.id);
const SCHOOL_IDS: School[] = ['arcane', 'fire', 'lightning', 'healing'];

/** Cloth palettes, picked per item (stable via its id) for variety. */
const CLOTHS = ['clothIndigo', 'clothCrimson', 'clothTeal', 'clothUmber'] as const;

let defsInjected = false;
let defs = '';

/** The icons' shared gradients and filters, as `<defs>` markup (made once). */
function iconDefs(): string {
  if (defs) return defs;
  // (a weapon with a school: its gem and glow in the school's colour, its crystal's, #402; its rarity is its slot's)
  const gem = (r: RarityId | School, c = rarityOf(r as RarityId).color) => {
    return `<radialGradient id="gem-${r}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".35"/></radialGradient>
      <radialGradient id="aura-${r}"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset=".55" stop-color="${c}" stop-opacity=".12"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  };
  const lin = (id: string, a: string, b: string, c?: string) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/>${c ? `<stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>` : `<stop offset="1" stop-color="${b}"/>`}</linearGradient>`;
  defs = `<defs>
    ${lin('gold', '#fff3c4', '#d4a64a', '#6e4a18')}
    ${lin('steel', '#f2f6ff', '#8f99ab', '#343a46')}
    ${lin('darksteel', '#9aa3b4', '#4a505e', '#1c1f26')}
    ${lin('wood', '#a8744a', '#6a4424', '#321c0c')}
    ${lin('bone', '#fbf3dc', '#cfc09a', '#7f6e4c')}
    ${lin('leather', '#a06a44', '#6a4026', '#2e1a0e')}
    ${lin('paper', '#fff8e4', '#e2d2a8', '#a38c5c')}
    ${lin('clothIndigo', '#7d86e8', '#2c3290', '#12143e')}
    ${lin('clothCrimson', '#e2566a', '#8e1a2c', '#3a0812')}
    ${lin('clothTeal', '#5fe0bd', '#1c7a64', '#0a2e26')}
    ${lin('clothUmber', '#c89868', '#6e4a2c', '#2c1a0c')}
    ${lin('crystal', '#ffffff', '#9fe8ff', '#2a6aa8')}
    ${RARITY_IDS.map((r) => gem(r)).join('')}
    ${SCHOOL_IDS.map((s) => gem(s, schoolCss(s))).join('')}
    <radialGradient id="shine" cx="30%" cy="25%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="icoShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity=".75"/></filter>
    <filter id="icoGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>`;
  return defs;
}

/** Inject the shared gradient/filter definitions (idempotent). */
export function initItemIcons(): void {
  if (defsInjected) return;
  defsInjected = true;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = iconDefs();
  document.body.prepend(svg);
}

type Draw = (g: string, cloth: string) => string;

// Small building blocks ------------------------------------------------------
const gemAt = (cx: number, cy: number, r: number, g: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r * 2.4}" fill="url(#aura-${g})"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gem-${g})" stroke="#1a1208" stroke-width=".8"/>` +
  `<circle cx="${cx - r * 0.35}" cy="${cy - r * 0.4}" r="${r * 0.3}" fill="#fff" opacity=".85"/>`;
const diamondGem = (cx: number, cy: number, w: number, h: number, g: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${w * 2}" ry="${h * 1.6}" fill="url(#aura-${g})"/>` +
  `<path d="M${cx} ${cy - h}L${cx + w} ${cy}L${cx} ${cy + h}L${cx - w} ${cy}Z" fill="url(#gem-${g})" stroke="#1a1208" stroke-width=".8"/>` +
  `<path d="M${cx} ${cy - h}L${cx + w * 0.45} ${cy}L${cx} ${cy + h * 0.2}Z" fill="#fff" opacity=".45"/>`;
const shaft = (x1: number, y1: number, x2: number, y2: number, w: number, fill: string) => {
  const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2;
  return `<path d="M${x1 + nx} ${y1 + ny}L${x2 + nx} ${y2 + ny}L${x2 - nx} ${y2 - ny}L${x1 - nx} ${y1 - ny}Z" fill="url(#${fill})" stroke="#140c06" stroke-width=".8"/>`;
};
/** Closed star outline: `n` points on radius ro, notches on ri (mace flanges). */
const star = (cx: number, cy: number, ro: number, ri: number, n: number) =>
  'M' + Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? ri : ro;
    return `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join('L') + 'Z';
const band = (x: number, y: number, w: number, h: number, rot: number) =>
  `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="1" fill="url(#gold)" stroke="#3a2608" stroke-width=".6" transform="rotate(${rot} ${x} ${y})"/>`;

// One drawing per base type ---------------------------------------------------
const DRAW: Record<string, Draw> = {
  'Hunting Bow': (g) => `<path d="M18 7c30 12 30 38 0 50" fill="none" stroke="url(#leather)" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M18 7v50M10 32h44l-7-5m7 5-7 5" fill="none" stroke="url(#steel)" stroke-width="1.5"/>` + gemAt(39, 32, 2.5, g),
  'Recurve Bow': (g) => `<path d="M15 7c-2 9 20 4 24 25-4 21-26 16-24 25" fill="none" stroke="url(#leather)" stroke-width="5"/>` +
    `<path d="M15 7v50M8 32h46l-7-5m7 5-7 5" fill="none" stroke="url(#steel)" stroke-width="1.5"/>` + gemAt(39, 32, 2.5, g),
  Longbow: (g) => `<path d="M17 4c28 16 28 40 0 56" fill="none" stroke="url(#leather)" stroke-width="4"/>` +
    `<path d="M17 4v56M8 32h46l-7-5m7 5-7 5" fill="none" stroke="url(#steel)" stroke-width="1.5"/>` + gemAt(38, 32, 2.5, g),
  'Trail Charm': (g) => `<path d="M15 8c0 14 12 12 17 24 5-12 17-10 17-24" fill="none" stroke="url(#leather)" stroke-width="2"/>` +
    `<path d="M32 28c-16 0-16 22 0 30 16-8 16-30 0-30z" fill="url(#gem-${g})" stroke="url(#gold)" stroke-width="2"/>`,
  'Scout Cap': (g) => `<path d="M13 37V29c0-26 38-26 38 0v8z" fill="url(#clothUmber)" stroke="url(#gold)" stroke-width="1.5"/>` +
    `<path d="M10 37c16-7 30-5 46 3-12 8-25 8-46 0z" fill="url(#leather)" stroke="#140c06"/>` + gemAt(43, 28, 3, g),
  Trailcoat: (g) => `<path d="M22 7l10 6 10-6 12 14-8 8-4-4 7 32H15l7-32-4 4-8-8z" fill="url(#clothUmber)" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M22 16l20 22M19 39h26" stroke="url(#leather)" stroke-width="5"/>` + gemAt(32, 39, 2.8, g),
  Bowguards: (g) => `<path d="M18 12l12-3 8 43-16 4zM34 9l12 3-4 44-12-4z" fill="url(#leather)" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M19 21l14-3M22 38l13-3M33 18l12 3M32 35l11 3" stroke="url(#gold)" stroke-width="2"/>` + gemAt(32, 47, 3, g),
  // --- weapons (diagonal, head at top-right)
  Staff: (g) => shaft(12, 56, 44, 16, 4.2, 'wood') + band(22, 43.5, 7, 3, -51) + band(36, 26, 7, 3, -51) +
    `<path d="M40 22c-6-4-6-13 2-17c-3 5-1 10 4 12M48 24c4-6 1-14-7-16c5 3 5 9 2 13" fill="none" stroke="url(#gold)" stroke-width="2.6" stroke-linecap="round"/>` +
    diamondGem(45, 14, 4, 6.5, g),
  Scepter: (g) => shaft(16, 54, 38, 24, 4, 'steel') + band(20, 48, 6, 3.4, -54) +
    `<path d="M33 30l-4-8 6-9 9-2 7 4 1 9-5 7-9 2z" fill="url(#gold)" stroke="#3a2608" stroke-width="1"/>` +
    `<path d="M36 13l2-7M48 16l6-4M49 27l7 1" stroke="url(#gold)" stroke-width="2.4" stroke-linecap="round"/>` + gemAt(40, 21, 5, g),
  Wand: (g) => shaft(14, 54, 42, 20, 3, 'bone') + shaft(14, 54, 22, 44, 4.4, 'leather') +
    `<path d="M45 17l2-7 2 7 7 2-7 2-2 7-2-7-7-2z" fill="url(#gem-${g})" stroke="#1a1208" stroke-width=".7"/>` +
    `<circle cx="47" cy="19" r="9" fill="url(#aura-${g})"/>`,
  Rod: (g) => shaft(14, 54, 40, 22, 4, 'darksteel') +
    `<path d="M17 50l6-2-2 6M22 44l6-2-2 6M27 38l6-2-2 6M32 32l6-2-2 6" stroke="url(#gold)" stroke-width="1.6" fill="none"/>` +
    `<path d="M37 26c-3-3 0-8 4-7M45 30c3 3 8 0 7-4" stroke="url(#gold)" stroke-width="2" fill="none"/>` + gemAt(44, 20, 6.5, g),
  Spire: (g) => shaft(14, 54, 28, 36, 5, 'leather') + band(28, 36, 9, 3.4, -52) +
    `<path d="M28 36l6-20 16-10-8 17z" fill="url(#crystal)" stroke="#123a5a" stroke-width="1"/>` +
    `<path d="M31 32l7-14 9-9" stroke="#fff" stroke-width="1" opacity=".7" fill="none"/>` +
    `<circle cx="42" cy="18" r="12" fill="url(#aura-${g})"/>`,

  Sword: (g) => `<path d="M18.7 40.7L45.7 13.7L55 9L50.3 18.3L23.3 45.3Z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` +
    `<path d="M22 42L49 15" stroke="#fff" stroke-width="1" opacity=".55"/>` +
    shaft(19, 45, 11, 53, 4, 'leather') + `<path d="M13 35L29 51" stroke="url(#gold)" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="9.5" cy="54.5" r="3.6" fill="url(#gold)" stroke="#3a2608" stroke-width=".8"/>` + gemAt(21, 43, 2.2, g),
  Axe: (g) => shaft(12, 56, 44, 16, 4, 'wood') +
    `<path d="M38 18L44 12C52 10 58 18 56 29C52 26 46 26 42 28Z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` +
    `<path d="M46 13C53 13 56 20 55 27" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/>` +
    `<path d="M38 18L31 13L35 23Z" fill="url(#darksteel)" stroke="#111" stroke-width=".8"/>` + band(38, 22, 8, 3.4, -51) + gemAt(44, 20, 2.6, g),
  Mace: (g) => shaft(14, 54, 38, 26, 4.4, 'darksteel') + shaft(14, 54, 22, 45, 5.2, 'leather') +
    `<path d="${star(42, 21, 13, 8, 8)}" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` +
    `<circle cx="42" cy="21" r="7" fill="url(#darksteel)" stroke="#111" stroke-width=".8"/>` + gemAt(42, 21, 3.4, g),

  Greatsword: (g) => `<path d="M13.6 45.6L47.6 11.6L58 6L52.4 16.4L18.4 50.4Z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` +
    `<path d="M17 48L50 15" stroke="#fff" stroke-width="1" opacity=".55"/>` +
    shaft(15, 49, 6, 58, 4, 'leather') + `<path d="M7 40L24 57" stroke="url(#gold)" stroke-width="4.4" stroke-linecap="round"/>` +
    `<circle cx="5" cy="59" r="3.2" fill="url(#gold)" stroke="#3a2608" stroke-width=".8"/>` + gemAt(16, 48, 2.4, g),
  Greataxe: (g) => shaft(8, 60, 50, 12, 4.2, 'wood') +
    `<path d="M40 22L46 16C54 14 60 22 58 34C54 31 48 30 44 32Z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` +
    `<path d="M40 22L34 16C32 8 40 2 52 4C49 8 48 14 50 18Z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` +
    `<path d="M48 17C55 17 58 24 57 31" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/>` + band(41, 21, 9, 3.6, -49) + gemAt(42, 20, 2.6, g),
  Maul: (g) => shaft(10, 58, 38, 26, 4.6, 'wood') + shaft(10, 58, 18, 49, 5.4, 'leather') +
    `<path d="M30 16L44 2L60 18L46 32Z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M34 12L50 28M40 6L56 22" stroke="url(#gold)" stroke-width="2.4"/>` +
    `<path d="M44 2L60 18" stroke="#fff" stroke-width="1" opacity=".5"/>` + gemAt(45, 17, 3, g),

  // --- off-hands
  Shield: (g, c) => `<circle cx="32" cy="32" r="23" fill="url(#darksteel)" stroke="#111" stroke-width="1.2"/>` +
    `<circle cx="32" cy="32" r="19.5" fill="url(#${c})"/>` +
    `<circle cx="32" cy="32" r="21.5" fill="none" stroke="url(#gold)" stroke-width="2.4"/>` +
    `<path d="M18 18l28 28M46 18L18 46" stroke="url(#gold)" stroke-width="3" opacity=".9"/>` +
    `<circle cx="32" cy="32" r="7.5" fill="url(#steel)" stroke="#1b1f28" stroke-width="1"/>` + gemAt(32, 32, 3.2, g),
  Buckler: (g) => `<circle cx="32" cy="32" r="19" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<circle cx="32" cy="32" r="13" fill="none" stroke="url(#darksteel)" stroke-width="2.4"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${(32 + Math.cos(i * Math.PI / 3) * 16).toFixed(1)}" cy="${(32 + Math.sin(i * Math.PI / 3) * 16).toFixed(1)}" r="1.4" fill="url(#gold)"/>`).join('') +
    `<circle cx="32" cy="32" r="7" fill="url(#gold)" stroke="#3a2608" stroke-width="1"/>` + gemAt(32, 32, 3.6, g) +
    `<ellipse cx="25" cy="23" rx="6" ry="3" fill="#fff" opacity=".35" transform="rotate(-35 25 23)"/>`,
  Tome: (g, c) => `<path d="M14 16l26-6 10 8v34l-26 6-10-8z" fill="url(#paper)"/>` +
    `<path d="M14 16l26-6v34l-26 6z" fill="url(#${c})" stroke="#140c06" stroke-width="1"/>` +
    `<path d="M40 10l10 8v34l-10-8z" fill="url(#paper)" stroke="#6a5530" stroke-width=".8"/>` +
    `<path d="M14 16l6-1.5M34 11.5l6-1.5M14 50l6-1.5M34 45.5l6-1.5" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M20 22l14-3.5v18l-14 3.5z" fill="none" stroke="url(#gold)" stroke-width="1.4"/>` + gemAt(27, 29, 4.2, g),
  Orb: (g) => `<circle cx="32" cy="28" r="22" fill="url(#aura-${g})"/>` +
    `<circle cx="32" cy="28" r="14" fill="url(#gem-${g})" stroke="#1a1208" stroke-width="1"/>` +
    `<ellipse cx="27" cy="22" rx="5" ry="3.5" fill="#fff" opacity=".55"/>` +
    `<path d="M18 36c2 8 8 12 14 12s12-4 14-12M22 38l-4 12M42 38l4 12M32 44v10" fill="none" stroke="url(#gold)" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M16 52h32" stroke="url(#darksteel)" stroke-width="4" stroke-linecap="round"/>`,
  Focus: (g) => `<ellipse cx="32" cy="46" rx="18" ry="6" fill="none" stroke="url(#gold)" stroke-width="2.4"/>` +
    `<circle cx="32" cy="28" r="20" fill="url(#aura-${g})"/>` +
    `<path d="M32 8l7 18-7 16-7-16z" fill="url(#gem-${g})" stroke="#1a1208" stroke-width="1"/>` +
    `<path d="M20 22l5 8-3 10-5-9zM44 22l-5 8 3 10 5-9z" fill="url(#crystal)" stroke="#123a5a" stroke-width=".8"/>` +
    `<path d="M32 8l3 10-3 4z" fill="#fff" opacity=".6"/>`,
  Codex: (g, c) => `<rect x="14" y="12" width="36" height="42" rx="3" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<rect x="47" y="14" width="5" height="38" rx="1" fill="url(#paper)"/>` +
    `<path d="M14 24h38M14 42h38" stroke="url(#leather)" stroke-width="4.5"/>` +
    `<rect x="45" y="21" width="9" height="6" rx="1" fill="url(#gold)" stroke="#3a2608"/>` +
    `<rect x="45" y="39" width="9" height="6" rx="1" fill="url(#gold)" stroke="#3a2608"/>` +
    `<circle cx="30" cy="33" r="8" fill="none" stroke="url(#gold)" stroke-width="1.6"/>` + gemAt(30, 33, 3.6, g),
  Lantern: (g) => `<path d="M26 10a6 6 0 0 1 12 0" fill="none" stroke="url(#darksteel)" stroke-width="2.4"/>` +
    `<path d="M22 16h20l-3 6H25z" fill="url(#darksteel)" stroke="#111" stroke-width=".8"/>` +
    `<circle cx="32" cy="36" r="18" fill="url(#aura-${g})"/>` +
    `<path d="M25 22h14l3 24H22z" fill="url(#gem-${g})" opacity=".85"/>` +
    `<path d="M25 22l-3 24M39 22l3 24M32 22v24" stroke="url(#darksteel)" stroke-width="2.2"/>` +
    `<path d="M20 46h24l-2 6H22z" fill="url(#darksteel)" stroke="#111" stroke-width=".8"/>` +
    `<circle cx="32" cy="34" r="4" fill="#fff" filter="url(#icoGlow)"/>`,

  // --- heads
  Hood: (g, c) => `<path d="M32 6c-14 0-22 12-22 26 0 10 4 18 8 22h28c4-4 8-12 8-22C54 18 46 6 32 6z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M32 16c-8 0-13 8-13 16s5 16 13 16 13-8 13-16-5-16-13-16z" fill="#07060a"/>` +
    `<path d="M19 32c0 8 5 16 13 16s13-8 13-16" fill="none" stroke="url(#gold)" stroke-width="1.8"/>` +
    `<circle cx="27" cy="31" r="1.8" fill="url(#gem-${g})"/><circle cx="37" cy="31" r="1.8" fill="url(#gem-${g})"/>` +
    `<circle cx="27" cy="31" r="5" fill="url(#aura-${g})"/><circle cx="37" cy="31" r="5" fill="url(#aura-${g})"/>`,
  Circlet: (g) => `<ellipse cx="32" cy="36" rx="22" ry="9" fill="none" stroke="url(#gold)" stroke-width="4"/>` +
    `<path d="M10 36c0-5 10-9 22-9s22 4 22 9" fill="none" stroke="#3a2608" stroke-width="1"/>` +
    `<path d="M26 28l6-14 6 14" fill="url(#gold)" stroke="#3a2608" stroke-width="1"/>` + diamondGem(32, 25, 4, 6, g),
  Cowl: (g, c) => `<path d="M8 54c2-10 8-14 12-16-4-4-6-10-6-16 0-10 8-16 18-16s18 6 18 16c0 6-2 12-6 16 4 2 10 6 12 16z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M32 12c-7 0-11 6-11 12s4 13 11 13 11-7 11-13-4-12-11-12z" fill="#07060a"/>` +
    `<path d="M14 50h36" stroke="url(#gold)" stroke-width="2"/>` + gemAt(32, 44, 3.6, g),
  Crown: (g) => `<path d="M10 46l4-24 10 12 8-18 8 18 10-12 4 24z" fill="url(#gold)" stroke="#3a2608" stroke-width="1.2"/>` +
    `<rect x="10" y="44" width="44" height="8" rx="1.5" fill="url(#gold)" stroke="#3a2608" stroke-width="1"/>` +
    gemAt(32, 48, 3.4, g) + gemAt(19, 48, 2.2, g) + gemAt(45, 48, 2.2, g) + gemAt(32, 18, 2.4, g),
  Mask: (g) => `<path d="M12 18c6-6 14-8 20-8s14 2 20 8c0 14-4 30-20 38C16 48 12 32 12 18z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M32 12v40" stroke="#1b1f28" stroke-width=".8" opacity=".6"/>` +
    `<path d="M18 26l10 3-1 4-9-3zM46 26l-10 3 1 4 9-3z" fill="#07060a"/>` +
    `<path d="M19 28l8 2M45 28l-8 2" stroke="url(#gem-${g})" stroke-width="1.6"/>` +
    `<circle cx="23" cy="29" r="6" fill="url(#aura-${g})"/><circle cx="41" cy="29" r="6" fill="url(#aura-${g})"/>` +
    `<path d="M26 44h12" stroke="#1b1f28" stroke-width="1.4"/>`,

  Helm: (g, c) => `<path d="M30 7c-3-4 5-5 6-1l-2 5z" fill="url(#${c})" stroke="#140c06" stroke-width=".8"/>` +
    `<path d="M16 22c0-9 7-15 16-15s16 6 16 15v24c0 5-7 10-16 10s-16-5-16-10z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M32 8v44" stroke="url(#gold)" stroke-width="2.2"/>` +
    `<rect x="18" y="27" width="28" height="4" rx="1" fill="#07060a"/>` +
    `<path d="M20 29h24" stroke="url(#gem-${g})" stroke-width="1.6"/>` + `<ellipse cx="32" cy="29" rx="14" ry="5" fill="url(#aura-${g})"/>` +
    `<path d="M24 38v10M28 39v11M36 39v11M40 38v10" stroke="#1b1f28" stroke-width="1.4"/>`,
  Greathelm: (g, c) => `<path d="M24 12c0-8 16-8 16 0" fill="url(#${c})" stroke="#140c06" stroke-width=".8"/>` +
    `<path d="M14 14h36v34c0 6-8 10-18 10s-18-4-18-10z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M14 14h36" stroke="url(#gold)" stroke-width="3"/>` +
    `<path d="M17 28h30M32 20v34" stroke="#07060a" stroke-width="3.4"/>` +
    `<path d="M18 28h28" stroke="url(#gem-${g})" stroke-width="1.4"/>` + `<ellipse cx="32" cy="28" rx="15" ry="5" fill="url(#aura-${g})"/>` +
    `<circle cx="20" cy="46" r="1.5" fill="url(#gold)"/><circle cx="44" cy="46" r="1.5" fill="url(#gold)"/>`,

  // --- chest
  Cuirass: (g) => `<path d="M16 10l10-2c2 5 10 5 12 0l10 2 4 14-6 4v22c-6 5-26 5-32 0V28l-6-4z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M32 16v36" stroke="#1b1f28" stroke-width="1" opacity=".6"/>` +
    `<path d="M26 8c2 5 10 5 12 0" fill="none" stroke="url(#gold)" stroke-width="2.4"/>` +
    `<path d="M18 40c8 3 20 3 28 0" fill="none" stroke="url(#darksteel)" stroke-width="2.4"/>` +
    `<ellipse cx="25" cy="24" rx="4" ry="7" fill="#fff" opacity=".3"/>` + gemAt(32, 24, 3.2, g),
  Hauberk: (g) => `<path d="M20 10l12 4 12-4 10 10-6 8-3-2v30H19V26l-3 2-6-8z" fill="url(#darksteel)" stroke="#111" stroke-width="1.2"/>` +
    `<path d="M20 20h24M19 26h26M19 32h26M19 44h26M19 50h26" stroke="url(#steel)" stroke-width="1.6" stroke-dasharray="1.6 1.4" opacity=".85"/>` +
    `<rect x="18" y="36" width="28" height="5" fill="url(#leather)" stroke="#140c06" stroke-width=".8"/>` +
    `<rect x="29" y="35" width="6" height="7" rx="1" fill="url(#gold)" stroke="#3a2608"/>` + gemAt(32, 38.5, 1.8, g),
  Robes: (g, c) => `<path d="M22 8l10 4 10-4 12 8-6 10-4-2 4 32H16l4-32-4 2-6-10z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M26 10l6 14 6-14" fill="none" stroke="url(#gold)" stroke-width="2"/>` +
    `<path d="M20 32h24" stroke="url(#gold)" stroke-width="3"/>` + gemAt(32, 32, 2.8, g) +
    `<path d="M16 56h32" stroke="url(#gold)" stroke-width="2"/>`,
  Vestments: (g, c) => `<path d="M20 8l12 5 12-5 10 10-7 8v30H17V26l-7-8z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M27 12h10v44H27z" fill="url(#paper)" opacity=".9"/>` +
    `<path d="M29 20h6M29 28h6M29 36h6M29 44h6" stroke="url(#gold)" stroke-width="1.6"/>` + diamondGem(32, 16, 3, 4, g),
  Mantle: (g, c) => `<path d="M32 10c-12 0-24 6-26 18 4-2 8-2 10 0 2-4 8-6 16-6s14 2 16 6c2-2 6-2 10 0-2-12-14-18-26-18z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M16 28l-4 26h40l-4-26c-4-3-10-4-16-4s-12 1-16 4z" fill="url(#${c})" opacity=".75" stroke="#140c06"/>` +
    `<path d="M8 27c4-2 8-2 10 0M46 27c2-2 6-2 10 0" stroke="url(#gold)" stroke-width="2" fill="none"/>` + gemAt(32, 16, 3.6, g),
  Raiment: (g, c) => `<path d="M24 6h16l4 8 10 6-4 8-4-2 6 32H12l6-32-4 2-4-8 10-6z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<path d="M24 6l8 10 8-10" fill="url(#darksteel)"/>` +
    `<path d="M18 40c8 3 20 3 28 0M16 50c10 3 22 3 32 0" stroke="url(#gold)" stroke-width="1.6" fill="none"/>` + gemAt(32, 22, 3, g),
  Garb: (g, c) => `<path d="M20 10l12 4 12-4 10 10-6 8-3-2v28H19V26l-3 2-6-8z" fill="url(#${c})" stroke="#140c06" stroke-width="1.2"/>` +
    `<rect x="18" y="34" width="28" height="5" fill="url(#leather)" stroke="#140c06" stroke-width=".8"/>` +
    `<rect x="29" y="33" width="6" height="7" rx="1" fill="url(#gold)" stroke="#3a2608"/>` + gemAt(32, 36.5, 1.8, g),

  // --- hands
  Gloves: (g) => `<path d="M20 58V36l-4-10c-1-3 3-5 5-2l4 8V14c0-3 5-3 5 0v14-18c0-3 5-3 5 0v18-15c0-3 5-3 5 0v17-12c0-3 5-3 5 0v26c0 6-2 10-4 12v8z" fill="url(#leather)" stroke="#140c06" stroke-width="1.2"/>` +
    `<rect x="18" y="46" width="28" height="8" rx="2" fill="url(#steel)" stroke="#1b1f28"/>` + gemAt(32, 50, 2.6, g),
  Gauntlets: (g) => `<path d="M20 58V36l-4-10c-1-3 3-5 5-2l4 8V14c0-3 5-3 5 0v14-18c0-3 5-3 5 0v18-15c0-3 5-3 5 0v17-12c0-3 5-3 5 0v26c0 6-2 10-4 12v8z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M25 18h5M30 16h5M35 18h5M40 22h5M25 24h5M30 22h5M35 24h5M40 28h5" stroke="#1b1f28" stroke-width="1" opacity=".7"/>` +
    `<rect x="17" y="44" width="30" height="10" rx="2" fill="url(#steel)" stroke="#1b1f28"/>` +
    `<path d="M17 47h30" stroke="url(#gold)" stroke-width="2"/>` + gemAt(32, 50, 2.6, g),
  Wraps: (g) => `<path d="M20 58V36l-4-10c-1-3 3-5 5-2l4 8V14c0-3 5-3 5 0v14-18c0-3 5-3 5 0v18-15c0-3 5-3 5 0v17-12c0-3 5-3 5 0v26c0 6-2 10-4 12v8z" fill="url(#paper)" stroke="#6a5530" stroke-width="1.2"/>` +
    `<path d="M20 40l24-6M20 46l24-6M20 52l24-6M25 30l20-5" stroke="#8a7348" stroke-width="1.4"/>` +
    `<path d="M44 34c4 6 6 14 4 22" fill="none" stroke="url(#gem-${g})" stroke-width="1.6"/>`,
  Grips: (g) => `<path d="M18 58V34l-4-8c-1-3 3-5 5-2l4 6V16c0-3 5-3 5 0v12-14c0-3 5-3 5 0v14-12c0-3 5-3 5 0v14-10c0-3 5-3 5 0v24c0 6-2 10-4 12v8z" fill="url(#darksteel)" stroke="#111" stroke-width="1.2"/>` +
    `<path d="M24 20h4M31 18h4M38 20h4" stroke="url(#steel)" stroke-width="2.4" stroke-linecap="round"/>` +
    `<rect x="16" y="46" width="30" height="9" rx="2" fill="url(#leather)" stroke="#140c06"/>` + gemAt(31, 50.5, 2.6, g),
  Handguards: (g) => `<path d="M16 58V32l-3-6 4-3 5 6V14l6-2v14l1-16 6 0v16l1-14 6 2v14l2-10 5 2v22c0 8-3 12-5 14v6z" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M16 42h32" stroke="url(#gold)" stroke-width="2.4"/>` +
    `<path d="M14 48h36l-2 10H16z" fill="url(#darksteel)" stroke="#111"/>` + gemAt(32, 52, 3, g),

  // --- amulets
  Amulet: (g) => `<path d="M14 6c0 14 8 24 18 26 10-2 18-12 18-26" fill="none" stroke="url(#gold)" stroke-width="2" stroke-dasharray="2 1.4"/>` +
    `<circle cx="32" cy="42" r="14" fill="url(#gold)" stroke="#3a2608" stroke-width="1.2"/>` +
    `<circle cx="32" cy="42" r="10" fill="none" stroke="#3a2608" stroke-width=".8"/>` + gemAt(32, 42, 6.5, g),
  Pendant: (g) => `<path d="M16 6c2 12 8 18 16 20 8-2 14-8 16-20" fill="none" stroke="url(#steel)" stroke-width="1.8" stroke-dasharray="2 1.2"/>` +
    `<path d="M32 24c-8 10-12 16-12 22a12 12 0 0 0 24 0c0-6-4-12-12-22z" fill="url(#gem-${g})" stroke="#1a1208" stroke-width="1"/>` +
    `<ellipse cx="27" cy="42" rx="3" ry="5" fill="#fff" opacity=".5"/>` +
    `<path d="M28 24h8l-2 4h-4z" fill="url(#gold)"/>` + `<circle cx="32" cy="46" r="16" fill="url(#aura-${g})"/>`,
  Talisman: (g) => `<path d="M18 6c0 10 6 16 14 18 8-2 14-8 14-18" fill="none" stroke="url(#leather)" stroke-width="2.4"/>` +
    `<path d="M22 26l20-2 4 22-12 10-14-8z" fill="url(#darksteel)" stroke="#111" stroke-width="1.2"/>` +
    `<path d="M29 32l6 4-6 4 6 4M36 32v14" fill="none" stroke="url(#gem-${g})" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="32" cy="39" r="12" fill="url(#aura-${g})"/>`,
  Choker: (g) => `<ellipse cx="32" cy="30" rx="22" ry="12" fill="none" stroke="url(#${'clothCrimson'})" stroke-width="7"/>` +
    `<ellipse cx="32" cy="30" rx="22" ry="12" fill="none" stroke="url(#gold)" stroke-width="1.2"/>` +
    `<path d="M26 40l6 12 6-12z" fill="url(#gold)" stroke="#3a2608"/>` + gemAt(32, 43, 3.6, g),

  // --- rings
  Ring: (g) => `<ellipse cx="32" cy="40" rx="16" ry="12" fill="none" stroke="url(#gold)" stroke-width="5.5"/>` +
    `<path d="M24 28l8-6 8 6-8 4z" fill="url(#gold)" stroke="#3a2608"/>` + diamondGem(32, 20, 6, 8, g),
  Band: (g) => `<ellipse cx="32" cy="34" rx="20" ry="16" fill="none" stroke="url(#gold)" stroke-width="9"/>` +
    `<ellipse cx="32" cy="34" rx="20" ry="16" fill="none" stroke="#3a2608" stroke-width=".8"/>` +
    `<path d="M14 34l3-3 3 3-3 3zM24 20l3-3 3 3-3 3zM38 20l3-3 3 3-3 3zM47 34l3-3 3 3-3 3z" fill="url(#gem-${g})"/>`,
  Signet: (g) => `<ellipse cx="32" cy="40" rx="15" ry="11" fill="none" stroke="url(#steel)" stroke-width="6"/>` +
    `<rect x="20" y="14" width="24" height="18" rx="4" fill="url(#steel)" stroke="#1b1f28" stroke-width="1.2"/>` +
    `<path d="M26 26l6-8 6 8-6 3z" fill="url(#gem-${g})" stroke="#1a1208" stroke-width=".8"/>` + `<circle cx="32" cy="23" r="10" fill="url(#aura-${g})"/>`,
  Loop: (g) => `<path d="M16 38c0-10 8-16 16-16s16 6 16 16-8 14-16 14-16-4-16-14z" fill="none" stroke="url(#gold)" stroke-width="3.5"/>` +
    `<path d="M16 38c2 6 8 10 16 10s14-4 16-10" fill="none" stroke="url(#steel)" stroke-width="3" stroke-dasharray="4 3"/>` + gemAt(32, 22, 4.4, g),
};

/** Stable small hash of a string (for per-item cloth variety). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Full-color icon for an item. */
export function itemIconSVG(item: Item): string {
  const draw = DRAW[item.base] ?? DRAW[SLOT_INFO[item.slot].bases[0]];
  const cloth = CLOTHS[hash(item.id) % CLOTHS.length];
  return `<svg class="item-icon" viewBox="0 0 64 64" aria-hidden="true"><g filter="url(#icoShadow)">${draw(item.school ?? item.rarity, cloth)}</g></svg>`;
}

/** An item's icon as an SVG of its own, `px` square, its gradients and filters inside it: drawn as an image (a label
 *  over the world, ui/overlay), which can't reach the page's shared ones. */
export function itemIconImage(item: Item, px: number): string {
  const draw = DRAW[item.base] ?? DRAW[SLOT_INFO[item.slot].bases[0]];
  const cloth = CLOTHS[hash(item.id) % CLOTHS.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 64 64">${iconDefs()}`
    + `<g filter="url(#icoShadow)">${draw(item.school ?? item.rarity, cloth)}</g></svg>`;
}

/** Faded silhouette for an empty equipment slot (in the class's own gear). */
export function slotPlaceholderSVG(slot: Slot, cls?: ClassDef): string {
  const draw = DRAW[basesFor(slot, cls)[0]];
  return `<svg class="item-icon placeholder" viewBox="0 0 64 64" aria-hidden="true">${draw('common', 'clothUmber')}</svg>`;
}
