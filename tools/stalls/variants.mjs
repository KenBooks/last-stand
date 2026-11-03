// Changes tried on the page before its own scripts run (tools/stalls `--variants`), to A/B a cause of the stalls
// without a build of its own. Each script is serialized into the page, so it can use nothing from here but its
// argument.

/** None: the page as it is. */
function base() {}

/** The stylesheet `css` added after the page's own, as soon as it has a head. */
function styled(css) {
  const add = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  };
  addEventListener('DOMContentLoaded', add);
}

/**
 * Every 2D canvas drawn on the CPU (`willReadFrequently`), never by the GPU process's Skia: a canvas drawn on the GPU
 * builds a Skia program for each new kind of drawing (a shadow's blur, a gradient), and building one holds up the
 * GPU process, the game's WebGL with it.
 */
function cpuCanvas() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, options) {
    if (kind !== '2d') return getContext.call(this, kind, options);
    return getContext.call(this, kind, { ...options, willReadFrequently: true });
  };
}

/**
 * `Math.random` drawn from one seed (mulberry32), so every page rolls alike: a fresh profile's gear is rolled, and
 * two URLs' heroes in one A/B wore different gear, a different count of draws (WebGPU's draws merged, `drawAsOne`).
 */
function seeded(seed) {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** every part of the stash's glow that loops: main's the glow and its pseudo-elements, #269's spans within it */
const GLOW_PARTS = '.slot-glow, .slot-glow *, .slot-glow::before, .slot-glow::after';

/** The parts of a variant as the command line names it: `a+b` is `a` and `b` applied together, in turn. */
export const partsOf = (name) => name.split('+');

/**
 * The stylesheet a variant adds, its parts' together, or null if a part does more than add one. A variant that only
 * adds styles can be put on a page and taken off again as it runs (`--rounds`, `page.mjs` `useStyle`).
 */
export function liveCss(name) {
  const parts = partsOf(name).map((part) => VARIANTS[part]);
  if (parts.some((variant) => variant.script !== styled && variant.script !== base)) return null;
  return parts
    .filter((variant) => variant.script === styled)
    .map((variant) => variant.arg)
    .join('\n');
}

/** The variants by name: each a script run before the page's own, and its argument. Hovering an item: its tooltip
 *  on a layer of its own (moved every mouse move by its `left` and `top`), none at all, its cards without their
 *  blurred shadow, the slot hovered without its brightening filter, and the stash's items that fit its slot lit
 *  without their glow's looping animations (#267). */
export const VARIANTS = {
  base: { script: base },
  // (the loading screen's exit split in two, filmed apart with --film-logo: its particles alone where the lobby logo
  // is, the logo hidden; the logo alone as it's uncovered, the particles' canvas hidden)
  noLobbyLogo: { script: styled, arg: '#menu .logo-art svg { visibility: hidden !important; }' },
  noWind: { script: styled, arg: 'body > canvas[style*="z-index: 101"] { visibility: hidden !important; }' },
  // (the lobby's panels at their own size, not zoomed with the UI's scale: the logo's SVG laid out as its snapshot is)
  noPanelZoom: { script: styled, arg: '#menu .panel { zoom: 1 !important; }' },
  cpuCanvas: { script: cpuCanvas },
  tooltipLayer: { script: styled, arg: '#tooltip { will-change: transform; }' },
  noTooltip: { script: styled, arg: '#tooltip { display: none !important; }' },
  // (and the slot's focus with no look at all: its classes still change, but nothing they style shows)
  noFocusLook: {
    script: styled,
    arg: '.slot-glow { display: none !important; }'
      + ' #menu.slot-focus :is(.sitem, .eslot) { opacity: 1 !important; transform: none !important;'
      + ' filter: none !important; transition: none !important; }'
      + ' #menu.slot-focus .sitem { box-shadow: inset 0 0 0 1px var(--c, #555) !important; background:'
      + ' radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--c, #555) 22%, #151315), #080708 78%)'
      + ' !important; }'
      + ' #menu.slot-focus .sitem > .item-icon { filter: none !important; }',
  },
  // (and a change of focus split: every fade cut, the items' own colours kept (nothing to paint again), the glows
  // made layers at load (painted once))
  snapFocus: { script: styled, arg: '.sitem, .eslot, .slot-glow { transition: none !important; }' },
  // (and the fades on the way in alone: lit and dimmed by a fade, put out at once; and the item under the pointer's
  // glow alone fading in, over every other fade cut)
  snapOut: {
    script: styled,
    arg: '#menu:not(.slot-focus) :is(.sitem, .eslot), :not(.match, .focal) > .slot-glow'
      + ' { transition: none !important; }',
  },
  focalFade: {
    script: styled,
    arg: '.focal > .slot-glow { transition: opacity .3s ease-out, transform .3s cubic-bezier(.2,1.6,.4,1)'
      + ' !important; }',
  },
  keepColours: {
    script: styled,
    arg: '#menu.slot-focus .sitem > .item-icon { filter: none !important; }'
      + ' #menu.slot-focus .sitem { box-shadow: inset 0 0 0 1px var(--c, #555) !important; background:'
      + ' radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--c, #555) 22%, #151315), #080708 78%)'
      + ' !important; } #menu.slot-focus .sitem.up::before { color: #4cff6a !important; }',
  },
  glowLayers: { script: styled, arg: '.sitem > .slot-glow { will-change: opacity, transform; }' },
  // (and a change of focus that paints nothing: the others that fit lit by their glow (a layer painted once) and
  // their size alone, the rest dimmed by their opacity alone; the item under the pointer lit in full)
  compositorFocus: {
    script: styled,
    arg: '.sitem > .slot-glow { will-change: opacity, transform; }'
      + ' #menu.slot-focus .sitem:not(.focal) > .item-icon { filter: none !important; }'
      + ' #menu.slot-focus .sitem:not(.focal) { box-shadow: inset 0 0 0 1px var(--c, #555) !important; background:'
      + ' radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--c, #555) 22%, #151315), #080708 78%)'
      + ' !important; } #menu.slot-focus .sitem:not(.focal).up::before { color: #4cff6a !important; }'
      + ' #menu.slot-focus .sitem:not(.focal).new::after { background: #f0c860 !important;'
      + ' box-shadow: 0 0 6px #f0c860 !important; }',
  },
  noCardShadow: { script: styled, arg: '.tt-card { box-shadow: inset 0 0 0 1px var(--c, var(--frame)) !important; }' },
  // (and the tooltip drawn again for each item without each of its costlier parts: the card compared with faded by an
  // opacity, drawn apart and laid over the rest; the icons' shadows and glows, SVG filters)
  noCardOpacity: { script: styled, arg: '.tt-cards .tt-card + .tt-card { opacity: 1 !important; }' },
  noIconFilters: { script: styled, arg: '#tooltip svg * { filter: none !important; }' },
  noHoverFilter: { script: styled, arg: '.sitem:hover, .eslot:hover { filter: none !important; }' },
  stillGlow: { script: styled, arg: `${GLOW_PARTS} { animation: none !important; }` },
  // (and each of the glow's three animations stopped alone: its pulsing shadow, the arc chasing round its border, the
  // sheen sweeping across; main's on the glow and its pseudo-elements, #269's on spans of their own)
  stillPulse: { script: styled, arg: '.slot-glow, .glow-bright { animation: none !important; }' },
  stillArc: { script: styled, arg: '.slot-glow::before, .glow-arc > span { animation: none !important; }' },
  stillSheen: { script: styled, arg: '.slot-glow::after, .glow-sheen > span { animation: none !important; }' },
  // (and the glow, animations and all, on layers of its own)
  glowLayer: { script: styled, arg: '.slot-glow, .slot-glow::before, .slot-glow::after { will-change: transform; }' },
  // (and moving between items: every item's fade into the slot's focus or out of it cut, the items dimmed and lit
  // without their filters, and the stash's view without its fading mask)
  noFocusFade: { script: styled, arg: '.sitem, .eslot { transition: none !important; }' },
  itemLayers: { script: styled, arg: '.sitem, .eslot { will-change: transform, opacity, filter; }' },
  itemMoveLayers: { script: styled, arg: '.sitem, .eslot { will-change: transform; }' },
  // (and the glow's own fade in and out cut, and the loops' layers made for good on every item that fits)
  noGlowFade: { script: styled, arg: '.slot-glow { transition: none !important; }' },
  glowOpacityFade: { script: styled, arg: '.slot-glow { transition-property: opacity !important; }' },
  // (and the items' filters switched at once while their opacity and size fade, and every fade half as long)
  filterSnap: { script: styled, arg: '.sitem, .eslot { transition-property: opacity, transform !important; }' },
  shortFades: { script: styled, arg: '.sitem, .eslot, .slot-glow { transition-duration: .15s !important; }' },
  // (and the items' filters on their icons, painted into the item's layer, where on the item each was a pass of the
  // compositor's own)
  iconFilter: {
    script: styled,
    arg: '#menu.slot-focus .sitem { filter: none !important; transition-property: opacity, transform !important; }'
      + ' #menu.slot-focus .sitem.match > .item-icon { filter: brightness(1.35); }'
      + ' #menu.slot-focus .sitem:not(.match) > .item-icon { filter: grayscale(.85); }',
  },
  glowSpanLayers: { script: styled, arg: '.match > .slot-glow span { will-change: transform; }' },
  noFocusFilter: { script: styled, arg: '#menu.slot-focus .sitem { filter: none !important; }' },
  noLitFilter: { script: styled, arg: '#menu.slot-focus .sitem.match { filter: none !important; }' },
  noDimFilter: { script: styled, arg: '#menu.slot-focus .sitem:not(.match) { filter: none !important; }' },
  noStashMask: { script: styled, arg: '#stash { mask-image: none !important; }' },
  // (and the arc chasing round the item under the pointer without the mask that keeps it to its border: a mask is a
  // pass of the compositor's own, drawn again each frame the arc turns)
  noArcMask: { script: styled, arg: '.glow-arc { mask: none !important; }' },
  // (or without the arc at all: neither its pass nor its loop)
  noArc: { script: styled, arg: '.glow-arc { display: none !important; }' },
  // (or the arc's turning square, half as wide again as the item, clipped to the ring's box: turned, its corners
  // reached over the items beside it)
  arcClipped: { script: styled, arg: '.glow-arc { overflow: hidden; }' },
  // (and the slot's focus without each of its looks in turn: the items that don't fit dimmed by their opacity (each a
  // layer holding its glow's, which an opacity can draw in a pass of its own), the others lit by their glows, and
  // lifted by their scale)
  noDim: { script: styled, arg: '#menu.slot-focus .sitem:not(.match) { opacity: 1 !important; }' },
  noLitGlow: { script: styled, arg: '.sitem:not(.focal) > .slot-glow { display: none !important; }' },
  noLift: { script: styled, arg: '.sitem.focal, #menu.slot-focus .sitem.match { transform: none !important; }' },
  // (and the lobby's panels stowed and shown again with Space: at once, with no fade or slide; faded without the
  // slide; on layers of their own for good, so a fade starting makes none)
  noStowFade: { script: styled, arg: '#menu .panel { transition: none !important; }' },
  stowFadeOnly: { script: styled, arg: '#menu .panel { transition-property: opacity !important; }' },
  stowLayers: { script: styled, arg: '#menu .panel { will-change: opacity, transform; }' },
  // (and the HUD's bar, shown in practice, hidden by opacity on a layer of its own rather than taken off the page,
  // so it's painted once; and the hints' words swapped by opacity)
  hudKept: {
    script: styled,
    arg: '#hud { will-change: opacity; } #hud.hidden { display: block !important; opacity: 0; }'
      + ' #hud.hidden, #hud.hidden * { pointer-events: none !important; }',
  },
  noLookHint: { script: styled, arg: '#look-hint { display: none !important; }' },
  noHudToggle: { script: styled, arg: '#hud.hidden { display: block !important; }' },
  stowHintKept: { script: styled, arg: '#menu .sh-show, #menu .sh-hide { display: inline !important; }' },
  // (and the overlays down the left, kept clear of the hero panel as it slides, moved by the compositor on a layer of
  // their own rather than laid out again at each move; or never moved)
  diagMoved: {
    script: styled,
    arg: '#diag { left: calc(10px * var(--ui, 1)) !important; translate: var(--clear-x, 0px) 0;'
      + ' will-change: translate; }',
  },
  diagStill: { script: styled, arg: '#diag { left: calc(10px * var(--ui, 1)) !important; }' },
  // (every page's dice from one seed: the same gear on each URL's fresh profile)
  seeded: { script: seeded, arg: 1 },
  // (and the glow's loops run on the item hovered and the slots alone, the other stash items that fit lit steady, or
  // pulsing)
  focusLoops: {
    script: styled,
    arg: '.sitem:not(:hover) > .slot-glow span, :not(.match) > .slot-glow span { animation: none !important; }',
  },
  focusLoopsPulse: {
    script: styled,
    arg: '.sitem:not(:hover) > .slot-glow :is(.glow-arc, .glow-sheen) > span, :not(.match) > .slot-glow span '
      + '{ animation: none !important; }',
  },
};
