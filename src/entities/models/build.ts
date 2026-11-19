// A body's build: what its hands and forearms are made from, as numbers, so every hero and person of the game, those
// there now and those to come, sizes them from one place instead of each model tuning its own. A hand's build sets its
// sculpt (`handShape.ts`: its digits' widths, its palm's breadth and depth, its knuckles), and its forearm's is read
// off the hand's own wrist (`wristOf`), so what dresses the forearm (a wrap, a sleeve, a cuff) is sized on the arm
// under it. From play, the warrior's fists were "fists of a software engineer", his wrists and arms thin ("its a
// warrior dude"), and each fix of the wrap's radii by hand went round again: "we need parametric wrists".

/** A hand's build, against the plain hand's sizes (1 each): kept by `name` (its sculpt is made once a side and build,
 *  and a worker is told which by it). */
export interface HandBuild {
  name: string;
  /** the digits' widths (the fingers' and the thumb's) */
  digits: number;
  /** the palm's breadth across, the digits' roots spread across it (at least `digits`, or the fingers press into
   *  each other) and the thumb's length with it */
  wide: number;
  /** the wrist's breadth and depth: a broad palm's wrist is not broader by as much (with the palm's 1.12, the wrapped
   *  forearm stood 8.6 cm across at the wrist, a stiff tube the fist looked small under) */
  wrist: number;
  /** the palm's depth from its back to its front, and the wrist's with it */
  deep: number;
  /** the knuckles' heads across the back of the hand, their size over the fingers' widths */
  knuckles: number;
  /** the thumb's breadth over the fingers' (its depth kept): a man's thumb is his stoutest digit, 26% of his hand's
   *  breadth at its joint to a finger's 24% */
  thumb: number;
  /** sculpted closed in its fist too (`closeFist`), shown bare while the fist is shut (`hands.ts`' `shut`): a fighter's
   *  hand. Sculpted open and bent shut, a fist's fingers were tubes apart, grooves between them, and its thumb a stick
   *  off the palm with the web open under it (from play: "this is not a natural fist shape"); sculpted shut, the flesh
   *  pressed together is one surface, as a fist's is. Opened, a hand sculpted shut tore where its fingers had met. */
  fist: boolean;
}

/** a hand as it was sculpted before builds: the mage's, the ranger's, the villagers' */
export const PLAIN: HandBuild = {
  name: 'plain', digits: 1, wide: 1, deep: 1, wrist: 1, knuckles: 1, thumb: 1, fist: false,
};

/** a fighter's hand: thick digits and broad knuckles on a deep palm (a man's hand who has worked with it: the fingers
 *  and the palm a tenth broader than the median man's, the largest men's; from play, "need bigger fists tho"). Its
 *  wrist a man's for that hand: at the plain hand's, it was 0.63 of the hand's breadth to a man's 0.67. Sizes checked
 *  by `node tools/handref/sizes.mjs`: at digits 1.12 and deep 1.14 the last joints were a fifth broader than a man's
 *  and the palm over a quarter thicker; at wide 1.12 on a wrist of 1.08 the wrist was 0.57 of the palm's breadth, the
 *  palm a paddle on it, and the thumb at the fingers' width was thinner than the index (an adversarial review of its
 *  proportions) */
export const HEAVY: HandBuild = {
  name: 'heavy', digits: 1.07, wide: 1.06, deep: 1.04, wrist: 1.2, knuckles: 1.15, thumb: 1.15, fist: true,
};

/** every build by name (a worker sculpting a hand is told its build's name) */
export const HAND_BUILDS: Record<string, HandBuild> = { plain: PLAIN, heavy: HEAVY };

/** the plain hand's wrist where the forearm takes over (`handShape.ts`' wrist tube at the hand's joint): its half-width
 *  across and its depth over its width (m, at the hand's scale 1) */
const WRIST = { half: 0.028, depth: 0.66 };

/** A forearm's section: its half-width across (x) and half-depth (z, back to front), m. */
export type Section = [number, number];

/** The wrist's section where a hand of `build` drawn `k` times its size meets its forearm. */
export function wristOf(build: HandBuild, k: number): Section {
  const half = WRIST.half * build.wrist * k;
  return [half, half * WRIST.depth];
}

/** A forearm's build: its section at its widest (the muscles' belly a third of the way down from the elbow) and where
 *  that is, as a share of the way from the wrist up to the elbow; at the wrist it is its hand's (`wristOf`). */
export interface ForearmBuild {
  belly: Section;
  /** where the belly is: 0 the wrist, 1 the elbow */
  bellyAt: number;
}

/** a fighter's forearm, the wrap over it 9.2 cm across under the sleeve's cuff, as it looked right in play before
 *  builds (at 11.5, its belly 10.6 cm across the skin, the wrap was a cardboard tube and the fists small under it) */
// (and 10 cm across on a hand a man's size: a man's forearm is 1.6 times his wrist across at its widest, and at 8.3
// under a fist its right size the wrap was a stick the fist sat on as a ball, a review of its proportions)
export const FIGHTER_FOREARM: ForearmBuild = { belly: [0.05, 0.038], bellyAt: 0.5 };

/** The forearm's section `y` up from the wrist (m) on a forearm `length` long, its wrist `wrist`: eased from the wrist
 *  out to the belly and held there to the elbow. */
export function forearmAt(forearm: ForearmBuild, wrist: Section, length: number, y: number): Section {
  const t = Math.min(1, Math.max(0, y / (forearm.bellyAt * length)));
  const ease = t * t * (3 - 2 * t);
  return [
    wrist[0] + (forearm.belly[0] - wrist[0]) * ease,
    wrist[1] + (forearm.belly[1] - wrist[1]) * ease,
  ];
}

/** An oval's perimeter with half-axes `a` and `b` (Ramanujan's): a section's girth, as a tape measures it. */
export function girth([a, b]: Section): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/** An arm's build, as its hand is built (`buildHand`'s `build` and `k`) and what dresses its forearm reads it. */
export interface ArmBuild {
  hand: HandBuild;
  /** how many times its plain size the hand is drawn */
  k: number;
  forearm: ForearmBuild;
}

/** The forearm's section of `arm` `y` up from its wrist (m), on a forearm `length` long. */
export function armSection(arm: ArmBuild, length: number, y: number): Section {
  return forearmAt(arm.forearm, wristOf(arm.hand, arm.k), length, y);
}
