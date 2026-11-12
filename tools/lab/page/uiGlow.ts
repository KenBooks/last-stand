// tools/lab ui `glow`: the stash's items that fit a hovered item's slot lit up (src/ui/menus.ts `focusSlot`, its glow
// in styles/_items.scss), pictured round the stash at set moments of the glow's looping animations, each held there,
// so a picture of this tree and of main's are of the same moment (`--ab`). And its loops checked twice (#267):
// - what they animate: only what the compositor moves without painting anything again (a layer's transform and
//   opacity). Each of the glow's three loops animated what has to be painted again (its blurred shadow, its arc's
//   conic gradient, its sheen's background), and with a full stash lit the lobby fell from 145 frames a second to 44,
//   the frame waiting on the browser's paint (`npm run stalls -- --scenario hover --stash 40`);
// - where they run: on the item hovered and the equipment slots alone. Each loop is a layer the page styles and the
//   compositor draws every frame, and 30 lit items' 90 loops, composited, still halved the frames while the mouse
//   moved between items (`--scenario sweep`).
// And the hovered item's glow checked for masks within masks: a mask is a pass of the compositor's own, and one inside
// another was drawn again every frame (the arc kept to the border's ring by one, inside the stash's fading mask:
// moving between items raised the GPU's time a frame from 5.4 ms to 6.3 (the owner's rose from 5 to 14 as the frames
// fell to 30), where either mask alone raised it by 0.1 at the most, `npm run stalls -- --scenario sweep --perf`,
// variants noArcMask, noStashMask).
// And for an opacity faded round its loops: an opacity on one layer is drawn with it, round more it's a pass of the
// compositor's own, every frame of the fade (the hovered glow faded in round its four layers: at the owner's pace from
// item to item, sweeping drew 2.6 passes a frame, 1.9 without it, `npm run stalls -- --scenario sweep --passes`).
// And the stash's fade, laid over a row its scroll cuts in place of that mask, shown at its top while a row is cut and
// hidden at its end and over a stash that fits (it was a dark band over the bare panel).
// A canary each: a shadow looped on the hovered item, a loop on a stash item not hovered, a mask on the hovered item's
// glow within one on the stash, an opacity faded round the glow's loops, and the fade held shown.
import { G } from '../../../src/state';
import { makeItem } from '../../../src/loot/items';
import * as menus from '../../../src/ui/menus';
import { panelsBack, showPanels } from './lobbyPanels';
import { hideTooltip } from '../../../src/ui/tooltip';
import type { Item, RarityId, Slot } from '../../../src/types';
import { middleOf, realWait } from './lab';
import type { PagePoint } from './lab';
import type { Lab, Pictured } from './lab';

/** the stash's items while the glow is pictured: so many (more than its view shows, so a row is cut by its fade),
 *  in turn of these slots and rarities */
const STASH_ITEMS = 60;
const SLOTS: Slot[] = ['weapon', 'chest', 'head'];
const RARITIES: RarityId[] = ['common', 'magic', 'rare', 'epic', 'legendary', 'ascendant'];
/** the slot whose stash item is hovered */
const HOVERED: Slot = 'weapon';
/** the moments of the glow's loops pictured (ms into each) */
const MOMENTS = [400, 1000, 1600];
/** what a keyframe holds besides the properties it animates (`getKeyframes`), and the properties the compositor
 *  animates alone */
const KEYFRAME_FIELDS = new Set(['offset', 'computedOffset', 'easing', 'composite']);
const COMPOSITED = new Set(['transform', 'opacity', 'translate', 'rotate', 'scale']);
/** how much longer than the focus's delay the hovered item is given to light the others (ms of the browser's time) */
const FOCUS_SPARE_MS = 100;
/** how long the pointer rests before the focus follows it (ms): the menus' own, none before they had one (main's side
 *  of an A/B before #269, which a named import of it would fail on) */
const focusDelay = () => (menus as { FOCUS_DELAY_MS?: number }).FOCUS_DELAY_MS ?? 0;
/** the canaries: each one's loop's name (which its finding names), and what it is */
export const GLOW_CANARIES = {
  shadow: { name: 'lab-canary-shadow', what: 'a looping shadow on the hovered item' },
  spread: { name: 'lab-canary-spread', what: 'a loop on a stash item not hovered' },
  mask: { name: 'lab-canary-mask', what: 'a mask on the hovered item\'s glow within one on the stash' },
  opacity: { name: 'lab-canary-opacity', what: 'an opacity faded round the hovered item\'s loops' },
  fade: { name: 'lab-canary-fade', what: 'the stash\'s fade held shown' },
};
/** how far from shown or hidden the fade may be read (its opacity) */
const FADE_SLACK = 0.01;

