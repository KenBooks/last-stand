// `lab village --only ambienceUnderMusic` (from Kenneth on #891: "Sounds are way too loud, can barely hear the
// music. Tune them down please, less loud"): the ambience against the music, each as the game plays it at the default
// volumes (every slider full, as a first visit has them): a minute of each rendered offline, the ambience through the
// effects' own chain (`playInto`: their master and compressor) where he stands, the music at its own level
// (`MUSIC_LEVEL`) for the hour (the village plays the hour's battleground's lobby track, `biomeOfHour`). Each is read
// as its RMS and its loudness (LUFS, K-weighted as ITU-R BS.1770 weighs it, ungated), at noon and midnight on the
// square and at noon by the campfire and the fountain. The music must be the louder by `UNDER_DB` on the square, and
// by `UNDER_NEAR_DB` beside the fire and the fountain, which a player walks up to hear. `canary` plays the ambience
// four times as loud (12 dB): it must be heard over the music.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { LightsChecked } from './villageLights';
import { G } from '../../../src/state';
import { playInto } from '../../../src/core/audio';
import { MUSIC_LEVEL } from '../../../src/core/music';
import { ambienceLoaded, playAmbience, FIRE_VOICES, type AmbienceWanted } from '../../../src/core/ambience';
import { firesHeard } from '../../../src/world/firesHeard';
import { groundHeight } from '../../../src/world/ground';
import { biomeOfHour, CAMPFIRE } from '../../../src/data/village';
import { BIOMES } from '../../../src/data/biomes';
import { holdHour, heldHour } from '../../../src/game/clock';
import quietBeginnings from '../../../src/audio/music/quiet-beginnings.mp3?url';
import shadowedDusk from '../../../src/audio/music/shadowed-dusk.mp3?url';

/** the rate rendered at, and how long each is heard (s) */
const RATE = 48000;
const HEARD = 60;
/** the music louder than the ambience by this on the square (dB), and beside the fire and the fountain */
const UNDER_DB = 12;
const UNDER_NEAR_DB = 8;
/** the canary's ambience, this many times as loud */
const CANARY_GAIN = 4;
/** the frames he stands before he's heard */
const SETTLE = 30;
/** the lobby tracks the village plays, by name */
const TRACKS: Record<string, string> = { 'quiet-beginnings': quietBeginnings, 'shadowed-dusk': shadowedDusk };

/** A stand: where he is, at what hour, and how much quieter the ambience must be than the music. */
interface Stand {
  name: string;
  at: [number, number];
  hour: number;
  under: number;
}

const STANDS: Stand[] = [
  { name: 'at noon on the square', at: [0, 4.5], hour: 12, under: UNDER_DB },
  { name: 'at midnight on the square', at: [0, 4.5], hour: 0, under: UNDER_DB },
  { name: 'at noon by the campfire', at: [CAMPFIRE[0] + 2, CAMPFIRE[1]], hour: 12, under: UNDER_NEAR_DB },
  { name: 'at noon by the fountain', at: [0, 3], hour: 12, under: UNDER_NEAR_DB },
];

/** A sound's level: its RMS and its loudness (dB, LUFS). */
interface Level {
  rmsDb: number;
  lufs: number;
}

/** `buffer`'s RMS over both channels (dB of full scale). */
function rmsDb(buffer: AudioBuffer): number {
  let squares = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    for (const sample of buffer.getChannelData(ch)) squares += sample * sample;
  }
  return 10 * Math.log10(Math.max(1e-12, squares / (buffer.length * buffer.numberOfChannels)));
}

/** `buffer` K-weighted (BS.1770's two stages: a shelf of +4 dB over 1.5 kHz, a high pass at 38 Hz), its loudness
 *  ungated (LUFS: -0.691 + 10 log of the channels' summed mean squares). */
