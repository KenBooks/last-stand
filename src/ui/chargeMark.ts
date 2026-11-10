// How far a held skill is charged, shown where the player aims (#402; from play: "when charging a skill, lets
// display a filling cursor in top down, from bottom to top... filled = charge (for all charged skills including
// ranger), in 1st and 3rd person it should display a circle around the aim, clockwise charge, full = charged").
// A drawn skill's (`SkillDef.draw`: the lightning staff's charge, the bow's draws).
// - Top-down: the game's cursor drawn by the page in place of the browser's (which the page can't draw over), dim,
//   its lit art filling it from the bottom up; where the browser's was and as large (from play: drawn half as
//   large again, and its place scaled with it, "the cursor teleports to another location", "it also changes size").
// - The close views: a ring round the crosshair, drawn clockwise from the top.
// Each moved by transforms alone, its parts painted once (ui/styles/AGENTS.md), written only while a charge is held; nothing of it on touch in the top-down view,
// which has no cursor.
import { G } from '../state';
import { input } from '../core/input';
import { viewMode } from '../core/renderer';

/** a charge is shown once held this long (s): a tap's swapped no cursor and drew no ring for a frame or two */
const SHOWN_AFTER = 0.12;

const cursor = (): HTMLElement => document.getElementById('charge-cursor')!;
const ring = (): HTMLElement => document.getElementById('charge-ring')!;
/** the cursor's box and the lit art in it; the ring's two halves */
let box: HTMLElement | null = null, art: HTMLElement | null = null;
let right: HTMLElement | null = null, left: HTMLElement | null = null;
let shown: 'cursor' | 'ring' | null = null;

/** The mark shown as `want` (none: put away). */
function show(want: typeof shown): void {
  if (want === shown) return;
  shown = want;
  cursor().classList.toggle('hidden', want !== 'cursor');
  ring().classList.toggle('hidden', want !== 'ring');
  // (the browser's cursor out of the way of the drawn one)
  document.documentElement.classList.toggle('charging', want === 'cursor');
}

/** Each frame: the local hero's charge, shown as the view has it. */
export function updateChargeMark(): void {
  const charge = G.mode === 'run' || G.mode === 'menu' ? G.player.charge : null;
  if (!charge || charge.held < SHOWN_AFTER) { show(null); return; }
  const top = viewMode() === 'top', full = charge.share >= 1;
  if (top && input.touchMode) { show(null); return; }
  show(top ? 'cursor' : 'ring');
  if (top) {
    const el = cursor();
    box ??= el.querySelector<HTMLElement>('b')!;
    art ??= el.querySelector<HTMLElement>('i')!;
    el.style.transform = `translate(${input.mouse.x}px, ${input.mouse.y}px)`;
    // (the box down by what's left to charge, the art in it up as far: the art still, shown from its foot up)
    const rest = ((1 - charge.share) * 100).toFixed(1);
    box.style.transform = `translateY(${rest}%)`;
    art.style.transform = `translateY(-${rest}%)`;
  } else {
    const el = ring();
    right ??= el.querySelector<HTMLElement>('.cr-right > i')!;
    left ??= el.querySelector<HTMLElement>('.cr-left > i')!;
    // (clockwise from the top: the right half turned in over the first half of the charge, the left over the rest)
    const turned = charge.share * 360;
    right.style.transform = `rotate(${Math.min(180, turned).toFixed(1)}deg)`;
    left.style.transform = `rotate(${Math.max(0, turned - 180).toFixed(1)}deg)`;
    el.classList.toggle('full', full);
  }
}
