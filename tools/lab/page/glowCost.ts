// tools/lab glowcost: what the worn gear's rarity glow (`ITEM_GLOW` in core/materials.ts, #404) takes of a frame. The
// same frame is drawn with the glow as players have it and, in turns within one page (`gpuTurns.ts`: a run's load
// falls on both sides), each of two ways without it:
//   - off by the setting (Settings' Gear glow: its strength a uniform at 0, its strands still worked out a pixel);
//   - on plain gear (no item of a rarity that glows: its colour black, the pattern passed over a pixel).
// The whole frame is timed by the engine's GPU clock, and the frame's work on the CPU by the browser's clock (with
// the glow's copies and in the kit's own materials too: each copy a material of its own). Each scene says what share
// of the screen the glow changed and proves each side: the glow seen with it, and the frame the same to the pixel
// whichever way it's off (else the measure compared nothing). Its canary draws the frame twice, which must read as
// more. A third way, the glow's code taken out of three's programs, was three's alone: the engine's kit shader is
// one (`engine/looks/kit.ts`). From play: "we also need to disable clothing shader effect,
// for rarity -- measure how much it would impact the performance".
import * as THREE from 'three';
import type { Lab, Pictured, Report } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { useQuality } from '../../../src/core/quality';
import { QUALITY, type QualityLevel } from '../../../src/data/quality';
import { gearGlow, setGearGlow, tickItemGlow } from '../../../src/core/materials';
import { BIOMES, type BiomeId } from '../../../src/data/biomes';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { Player } from '../../../src/entities/player';
import { loadProfile } from '../../../src/loot/profile';
import * as hall from '../../../src/game/hall';
import type { Gear, GlowSlot, Model, RarityId } from '../../../src/types';
import { costInTurns, sure, type TurnsCost, type Turns } from './gpuTurns';
import { RUST } from '../../../src/engine';
import { drawFrame, standIn, type Canvas } from './light';
import { openHall, toLobby } from './hallMoves';

/** the scenes: the hero alone in each view, a party of four close up, the hall of heroes, a fight */
export type GlowScene = 'top' | 'third' | 'first' | 'party' | 'hall' | 'fight';

export interface GlowCostOptions {
  scene: GlowScene;
  biome: BiomeId;
  level: QualityLevel;
  /** the rarity every item is worn at */
  rarity: RarityId;
  /** the rounds of turns, each with a side's renders */
  rounds: number;
  /** draw the frame twice: it must read as more */
  canary: boolean;
  /** three's work on the frame timed on the CPU too, slowed this many times as the browser plays a slower device's
   *  (1: as it is; 0: not timed). On a screen the GPU keeps up with: a frame it's behind on holds three's calls up */
  cpu: number;
}

/** a side's renders in a turn */
const TURN_RENDERS = 6;
/** the canary's frame drawn twice must take this many times the frame once, at least */
const CANARY_LEAST = 1.6;
/** a pixel differs where a channel is this far apart (of white): past the GPU's own rounding, 2 levels */
const APART = 2.5 / 255;
/** the glow must change this share of the screen at least, or it wasn't drawn; and two ways of having none may
 *  differ in this share at most, or one of them drew something else */
const SEEN_LEAST = 0.00002;
const SAME_MOST = 0.0005;
/** frames the scene is let settle for once it's set (foes risen, the hall's camera in) */
const SETTLE = { party: 30, hall: 240, fight: 150 };
/** the fight's foes: how many, and how far from the hero they rise (m) */
const FOES = { count: 28, near: 4, far: 10, wave: 8 };
/** the CPU's turns: rounds of this many frames a side, timed as one */
const CPU_TURNS = { rounds: 10, frames: 20 };

/** the ways the frame is drawn: as players have it, and each way without the glow */
type Way = 'on' | 'setting' | 'plain' | 'own';
const WAYS: { way: Exclude<Way, 'on'>; name: string; gpu: boolean }[] = [
  { way: 'setting', name: 'off by the setting (its strength 0)', gpu: true },
  { way: 'plain', name: 'on plain gear (its code passed over)', gpu: true },
  // (the glow's copies are work on the CPU, `--cpu`: the GPU draws the same either way)
  { way: 'own', name: 'plain gear in the kit\'s own materials (no copies for the glow)', gpu: false },
];

