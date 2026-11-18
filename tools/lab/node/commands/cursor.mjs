// `npm run lab -- cursor`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab cursor`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the cursor drawn over mouse look while Alt is held, in each close view (the lab\'s browser playing the '
    + 'pointer lock: the view held still as the mouse moves, the cursor drawn where it went and lit over a button, '
    + 'the battle log\'s Pause clicked without an attack, a hotbar slot\'s tooltip, the wheel scrolling the log\'s '
    + 'lines and not zooming, the world not attacked; Alt let go, mouse look again; the lock held and the run going '
    + 'on); then Esc pressed again and again, quickly, held and repeating, as each browser hands it over with the '
    + 'lock held (in a window, full screen with and without Esc locked, the lock\'s answers late): each press '
    + 'toggling the pause menu once, in a run\'s views and the lobby\'s (`--parts esc`, #554)',
  help: 'the cursor drawn over mouse look while Alt is held: in each close view the pointer locked as the player\'s '
    + 'click takes it (the lab\'s browser plays the lock, every event of the mouse sent to the game\'s canvas while '
    + 'it\'s held), then Alt held: the mouse moved onto the battle log\'s Pause must leave the view still and draw '
    + 'the cursor there, lit; its click must pause the log and not attack; over the hotbar\'s slot its tooltip must '
    + 'show; the wheel over the log\'s lines must scroll them, not zoom; a click on the world must not attack; Alt '
    + 'let go, the mouse turns the view again; the lock held and the run going on throughout. Then Esc (#554): '
    + 'pressed again and again and quickly as each browser hands it over with the lock held (Chrome in a window, '
    + 'in full screen with Esc locked, a browser handing the keydown over too, full screen left without the lock), '
    + 'held and repeating, the lock\'s answers late: each press must toggle the pause menu once, in a run\'s views '
    + 'and the lobby\'s, and nothing change it in the second after',
  options: {
    parts: {
      kind: 'list',
      usage: 'a,b',
      choices: ['alt', 'esc'],
      default: 'alt,esc',
      help: 'the parts run: alt (the cursor over mouse look), esc (Esc and the pause menu)',
    },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['third', 'first'],
      default: 'third,first',
      help: 'the close views: third, first',
    },
    canary: {
      kind: 'switch',
      help: 'hold Ctrl instead, a key that frees nothing: the checks must find the view turning with the mouse and '
        + 'the click on Pause landing on the world; and read Esc as before #554: a press must be found toggling the '
        + 'pause menu twice or not at all',
    },
    at: SETUP_OPTIONS.at,
    facing: SETUP_OPTIONS.facing,
    gear: SETUP_OPTIONS.gear,
    weapon: SETUP_OPTIONS.weapon,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      views: options.views,
      parts: options.parts,
      canary: Boolean(options.canary),
    };
    return side.command('cursor', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('cursor'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