/** the hero's own stash, kept while the glow's is shown */
let kept: Item[] | null = null;
/** whether the lobby's rail was turned to the gear to show the stash (a short screen shows one panel at a time) */
let railTurned = false;

/** The stash given `STASH_ITEMS` items, and one fitting `HOVERED` hovered by the mouse: those that fit its slot lit
 *  once it has rested there (`FOCUS_DELAY_MS`), its loops let run (the lab opens its pages with the decorative
 *  animation left out: `Lab.reduceMotion`), the rail turned to the gear on a short screen. Its tooltip is put away,
 *  which would cover the items pictured. */
export async function openGlow(lab: Lab): Promise<void> {
  await lab.reduceMotion(false);
  kept = G.profile.stash;
  G.profile.stash = Array.from({ length: STASH_ITEMS }, (_, index) => makeItem({
    slot: SLOTS[index % SLOTS.length],
    rarity: RARITIES[index % RARITIES.length],
    cls: G.player.cls,
  }));
  menus.renderMenu();
  showPanels('chest');
  railTurned = !document.getElementById('stash')?.checkVisibility();
  const gearTab = document.querySelector('#lobby-rail [data-lt="gear"]');
  if (railTurned && gearTab) await lab.clickOn(gearTab);
  const hovered = document.querySelector(`#stash .sitem[data-slot="${HOVERED}"]`);
  if (!hovered) throw new Error(`lab: ui glow: no stash item for the ${HOVERED} to hover`);
  // (the mouse itself: a dispatched event lights the items but hovers nothing, and the loops run where it is)
  await hoverAt(lab, middleOf(hovered));
}

/** The mouse moved to `at` and rested there till the focus follows it, its tooltip put away. */
async function hoverAt(lab: Lab, at: PagePoint): Promise<void> {
  await lab.mouseTo(at);
  await realWait(focusDelay() + FOCUS_SPARE_MS);
  hideTooltip();
}

/** The hero's own stash back, nothing hovered (the mouse over the world), the decorative animation left out again. */
export async function closeGlow(lab: Lab): Promise<void> {
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  await realWait(focusDelay() + FOCUS_SPARE_MS);
  if (kept) G.profile.stash = kept;
  kept = null;
  menus.renderMenu();
  if (railTurned) document.querySelector<HTMLElement>('#lobby-rail [data-lt="hero"]')?.click();
  railTurned = false;
  panelsBack();
  await lab.reduceMotion(true);
}

/** The stash pictured round it at each of `MOMENTS`, every looping animation held there. */
export async function glowPictures(lab: Lab): Promise<Pictured[]> {
  const pictures: Pictured[] = [];
  for (const moment of MOMENTS) {
    for (const animation of looping()) {
      animation.pause();
      animation.currentTime = moment;
    }
    pictures.push(await lab.screen(`glow at ${moment} ms`, [], '#stash'));
  }
  return pictures;
}

/** The page's animations that loop without end. */
const looping = () => document.getAnimations().filter((animation) => {
  return animation.effect?.getComputedTiming().iterations === Infinity;
});

/** What a check found: its lines and its problems. */
interface Found {
  lines: string[];
  problems: string[];
}

/**
 * The glow lit: how many items it lit, the loops they run and on how many items, and a problem each for those that
 * animate what has to be painted again (its name, where, the properties, how many such), for those on a stash item
 * not hovered, for each mask in the hovered item's glow within another and for each part of it whose opacity fades
 * round its loops; then the stash's fade (`fadeShown`). With `canary`, the hovered item loops a shadow, one not
 * hovered loops its glow round, the hovered one's glow is masked within a mask on the stash first and faded in after.
 */
export async function glowShown(canary: boolean, lab: Lab): Promise<Found> {
  const glow = litShown(canary);
  const fade = await fadeShown(canary, lab);
  return { lines: [...glow.lines, ...fade.lines], problems: [...glow.problems, ...fade.problems] };
}