/** A hero in the scene: his model and the gear he wears, glowing. */
interface Worn {
  model: Model;
  gear: Gear;
}

const GLOW_SLOTS: GlowSlot[] = ['weapon', 'offhand', 'head', 'chest', 'hands'];

/** `gear` with every item of `rarity` (none: plain). */
function gearAt(gear: Gear, rarity: RarityId | null): Gear {
  return { ...gear, rarity: rarity ? Object.fromEntries(GLOW_SLOTS.map((slot) => [slot, rarity])) : {} };
}

/** The materials of a mesh, as a list. */
function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** A kit material's looks, as far as the glow goes: its own glow's colour. */
type Glowing = THREE.Material & { kitLooks?: { aura: { value: THREE.Color } } };

/**
 * The heroes' glow copies (`kitCopy`: a material an item's parts draw in, the kit's own but for its glow's colour)
 * swapped for the materials they copy, and back: the hero as he'd draw with no glow to tell his items apart by. A
 * copy shares its original's hook, and the original is the one made first, its id the lowest; a copy's glow colour
 * is its own. Only right while no gear glows (plain, or the setting off): the frame's pixels say so.
 */
class OwnMaterials {
  private readonly swaps: { mesh: THREE.Mesh; with_: THREE.Material | THREE.Material[]; without: THREE.Material | THREE.Material[] }[] = [];
  readonly copies = new Set<THREE.Material>();

  constructor(roots: THREE.Object3D[]) {
    const meshes: THREE.Mesh[] = [];
    for (const root of roots) root.traverse((object) => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
    const first = new Map<unknown, Glowing>();
    for (const material of meshes.flatMap(materialsOf) as Glowing[]) {
      if (!material.kitLooks) continue;
      const known = first.get(material.onBeforeCompile);
      if (!known || material.id < known.id) first.set(material.onBeforeCompile, material);
    }
    const own = (material: Glowing): THREE.Material => {
      const original = material.kitLooks ? first.get(material.onBeforeCompile)! : material;
      if (original === material || original.kitLooks!.aura === material.kitLooks!.aura) return material;
      this.copies.add(material);
      return original;
    };
    for (const mesh of meshes) {
      const owns = materialsOf(mesh).map(own);
      if (owns.every((material, index) => material === materialsOf(mesh)[index])) continue;
      this.swaps.push({ mesh, with_: mesh.material, without: Array.isArray(mesh.material) ? owns : owns[0] });
    }
  }

  get meshes(): number { return this.swaps.length; }

  put(own: boolean): void {
    for (const swap of this.swaps) swap.mesh.material = own ? swap.without : swap.with_;
  }
}

/**
 * The heroes' glows put out and lit again: each glowing material's own colour (`kitLooks.aura`) made black, as
 * plain gear's is, or what the gear worn gave it. The colour alone, as `ItemGlows.set` sets it: dressed again
 * (`setGear`), a hero's weapon and coat were built anew at every turn, and nothing the lab had swapped held.
 */
class Glows {
  private readonly lit: { colour: THREE.Color; worn: THREE.Color }[] = [];

  constructor(roots: THREE.Object3D[]) {
    const seen = new Set<THREE.Color>();
    for (const root of roots) {
      root.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return;
        for (const material of materialsOf(object as THREE.Mesh) as Glowing[]) {
          const colour = material.kitLooks?.aura.value;
          if (!colour || seen.has(colour) || colour.getHex() === 0 && colour.r + colour.g + colour.b === 0) continue;
          seen.add(colour);
          this.lit.push({ colour, worn: colour.clone() });
        }
      });
    }
  }

  get count(): number { return this.lit.length; }

  put(on: boolean): void {
    for (const { colour, worn } of this.lit) {
      if (on) colour.copy(worn);
      else colour.setRGB(0, 0, 0);
    }
  }
}

/** The scene as it's measured: its heroes in glowing gear, and what takes it down. */
interface Staged {
  heroes: Worn[];
  leave: () => void;
}