async function lufsOf(buffer: AudioBuffer): Promise<number> {
  const c = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = c.createBufferSource();
  source.buffer = buffer;
  const shelf = c.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 1500;
  shelf.gain.value = 4;
  const pass = c.createBiquadFilter();
  pass.type = 'highpass';
  pass.frequency.value = 38;
  pass.Q.value = 0.5;
  source.connect(shelf).connect(pass).connect(c.destination);
  source.start();
  const weighted = await c.startRendering();
  let sum = 0;
  for (let ch = 0; ch < weighted.numberOfChannels; ch++) {
    let squares = 0;
    for (const sample of weighted.getChannelData(ch)) squares += sample * sample;
    sum += squares / weighted.length;
  }
  return -0.691 + 10 * Math.log10(Math.max(1e-12, sum));
}

async function levelOf(buffer: AudioBuffer): Promise<Level> {
  return { rmsDb: rmsDb(buffer), lufs: await lufsOf(buffer) };
}

/** The ambience `wanted` asks for, a minute of it through the effects' chain (`gain` times as loud). */
async function renderAmbience(wanted: AmbienceWanted, gain: number): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, HEARD * RATE, RATE);
  const restore = playInto(c);
  try {
    await ambienceLoaded(c);
    playAmbience(wanted);
    const rendered = await c.startRendering();
    if (gain !== 1) {
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch);
        for (let i = 0; i < data.length; i++) data[i] *= gain;
      }
    }
    return rendered;
  } finally {
    restore();
  }
}

/** A minute of lobby track `id` at the music's level, from its start (each rendered once). */
const tracks = new Map<string, Promise<AudioBuffer>>();
function renderTrack(id: string): Promise<AudioBuffer> {
  let rendered = tracks.get(id);
  if (!rendered) {
    rendered = (async () => {
      const c = new OfflineAudioContext(2, HEARD * RATE, RATE);
      const data = await (await fetch(TRACKS[id])).arrayBuffer();
      const source = c.createBufferSource();
      source.buffer = await c.decodeAudioData(data);
      source.loop = true;
      const level = c.createGain();
      level.gain.value = MUSIC_LEVEL;
      source.connect(level).connect(c.destination);
      source.start();
      return c.startRendering();
    })();
    tracks.set(id, rendered);
  }
  return rendered;
}

/** What the game asks of the ambience with him at `stand`, settled there (as `ambienceWanted` in `main.ts` asks). */
async function wantedAt(lab: Lab, stand: Stand): Promise<AmbienceWanted> {
  const [x, z] = stand.at;
  holdHour(stand.hour);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  const p = G.player.pos;
  const water = new THREE.Vector3(0, p.y, 0).applyMatrix4(G.camera.matrixWorldInverse);
  return {
    on: true,
    village: true,
    hour: stand.hour,
    indoors: false,
    waterAt: Math.hypot(p.x, p.z),
    waterWay: Math.atan2(water.x, -water.z),
    fires: firesHeard(p, G.camera, FIRE_VOICES),
  };
}

const dB = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;

/** The ambience against the music at each stand. */
export async function ambienceUnderMusic(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const was = heldHour();
  const lines: string[] = [];
  const problems: string[] = [];
  let heardOver = false;
  try {
    for (const stand of STANDS) {
      const track = BIOMES[biomeOfHour(stand.hour)].music.lobby;
      const ambience = await levelOf(await renderAmbience(await wantedAt(lab, stand), canary ? CANARY_GAIN : 1));
      const music = await levelOf(await renderTrack(track));
      const under = music.lufs - ambience.lufs;
      const levels = `ambience ${ambience.lufs.toFixed(1)} LUFS (RMS ${ambience.rmsDb.toFixed(1)} dB), `
        + `music (${track}) ${music.lufs.toFixed(1)} LUFS (RMS ${music.rmsDb.toFixed(1)} dB)`;
      lines.push(`${stand.name}: ${levels}: the music ${dB(under)} dB over it (at least ${stand.under})`);
      if (under < stand.under) {
        heardOver = true;
        const asked = `${stand.under} asked`;
        problems.push(`ambience: ${stand.name}, the music only ${dB(under)} dB over the ambience (${asked})`);
      }
    }
  } finally {
    holdHour(was);
    await lab.step(SETTLE);
  }
  if (canary) return { lines, problems: [], caught: heardOver, moments: [] };
  return { lines, problems, caught: null, moments: [] };
}
