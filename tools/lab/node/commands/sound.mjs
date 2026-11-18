// `npm run lab -- sound`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO } from '../paths.mjs';
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** the scenes `sound` renders unless it's given some (page/sound.ts `SCENES`) */
const SOUNDS = ['bolt', 'boltMiss', 'lance', 'lanceEarly'];

/** The scenes or sounds `sound` renders: its argument's names, comma separated, else `SOUNDS`. */
function soundsFrom(options) {
  const named = options._[0]?.split(',').filter(Boolean);
  return named?.length ? named : SOUNDS;
}

/**
 * Each side's text under its name, and each sound it rendered (a report's `wavs`) written in `dir` as
 * `<filePrefix><name>.wav`, the folder emptied of an earlier run's first.
 */
function textWithWavs(results, dir) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [side, result] of results) {
    for (const wav of result?.wavs ?? []) {
      const name = `${side.filePrefix}${wav.name}.wav`;
      writeFileSync(join(dir, name), Buffer.from(wav.base64, 'base64'));
      written.push(name);
    }
  }
  return written.length ? `${text}\n\nsounds in ${relative(REPO, dir)}: ${written.join(', ')}` : text;
}

/** `lab sound`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'a skill\'s sounds rendered offline as the game plays them and written as WAV files to listen to '
    + '(Splintering Bolt held and its bursts, Void Lance\'s portal, beam and release, or any sound of the game\'s '
    + 'played once: each one\'s peak, loudest half second, level over time, brightness (centroid, share above 2 kHz), '
    + 'share above 150 Hz, most tonal peak, the nodes it made, its silence at its end)',
  help: 'the sounds of a skill as the player hears them, rendered offline as the game plays them (the same '
    + 'master, compressor and hall) and written as WAV files in tools/lab/out/sound: bolt (Splintering Bolt held, '
    + 'each bolt bursting on a foe and its splits on others), boltMiss (one striking nothing), lance (Void Lance: '
    + 'its portal, the beam held and let go), lanceEarly (let go before the beam), or any sound of the game by '
    + 'its name in sfx (bow, swing...), played once. Each one: its peak, loudest half second, level every tenth '
    + 'of a second, share above 150 Hz, most tonal peak and the nodes it made; a sample not a number, a clip, a '
    + 'note standing 15 dB over its noise in a scene of a spell and a sound still playing at its end are '
    + 'problems (bolt,boltMiss,lance,lanceEarly by default; --ab only against a commit with src/core/audio.ts '
    + '`playInto`)',
  argument: 'sounds',
  mayOmit: true,
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault the measures must catch: the first scene again under a 440 Hz note never stopped',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('sound', { sounds: soundsFrom(options), canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithWavs(results, session.outFor('sound'));
  },
  textOf: asText,
  problemsOf: problemsIn,
};