/** Three partners of the other classes stood before the hero, facing him, as a party stands close up. */
function partyOf(lab: Lab): Staged {
  const hero = lab.player;
  const ahead = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
  const aside = new THREE.Vector3(ahead.z, 0, -ahead.x);
  const others = [...CLASS_IDS.filter((id) => id !== hero.cls.id), hero.cls.id].slice(0, 3);
  const partners = others.map((id, index) => {
    const partner = new Player(id, loadProfile(id).equipped, false);
    const at = hero.pos.clone().addScaledVector(ahead, 3.2).addScaledVector(aside, (index - 1) * 1.6);
    partner.place(at, hero.facing + Math.PI);
    return partner;
  });
  return {
    heroes: [hero, ...partners].map((player) => ({ model: player.model, gear: player.gear })),
    leave: () => partners.forEach((partner) => partner.dispose()),
  };
}

/** The biome's foes risen round the hero, as a wave's stand about him. */
function fightRound(lab: Lab, biome: BiomeId): Staged {
  const pool = BIOMES[biome].pool(FOES.wave);
  for (let foe = 0; foe < FOES.count; foe++) {
    const turn = (foe / FOES.count) * Math.PI * 2;
    const reach = FOES.near + (FOES.far - FOES.near) * ((foe * 7) % FOES.count) / FOES.count;
    const at = lab.player.pos.clone().add(new THREE.Vector3(Math.sin(turn) * reach, 0, Math.cos(turn) * reach));
    lab.spawnFoe(pool[foe % pool.length][0], at);
  }
  return { heroes: [{ model: lab.player.model, gear: lab.player.gear }], leave: () => {} };
}

/** The scene set up: the hero stood in the biome in his view, and what the scene adds. */
async function stage(lab: Lab, { scene, biome }: GlowCostOptions): Promise<Staged> {
  const view: renderer.ViewMode = scene === 'top' || scene === 'fight' || scene === 'hall' ? 'top'
    : scene === 'party' ? 'third' : scene;
  await standIn(lab, { biome, view, facing: 0 });
  if (scene === 'party') {
    const staged = partyOf(lab);
    await lab.step(SETTLE.party);
    return staged;
  }
  if (scene === 'fight') {
    const staged = fightRound(lab, biome);
    await lab.step(SETTLE.fight);
    return staged;
  }
  if (scene === 'hall') {
    await toLobby(lab);
    if (!(await openHall(lab))) throw new Error('lab: glowcost: no hall of heroes in this tree');
    await lab.step(SETTLE.hall);
    const heroes = hall.hallHeroes().map(({ player }) => ({ model: player.model, gear: player.gear }));
    return { heroes, leave: () => {} };
  }
  return { heroes: [{ model: lab.player.model, gear: lab.player.gear }], leave: () => {} };
}

/** How two frames differ: the share of the canvas's pixels apart, and where on the screen they lie (shares of its
 *  width from the left and of its height from the bottom) and by how much at most (levels of 255). */
interface Apart {
  share: number;
  where: string;
}

/** The pixels that differ between two frames of the canvas. */
function apartIn(a: Canvas, b: Canvas): Apart {
  let apart = 0;
  let most = 0;
  const box = { left: 1, right: 0, bottom: 1, top: 0 };
  for (let at = 0; at < a.pixels.length; at += 4) {
    const by = Math.max(Math.abs(a.pixels[at] - b.pixels[at]), Math.abs(a.pixels[at + 1] - b.pixels[at + 1]),
      Math.abs(a.pixels[at + 2] - b.pixels[at + 2]));
    if (by <= APART) continue;
    apart++;
    most = Math.max(most, by);
    const x = ((at / 4) % a.width) / a.width;
    const y = Math.floor(at / 4 / a.width) / a.height;
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.bottom = Math.min(box.bottom, y);
    box.top = Math.max(box.top, y);
  }
  const where = apart ? `across ${box.left.toFixed(2)} to ${box.right.toFixed(2)} of the screen, ${box.bottom.toFixed(2)} to `
    + `${box.top.toFixed(2)} up it, by up to ${Math.round(most * 255)} levels` : 'nowhere';
  return { share: apart / (a.pixels.length / 4), where };
}