/** The glow's part of `glowShown`. */
function litShown(canary: boolean): Found {
  const lit = document.querySelectorAll('#stash .sitem.match').length;
  const planted = canary ? plantCanaries() : [];
  const unmask = canary ? plantMasks() : () => undefined;
  const masked = maskedParts();
  const within = maskedAround();
  unmask();
  const unfade = canary ? plantOpacityFade() : () => undefined;
  const faded = fadedRoundLoops();
  unfade();
  const running = looping().filter(runsLit);
  const painted = countedWords(running.flatMap(paintedBy));
  const spread = countedWords(running.filter(onItemNotHovered).map(namedWhere));
  const items = new Set(running.map(itemOf)).size;
  for (const animation of planted) animation.cancel();
  const painting = painted.reduce((sum, loop) => sum + loop.count, 0);
  const lines = [`  the glow: ${lit} of the stash's ${STASH_ITEMS} items lit, the ${HOVERED}s; ${running.length} `
    + `loops running on ${items} items, ${painting} of them animating what has to be painted again; the hovered `
    + `item's glow masked in ${masked.length} part${masked.length === 1 ? '' : 's'}, within ${within.length} `
    + `mask${within.length === 1 ? '' : 's'} round it, faded round its loops in ${faded.length}`];
  const problems = painted.map(({ words, count }) => `glow: ${count} x ${words} (painted again every frame: animate `
    + 'a layer\'s transform or opacity alone)');
  for (const { words, count } of spread) {
    problems.push(`glow: ${count} x ${words}, a stash item not hovered (each loop is a layer styled and drawn every `
      + 'frame: loop the hovered item and the slots alone)');
  }
  for (const part of within.length ? masked : []) {
    problems.push(`glow: a mask on ${part} in the hovered item's glow, within the mask on ${within.join(', ')} (a `
      + 'pass of the compositor\'s own within another, drawn again every frame: keep one of them to a shape by its '
      + 'box)');
  }
  for (const part of faded) {
    problems.push(`glow: an opacity faded on ${part} round the loops in it (a pass of the compositor's own every `
      + 'frame of the fade: fade a layer alone, or bring it in by its size)');
  }
  if (lit === 0) problems.push(`glow: hovering a ${HOVERED} lit none of the stash's items`);
  return { lines, problems };
}

/** The parts of the hovered item's glow whose opacity fades (a transition of it, or an animation) round parts within
 *  them that loop, by tag and classes. */
function fadedRoundLoops(): string[] {
  const glow = hoveredGlow();
  if (!glow) return [];
  return [glow, ...glow.querySelectorAll('*')].filter(fadesOpacity).filter(holdsLoops).map(elementName);
}

/** Whether `part`'s opacity fades: a transition of it (or of all) that takes any time, or an animation of it. */
function fadesOpacity(part: Element): boolean {
  const style = getComputedStyle(part);
  const durations = style.transitionDuration.split(',').map((duration) => Number.parseFloat(duration));
  const transitioned = style.transitionProperty.split(',').some((property, index) => {
    const named = property.trim();
    return (named === 'opacity' || named === 'all') && durations[index % durations.length] > 0;
  });
  const animated = part.getAnimations().some((animation) => {
    const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    return keyframes.some((keyframe) => 'opacity' in keyframe);
  });
  return transitioned || animated;
}

/** Whether a part within `part` (not it) runs a loop. */
function holdsLoops(part: Element): boolean {
  return part.getAnimations({ subtree: true }).some((animation) => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return target !== part && animation.effect?.getComputedTiming().iterations === Infinity;
  });
}

/** The opacity canary: the hovered item's glow faded in, named by its class; returns what takes it off. */
function plantOpacityFade(): () => void {
  const glow = hoveredGlow() as HTMLElement | null;
  if (!glow) return () => undefined;
  glow.classList.add(GLOW_CANARIES.opacity.name);
  glow.style.transition = 'opacity .3s';
  return () => {
    glow.classList.remove(GLOW_CANARIES.opacity.name);
    glow.style.transition = '';
  };
}

/**
 * The stash's fade (its tab page's `::after`, laid over its last 18 px) read at the stash's top and at its end, the
 * mouse off the stash meanwhile (an item scrolled under it would take the hover): shown at the top while a row is cut
 * below, hidden at the end and wherever the stash fits; then the hovered item hovered again and the stash back at its
 * top. With `canary`, the fade is held shown.
 */
