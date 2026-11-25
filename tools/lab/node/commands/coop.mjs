// `npm run lab -- coop`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * `runCoop` (coop.mjs), imported as the command runs: it loads the game's own modules (src/data),
 * which the command line, reading every command, never needs.
 */
async function runCoop(...args) {
  const { runCoop: run } = await import('../coop.mjs');
  return run(...args);
}

/** `lab coop`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'two games playing together, a host\'s and a guest\'s, over a link of a high ping and jitter: what each '
    + 'shows of the other\'s heroes and foes and whether the hits counted, parties of 3 and 4, colours, looks, trade, '
    + 'chat, pings, the run\'s end and spectating (`--scenarios`; in full in `commands/coop.md`)',
  help: 'two games playing together, the host\'s and the guest\'s, their messages carried as a link of a high ping '
    + 'carries them: how far behind and how roughly each copies the other\'s heroes and foes, whether an arrow that '
    + 'struck a foe on the guest\'s screen counted, whether a blow it dodged on its screen hurt it, where its blink '
    + 'came out on the host\'s screen and whether the foes it dazed were dazed on the host\'s, and whether every foe '
    + 'its charge met on its screen was carried and thrown on both and ended before it, and whether a Power '
    + 'Strike it cast its charge over landed in the charge on both, shown over it and building to its blow',
  options: {
    scenarios: {
      kind: 'list',
      usage: 'a,b',
      choices: [
        'walk', 'foes', 'shoot', 'evade', 'dodge', 'down', 'blink', 'staffs', 'rush', 'strike', 'throws', 'wave', 'ping',
        'chat', 'afk', 'colours', 'ghosts', 'duel', 'ends', 'houses', 'seats', 'trade', 'looks', 'wall', 'belt', 'choir',
        'rootmother', 'rootcage', 'rootburrow', 'stag', 'tavern', 'tavern-recovery',
      ],
      help: 'the scenarios (all the hero can play by default): walk, foes, shoot, evade (a ranger or a mage), dodge, '
        + 'down, blink (a mage), rush and strike (a warrior), throws, rootmother (her branches and vines at the '
        + 'guest), stag (the Stag of Ash\'s toss of the guest, its antlers shed as stakes and one worn on the '
        + 'host\'s game, the wood its breath sets alight: both screens alike; its canary the guest deaf to the '
        + 'stakes\' life), rootcage (her root cage at the guest, the host breaking a root of it), rootburrow (her burrow '
        + 'alike on both screens), belt (the '
        + 'Ossuary Twins\' belt skulls); '
        + 'ends alone: the ways a run ends that left a '
        + 'player apart from the party; houses alone: a partner gone into a village house shown to the host outside '
        + '(a marker over its door, the minimap, the map); seats alone: a log a partner sits on not outlined for the '
        + 'host to sit on, a free one and the log once he\'s up outlined; choir alone: the Ossuary Cantor\'s choir\'s '
        + 'ring and rising graves on both screens alike (the ring\'s place and radius by its age, each stone\'s spot), '
        + 'in the crypt; tavern-recovery alone: joining with a mug held, then its holder disconnecting; '
        + 'tavern alone: the keeper and his mugs as the host rules them, a guest served, '
        + 'both served at once with a mug each, both games\' mugs agreeing',
    },
    ping: { kind: 'number', usage: 'ms', help: 'the link\'s least round trip (300 by default)' },
    jitter: { kind: 'number', usage: 'ms', help: 'how much later each way a message may come (60 by default)' },
    pictures: { kind: 'switch', help: 'picture both screens at a scenario\'s moments (into out/coop)' },
    party: {
      kind: 'number',
      usage: 'n',
      help: 'the heroes in the room, 2 to 4 (2 by default): the others join after the guest, the third first as '
        + 'the guest\'s name tag (refused, asked to rename), and stand off the scenarios\' action',
    },
    canary: {
      kind: 'switch',
      help: 'plant the faults the start must catch: the guest\'s game dresses its hero in the host\'s '
        + 'colour once in the room, and the host is told no guest readies the run',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    const { scenarios, ping, jitter, party } = options;
    const canary = Boolean(options.canary);
    return runCoop(side, { scenarios, ping, jitter, party, canary, pictures: Boolean(options.pictures) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
