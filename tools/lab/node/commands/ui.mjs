// `npm run lab -- ui`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { labError } from '../errors.mjs';
import { REPO } from '../paths.mjs';
import { canaryVerdict, withAsks } from '../production.mjs';
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** where the UI's states are, a module each (page/uiStates/<state>.ts, its name the state's) */
export const UI_STATES_DIR = join(REPO, 'tools', 'lab', 'page', 'uiStates');
/** a state module's place in the run, its `order: n` line (page/uiKit.ts `Steps`) */
const ORDER_LINE = /^\s*order:\s*(\d+),?\s*$/gm;

/** The place in the run of the state module `file` holds as `text`: its one `order: n` line's number. */
function orderOf(file, text) {
  const orders = [...text.matchAll(ORDER_LINE)];
  if (orders.length !== 1) {
    throw labError(`ui: ${file} has ${orders.length} \`order: n\` lines, not one (page/uiKit.ts \`Steps\`)`);
  }
  return Number(orders[0][1]);
}

/**
 * The UI's states in `folder` (a TypeScript module each, read as text: the command line imports no TypeScript), by
 * their names, in their `order`; two states at one place are refused, so the run's order is never left to chance.
 */
export function uiStatesIn(folder) {
  const files = readdirSync(folder).filter((file) => file.endsWith('.ts'));
  const states = files.map((file) => {
    const order = orderOf(file, readFileSync(join(folder, file), 'utf8'));
    return { name: basename(file, '.ts'), order };
  });
  states.sort((a, b) => a.order - b.order);
  for (let i = 1; i < states.length; i++) {
    if (states[i].order !== states[i - 1].order) continue;
    throw labError(`ui: ${states[i - 1].name} and ${states[i].name} are both at order ${states[i].order}`);
  }
  return states.map((state) => state.name);
}

/** the UI's states `ui` pictures, in the order it runs them: the lobby's, then the run's (page/uiStates) */
export const UI_STATES = uiStatesIn(UI_STATES_DIR);

