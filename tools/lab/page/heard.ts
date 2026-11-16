// The sounds a skill plays as its key is held (tools/lab `heard`): foes stand where it strikes (as `hits` stands
// them), its key is held as a player holds it (a drawn shot to full and a moment more, a channel for seconds, or for
// `--hold`), and every sound the game asks for is caught as it's asked for: its name, what it was given and when from
// the press, and for a held sound (one that returns its stop: a bow's creak, a beam) when it was stopped. `sound`
// renders what a sound is; this says which play, when, and whether the held ones end. A skill that plays nothing, a
// held sound still going once the cast is over, and a sound a skill is known to play (`EXPECTED`) that never came are
// problems. (The owner, on sounds: check them with a real key hold, how repeats and loops layer, start and stop.)
import type { Fixture, Lab, Report } from './lab';
import { G } from '../../../src/state';
import { sfx } from '../../../src/core/audio';
import type { BiomeId } from '../../../src/data/biomes';
import { holdFor } from './cast';
import { castAt, type Cast } from './hits';

export interface HeardOptions {
  fixture: Fixture;
  /** the skills: their keys, behaviours or names */
  skills: string[];
  /** how long each skill's key is held (s); else as a player holds it (`holdFor`) */
  hold?: number;
  /** the biome he stands in (the lobby's by default): an arrow glances off the crypt's stone and sticks in the
   *  Thornwood's earth */
  biome?: BiomeId;
  /** the foes left awake once they've risen (they stand dazed otherwise, as `hits` has them): they come at the hero,
   *  or at his lure and strike it */
  awake?: boolean;
  /** plant the fault the checks must catch: a held sound started in each cast and never stopped */
  canary: boolean;
}

/** A sound asked for: its name, what it was given, the game's time then, and for a held one when it was stopped
 *  (-1: never). */
interface Sound {
  name: string;
  args: string;
  at: number;
  held: boolean;
  stopped: number;
}

type Play = (...args: unknown[]) => unknown;

/** how long a cast is followed past its hold, its cast time and its effect's own time (s): what it left in the air
 *  landing, a held sound's stop */
const AFTER = 2;
/** with the canary: the held sound planted (a bow's creak) and the frame it's planted at */
const PLANTED = 'bowDraw';
const PLANTED_FRAME = 3;
/** the sounds each of the ranger's skills must play when cast at foes, by its behaviour (`a|b`: either: an arrow
 *  lands in earth or wood, or glances off a stone floor) */
const EXPECTED: Record<string, string[]> = {
  nockShot: ['bowDraw', 'bowReady', 'bow', 'nock', 'arrowHit|arrowLand|ricochet'],
  fanShot: ['bowDraw', 'bowReady', 'fan', 'nock', 'arrowHit|arrowLand|ricochet'],
  piercingShot: ['bowDraw', 'bowReady', 'lancewood', 'nock', 'arrowHit|arrowLand|ricochet'],
  arrowRain: ['bowDraw', 'volley', 'nock', 'split', 'arrowHit', 'arrowLand|ricochet'],
  quarryMark: ['mark'],
  strawman: ['straw', 'strawSink'],
};
/** and with its foes awake (`--awake`): the blows they strike at his lure */
const EXPECTED_AWAKE: Record<string, string[]> = {
  strawman: ['strawHit'],
};

const seconds = (value: number): string => value.toFixed(2);

/** An argument as the report says it. */
function argText(value: unknown): string {
  return typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
}

/** Every sound the game asks for from now on, until the returned `remove` puts its own back. */
function listen(): { sounds: Sound[]; play: Record<string, Play>; remove(): void } {
  const table = sfx as unknown as Record<string, Play>;
  const own = { ...table };
  const sounds: Sound[] = [];
  for (const name of Object.keys(own)) {
    table[name] = (...args: unknown[]) => {
      const result = own[name](...args);
      const sound: Sound = { name, args: args.map(argText).join(', '), at: G.time, held: typeof result === 'function', stopped: -1 };
      sounds.push(sound);
      if (typeof result !== 'function') return result;
      return () => {
        if (sound.stopped < 0) sound.stopped = G.time;
        (result as Play)();
      };
    };
  }
  return { sounds, play: table, remove: () => { Object.assign(table, own); } };
}