async function fadeShown(canary: boolean, lab: Lab): Promise<Found> {
  const stash = document.getElementById('stash');
  const page = stash?.parentElement;
  const hovered = document.querySelector('#stash .sitem.focal');
  if (!stash || !page || !hovered) return { lines: ['  the stash\'s fade: no stash or nothing hovered'], problems: [] };
  if (getComputedStyle(page, '::after').content === 'none') {
    const masked = getComputedStyle(stash).maskImage !== 'none';
    const line = `  the stash's fade: nothing laid over it${masked ? ' (a mask on the stash)' : ''}`;
    return { lines: [line], problems: [] };
  }
  await hoverAt(lab, { x: innerWidth / 2, y: innerHeight / 2 });
  const release = canary ? holdFade(page) : () => undefined;
  const cut = stash.scrollHeight > stash.clientHeight;
  const atTop = await fadeAt(stash, 0);
  const atEnd = await fadeAt(stash, stash.scrollHeight);
  const name = `${elementName(page)}::after`;
  release();
  await fadeAt(stash, 0);
  await hoverAt(lab, middleOf(hovered));
  const lines = [`  the stash's fade: ${cut ? 'a row cut below its view' : 'all of it in view'}; shown `
    + `${atTop.toFixed(2)} at its top, ${atEnd.toFixed(2)} at its end`];
  const problems: string[] = [];
  if (cut && atTop < 1 - FADE_SLACK) {
    problems.push(`glow: the stash's fade (${name}) shown ${atTop.toFixed(2)} at its top, a row cut below it (the `
      + 'row runs into the frame)');
  }
  if (atEnd > FADE_SLACK) {
    problems.push(`glow: the stash's fade (${name}) shown ${atEnd.toFixed(2)} at its end, ${cut ? 'nothing cut below '
      + 'it' : 'all of the stash in view'} (a dark band over the bare panel)`);
  }
  return { lines, problems };
}

/** The stash's fade (its tab page's `::after`) read with the stash scrolled to `top` (css px), a frame on: the scroll
 *  that shows it is read at a frame's start. */
async function fadeAt(stash: HTMLElement, top: number): Promise<number> {
  stash.scrollTop = top;
  await window.__labClock.realFrame();
  await window.__labClock.realFrame();
  return Number(getComputedStyle(stash.parentElement!, '::after').opacity);
}

/** The fade canary: the stash's fade on `page` held shown, named by its class; returns what lets it go. */
function holdFade(page: HTMLElement): () => void {
  const held = document.createElement('style');
  held.textContent = `.${GLOW_CANARIES.fade.name}::after { animation: none !important; opacity: 1 !important; }`;
  document.head.append(held);
  page.classList.add(GLOW_CANARIES.fade.name);
  return () => {
    page.classList.remove(GLOW_CANARIES.fade.name);
    held.remove();
  };
}

