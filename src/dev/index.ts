// The developer mode: a free camera with the game frozen, and a panel to set up anything to test (a wave and biome, foes,
// gear, god mode, the class) and to see what a moment costs. Only in a dev build or a PR preview's (main.ts loads it
// behind `__DEV_TOOLS__`, set by the preview's Docker build alone, and the preview's host): a production build has
// none of it, not a byte (`src/dev/AGENTS.md`). F8 opens the panel, F9 flies the free camera, F7 freezes the game.
import { G } from '../state';
import { Player } from '../entities/player';
import { updateFloaters } from '../ui/floaters';
import { applyFreeCam, freeCamOn, freeCamToHero, setFreeCam } from './freeCam';
import { dockPanel, initPanel, panelOpen, refreshPanel, toggleFly, togglePanel } from './panel';
import type { BiomeId } from '../data/biomes';

/** What main.ts does for the developer mode: the game's own flows, so a wave or a class switch is set up as play
 *  sets it up. */
export interface DevHooks {
  /** a run at `wave` in `biome` (a run on now is left first) */
  startWave(wave: number, biome: BiomeId, training: boolean): void;
  /** back to the lobby */
  toLobby(): void;
  /** restart the loaded wave or restore the lobby, reviving and replacing the hero */
  reset(): void;
  /** the hero of class `id` in the lobby (in a run: not until it's left) */
  switchClass(id: string): void;
  /** the hero's gear changed: his stats, model and skill bar again */
  gearChanged(): void;
  /** the top view, so the free camera's start and end look from where the game's does */
  topView(): void;
  /** the pause menu open on its Performance tab (Profile this spot, the overlay's size) */
  openPerformance(): void;
  /** `fn` once the fight's programs are warm (at once if they are): a foe of another biome compiles nothing */
  whenFightWarm(fn: () => void): void;
}

/** What main.ts asks of the developer mode each frame. */
export interface DevApi {
  /** the game's step this frame from the browser's `dt`: 0 frozen (nothing moves but the free camera), else slowed
   *  or sped up, or one step while frozen */
  simDt(dt: number): number;
  /** a frame's end before it's drawn: the free camera flown and placed (`dt`: the browser's, frozen or not) */
  frame(dt: number): void;
  /** the cursor is wanted (the panel or the free camera): the close views' mouse look mustn't hold the pointer */
  wantsCursor(): boolean;
}

/** the game's time: frozen, its speed, and a step asked for while frozen */
export const time = { frozen: false, scale: 1, step: 0 };
/** one step of a frozen game (s) */
const STEP = 1 / 60;
/** the hero takes no damage */
export const cheats = { god: false, free: false };

export function setFrozen(on: boolean): void { time.frozen = on; refreshPanel(); }
export function stepFrozen(): void { if (time.frozen) time.step++; }

/** No damage while god mode is on: a hit on the local hero doesn't land (as a guarded one doesn't). */
function patchGodMode(): void {
  const take = Player.prototype.takeDamage;
  Player.prototype.takeDamage = function (this: Player, ...args: Parameters<Player['takeDamage']>) {
    if (cheats.god && this.local) return null;
    return take.apply(this, args);
  };
}

/** The free camera on, from the top view and frozen (to look at a moment from any angle), or off and running again. */
export function flyFree(on: boolean, hooks: DevHooks): void {
  if (on === freeCamOn()) return;
  if (on) hooks.topView();
  setFreeCam(on);
  document.body.classList.toggle('dev-flying', on);
  if (on) time.frozen = true;
  else time.frozen = false;
  refreshPanel();
}

export function initDev(hooks: DevHooks): DevApi {
  patchGodMode();
  initPanel(hooks);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return;
    if (e.code === 'F8') { e.preventDefault(); togglePanel(); }
    else if (e.code === 'F9') { e.preventDefault(); toggleFly(); }
    else if (e.code === 'F7') { e.preventDefault(); setFrozen(!time.frozen); }
    else if (freeCamOn() && !G.menuOpen) {
      // (the free camera's own keys: the hero stands idle, so none of them is his)
      if (e.code === 'KeyF') setFrozen(!time.frozen);
      else if (e.code === 'Period') stepFrozen();
      else if (e.code === 'KeyR') freeCamToHero();
    }
  });
  console.info('Developer mode: F8 the panel, F9 the free camera, F7 freeze');
  return {
    simDt(dt) {
      if (!time.frozen) return dt * time.scale;
      if (time.step <= 0) return 0;
      time.step--;
      return STEP;
    },
    frame(dt) {
      dockPanel();
      if (cheats.free) {
        G.player.energy = G.player.stats.maxEnergy;
        G.player.cooldowns.clear();
      }
      applyFreeCam(dt);
      // Labels must project through the flown camera even while simulation is frozen.
      if (freeCamOn()) updateFloaters(0);
    },
    wantsCursor: () => panelOpen() || freeCamOn(),
  };
}
