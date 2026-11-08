// A label kept from the world's overlays by a full atlas (tools/lab `labels`): the atlas filled with labels the size of
// a partner's name tag until a tag finds no slot, then a few of them given back (too few for the atlas to be packed
// again), and the tag must be drawn in one within a few frames. A tag that found the atlas full (a co-op fight's
// numbers) was marked painted all the same and never asked again: it wasn't drawn until its art next changed, its bar
// a step down ("name tags sometimes appear, then disappear").
import { G } from '../../../src/state';
import { Label, ORDER } from '../../../src/ui/overlay/layer';
import { ALLY_BAR, ALLY_NAME, barArt } from '../../../src/ui/overlay/bars';
import type { Lab, Report } from './lab';

/** the most labels laid in to fill the atlas (a 2048 px atlas holds about a thousand tags) */
const MOST_FILLERS = 6000;
/** how many are laid in a frame */
const FILLERS_A_FRAME = 500;
/** the share of the fillers given back: enough room for the tag, too little for the atlas to be packed again */
const GIVEN_BACK = 0.05;
/** the frames the tag has to be drawn in once there's room */
const DRAWN_WITHIN = 3;

export interface LabelsOptions {
  /** plant a fault the measure must catch: no filler given back, so the tag can't be drawn */
  canary?: boolean;
}

/** A name tag's label, as a co-op partner's is shown: placed in the middle of the screen. */
function tagLabel(name: string): Label {
  const label = new Label(ORDER.tag);
  label.show(barArt({ ...ALLY_BAR, name, nameStyle: ALLY_NAME }, 1));
  label.x = window.innerWidth / 2;
  label.y = window.innerHeight / 2;
  label.shown = true;
  return label;
}

/** Lays in fillers until a label laid after them finds no slot; returns them, and whether the atlas filled. */
async function fillAtlas(lab: Lab): Promise<{ fillers: Label[]; full: boolean }> {
  const fillers: Label[] = [];
  while (fillers.length < MOST_FILLERS) {
    for (let i = 0; i < FILLERS_A_FRAME; i++) fillers.push(tagLabel(`Filler ${fillers.length}`));
    await lab.step(1);
    if (fillers.some((label) => !label.slot)) return { fillers, full: true };
  }
  return { fillers, full: false };
}

export async function labels(lab: Lab, options: LabelsOptions): Promise<Report> {
  const problems: string[] = [];
  const { fillers, full } = await fillAtlas(lab);
  const tag = tagLabel('Partner');
  await lab.step(1);
  const slotless = fillers.filter((label) => !label.slot).length;
  if (!full || tag.slot) problems.push(`the atlas never filled (${fillers.length} labels laid in)`);
  // (the fillers that found no slot go first: they'd take the room given back before the tag)
  for (const label of fillers.filter((filler) => !filler.slot)) label.remove();
  const placed = fillers.filter((label) => label.slot);
  const back = options.canary ? 0 : Math.max(1, Math.round(placed.length * GIVEN_BACK));
  for (const label of placed.slice(0, back)) label.remove();
  const drawnAt = (await lab.step(DRAWN_WITHIN, undefined, () => tag.slot !== null)).indexOf(true);
  for (const label of placed.slice(back)) label.remove();
  tag.remove();
  await lab.step(1);

  const ratio = G.renderer.getPixelRatio();
  const filled = `the atlas filled at ratio ${ratio} by ${placed.length} tags (${slotless} more with no slot)`;
  const drawn = drawnAt >= 0 ? `drawn ${drawnAt + 1} frames after` : `not drawn ${DRAWN_WITHIN} frames after`;
  const text = `${filled}; a tag that found it full, ${back} slots given back: ${drawn}`;
  if (drawnAt < 0 && !options.canary) {
    problems.push(`a tag that found the atlas full is ${drawn} ${back} were given back`);
  }
  if (drawnAt >= 0 && options.canary) problems.push('the canary (no slot given back) drew the tag all the same');
  return { text, problems };
}
