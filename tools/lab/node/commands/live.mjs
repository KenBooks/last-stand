// `npm run lab -- live`: its command line (help, options) (node/commands/AGENTS.md).
import { LOOK_OPTION, SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab live`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a page kept between steps for trying by hand (start, picture in any look with a reference over it, '
    + 'inspect, eval, frames): under a second a picture',
  help: 'a page of the game kept between steps, each on the state the last one left (needs npm run lab:serve): '
    + 'start (--class, the set-up), picture (--views, --look, --on, --over, --crop), inspect [name] (--depth), eval '
    + '<expression>, frames <count>, log, stop; its pictures in tools/lab/out/live (tools/lab/COMMANDS.md)',
  argument: 'step',
  options: {
    views: {
      kind: 'list',
      usage: 'a,b',
      help: 'picture: the views (through the eyes eyes, else third by default; screen: the page with its UI)',
    },
    look: LOOK_OPTION,
    focus: { kind: 'text', usage: 'joint', help: 'picture: close-ups framed on a joint (head, handL...)' },
    distance: {
      kind: 'number',
      usage: 'm',
      help: 'picture: a close-up\'s distance from what it\'s framed on (1.7 from a joint, 4.3 from the body)',
    },
    over: {
      kind: 'text',
      usage: 'picture',
      help: 'picture: a reference (PNG, JPEG or WebP, a path) laid over each picture, stretched to it',
    },
    strength: { kind: 'number', usage: 'share', help: 'picture: how strongly --over is laid (0.5 by default)' },
    on: {
      kind: 'list',
      usage: 'x,y,z',
      help: 'picture: close-ups framed on this place in the world (m) instead of the hero: a prop, from --views',
    },
    crop: {
      kind: 'list',
      usage: 'l,t,r,b',
      help: 'picture: the part of each picture kept, its edges as shares of it (0.5,0,1,0.6)',
    },
    canary: {
      kind: 'switch',
      help: 'picture: the hero hidden and pictured in the parts look too, where no part of him may be found',
    },
    depth: { kind: 'number', usage: 'n', default: '1', help: 'inspect: the levels under it listed (1)' },
    class: COMMON_OPTIONS.class,
    screen: {
      ...COMMON_OPTIONS.screen,
      help: 'start: the page put on a screen of this size (css px) and pixel ratio once it has booted (a phone\'s: '
        + '832x384@3.75)',
    },
    ...SETUP_OPTIONS,
  },
};
