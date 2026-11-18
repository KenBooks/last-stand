// The battle log's states of `lab ui` (`uiStates/log.ts`, `logLobby.ts`, `logTouch.ts`): hits dealt and taken listed
// in it, and its panel checked: a row for each line, within the window, over nothing of the HUD.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import type { DamageType, SkillDef } from '../../../src/types';
import type { Enemy } from '../../../src/entities/enemy';
import { DAMAGE_TYPES, hitEnemy, hurtPlayer } from '../../../src/combat/damage';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { battleLog } from './battleLog';
import { boxText } from './uiKit';
import type { Found } from './uiKit';

/** the battle log's hits: each skill on a key struck at the run's foe this many times, and its blows on the hero; then
 *  the frames run for the panel to draw them (it draws every 0.1 s at most) */
const LOG_STRIKES = 2;
const LOG_BLOWS = 2;
export const LOG_FRAMES = 12;
/** how far apart the tops of the battle log's head's parts may be on one line (css px: a line is ~13) */
const HEAD_SLACK = 6;

/** the lines the battle log listed for its state (-1: no log in this tree) */
export const logListed = { lines: -1 };

/** A skill's damage type as its tags say (its behaviour picks it; the physical when they don't say). */
function typeOf(def: SkillDef): DamageType {
  return DAMAGE_TYPES.find((type) => def.tags.includes(type)) ?? 'physical';
}

/** The game's battle log module, as `battleLog` finds it. */
export type BattleLog = NonNullable<Awaited<ReturnType<typeof battleLog>>>;

/** The battle log shown and cleared, and each skill on a key struck at `foe` `LOG_STRIKES` times (the foe kept alive
 *  through them and given back the life it had). Null in a tree without a log. */
export async function logStrikes(foe: Enemy | undefined): Promise<BattleLog | null> {
  const game = await battleLog();
  logListed.lines = -1;
  if (!game) return null;
  if (!foe) throw new Error('lab: ui: no foe for the battle log to list hits on');
  game.setBattleLog(true, false);
  game.clearBattleLog();
  const hero = G.player;
  const life = foe.life;
  foe.life = foe.maxLife * 100;
  for (const key of SKILL_KEYS) {
    const def = hero.skillAt(key)?.def;
    if (!def?.damage) continue;
    for (let strike = 0; strike < LOG_STRIKES; strike++) {
      hitEnemy(foe, def.damage, { by: hero, skill: def, type: typeOf(def), silent: true });
    }
  }
  foe.life = life;
  return game;
}

/** The battle log shown over the run, each skill struck at the run's foe and the foe's blows on the hero listed in
 *  it, the panel drawn after. */
export async function openLog(lab: Lab): Promise<void> {
  const foe = G.enemies.find((enemy) => enemy.alive);
  const game = await logStrikes(foe);
  if (!game || !foe) return;
  for (let blow = 0; blow < LOG_BLOWS; blow++) {
    hurtPlayer(G.player, foe.damage, foe.def.damageType, foe.pos, { foe, attack: 'strike' });
  }
  logListed.lines = game.battleLogLines().length;
  // (paused from its panel, its head at its widest)
  document.querySelector<HTMLElement>('#blog [data-bl="pause"]')?.click();
  await lab.step(LOG_FRAMES);
}

/** The battle log let go of and hidden. */
export async function closeLog(): Promise<void> {
  const game = await battleLog();
  game?.pauseBattleLog?.(false);
  game?.setBattleLog(false, false);
}

/** The page's named elements shown that `panel` lies over, other than the layers as wide as the screen it lies on
 *  (the HUD, the touch controls' pad: a third of the window or more). */
function namedUnder(panel: HTMLElement): string[] {
  const box = panel.getBoundingClientRect();
  const covered: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    if (element.contains(panel) || panel.contains(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.width * rect.height >= innerWidth * innerHeight / 3) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const across = rect.left < box.right && box.left < rect.right;
    if (across && rect.top < box.bottom && box.top < rect.bottom) covered.push(`#${element.id}`);
  }
  return covered;
}

/** The battle log's panel: a row for every line it listed, within the window, over nothing of the HUD, and no row
 *  wider than the panel. */
export function logShown(): Found {
  const listed = logListed.lines;
  if (listed < 0) return { lines: ['  no battle log in this tree'], problems: [] };
  const panel = document.getElementById('blog')!;
  const rows = panel.querySelectorAll('.bl-line').length;
  const box = panel.getBoundingClientRect();
  const list = panel.querySelector<HTMLElement>('.bl-lines')!;
  const lines = [`  battle log: ${listed} lines listed, ${rows} shown`];
  const problems: string[] = [];
  if (rows !== listed) problems.push(`log: the panel shows ${rows} lines of the ${listed} listed`);
  const covered = namedUnder(panel);
  if (covered.length) problems.push(`log: the panel lies over ${covered.join(', ')}`);
  if (box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5) {
    const where = boxText({ x: box.x, y: box.y, w: box.width, h: box.height });
    problems.push(`log: the panel reaches past the window (${where})`);
  }
  if (list.scrollWidth > list.clientWidth + 0.5) {
    problems.push(`log: its lines are ${list.scrollWidth} px wide, in a panel ${list.clientWidth} px wide`);
  }
  const head = panel.querySelector<HTMLElement>('.bl-head')!;
  const tops = [...head.children].map((part) => part.getBoundingClientRect().top);
  const wrapped = Math.max(...tops) - Math.min(...tops) > HEAD_SLACK;
  if (head.scrollWidth > head.clientWidth + 0.5 || wrapped) {
    problems.push(`log: its head (${head.textContent?.trim()}) doesn't fit on a line of the panel`);
  }
  return { lines, problems };
}
