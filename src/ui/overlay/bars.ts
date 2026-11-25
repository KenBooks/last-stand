// The health bars over the world's heads (ui/overlay): a foe's red bar (a hero foe's wider, gold, with its name over
// it) and a partner's blue one with theirs; a thin dark track in a black border, a faint ring round it, the fill a
// gradient. Painted again when the life it shows changes.
import { drawText, measure, OUTLINE, ringAround, vertical, type TextStyle } from './paint';
import type { LabelArt } from './layer';

/** A bar's look: its track's size inside its border (px), the ring round it, its fill's gradient. */
export interface BarLook {
  w: number;
  h: number;
  ring: string;
  fill: [string, string];
  /** the name over it, if any, and how it's written */
  name?: string;
  nameStyle?: TextStyle;
  /** a word over the name, if any (a partner away: Idle, #847's review: not everyone knows what AFK is), and how it's written */
  over?: string;
  overStyle?: TextStyle;
}

const FRAME = 'rgba(160,124,70,.25)';
export const FOE_BAR: BarLook = { w: 56, h: 5, ring: FRAME, fill: ['#e03030', '#8a0c10'] };
export const HERO_FOE_BAR: BarLook = { w: 84, h: 7, ring: 'rgba(240,200,96,.6)', fill: ['#ffb040', '#b0400c'] };
/** an encounter's guard's: wider still, red in a boss's bronze ring (its name over it) */
export const GUARD_BAR: BarLook = { w: 110, h: 8, ring: 'rgba(230,170,90,.7)', fill: ['#ff4a3a', '#8a0c10'] };
export const ALLY_BAR: BarLook = { w: 56, h: 5, ring: FRAME, fill: ['#6ab8ff', '#1d4f8a'] };
export const FOE_NAME: TextStyle = { face: 'display', size: 12, color: '#f5c060', shadows: OUTLINE };
export const ALLY_NAME: TextStyle = { face: 'display', size: 12, color: '#9ccfff', shadows: OUTLINE };
/** the word over a partner's name while it's away (#847): a dim grey under the name's size */
export const AWAY_WORD: TextStyle = { face: 'display', size: 10, color: '#c9c4b8', shadows: OUTLINE };

/** room round the bar and its name for the name's shadows (px) */
const PAD = 7;
/** between the name and the bar (px) */
const GAP = 2;

/** A bar's art showing `share` (0 to 1) of its fill. */
export function barArt(look: BarLook, share: number): LabelArt {
  const name = look.name !== undefined && look.nameStyle ? measure(look.name, look.nameStyle) : null;
  const over = look.over !== undefined && look.overStyle ? measure(look.over, look.overStyle) : null;
  const above = (over ? over.h + GAP : 0) + (name ? name.h + GAP : 0);
  // (the track inside its 1 px border, and the ring 1 px round that)
  const outer = { w: look.w + 4, h: look.h + 4 };
  const w = Math.max(outer.w, name?.w ?? 0, over?.w ?? 0) + PAD * 2, h = above + outer.h + PAD * 2;
  // (hung from the bottom of its border, as the page's box was)
  const top = PAD + above + 2;
  return {
    w, h,
    anchor: { x: w / 2, y: top + look.h + 1 },
    paint(c, scale) {
      if (over && look.overStyle) drawText(c, over, (w - over.w) / 2, PAD, look.overStyle, scale);
      const nameAt = PAD + (over ? over.h + GAP : 0);
      if (name && look.nameStyle) drawText(c, name, (w - name.w) / 2, nameAt, look.nameStyle, scale);
      const x = (w - look.w) / 2, y = top;
      ringAround(c, x - 1, y - 1, look.w + 2, look.h + 2, 1, look.ring);
      ringAround(c, x, y, look.w, look.h, 1, 'rgba(0,0,0,.9)');
      c.fillStyle = 'rgba(0,0,0,.75)';
      c.fillRect(x, y, look.w, look.h);
      const fill = Math.max(0, Math.min(1, share)) * look.w;
      if (fill > 0) {
        c.fillStyle = vertical(c, y, look.h, look.fill);
        c.fillRect(x, y, fill, look.h);
      }
    },
  };
}

/** The share of a bar's fill in whole pixels of its track, so a bar is painted again only when its fill visibly moves. */
export const barStep = (look: BarLook, share: number): number => Math.round(Math.max(0, Math.min(1, share)) * look.w * 2);

/** a damaged prop's gauge: the diamond's side and the track's size (px), its gap between them */
const GAUGE = { diamond: 7, gap: 3, w: 44, h: 6 };

/** A damaged prop's gauge (`world/destructible.ts`) showing `share` of its health: not a foe's red bar but a notched
 *  stone-and-amber one with a diamond before it. */
export function gaugeArt(share: number): LabelArt {
  const pad = 3, w = GAUGE.diamond + GAUGE.gap + GAUGE.w + pad * 2 + 2, h = Math.max(GAUGE.diamond * 1.42, GAUGE.h + 4) + pad * 2;
  return {
    w, h,
    // (hung from the bottom of the diamond's box, the taller of the two, as the page laid them out)
    anchor: { x: w / 2, y: h / 2 + GAUGE.diamond / 2 },
    paint(c) {
      const mid = h / 2;
      // the diamond, its corners on the middle line, in a dark ring
      const dx = pad + 1 + GAUGE.diamond / 2;
      c.save();
      c.translate(dx, mid);
      c.rotate(Math.PI / 4);
      c.fillStyle = 'rgba(0,0,0,.85)';
      c.fillRect(-GAUGE.diamond / 2 - 1, -GAUGE.diamond / 2 - 1, GAUGE.diamond + 2, GAUGE.diamond + 2);
      c.fillStyle = '#c9b78a';
      c.fillRect(-GAUGE.diamond / 2, -GAUGE.diamond / 2, GAUGE.diamond, GAUGE.diamond);
      c.restore();
      // the track in a black ring and a stone one round that
      const x = pad + 1 + GAUGE.diamond + GAUGE.gap, y = mid - GAUGE.h / 2;
      ringAround(c, x - 1, y - 1, GAUGE.w + 2, GAUGE.h + 2, 1, 'rgba(201,183,138,.45)');
      ringAround(c, x, y, GAUGE.w, GAUGE.h, 1, 'rgba(0,0,0,.9)');
      c.fillStyle = 'rgba(20,18,14,.8)';
      c.fillRect(x, y, GAUGE.w, GAUGE.h);
      const fill = Math.max(0, Math.min(1, share)) * GAUGE.w;
      if (fill > 0) {
        c.fillStyle = vertical(c, y, GAUGE.h, ['#e8d9a8', '#9c8650']);
        c.fillRect(x, y, fill, GAUGE.h);
      }
      // five notches over it, each fifth's last pixel
      c.fillStyle = 'rgba(0,0,0,.85)';
      for (let k = 1; k <= 5; k++) c.fillRect(x + (GAUGE.w * k) / 5 - 1, y, 1, GAUGE.h);
    },
  };
}