/** A whole frame's draws, triangles and the materials its shown meshes draw in. */
function drawsOf(): { calls: number; triangles: number; materials: number } {
  renderer.render();
  const stats = RUST.bridge!.stats;
  const calls = stats.draws;
  const triangles = stats.triangles;
  const materials = new Set<THREE.Material>();
  G.scene.traverseVisible((object) => {
    if ((object as THREE.Mesh).isMesh) for (const material of materialsOf(object as THREE.Mesh)) materials.add(material);
  });
  return { calls, triangles, materials: materials.size };
}

/** What three's own work on a frame takes of the CPU (ms a frame, by the browser's clock, the GPU not waited for)
 *  with `change(true)` and `change(false)`, in turns: each turn's frames timed as one, a round's two turns back to
 *  back, the median over the rounds of each side and of each round's own difference, and how far that may be off. */
function cpuInTurns(change: (on: boolean) => void, draw: () => void): CpuCost {
  const now = window.__labClock.realNow;
  const times = { on: [] as number[], off: [] as number[] };
  for (let round = 0; round < CPU_TURNS.rounds; round++) {
    for (const on of round % 2 ? [false, true] : [true, false]) {
      change(on);
      draw();
      const start = now();
      for (let frame = 0; frame < CPU_TURNS.frames; frame++) draw();
      (on ? times.on : times.off).push((now() - start) / CPU_TURNS.frames);
    }
  }
  change(true);
  const middle = (values: number[]): number => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];
  const apart = times.on.map((on, round) => on - times.off[round]);
  const takes = middle(apart);
  const spread = middle(apart.map((value) => Math.abs(value - takes)));
  return { on: middle(times.on), off: middle(times.off), takes, error: (1.2533 * 1.4826 * spread) / Math.sqrt(apart.length) };
}

/** Three's work on a frame (ms) with the glow and another way, what that way saves and how far that may be off. */
interface CpuCost {
  on: number;
  off: number;
  takes: number;
  error: number;
}

/** A CPU line: three's work a frame with the glow and `name`'s way, and what that saves. */
function cpuLine(name: string, cost: CpuCost): string {
  const told = Math.abs(cost.takes) > 2 * cost.error ? '' : ', within the noise';
  return `    ${name}: saves ${cost.takes.toFixed(3)} ms \u00b1${cost.error.toFixed(3)}${told} `
    + `(${cost.on.toFixed(2)} with the glow, ${cost.off.toFixed(2)} this way)`;
}

/** A way's line: what the frame takes with the glow and this way without, the saving and its share. */
function wayLine(name: string, cost: TurnsCost): string {
  const share = cost.on > 0 ? (100 * cost.takes) / cost.on : 0;
  const told = sure(cost) ? '' : ', within the noise';
  return `  ${name}: saves ${cost.takes.toFixed(3)} ms ±${cost.error.toFixed(3)}, ${share.toFixed(1)}%${told} `
    + `(the frame ${cost.on.toFixed(2)} with the glow, ${cost.off.toFixed(2)} this way)`;
}