/** `sounds` of one name as the report says them: a one-shot's times from `press`, a row of many as its count and
 *  span, a held one's start and stop. */
function soundLine(name: string, sounds: Sound[], press: number): string {
  const given = sounds[0].args ? `(${sounds[0].args})` : '';
  if (sounds[0].held) {
    const spans = sounds.map((sound) => `${seconds(sound.at - press)} to ${sound.stopped < 0 ? 'never stopped' : seconds(sound.stopped - press)}`);
    return `${name}${given} held ${spans.join(', ')}`;
  }
  const times = sounds.map((sound) => sound.at - press);
  if (times.length > 4) return `${name}${given} ×${times.length} from ${seconds(times[0])} to ${seconds(times[times.length - 1])}`;
  return `${name}${given} at ${times.map(seconds).join(', ')}`;
}

/** `lab heard`: each skill's key held as a player holds it, and the sounds the game asked for, when. */
export async function heard(lab: Lab, options: HeardOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const canary: string[] = [];
  if (options.biome && G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  for (const wanted of options.skills) {
    const { sounds, play, remove } = listen();
    let press = 0;
    let planted = false;
    try {
      const follow = (frame: number, cast: Cast): boolean => {
        // (the frame has run: the press was a frame ago)
        if (frame === 0) press = G.time - G.dt;
        if (frame === 0 && options.awake) for (const foe of cast.foes) foe.dazed = 0;
        if (options.canary && frame === PLANTED_FRAME) { play[PLANTED](1, 0); planted = true; }
        // (asked again each frame until this says it's done: the cast is followed until then)
        return !options.canary || planted;
      };
      // (a drawn shot's arrow comes out of the quiver before its draw: held through that too, to full)
      const fetch = (drawn: boolean): number => (drawn ? G.player.cls.quiver?.fetch ?? 0 : 0);
      const holding = (skill: { def: Parameters<typeof holdFor>[0] }): number => options.hold ?? holdFor(skill.def) + fetch(!!skill.def.draw);
      const cast = await castAt(lab, options.fixture, wanted, holding, follow, undefined, 0);
      const { def } = cast.skill;
      // (followed on past the cast: what it left in the air, and a held sound's stop)
      const rest = (def.castTime ?? 0) + (def.duration ?? 0) + AFTER;
      await lab.step(Math.round(rest / (window.__labClock.frame / 1000)), () => ({}));
      const own = sounds.filter((sound) => sound.at >= press);
      const names = [...new Set(own.map((sound) => sound.name))];
      const found: string[] = [];
      if (!own.length) found.push(`${def.name} played nothing`);
      for (const sound of own.filter((each) => each.held && each.stopped < 0)) {
        found.push(`${def.name}: ${sound.name} from ${seconds(sound.at - press)} s was never stopped`);
      }
      const expected = [...(EXPECTED[def.impl] ?? []), ...(options.awake ? EXPECTED_AWAKE[def.impl] ?? [] : [])];
      for (const name of expected) {
        if (!name.split('|').some((either) => names.includes(either))) found.push(`${def.name}: no ${name.replaceAll('|', ' or ')} was heard`);
      }
      lines.push(`${def.name} (held ${seconds(cast.held)} s, ${cast.blows.length} blows on its foes; s from the press):`);
      lines.push(...names.map((name) => `  ${soundLine(name, own.filter((sound) => sound.name === name), press)}`));
      lines.push(...found.map((problem) => `  ! ${problem}`));
      if (options.canary) {
        const caught = planted && found.some((problem) => problem.includes('never stopped'));
        lines.push(`  canary: a ${PLANTED} never stopped ${caught ? 'caught' : 'missed'}`);
        if (!caught) canary.push(`the canary's ${PLANTED} never stopped in ${def.name} went unseen`);
      } else problems.push(...found);
    } finally {
      remove();
    }
  }
  return { text: lines.join('\n'), problems: options.canary ? canary : problems };
}
