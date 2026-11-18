// `npm run lab -- eyes`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { join } from 'node:path';
import { labError } from '../errors.mjs';
import { writeStack } from '../sheetImage.mjs';
import { fixtureFrom, picturePairs, asText, problemsIn, fileNameOf, textWithPictureFiles } from '../commandKit.mjs';
import { SETUP_OPTIONS, COMMON_OPTIONS } from '../optionKit.mjs';

/**
 * In an A/B, each moment both sides pictured whose label passes `wanted`, the other side's above this tree's in one
 * picture at their own sizes (`writeStack`), written in `dir` as `<label>--ab.png`; the files written.
 */
async function writeStacks(results, dir, browser, wanted) {
  if (results.length < 2) return [];
  const written = [];
  const [first, ...others] = results;
  for (const moment of first[1]?.moments ?? []) {
    if (!wanted(moment.label)) continue;
    const momentOf = (result) => result?.moments?.find((m) => m.label === moment.label);
    const sides = [first, ...others].map(([side, result]) => [side, momentOf(result)]);
    if (sides.some(([, found]) => !found || found.tiles.length !== 1)) continue;
    const pictures = sides.map(([side, found]) => ({ caption: side.name, ...found.tiles[0] }));
    const name = `${fileNameOf(moment.label)}--ab.png`;
    await writeStack(browser, pictures, join(dir, name));
    written.push(name);
  }
  return written;
}

/** `lab eyes`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a skill cast through the eyes, frame by frame (where the blade goes across the view, wound up, through '
    + 'the blow and where it ends, how fast, where it is as the skill fires; a two-hander let go of by the other '
    + 'hand, seen or not, or seen in one hand; a fist open on its handle; the arm drawn against its swing\'s keys, '
    + 'the weapon\'s way and flat too; the arms\' joints past their ranges where they\'re seen; the arms in the body '
    + 'the view hides, said; the weapon and the elbows jumping between frames; a film of the frames)',
  help: 'a skill of the hero\'s cast through the eyes, frame by frame from the press until the arms are at rest '
    + 'again: where the weapon\'s tip is on the screen at rest, wound up, through the blow and at its end, how '
    + 'fast it crosses the view and where it is as the skill fires; a two-hander let go of by the other hand, or '
    + 'seen in one hand, an arm\'s joint past its range (a gripping wrist past a gripping wrist\'s), a strike led '
    + 'by its flat, slid across rather than swung round, stopped dead, met at the aim by its blade\'s inner part or '
    + 'sweeping a narrow share of the skill\'s arc, a weapon out of the frame at rest, and a basic attack\'s cuts '
    + 'chained unlike a body chains them (a backhand from the rest, back to the rest between cuts, the last end '
    + 'not held) are problems; with a film of the frames, each labelled with the gripping wrists\' bends: '
    + 'tools/lab/out/eyes/<skill> (--class warrior)',
  argument: 'skill',
  options: {
    times: { kind: 'number', usage: 'n', help: 'casts in a row, the key held through them (1 by default)' },
    apart: {
      kind: 'number',
      usage: 's',
      help: 'the key let go as each cast begins and pressed again s seconds after it ended (a pause in the attacks)',
    },
    every: { kind: 'number', usage: 'n', help: 'a frame pictured into the film every n (2 by default)' },
    cast: { kind: 'number', usage: 'n', help: 'film the nth cast of the row alone (every cast by default)' },
    close: {
      kind: 'list',
      usage: 'a,b',
      help: 'each cast\'s firing frame from these close-ups too (front, left, right, back, above): the arms and '
        + 'the weapon seen from outside, framed on the weapon\'s hand',
    },
    film: { kind: 'switch', help: 'the film of the frames (=false: the numbers alone)' },
    frames: {
      kind: 'switch',
      help: 'list every frame: the grip, the weapon\'s way and the other hand in the eyes\' frame, as the '
        + 'moves through the eyes are keyed (models/warriorEyes.ts)',
    },
    span: { kind: 'pair', usage: 'from,to', help: 'with --frames, only the frames from the first to the second' },
    canary: {
      kind: 'switch',
      help: 'the arms held as they were at the press and the other arm dropped: no blow, and a two-hander seen '
        + 'in one hand, no sweep, the dropped left weapon out of the frame and a chained cut as a backhand from the '
        + 'rest, must be found; the weapon turned its edge, then its flat, into its blow; held at its first turn, '
        + 'sliding with the hand; the right fist bent on its forearm 60° each way',
    },
    ...SETUP_OPTIONS,
    ...COMMON_OPTIONS,
  },
  // (a two-hander's too, since each set-up starts a run of its own: a page kept from the jobs before had turned its
  // forearm past its range on 9 frames more of a cleave with pauses; but his Steel Tempest on a page of its own: on
  // a kept one, the left wrist at the spin's fastest read a degree to five otherwise, not found yet)
  keepsPage: (options) => options.gear !== 'twoHanded' || options._?.[0] !== 'tempest',
  check(options) {
    if (options.times !== undefined && !(options.times >= 1)) throw labError('eyes --times: at least 1');
    if (options.every !== undefined && !(options.every >= 1)) throw labError('eyes --every: at least 1');
    if (options.cast !== undefined && !(options.cast >= 1 && options.cast <= (options.times ?? 1))) {
      throw labError('eyes --cast: one of the casts, 1 to --times');
    }
    if (options.apart !== undefined && !(options.apart >= 0)) throw labError('eyes --apart: seconds, 0 or more');
  },
  each(side, options) {
    const command = {
      fixture: fixtureFrom(options),
      skill: options._[0],
      times: Math.round(options.times ?? 1),
      apart: options.apart ?? null,
      every: Math.round(options.every ?? 2),
      cast: options.cast === undefined ? null : Math.round(options.cast),
      close: options.close ?? [],
      film: options.film !== false,
      frames: Boolean(options.frames),
      span: options.span ?? null,
      canary: Boolean(options.canary),
    };
    return side.command('eyes', command);
  },
  async finish(results, options, session) {
    const dir = session.outFor(join('eyes', options._[0]));
    const text = textWithPictureFiles(results, dir);
    // (in an A/B, each strike's strip of frames, the other side's above this tree's)
    const stacked = await writeStacks(results, dir, session.browser, (label) => label.endsWith(': the strike'));
    return stacked.length ? `${text}\nside by side: ${stacked.join(', ')}` : text;
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
