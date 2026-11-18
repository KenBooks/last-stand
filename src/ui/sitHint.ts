// The prompt to sit on the seat the cursor points at (from play: "when pointing at object to sit on, we need to display
// a hint like E Sit"; from the owner: "hint should be same style as other hints to open door etc, dont make new"): the
// village's objects' own prompt (`promptArt`), over where the cursor meets the seat outlined (`Sitting.hintAt`), with
// the keyboard and mouse alone (touch has no pointing), and never with the prompt to revive a partner, as E revives then.

import { G } from '../state';
import { isTouch } from './touch';
import { raisePromptShown } from './coop';
import { anchorLabel, promptArt } from './floaters';
import { ORDER, type Label } from './overlay/layer';

/** the prompt's look: the village's objects' as the hero stands by one (`syncLabels` in `game/village.ts`) */
const LOOK = { face: 'display', size: 14, weight: 700, spacing: 0.5, color: '#ffe7b0' } as const;

let label: Label | null = null;

/** Where the prompt stands this frame, or none. */
function hintAt(): { x: number; y: number; z: number } | null {
  if (isTouch() || raisePromptShown()) return null;
  return G.player.sitting.hintAt;
}

/** Sets the prompt going the first time a seat is outlined: placed each frame by the overlay from then on. */
export function updateSitHint(): void {
  if (label || !G.player.sitting.pointed) return;
  label = anchorLabel(ORDER.tag, hintAt, true);
  label.ay = 0.5;
  label.show(promptArt('E', 'Sit', LOOK));
}

/** The prompt, once set going (the lab reads where it shows). */
export function sitHintLabel(): Label | null {
  return label;
}