/** An element's tag and classes, as words. */
function elementName(element: Element): string {
  const classes = [...element.classList].map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${classes}`;
}

/** the hovered item's glow */
const hoveredGlow = (): Element | null => document.querySelector('#stash .sitem.focal > .slot-glow');

/** Whether `element` is drawn with a mask. */
function isMasked(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.maskImage !== 'none';
}

/** The parts of the hovered item's glow shown with a mask, by tag and classes. */
function maskedParts(): string[] {
  const glow = hoveredGlow();
  if (!glow) return [];
  return [glow, ...glow.querySelectorAll('*')].filter(isMasked).map(elementName);
}

/** The elements round the hovered item's glow drawn with a mask (the stash's fading one), by tag, id and classes. */
function maskedAround(): string[] {
  const around: string[] = [];
  for (let element = hoveredGlow()?.parentElement; element; element = element.parentElement) {
    if (isMasked(element)) around.push(`${elementName(element)}${element.id ? `#${element.id}` : ''}`);
  }
  return around;
}

/** The mask canary: a mask on the hovered item's steady glow, named by its class, and one on the stash where it has
 *  none; returns what takes them off. */
function plantMasks(): () => void {
  const part = document.querySelector<HTMLElement>('#stash .sitem.focal .glow-steady');
  const stash = document.querySelector<HTMLElement>('#stash');
  if (!part || !stash) return () => undefined;
  const stashMask = stash.style.maskImage;
  part.classList.add(GLOW_CANARIES.mask.name);
  part.style.maskImage = 'linear-gradient(#000, #000)';
  if (!isMasked(stash)) stash.style.maskImage = 'linear-gradient(#000, #000)';
  return () => {
    part.classList.remove(GLOW_CANARIES.mask.name);
    part.style.maskImage = '';
    stash.style.maskImage = stashMask;
  };
}

/** The item (stash item or equipment slot) an animation's element is in, or the element itself outside any. */
function itemOf(animation: Animation): Element | null {
  const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
  return target?.closest('.sitem, .eslot') ?? target;
}

/** Whether an animation runs on a stash item the mouse isn't over (the focus's own item, `.focal`, is the one it
 *  rested on). */
function onItemNotHovered(animation: Animation): boolean {
  const item = itemOf(animation);
  return !!item?.matches('.sitem') && !item.matches(':hover');
}

/** An animation's name and where it runs, as words. */
function namedWhere(animation: Animation): string {
  const effect = animation.effect;
  return `${nameOf(animation)} on ${effect instanceof KeyframeEffect ? whereOf(effect) : '?'}`;
}

/** Whether a loop runs: a CSS animation its element's style doesn't pause, or one played by a script. */
function runsLit(animation: Animation): boolean {
  if (!(animation instanceof CSSAnimation)) return true;
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect) || !effect.target) return false;
  return getComputedStyle(effect.target, effect.pseudoElement).animationPlayState !== 'paused';
}

/** The same words counted once each, the most first. */
function countedWords(all: string[]): { words: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const words of all) counts.set(words, (counts.get(words) ?? 0) + 1);
  return [...counts].map(([words, count]) => ({ words, count })).sort((a, b) => b.count - a.count);
}

/** The canaries' loops: a shadow on the hovered item, as a glow that paints every frame has, and the glow of a lit
 *  item not hovered turned round, as every lit item's loops ran. */
function plantCanaries(): Animation[] {
  const planted: Animation[] = [];
  const hovered = document.querySelector('#stash .sitem:hover');
  const shadow = [{ boxShadow: '0 0 0 rgb(255 0 0)' }, { boxShadow: '0 0 12px rgb(255 0 0)' }];
  const { shadow: shadowCanary, spread: spreadCanary } = GLOW_CANARIES;
  if (hovered) planted.push(hovered.animate(shadow, { duration: 1000, iterations: Infinity, id: shadowCanary.name }));
  const other = document.querySelector('#stash .sitem.match:not(:hover) .slot-glow');
  const turn = [{ transform: 'none' }, { transform: 'rotate(1turn)' }];
  if (other) planted.push(other.animate(turn, { duration: 1000, iterations: Infinity, id: spreadCanary.name }));
  return planted;
}

/** What `animation` animates that has to be painted again, as words (nothing if it's the compositor's alone). */
function paintedBy(animation: Animation): string[] {
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect)) return [];
  const painted = animatedBy(animation, effect).filter((property) => !COMPOSITED.has(property));
  if (painted.length === 0) return [];
  return [`${nameOf(animation)} on ${whereOf(effect)} animates ${painted.join(', ')}`];
}

/** The properties an animation animates: a CSS animation's read off its `@keyframes` rule (Chrome leaves a custom
 *  property out of `getKeyframes`, and the glow's arc, turned by one, read as animating nothing), another's off its
 *  keyframes. */
function animatedBy(animation: Animation, effect: KeyframeEffect): string[] {
  const rule = animation instanceof CSSAnimation ? keyframesRule(animation.animationName) : null;
  if (!rule) {
    const fields = effect.getKeyframes().flatMap((frame) => Object.keys(frame));
    return [...new Set(fields)].filter((field) => !KEYFRAME_FIELDS.has(field));
  }
  const properties = new Set<string>();
  for (const keyframe of rule.cssRules) {
    const { style } = keyframe as CSSKeyframeRule;
    for (let index = 0; index < style.length; index++) properties.add(style[index]);
  }
  return [...properties];
}

/** The page's `@keyframes` rule named `name` (in a style sheet or a rule within one, a media query's), or null. */
function keyframesRule(name: string): CSSKeyframesRule | null {
  const within = (rules: Iterable<CSSRule>): CSSKeyframesRule | null => {
    for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule && rule.name === name) return rule;
      const found = rule instanceof CSSGroupingRule ? within(rule.cssRules) : null;
      if (found) return found;
    }
    return null;
  };
  for (const sheet of document.styleSheets) {
    const found = within(rulesOf(sheet));
    if (found) return found;
  }
  return null;
}

/** A style sheet's rules: none of one from another host, which the page can't read (the fonts', which has no
 *  keyframes of the game's). */
function rulesOf(sheet: CSSStyleSheet): Iterable<CSSRule> {
  try {
    return sheet.cssRules;
  } catch {
    return [];
  }
}

/** An animation's name: a CSS animation's, or its id. */
function nameOf(animation: Animation): string {
  if (animation instanceof CSSAnimation) return animation.animationName;
  return animation.id || 'an animation';
}

/** Where an effect runs: its element's tag and classes, and its pseudo-element. */
function whereOf(effect: KeyframeEffect): string {
  const element = effect.target;
  if (!element) return '?';
  const classes = [...element.classList].map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${classes}${effect.pseudoElement ?? ''}`;
}
