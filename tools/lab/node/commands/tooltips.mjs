// `npm run lab -- tooltips`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab tooltips`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'each damage skill\'s tooltip held to the hits it deals (the hero given modifiers of every kind, each '
    + 'skill cast at foes in each way of holding weapons: every hit within a figure its tooltip states, a crit raised '
    + 'by its share, a crit\'s chance the hero\'s, a channel\'s ticks as often as it says; the hotbar\'s tooltip '
    + 'following a weapon\'s damage changed; the draught\'s heal and Iron Bellow\'s ward as stated)',
  help: 'each damage skill\'s tooltip held to the hits it deals: the hero given modifiers of every kind (all, '
    + 'arcane and elemental damage, a crit\'s chance and share, casting speed), each skill he can use, in each way '
    + 'of holding weapons his class has (or --gear\'s), cast at foes stood where it strikes as hits casts it; every '
    + 'hit must be within a figure its tooltip states (a crit raised by its share), a crit\'s chance the hero\'s, '
    + 'and a hit dealt over time as often as it says; the hotbar\'s tooltip must follow a change of his gear, and '
    + 'a skill giving him Health or a ward must give what its tooltip states',
  options: {
    skills: { kind: 'list', usage: 'a,b', help: 'the skills cast (every one dealing damage he can use by default)' },
    canary: {
      kind: 'switch',
      help: 'raise all damage and the hero\'s most Health once each tooltip is read, as a tooltip behind a change: '
        + 'the hits must be found above it, and what was given off it',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      skills: options.skills ?? [],
      canary: Boolean(options.canary),
    };
    return side.command('tooltips', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
