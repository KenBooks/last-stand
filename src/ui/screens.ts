// The screens of their own, a folder each (src/ui/screens/<id>/: its module, its panel's markup `<id>.html` and its
// styles `_<id>.scss`), found here, and by the build for their markup and styles (vite.config.ts `htmlParts` and
// `screenStyles`): a new screen is a folder, and touches neither main.ts, index.html nor the stylesheets' list. Each
// module registers itself (`screen` in screenKit.ts) and, if it's a dialog, its open and close (ui/dialogs.ts).
import { SCREENS } from './screenKit';

// (every screen's modules, loaded for what they register)
import.meta.glob('./screens/*/*.ts', { eager: true });

/** Every screen started, as the game boots (`village`: the village's lobby, the beta on). */
export function initScreens(village: boolean): void {
  for (const s of SCREENS) if (village || !s.village) s.init();
}

/** Every screen's step for this frame. */
export function frameScreens(): void {
  for (const s of SCREENS) s.frame?.();
}
