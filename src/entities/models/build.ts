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
  /** the palm's breadth across, the digits' roots spread across it, and the wrist's with it (at least `digits`, or the
   *  fingers press into each other) */
  wide: number;
  /** the palm's depth from its back to its front, and the wrist's with it */
  deep: number;
  /** the knuckles' heads across the back of the hand, their size over the fingers' widths */
  knuckles: number;
}

/** a hand as it was sculpted before builds: the mage's, the ranger's, the villagers' */
export const PLAIN: HandBuild = { name: 'plain', digits: 1, wide: 1, deep: 1, knuckles: 1 };

/** a fighter's hand: thick digits and broad knuckles on a deep palm (a man's hand who has worked with it: the fingers
 *  some 12% wider at their joints than an office worker's, the palm deeper; from play, "need bigger fists tho") */
export const HEAVY: HandBuild = { name: 'heavy', digits: 1.12, wide: 1.12, deep: 1.14, knuckles: 1.15 };

/** every build by name (a worker sculpting a hand is told its build's name) */
export const HAND_BUILDS: Record<string, HandBuild> = { plain: PLAIN, heavy: HEAVY };

/** the plain hand's wrist where the forearm takes over (`handShape.ts`' wrist tube at the hand's joint): its half-width
 *  across and its depth over its width (m, at the hand's scale 1) */
const WRIST = { half: 0.028, depth: 0.66 };

/** A forearm's section: its half-width across (x) and half-depth (z, back to front), m. */
export type Section = [number, number];

/** The wrist's section where a hand of `build` drawn `k` times its size meets its forearm. */
export function wristOf(build: HandBuild, k: number): Section {
  const half = WRIST.half * build.wide * k;
  return [half, WRIST.half * WRIST.depth * build.deep * k];
}

/** A forearm's build: its section at its widest (the muscles' belly a third of the way down from the elbow) and where
 *  that is, as a share of the way from the wrist up to the elbow; at the wrist it is its hand's (`wristOf`). */
export interface ForearmBuild {
  belly: Section;
  /** where the belly is: 0 the wrist, 1 the elbow */
  bellyAt: number;
}

/** a fighter's forearm: 29 cm round at its belly over a 21 cm wrist (a man's 27 over 17, a strongman's 32 to 35) */
export const FIGHTER_FOREARM: ForearmBuild = { belly: [0.053, 0.04], bellyAt: 0.68 };

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
