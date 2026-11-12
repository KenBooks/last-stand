// The game's music as the player hears it (tools/lab `music`): in each biome, its lobby, a run's countdown, the first
// wave's fight and its win, the next wave, the tab hidden and shown again mid-fight, and the bank back to the lobby,
// every frame judged against what each place must play (`EXPECTED`, the owner's choice: the lobby's track between
// waves, the battle track on from wave to wave where it was left) by what the music sends to WebAudio and what its
// tracks' outputs carry (`musicJudge.ts`). With a canary, a round played again with faults planted that the judge
// must catch.
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { TrackId } from '../../../src/data/music';
import { G } from '../../../src/state';
import { BIOMES } from '../../../src/data/biomes';
import { FADES } from '../../../src/data/music';
import { RUN } from '../../../src/data/balance';
import { musicShown } from '../../../src/core/music';
// (an older tree's lobby stood in a biome picked by its setting; this one's, in the village, by the portal's)
const BIOME_SETTING = import.meta.glob<{ setBiomeSetting(b: BiomeId): void }>('../../../src/game/biome.ts');
import { MusicJudge, type Wanted } from './musicJudge';
import { realWait } from './lab';
import { Ears, SourceLog } from './musicTap';

export interface MusicOptions {
  biomes: BiomeId[];
  /** play a round again with faults planted that the judge must catch */
  canary: boolean;
}

/** what each biome must play (#215): in its lobby and between its runs' waves, and through each wave's fight */
const EXPECTED: Record<BiomeId, { lobby: TrackId; battle: TrackId }> = {
  forest: { lobby: 'quiet-beginnings', battle: 'sunlit-battle' },
  crypt: { lobby: 'shadowed-dusk', battle: 'crypt-motif' },
};

/** how long each stretch runs once its moment has come (s): past the longest fade into it or out of it */
const LOBBY_SECONDS = 4.5;
const FIGHT_SECONDS = 2.5;
const WON_SECONDS = 3.5;
const SHOWN_SECONDS = 1;
/** the browser's own time a lobby's track may take to be fetched and decoded (ms; a battle track has the run's
 *  countdown), and how often it's looked at (ms) */
const DECODE_LIMIT_MS = 15000;
const DECODE_POLL_MS = 20;
/** the browser's own time listened before an output's level is read: past an analyser's samples (ms); and the most
 *  listened for the track wanted to be heard (ms: a piece may open near silence, as Quiet Beginnings does) */
const LISTEN_MS = 250;
const HEAR_LIMIT_MS = 4000;
/** the most frames a moment the game moves to on its own (a run's start, a wave's) may take */
const MOMENT_FRAMES = 900;
/** where a canary starts a fresh track instead of its top (s): each comeback it starts at the top instead */
const CANARY_OFFSET = 5;
/** the lobby's fade in a canary cuts to (s) */
const CANARY_FADE = 0.05;

/** What the music must do now, by the game's state: the place's track, and those it keeps decoded. */
function wantedNow(): Wanted {
  const music = EXPECTED[G.arena.biome];
  if (G.mode === 'menu') return { track: music.lobby, ready: [music.lobby] };
  const fighting = G.run?.phase === 'fighting';
  return { track: fighting ? music.battle : music.lobby, ready: [music.lobby, music.battle] };
}

