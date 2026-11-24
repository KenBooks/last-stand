// `npm run lab -- gear`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** the sets `gear` rolls for each class at each tier unless `--sets` says */
const GEAR_SETS = 400;

/** the rarities loot rolls (src/data/items.ts `RARITIES`) */
const RARITIES = ['common', 'magic', 'rare', 'epic', 'legendary', 'ascendant', 'ultimate'];

/** A `gear` tier from its option (`epic@30`: a rarity at an item level), checked. */
function gearTier(text) {
  const [rarity, level] = text.split('@');
  const ilvl = Number(level);
  if (!RARITIES.includes(rarity) || !(ilvl >= 1)) {
    throw labError(`gear --tiers: ${text} is not a rarity at an item level (${RARITIES.join(', ')}; epic@30)`);
  }
  return { rarity, ilvl: Math.round(ilvl) };
}

/** `lab gear`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'full sets of gear rolled for every class at each tier (the Health, regeneration and draught they give, '
    + 'and the damage they multiply)',
  help: 'full sets rolled for every class as its loot rolls them, at each rarity and item level, and what a set '
    + 'gives on average: Health (his own and gear\'s), regeneration a second, the draught\'s heal and how much it '
    + 'multiplies his damage; a class whose Health or regeneration from gear is out of the order of his own Health '
    + 'is a problem',
  options: {
    tiers: {
      kind: 'list',
      usage: 'rarity@ilvl,...',
      default: 'magic@5,rare@15,epic@30,legendary@50',
      help: 'the tiers: a rarity at an item level each',
    },
    sets: { kind: 'number', usage: 'n', help: 'the sets rolled for each class at each tier (400 by default)' },
    canary: {
      kind: 'switch',
      help: 'plant a fault the check must catch: the ranger\'s Health from gear rolled as the mage\'s',
    },
    ...COMMON_OPTIONS,
  },
  check(options) {
    for (const tier of options.tiers) gearTier(tier);
    if (options.sets !== undefined && !(options.sets >= 1)) throw labError('gear --sets: at least 1');
  },
  each(side, options) {
    const command = {
      tiers: options.tiers.map(gearTier),
      sets: Math.round(options.sets ?? GEAR_SETS),
      canary: Boolean(options.canary),
    };
    return side.command('gear', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
