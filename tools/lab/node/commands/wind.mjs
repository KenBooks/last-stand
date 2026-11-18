// `npm run lab -- wind`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab wind`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the loading screen\'s exit as it hands over to the lobby\'s logo (run on the lab\'s clock, the window '
    + 'resized as the particles fly with `--resize`: the particles\' picture as each column of it rests, read from '
    + 'the exit\'s canvas, against the logo once the exit is done, at the screen\'s own pixels: the pixels apart and '
    + 'which way the logo stands from them)',
  help: 'the loading screen\'s exit as it hands over to the lobby\'s logo: the loading screen put back over the '
    + 'lobby and its exit run on the lab\'s clock, the particles\' picture read from the exit\'s canvas column by '
    + 'column as each rests in the logo\'s place, laid over the lobby behind them, against the lobby logo once the '
    + 'exit is done, both at the screen\'s own pixels: the pixels apart and which way the logo stands from them (a '
    + 'jump the player sees as the logo takes over): tools/lab/out/wind',
  options: {
    resize: {
      kind: 'screenList',
      usage: 'WxH[@ratio],...',
      help: 'the window put on these screens one after another as the particles fly, the last where they land '
        + '(1920x1080@1.25,1536x864@1.25 on --screen 1536x864@1.25: full screen and back at 125%)',
    },
    canary: {
      kind: 'switch',
      help: 'the lobby logo pictured a pixel lower than it is after the exit: the jump must be found, a pixel down',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = { resize: options.resize ?? [], canary: Boolean(options.canary) };
    return side.command('wind', command);
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('wind'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