/** The page's tab hidden (or shown again), as the browser tells a page its tab went to the background. */
function showTab(shown: boolean): void {
  if (shown) Reflect.deleteProperty(document, 'hidden');
  else Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** The frames of `seconds` at the lab's frame. */
function framesOf(seconds: number): number {
  return Math.ceil(seconds * 1000 / window.__labClock.frame);
}

/** How a track must come in during a stretch: from its top, or where it was left. */
type Entry = 'top' | 'left';

/** A round of the game played and judged, frame by frame, through stretches named as they're played. */
class Listening {
  readonly lines: string[] = [];
  /** how the tracks must come in during the stretch under way */
  private entries: [TrackId, Entry][] = [];

  constructor(
    private readonly lab: Lab,
    readonly judge: MusicJudge,
    private readonly log: SourceLog,
    private readonly ears: Ears,
  ) {
    judge.seen(musicShown());
  }

  begin(name: string): void {
    this.judge.begin(name);
    this.entries = [];
  }

  /** `id` must come in during the stretch, as `entry` says. */
  expect(id: TrackId, entry: Entry): void {
    this.entries.push([id, entry]);
  }

  /** The stretch's line; `settled`, its fades must all have ended. Each track expected came in as it must. */
  end(settled: boolean, note = ''): void {
    for (const [id, entry] of this.entries) {
      const starts = this.judge.startsOf(id);
      const fromTop = starts.some((offset) => MusicJudge.fromTop(offset));
      const resumed = starts.some((offset) => !MusicJudge.fromTop(offset));
      if (entry === 'top' && !fromTop) this.judge.problem(`${id} didn't come in from its top`);
      if (entry === 'left' && !resumed) this.judge.problem(`${id} didn't come back where it was left`);
    }
    this.lines.push(this.judge.end(musicShown(), settled) + note);
  }

  /** `count` frames run, each judged; `keys` held in the first. */
  async frames(count: number, keys?: string[]): Promise<void> {
    const input = keys ? (frame: number) => (frame === 0 ? { keys } : {}) : undefined;
    await this.lab.step(count, input, () => this.judgeFrame());
  }

  /** Frames run, each judged, until `done` (at most `MOMENT_FRAMES`; past them, `what` failed). */
  async until(done: () => boolean, what: string): Promise<void> {
    for (let frame = 0; frame < MOMENT_FRAMES; frame++) {
      await this.frames(1);
      if (done()) return;
    }
    throw new Error(`lab: music: ${what} (not within ${MOMENT_FRAMES} frames)`);
  }

  /**
   * A frame run to ask for `id`, then the browser's own time waited for it to be decoded, at most `limit` ms: a
   * problem past that (the game plays on without it).
   */
  async decoded(id: TrackId, limit: number): Promise<void> {
    const asked = window.__labClock.realNow();
    await this.frames(1);
    while (!musicShown().find((track) => track.id === id)?.buffer) {
      if (window.__labClock.realNow() - asked > limit) {
        this.judge.problem(`${id} wasn't decoded within ${limit} ms of being asked for`);
        return;
      }
      await realWait(DECODE_POLL_MS);
    }
  }

  /**
   * The outputs listened to, the game held still, until the track wanted is heard or `HEAR_LIMIT_MS` has gone, and the
   * loudest each carried judged; in a `hidden` tab nothing may be heard.
   */
  async listen(hidden = false): Promise<void> {
    const loudest = new Map<string, number>();
    const began = window.__labClock.realNow();
    let heard = false;
    while (!heard) {
      await realWait(LISTEN_MS);
      for (const [id, level] of this.ears.levels()) loudest.set(id, Math.max(level, loudest.get(id) ?? -Infinity));
      const waited = window.__labClock.realNow() - began;
      heard = hidden || this.judge.heard(loudest, musicShown()) || waited > HEAR_LIMIT_MS;
    }
    this.judge.listened(loudest, musicShown(), hidden);
  }

  /** The tab hidden or shown, between frames. */
  tab(shown: boolean): void {
    showTab(shown);
    this.judge.seen(musicShown());
  }

  private judgeFrame(): void {
    const shown = musicShown();
    this.ears.follow(shown);
    this.judge.frame(shown, wantedNow(), this.log.starts);
  }
}

/** The wave's foes all taken out once every one of them has risen, as a wave won leaves it. */
async function winTheWave(listening: Listening): Promise<void> {
  await listening.until(() => G.run?.pending === 0, 'the wave\'s foes never all rose');
  const run = G.run!;
  run.queue = [];
  run.boss = null;
  for (const foe of G.enemies) foe.dispose();
  G.enemies.length = 0;
  await listening.until(() => G.run?.phase === 'cleared', 'the wave was never won');
}

/** The biome's lobby: switched to, its track decoded and faded in. */
async function lobby(listening: Listening, biome: BiomeId): Promise<void> {
  listening.begin(`${biome}'s lobby`);
  const setting = Object.values(BIOME_SETTING)[0];
  if (setting) (await setting()).setBiomeSetting(biome);
  else G.arena.setBiome(biome);
  await listening.decoded(EXPECTED[biome].lobby, DECODE_LIMIT_MS);
  await listening.frames(framesOf(LOBBY_SECONDS));
  await listening.listen();
  listening.end(true);
}

/** A run started from the lobby, its countdown run out: the lobby's track playing on, the battle's decoded. */
async function countdown(listening: Listening, lab: Lab, biome: BiomeId): Promise<void> {
  listening.begin(`${biome}'s run, its countdown`);
  lab.letWavesCome();
  document.getElementById('btn-start')?.click();
  await listening.until(() => G.mode === 'run' && !lab.player.sandbox, 'the run never started');
  await listening.decoded(EXPECTED[biome].battle, RUN.countdown * 1000);
  await listening.until(() => G.run?.phase === 'fighting', 'the wave never started');
  listening.end(true, `; ${EXPECTED[biome].battle} decoded within it`);
}

/** A wave's fight from its start, its battle track coming in as `entry` says, listened to once it's up. */
async function fight(listening: Listening, biome: BiomeId, wave: number, entry: Entry): Promise<void> {
  listening.begin(`${biome}'s wave ${wave}'s fight`);
  listening.expect(EXPECTED[biome].battle, entry);
  await listening.frames(framesOf(FIGHT_SECONDS));
  await listening.listen();
  listening.end(true);
}

/** The wave won: the battle track out over the choice, the lobby's back where the fight left it. */
async function won(listening: Listening, biome: BiomeId): Promise<void> {
  listening.begin(`${biome}'s wave 1 won`);
  listening.expect(EXPECTED[biome].lobby, 'left');
  await winTheWave(listening);
  await listening.frames(framesOf(WON_SECONDS));
  await listening.listen();
  listening.end(true);
}

/** Continue chosen: the next wave's countdown and fight. */
async function nextWave(listening: Listening, biome: BiomeId): Promise<void> {
  listening.begin(`${biome}'s wave 2, its countdown`);
  await listening.frames(1, ['c']);
  await listening.until(() => G.run?.phase === 'fighting', 'the next wave never started');
  listening.end(true);
  await fight(listening, biome, 2, 'left');
}

/** The tab hidden mid-fight, listened to, and shown again. */
async function hidden(listening: Listening, biome: BiomeId): Promise<void> {
  listening.begin(`${biome}'s wave 2, the tab hidden and shown again`);
  listening.tab(false);
  await listening.listen(true);
  listening.tab(true);
  await listening.frames(framesOf(SHOWN_SECONDS));
  await listening.listen();
  listening.end(true);
}

/** The wave won and banked, the summary closed: back in the lobby. */
async function banked(listening: Listening, biome: BiomeId): Promise<void> {
  listening.begin(`${biome}'s wave 2 won and banked, back to the lobby`);
  listening.expect(EXPECTED[biome].lobby, 'left');
  await winTheWave(listening);
  await listening.frames(1, ['b']);
  await listening.until(() => G.run?.phase === 'over' || !G.player.inRun, 'the bank never took');
  document.getElementById('btn-summary')?.click();
  await listening.until(() => G.mode === 'menu', 'the summary never led back to the lobby');
  await listening.decoded(EXPECTED[biome].lobby, DECODE_LIMIT_MS);
  await listening.frames(framesOf(Math.max(LOBBY_SECONDS, FADES.battle.out)));
  await listening.listen();
  listening.end(true);
}

/** A biome played through: its lobby, a run's two waves with the tab hidden in the second, and back. */
async function round(listening: Listening, lab: Lab, biome: BiomeId): Promise<void> {
  await lobby(listening, biome);
  await countdown(listening, lab, biome);
  await fight(listening, biome, 1, 'top');
  await won(listening, biome);
  await nextWave(listening, biome);
  await hidden(listening, biome);
  await banked(listening, biome);
}

/** Throws unless every stretch outlasts the fade it waits out: [the stretch, its seconds, the fade's]. */
function checkStretches(): void {
  const waits: [string, number, number][] = [
    ['the lobby', LOBBY_SECONDS, FADES.lobby.in],
    ['the fight', FIGHT_SECONDS, Math.max(FADES.battle.in, FADES.lobby.out)],
    ['the win', WON_SECONDS, Math.max(FADES.battle.out, FADES.lobby.in)],
  ];
  for (const [stretch, seconds, fade] of waits) {
    if (seconds < fade) throw new Error(`lab: music: ${stretch} (${seconds} s) is shorter than its fade (${fade} s)`);
  }
}

/** The faults a canary plants, each with what the judge must say to have caught it. */
interface Planted {
  what: string;
  caught: (problem: string) => boolean;
  undo: () => void;
}

/** The canary's faults planted in `biome`: its battle track another's, the lobby's fade in cut, a fresh track not
 *  from its top and a track coming back from its top. */
function plant(biome: BiomeId, log: SourceLog): Planted[] {
  const music = BIOMES[biome].music;
  const battle = music.battle;
  const other = Object.values(EXPECTED).map((expected) => expected.battle).find((id) => id !== battle)!;
  music.battle = other;
  const fadeIn = FADES.lobby.in;
  FADES.lobby.in = CANARY_FADE;
  log.fault = (offset) => (offset === 0 ? CANARY_OFFSET : 0);
  return [
    {
      what: `${biome}'s battle track played as ${other}`,
      caught: (problem) => problem.includes(`${other} rose while`),
      undo: () => { music.battle = battle; },
    },
    {
      what: `the lobby's fade in cut to ${CANARY_FADE} s`,
      caught: (problem) => problem.includes(`${EXPECTED[biome].lobby}'s level went`),
      undo: () => { FADES.lobby.in = fadeIn; },
    },
    {
      what: `every fresh track started ${CANARY_OFFSET} s in`,
      caught: (problem) => problem.includes(`started ${CANARY_OFFSET.toFixed(2)} s in, not from its top`),
      undo: () => { log.fault = null; },
    },
    {
      what: 'every track coming back started from its top',
      caught: (problem) => problem.includes('came back at 0.00 s'),
      undo: () => undefined,
    },
  ];
}

/** A round played with the canary's faults, each caught or a problem. */
async function canaryRound(lab: Lab, biome: BiomeId, log: SourceLog, ears: Ears): Promise<Report> {
  const judge = new MusicJudge(window.__labClock.frame / 1000);
  const listening = new Listening(lab, judge, log, ears);
  const planted = plant(biome, log);
  try {
    await round(listening, lab, biome);
  } finally {
    for (const fault of planted) fault.undo();
  }
  const lines: string[] = [];
  const problems: string[] = [];
  for (const fault of planted) {
    const caught = judge.problems.some(fault.caught);
    lines.push(`canary, ${fault.what}: ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push(`the canary's fault went unseen: ${fault.what}`);
  }
  return { text: lines.join('\n'), problems };
}

/**
 * `lab music`: each biome's music played through as the player hears it, a problem for every frame the judge finds
 * at fault, and for a canary's fault it missed.
 */
export async function music(lab: Lab, options: MusicOptions): Promise<Report> {
  checkStretches();
  const log = new SourceLog();
  const ears = new Ears();
  const judge = new MusicJudge(window.__labClock.frame / 1000);
  const listening = new Listening(lab, judge, log, ears);
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    for (const biome of options.biomes) await round(listening, lab, biome);
    lines.push(...listening.lines);
    problems.push(...judge.problems);
    if (options.canary) {
      const last = options.biomes[options.biomes.length - 1];
      const biome = options.biomes.find((other) => other !== last) ?? last;
      const canary = await canaryRound(lab, biome, log, ears);
      lines.push(canary.text);
      problems.push(...canary.problems);
    }
  } finally {
    log.remove();
    ears.remove();
  }
  return { text: lines.join('\n'), problems };
}
