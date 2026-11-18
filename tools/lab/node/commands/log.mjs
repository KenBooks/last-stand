// `npm run lab -- log`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { fixtureFrom, asText, problemsIn } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab log`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the battle log held to every hit as it lands (each skill cast at foes, in each way of holding weapons: '
    + 'each hit listed once and in turn, under its skill, on its foe, for what it dealt, of its type, a crit and a '
    + 'kill as they were, the panel showing every line; three foes striking, one shooting and one slamming the hero: '
    + 'each blow under the foe\'s name and attack, for what it took and what was stopped; each row naming the hero '
    + 'alone on his side; paused, nothing listed)',
  help: 'the battle log held to the hits as they land: each skill the hero can use, in each way of holding weapons '
    + 'his class has (or --gear\'s), cast at foes stood where it strikes as hits casts it, and the basic attack at '
    + 'foes it kills; each hit must be listed once and in turn, under the skill cast, on the foe it struck, for what '
    + 'it dealt, of its type, a crit and a kill as they were, and the panel must show every line; then a foe of each '
    + 'way of attacking (a blow, a bolt, a slam) strikes the hero, each blow listed under its name and attack, for '
    + 'the life it took and what his shield and ward stopped (log --class warrior --gear dual)',
  options: {
    skills: { kind: 'list', usage: 'a,b', help: 'the skills cast (every one the hero can use by default)' },
    canary: {
      kind: 'switch',
      help: 'plant the faults the checks must catch: a hit in each cast listed under another skill, and a blow on '
        + 'the hero from no foe',
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
    return side.command('log', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