/** `lab ui`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'pictures the UI in its states (the lobby, the stash, tooltips, the dialogs, the hero selection screen, '
    + 'the run\'s HUD, the pause menu\'s tabs, the summary, the touch HUD...) at each screen size, each fitting the '
    + 'window (`--states`, `--screens`; in full in `commands/ui.md`)',
  help: 'the game\'s UI as the player sees it, each state pictured whole with its named elements\' and the world\'s '
    + 'labels\' boxes as shares of the window, the game\'s cursor over all of it and every digit shown on its line: '
    + 'with --screens, whether the UI is the same share of the screen on both (tools/lab/out/ui)',
  options: {
    states: {
      kind: 'list',
      usage: 'a,b',
      choices: UI_STATES,
      help: 'the states (every one by default): lobby, tooltip, glow (the stash\'s items lit for a hovered item\'s '
        + 'slot, pictured at set moments of its loops, each of which must animate only what the compositor moves), '
        + 'help, saves, heroes (the hero selection screen opened by Change hero: the hero in focus in the room '
        + 'its panel leaves, its parts within the window and none over another, the hero beside clicked into focus, '
        + 'Esc back to the lobby), readying (the fight\'s loading bar over the lobby: within the window, its label '
        + 'on a line), readyingHeroes (Change hero clicked with the heroes\' programs cold: the bar says it readies '
        + 'the heroes), clicked (the crypt\'s portal card left by its Leave clicked and a key pressed after it: '
        + 'where the focus went), views (the lobby\'s camera switched through its views from the training yard: '
        + 'the labels over the dummies against their anchors), '
        + 'behindProps (a column planted between the camera and each dummy\'s label: '
        + 'every label hidden behind it, every one shown with it gone; the canary plants it aside), sitHint (the '
        + 'mouse rested on the nearest seat: the hint E Sit shown within the window, gone once it leaves; the canary '
        + 'hides it), run (the HUD '
        + 'with a hurt foe\'s bar and damage numbers), '
        + 'scores, perf, perfMini (the performance overlay\'s Mini pressed in the pause menu: the frame rate '
        + 'and its graph alone, then Full and Off), perfGraph (the overlay\'s frame rate and graph scale read '
        + 'after every frame of its first 5 s, never far over the frames\' own rate; the canary runs a burst of '
        + 'frames 1 ms apart), decision, pause, summary, '
        + 'skillTips (each skill\'s tooltip on the hotbar opened by the '
        + 'mouse, within the window; the tallest pictured; skillTipsTouch: the lobby\'s by a finger\'s tap), log '
        + '(the battle log with hits dealt and taken: every '
        + 'line shown, within the screen, over nothing of the HUD), logLobby (the same over the lobby, clear of its '
        + 'panels), pauseLobby (the pause menu in the village: its time of day shown, holding the hour it is '
        + 'moved to and giving the clock back at Auto; none in the pause menu of a run), '
        + 'logTouch (the same in touch mode: clear of the touch HUD, touches let through), hudTouch (the touch '
        + 'HUD\'s top corners at the screen\'s edges, none of its corners\' controls over another; --insets for a '
        + 'phone\'s cutout), decisionTouch (the choice after a wave in touch mode: on a short screen within its top '
        + '30%, its buttons a finger\'s height), sheetTouch (a stash shield\'s sheet opened by a tap, its card '
        + 'beside the worn one\'s: its buttons within the window and the sheet), litTouch (a worn item pressed long: '
        + 'the stash items that fit its slot lit until a tap elsewhere), buttonsTouch and buttonsRunTouch '
        + '(every touch button shown in the lobby, its practice and a run: nothing over its middle, and a '
        + 'finger\'s tap there does what it\'s for; the canary lays a clear sheet over the pause button), '
        + 'bugReport and bugReportTouch (the bug report\'s form opened from the pause menu, by the mouse in the '
        + 'lobby and a finger over a run: within the window, each control found, a report made of it and sent '
        + 'to a reports service of the lab\'s own, failed once and sent again, then read back; the canary makes '
        + 'its box twice the window\'s height and drops the report\'s picture on its way)',
    },
    hdr: { kind: 'switch', help: 'HDR on, as on a display in HDR mode (the pause menu shows its levels)' },
    canary: {
      kind: 'switch',
      help: 'plant the system\'s cursor on the page\'s body in each state, old-style digits on it and the labels\' '
        + 'lining twin taken away (the skill tooltips made as tall as the window): each check must find its own',
    },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    // (a state at a time, in the order they run: a 4K screen's ten pictures sent back at once closed the browser)
    const states = UI_STATES.filter((state) => (options.states ?? UI_STATES).includes(state));
    const canary = Boolean(options.canary);
    // (the bug report's form sends to a reports service of the lab's own, read back here: never production's)
    const { checkReportSent, startTracesService } = await import('../tracesService.mjs');
    const service = states.includes('bugReport') ? await startTracesService(new URL(side.url).origin) : null;
    const reports = [];
    // (each state's asks of production its own problems; the canary lets the saves service's health go to
    // production's host again, which the guard must refuse and catch: production.mjs)
    const booting = withAsks({ text: 'boot', problems: [], moments: [] }, 'boot', side.production.take(), false);
    side.production.answersHealth = !canary;
    try {
      for (const state of states) {
        const command = { state, hdr: Boolean(options.hdr), canary, reports: service?.url };
        const report = await side.command('ui', command);
        const read = state === 'bugReport' ? await checkReportSent(report, service, canary) : report;
        reports.push(withAsks(read, state, side.production.take(), canary));
      }
    } finally {
      side.production.answersHealth = true;
      await service?.close();
    }
    const lines = [booting.text, ...reports.map((report) => report.text)];
    const problems = [...booting.problems, ...reports.flatMap((report) => report.problems)];
    if (canary) {
      const verdict = canaryVerdict(states, reports);
      lines.push(verdict.line);
      if (verdict.problem) problems.push(verdict.problem);
    }
    return { text: lines.join('\n'), problems, moments: reports.flatMap((report) => report.moments) };
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('ui'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
