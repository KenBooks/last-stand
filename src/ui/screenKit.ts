// What a screen of its own registers (ui/screens.ts finds every one, src/ui/screens/<id>/): how it starts as the game
// boots and what it does each frame. Imports nothing, so a screen's module can register as it loads, whatever order
// the modules load in (the screens are loaded by a glob, as the foes are).

/** A screen: started at boot, and stepped each frame if it needs to be. */
export interface Screen {
  /** its buttons bound and its panel made ready, once, as the game boots */
  init(): void;
  /** each frame, after the game's update (a window kept in step with what changes under it) */
  frame?(): void;
}

/** every screen registered, in the order their modules loaded */
export const SCREENS: Screen[] = [];

/** `s` registered, started and stepped with every other (ui/screens.ts). */
export function screen(s: Screen): void {
  SCREENS.push(s);
}