/** `lab glowcost`, one scene: what the gear's glow takes of the frame, each way of having none against it. */
export async function glowCost(lab: Lab, command: GlowCostOptions): Promise<Report> {
  const { scene, biome, level, rarity } = command;
  useQuality(level);
  const staged = await stage(lab, command);
  const size = renderer.sceneSize(new THREE.Vector2());
  const name = `${scene} (${biome}, ${QUALITY[level].label}, ${staged.heroes.length} hero${staged.heroes.length > 1 ? 'es' : ''} `
    + `in ${rarity} gear, the scene ${size.x}x${size.y}, ${(size.x * size.y / 1e6).toFixed(2)} Mpx)`;
  const dress = (worn: RarityId | null): void => {
    for (const hero of staged.heroes) hero.model.setGear?.(gearAt(hero.gear, worn));
  };
  const setting = gearGlow();
  const drawing = lab.drawing;
  lab.drawing = true;
  dress(rarity);
  // (pictured before anything of his is taken stock of: dressed, a hero's weapon and coat are built anew, and what
  // the page's workers make of them lands in a task of its own, which the picture waits out. Taken stock of at
  // once, the first scene on a page drew a dozen meshes the lab had never seen, the glow still on them)
  const moments: Pictured[] = [];
  moments.push(await lab.screen(`${scene} ${level}: glow on`, [`every item ${rarity}`]));
  const glows = new Glows(staged.heroes.map((hero) => hero.model.root));
  const owned = new OwnMaterials(staged.heroes.map((hero) => hero.model.root));
  /** the frame drawn `way` from here on */
  const draws = (way: Way): void => {
    setGearGlow(way !== 'setting');
    tickItemGlow(G.time);
    glows.put(way !== 'plain' && way !== 'own');
    owned.put(way === 'own');
  };
  const turns: Turns = { rounds: command.rounds, renders: TURN_RENDERS };
  const lines = [name];
  const problems: string[] = [];
  try {
    const draw = (): void => renderer.render();
    // what each way draws: the glow seen, and every way without it the same frame
    draws('on');
    const lit = drawFrame(lab);
    const counts = { on: drawsOf() } as Record<Way, ReturnType<typeof drawsOf>>;
    const frames = {} as Record<Exclude<Way, 'on'>, Canvas>;
    for (const { way } of WAYS) {
      draws(way);
      frames[way] = drawFrame(lab);
      counts[way] = drawsOf();
      if (way === 'plain') moments.push(await lab.screen(`${scene} ${level}: no glow`, ['plain gear']));
    }
    draws('on');
    const seen = apartIn(lit, frames.plain).share;
    lines.push(`  the glow changed ${(100 * seen).toFixed(2)}% of the screen's pixels (${glows.count} glowing `
      + 'materials)');
    if (glows.count < 1) problems.push(`${scene}: no material of the heroes' glows in ${rarity} gear`);
    if (seen < SEEN_LEAST) problems.push(`${scene}: the glow was never seen: the frame with it is the frame without`);
    for (const way of ['setting', 'own'] as const) {
      const apart = apartIn(frames[way], frames.plain);
      if (apart.share > SAME_MOST) {
        problems.push(`${scene}: ${way}: ${(100 * apart.share).toFixed(2)}% of the pixels differ from the frame on `
          + `plain gear (${apart.where}): one of them drew something else`);
      }
    }
    lines.push(`  a frame's draws ${counts.on.calls} in ${counts.on.materials} materials with the glow, `
      + `${counts.plain.calls} in ${counts.plain.materials} on plain gear, ${counts.own.calls} in `
      + `${counts.own.materials} without the glow's ${owned.copies.size} copies (on ${owned.meshes} meshes)`);
    // the GPU: the whole frame, each way without the glow against it
    for (const { way, name: wayName } of WAYS.filter((timed) => timed.gpu)) {
      const cost = await costInTurns((on) => draws(on ? 'on' : way), draw, turns);
      if (!cost) return { text: `${name}: untimed (the engine has no GPU timestamps here)`, problems: [] };
      lines.push(wayLine(wayName, cost));
    }
    const nothing = await costInTurns(() => {}, draw, turns);
    if (nothing) lines.push(wayLine('nothing changed (the measure\'s own noise)', nothing));
    // the CPU: the frame's work (the glow's copies are materials of their own)
    if (command.cpu >= 1) {
      lines.push(`  the frame's work on the CPU${command.cpu > 1 ? `, the CPU slowed ${command.cpu} times` : ''}:`);
      if (command.cpu > 1) await lab.throttle(command.cpu);
      try {
        lines.push(cpuLine('on plain gear', cpuInTurns((on) => draws(on ? 'on' : 'plain'), draw)));
        lines.push(cpuLine('plain gear in the kit\'s own materials', cpuInTurns((on) => draws(on ? 'on' : 'own'), draw)));
        lines.push(cpuLine('nothing changed (the noise)', cpuInTurns(() => {}, draw)));
      } finally {
        if (command.cpu > 1) await lab.throttle(1);
      }
    }
    if (command.canary) {
      const twice = await costInTurns(() => {}, draw, turns, (on) => (on ? 2 : 1));
      const read = twice ? twice.on / twice.off : 0;
      lines.push(`  canary: the frame drawn twice read ${read.toFixed(2)} times once`);
      if (read < CANARY_LEAST) problems.push(`${scene}: canary: the frame drawn twice went unseen`);
    }
    return { text: lines.join('\n'), problems, moments };
  } finally {
    draws('on');
    setGearGlow(setting);
    staged.leave();
    lab.drawing = drawing;
  }
}
