// `npm run lab -- rust`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { labError } from '../errors.mjs';
import { picturePairs, asText, problemsIn, textWithPictureFiles, tunesFrom } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';
import { join } from 'node:path';
import { saveTape } from '../rustTape.mjs';
import { OUT } from '../paths.mjs';

const LEVELS = ['high', 'medium', 'low', 'verylow'];

/** `--level`'s text as the levels it names, in turn. */
function levelsOf(text) {
  const levels = text ? String(text).split(',') : [];
  const unknown = levels.find((level) => !LEVELS.includes(level));
  if (unknown !== undefined) throw labError(`lab: --level: ${unknown} isn't one of ${LEVELS.join(', ')}`);
  return levels;
}

/** `lab rust`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the frame of the Rust engine (`src/engine`, Bulwark) where the hero stands, pictured and timed: the walk '
    + 'of the scene and the work of the engine by the clock of the browser, the GPU by its timestamps, its draw '
    + 'calls and triangles, what it could not draw by its kind, its boot (`--village`, `--foes n`; `--census` '
    + 'the shown materials by what they ask of a renderer; `--tune rust.debug=1` the reach of the sun alone; `--capture 512` the frame written '
    + 'down as a tape, its maps no larger than that a side, which the `replay` of the engine draws, pictures '
    + 'and times with no browser)',
  help: 'the Rust engine\'s frame where the hero stands: pictures, frame times, draws, boot',
  options: {
    biome: {
      kind: 'choice',
      choices: ['crypt', 'forest'],
      usage: 'crypt|forest',
      help: 'the biome (forest by default)',
    },
    view: SETUP_OPTIONS.view,
    at: SETUP_OPTIONS.at,
    frames: { kind: 'number', usage: 'n', help: 'the frames timed a side (60 by default)' },
    foes: { kind: 'number', usage: 'n', help: 'foes stood before the hero (none by default; not in the village)' },
    hour: { kind: 'number', usage: 'h', help: 'with --village, the hour it\'s lit for' },
    zoom: { kind: 'number', usage: 'z', help: 'with --village, the camera\'s zoom from above (1.7: the furthest out)' },
    village: { kind: 'switch', help: 'in the lobby\'s village instead' },
    skylight: {
      kind: 'switch',
      help: 'through his eyes, turned to the sky\'s key light (the sun, by night the moon): the picture is its '
        + 'disc and what\'s round it',
    },
    room: {
      kind: 'text',
      usage: 'id',
      help: 'with --village, inside a house (library, merchant...): its frame, and the longest frame of the page '
        + 'going in, out and in again',
    },
    cast: {
      kind: 'text',
      usage: 'skill',
      help: 'a skill of the hero\'s held through the frames timed and pictured (its key, behaviour or name; '
        + '--class whose): what it leaves undrawn is a problem',
    },
    level: {
      kind: 'text',
      usage: 'high|medium|low|verylow[,...]',
      help: 'the quality level switched to once he stands there, as Auto steps to it in play (--boot: the level '
        + 'the page boots at); several, each in turn: `--boot verylow --level low,verylow` is Auto trying Low and '
        + 'going back, which must leave the frame as it was',
    },
    boss: { kind: 'switch', help: 'the boss of the biome stood before him (not in the village)' },
    dying: {
      kind: 'number',
      usage: 'frames',
      help: 'with --foes, each killed and pictured this many frames on: its fall and its dissolve (40: half gone)',
    },
    nobody: { kind: 'switch', help: 'every body on a skeleton hidden (heroes, ghost, dummies): what they cost' },
    blended: { kind: 'switch', help: 'the blended meshes shown, by how the engine draws them and what they are' },
    census: { kind: 'switch', help: 'the shown meshes\' materials by kind, and what each asks beyond the engine' },
    capture: {
      kind: 'number',
      usage: 'side',
      help: 'the frame written down as a tape for the engine\'s own harness, its maps no larger than this a side',
    },
    wear: SETUP_OPTIONS.wear,
    rarity: SETUP_OPTIONS.rarity,
    tune: SETUP_OPTIONS.tune,
    ...COMMON_OPTIONS,
  },
  check(options) {
    if (options.frames !== undefined && !(options.frames >= 1)) throw labError('rust --frames: 1 or more');
    if (options.capture !== undefined && !(options.capture >= 16)) throw labError('rust --capture: 16 or more');
  },
  async each(side, options) {
    const command = {
      biome: options.biome ?? 'forest',
      view: options.view ?? (options.skylight ? 'first' : 'top'),
      at: options.at,
      frames: Math.round(options.frames ?? 60),
      foes: Math.round(options.foes ?? 0),
      village: Boolean(options.village),
      room: options.room,
      cast: options.cast,
      levels: levelsOf(options.level),
      boss: Boolean(options.boss),
      dying: Math.round(options.dying ?? 0),
      hour: options.hour,
      zoom: options.zoom,
      skylight: Boolean(options.skylight),
      census: Boolean(options.census),
      blended: Boolean(options.blended),
      nobody: Boolean(options.nobody),
      capture: Math.round(options.capture ?? 0),
      wear: options.wear?.filter((part) => part !== 'none'),
      rarity: options.rarity,
      tune: options.tune === undefined ? {} : tunesFrom(options.tune),
    };
    const report = await side.command('rustHere', command);
    if (!command.capture) return report;
    const stand = command.village ? 'village' : command.biome;
    const file = join(OUT, 'rust-tapes', `${stand}-${command.view}.tape`);
    const bytes = await saveTape(side.page, file);
    const megabytes = (bytes / 1048576).toFixed(1);
    const replay = `cargo run --release --bin replay -- ${file} --out ${file.replace(/\.tape$/, '.png')}`;
    report.text += `\n  the frame's tape: ${file} (${megabytes} MB); in the engine's repository: ${replay}`;
    return report;
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('rust'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
