// Music: each biome's tracks (data/music.ts, `BiomeDef.music`), one in its lobby and between its runs' waves, and one
// through each wave's fight. Every track is fetched and decoded when it's first wanted, looped by a buffer source over
// its loop (seamless whatever delay a decoder leaves at the file's start: an audio element's own loop left a gap of the
// MP3's padding) and faded by a gain node of its own (iOS ignores an audio element's volume), through the sound
// effects' WebAudio context, so it starts with the first user gesture that resumes it. Two cross as the music changes:
// the one going fades out as the next fades in where it was left (a run's battle track on from wave to wave), from its
// top once it was let go (a new run's first wave, a biome switched to).
import { audioContext, musicOutput } from './audio';
import { TRACKS, type Fade, type TrackId } from '../data/music';
import quietBeginnings from '../audio/music/quiet-beginnings.mp3?url';
import shadowedDusk from '../audio/music/shadowed-dusk.mp3?url';
import sunlitBattle from '../audio/music/sunlit-battle.mp3?url';
import cryptMotif from '../audio/music/crypt-motif.mp3?url';

/** the music's level under the effects' */
const LEVEL = 0.32;
const URLS: Record<TrackId, string> = {
  'quiet-beginnings': quietBeginnings, 'shadowed-dusk': shadowedDusk, 'sunlit-battle': sunlitBattle,
  'crypt-motif': cryptMotif,
};

/** What the music should be now: the track that plays (none: silence), how it fades in and out where it plays,
 *  and the tracks to keep decoded (a run's battle track from its start, so its first wave doesn't wait for it). */
export interface MusicWanted {
  track: TrackId | null;
  fade: Fade;
  ready: TrackId[];
}

/** A track: decoded once wanted, playing while it's heard, faded on its own. */
class Track {
  buffer: AudioBuffer | null = null;
  private loading = false;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** how loud it is now (0 to 1, eased: heard as its square) */
  level = 0;
  /** how it fades where it last played */
  private fade: Fade | null = null;
  /** where in it it was left (s), and the context's time it was started from there */
  private offset = 0;
  private startedAt = 0;

  constructor(readonly id: TrackId) {}

  get playing(): boolean { return this.source !== null; }

  /** Fetched and decoded (fetched whole: it plays from the service worker's cache everywhere). */
  async load(ctx: AudioContext): Promise<void> {
    if (this.buffer || this.loading) return;
    this.loading = true;
    try {
      const data = await (await fetch(URLS[this.id])).arrayBuffer();
      this.buffer = await ctx.decodeAudioData(data);
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(musicOutput() ?? ctx.destination);
    } catch {
      // no music, the game plays on without it
    } finally {
      this.loading = false;
    }
  }

  /** Where it is now (s), looping round its loop; stopped, where it was left. */
  position(ctx: AudioContext): number {
    if (!this.source) return this.offset;
    const [start, end] = TRACKS[this.id].loop;
    const at = this.offset + ctx.currentTime - this.startedAt;
    return at < end ? at : start + ((at - start) % (end - start));
  }

  private play(ctx: AudioContext, from: number): void {
    if (!this.buffer || !this.gain || this.source) return;
    const [start, end] = TRACKS[this.id].loop;
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;
    this.source.loopStart = start;
    this.source.loopEnd = end;
    this.source.connect(this.gain);
    this.source.start(0, from);
    this.offset = from;
    this.startedAt = ctx.currentTime;
  }

  /** Stopped where it is, to play on from there. */
  stop(ctx: AudioContext): void {
    if (!this.source) return;
    this.offset = this.position(ctx);
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }

  /** A frame: faded towards heard while `wanted` (`fade` the way it fades there), out to silence otherwise. It comes
   *  back where it was left (silent, or in a hidden tab): from its top only once it was let go (`release`). */
  step(ctx: AudioContext, dt: number, wanted: boolean, fade: Fade): void {
    if (wanted) this.fade = fade;
    if (!this.buffer || !this.fade) return;
    if (wanted && !this.source && !document.hidden) this.play(ctx, this.offset);
    const step = dt / (wanted ? this.fade.in : this.fade.out);
    this.level = Math.max(0, Math.min(1, this.level + (wanted ? step : -step)));
    if (this.gain) this.gain.gain.value = LEVEL * this.level * this.level;
    if (this.level === 0) this.stop(ctx);
  }

  /** What it does now (for the lab). */
  shown(ctx: AudioContext | null): TrackShown {
    const at = ctx ? this.position(ctx) : this.offset;
    return { id: this.id, level: this.level, playing: this.playing, at, buffer: this.buffer, output: this.gain };
  }

  /** Its decoded samples let go (a minute of music is 20 MB of them), once it's silent and not wanted soon: wanted
   *  again, it starts from its top. */
  release(ctx: AudioContext): void {
    if (this.level > 0 || this.loading) return;
    this.stop(ctx);
    this.gain?.disconnect();
    this.gain = null;
    this.buffer = null;
    this.fade = null;
    this.offset = 0;
  }
}

const tracks = Object.fromEntries(
  (Object.keys(TRACKS) as TrackId[]).map((id) => [id, new Track(id)]),
) as Record<TrackId, Track>;
/** whether the context was asked to start before a gesture */
let asked = false;

/** The music made to follow `wanted`, called every frame. */
export function updateMusic(dt: number, wanted: MusicWanted): void {
  const ctx = audioContext();
  if (!ctx) return;
  // (loaded and asked to start as it's wanted: a browser lets sound start before the page's first click or key only
  // where it allows autoplay, as Chrome does on a site visited often or an installed app; elsewhere it starts with
  // that first gesture, the track already decoded)
  for (const id of wanted.ready) void tracks[id].load(ctx);
  if (wanted.track) void tracks[wanted.track].load(ctx);
  if (ctx.state !== 'running') {
    if (wanted.track && !asked) void ctx.resume().catch(() => undefined);
    asked = true;
    return;
  }
  for (const track of Object.values(tracks)) {
    track.step(ctx, dt, track.id === wanted.track, wanted.fade);
    if (track.id !== wanted.track && !wanted.ready.includes(track.id)) track.release(ctx);
  }
}

/** What a track does now (for the lab's `music`). */
export interface TrackShown {
  id: TrackId;
  /** how loud it is (0 to 1, heard as its square) */
  level: number;
  playing: boolean;
  /** where in it it plays (s), or was left */
  at: number;
  /** its decoded samples, and the node it's heard through (none until it's decoded) */
  buffer: AudioBuffer | null;
  output: GainNode | null;
}

/** What each track does now (for the lab's `music`). */
export function musicShown(): TrackShown[] {
  const ctx = audioContext();
  return Object.values(tracks).map((track) => track.shown(ctx));
}

// music left playing in a background tab stays quiet (the frames stop there, and with them the fades); it plays on
// from where it was when the tab comes back
document.addEventListener('visibilitychange', () => {
  const ctx = audioContext();
  if (!ctx || !document.hidden) return;
  for (const track of Object.values(tracks)) track.stop(ctx);
});
