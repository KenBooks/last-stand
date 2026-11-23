// The Ossuary Twins (tools/lab `twins`; entities/twins.ts, entities/bossKit.ts): the Crypt's special boss wave, Slab
// and Reliquary sharing one life.
//
// - `waves`: each battleground's boss waves set off as the game sets them off (the run's wave and its timer): the
//   boss the run sends read off the run (`RunState.boss`), the banner's line and the Continue button's name, against
//   what each wave should send (the Twins on the Crypt's 15th and every 20th after, the Colossus on its other boss
//   waves, the Thornheart on every one of the Thornwood's); then the Crypt's 15th let come: the two risen together,
//   within their chain's reach.
// - `fight`: a hit on either taking the pair's life from both; the chain snapping tight past its reach (the hero stood
//   between them hurt, the two dragged nearer); at half the one that took more collapsing, paying nothing, the other
//   in its phase; Reliquary's mend raising the pair's life once Slab stands hurt and unhit, and a stun in its channel
//   breaking it, healing nothing.
// - `compiles`: every effect of their fight drawn (the chain, its snap, a volley, a charge, a slam, a mend): no
//   program compiled meanwhile.
// - `pictures` (asked for alone): the pair in each of their moments, a sheet for the eye.
// - `look` (asked for alone): each twin alone from its front, back and sides and its skull close up, its triangles held
//   to 45k.
//
// `--canary` plants a fault each part must catch: no special boss wave (the Colossus on the 15th), a pair that shares
// nothing, a chain that never snaps, no collapse at half, a mend that mends nothing, a program compiled in the fight.
import * as THREE from 'three';
import type { Fixture, Lab, Pictured, Report } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import type { BiomeId } from '../../../src/data/biomes';
import type { EnemyId } from '../../../src/data/enemies';
import { G } from '../../../src/state';
import { BIOMES, BIOME_IDS, bossOfWave } from '../../../src/data/biomes';
import { ENEMIES } from '../../../src/data/enemies';
import { TWINS } from '../../../src/data/foes/twins';
import { WAVES } from '../../../src/data/waves';
import { ARENA } from '../../../src/data/balance';
import { hooksOf } from '../../../src/entities/bossHooks';
import { fx, setFxSink } from '../../../src/entities/enemyAI';
import { startNextWave } from '../../../src/game/run';
import { inObstacle } from '../../../src/world/collision';
import { lineClear } from '../../../src/world/navigation';
import { femur, forearm, humerus, jaw, pelvis, scapula, skull, sternum, tibia, twinSkull } from '../../../src/entities/models/ossuary';
import { PIPELINES } from '../../../src/engine/pipelinesAside';

/** The parts the command runs, in order. */
export type TwinsPart = 'waves' | 'fight' | 'compiles' | 'pictures' | 'look';
/** the parts run by default: the pictures are asked for alone */
export const TWINS_PARTS: TwinsPart[] = ['waves', 'fight', 'compiles'];

export interface TwinsOptions {
  fixture: Fixture;
  /** the parts to run (all but the pictures by default) */
  parts?: TwinsPart[];
  /** plant a fault each part must catch */
  canary: boolean;
}

/** the wave the Twins first come on, and every how many after (data/biomes.ts `bossWaves`, as it ships) */
const FIRST_WAVE = 15;
const EVERY = 20;
/** the boss waves each battleground's are judged on */
const BOSS_WAVES = [5, 10, 15, 20, 25, 30, 35];
/** where the hero stands (m), off the dais and clear of props */
const SPOT: [number, number] = [12, 12];
/** the frames a boss may take to come and rise, a wave to start, and the lab's frames a second */
const RISE_FRAMES = 200;
const COME_FRAMES = 400;
const WAVE_FRAMES = 30;
const FPS = 60;
/** how far apart the pair stands at first (m), well inside the chain's reach */
const ABREAST = 5;
/** the frames a mend may take to begin, and how far under its `heal` a mend may raise the pair's life (a share) */
const MEND_WAIT = 15 * FPS;
const MEND_MOST_OFF = 0.1;

const fixed = (value: number, digits = 2): string => value.toFixed(digits);

/** The hero set up in `biome`, at the spot, facing the arena's middle. */
async function standIn(lab: Lab, fixture: Fixture, biome: BiomeId): Promise<void> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  const facing = Math.atan2(-SPOT[0], -SPOT[1]);
  await lab.setup({ at: SPOT, facing, ...fixture });
}

/** how far either way round the hero a boss's spot is looked for (rad), in steps of `CLEAR_STEP` */
const CLEAR_MOST = Math.PI;
const CLEAR_STEP = 0.15;

/** A spot `away` m from the hero, nearest the way to the arena's middle, where a boss of `radius` stands clear of the
 *  props with nothing between it and him. */
function clearSpot(away: number, radius: number): THREE.Vector3 {
  const hero = G.player.pos;
  const inward = new THREE.Vector3(-hero.x, 0, -hero.z).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  for (let turn = 0; turn <= CLEAR_MOST; turn += CLEAR_STEP) {
    for (const sign of turn === 0 ? [1] : [1, -1]) {
      const way = inward.clone().applyAxisAngle(up, turn * sign);
      const at = hero.clone().addScaledVector(way, away).setY(0);
      const inside = Math.hypot(at.x, at.z) < ARENA.radius - radius;
      if (inside && !inObstacle(at, radius) && lineClear(hero.x, hero.z, at.x, at.z, 0.5)) return at;
    }
  }
  throw new Error(`lab: no spot ${away} m from the hero clear for a boss`);
}

/** Slab and Reliquary risen abreast `away` m from the hero, dazed (thinking nothing) unless `thinks`. */
async function pairAt(lab: Lab, away: number, thinks: boolean): Promise<{ slab: Enemy; reliquary: Enemy }> {
  const at = clearSpot(away, ENEMIES.twinslab.radius);
  const toHero = new THREE.Vector3(G.player.pos.x - at.x, 0, G.player.pos.z - at.z).normalize();
  const side = new THREE.Vector3(-toHero.z, 0, toHero.x);
  let other = at.clone().addScaledVector(side, ABREAST);
  if (inObstacle(other, ENEMIES.twinreliquary.radius)) other = at.clone().addScaledVector(side, -ABREAST);
  const slab = lab.spawnFoe('twinslab', at, { wave: FIRST_WAVE });
  const reliquary = lab.spawnFoe('twinreliquary', other, { wave: FIRST_WAVE });
  await lab.until(() => slab.spawning <= 0 && reliquary.spawning <= 0, RISE_FRAMES, 'the Twins never rose');
  for (const twin of [slab, reliquary]) {
    twin.facing = twin.targetFacing = Math.atan2(G.player.pos.x - twin.pos.x, G.player.pos.z - twin.pos.z);
    twin.dazed = thinks ? 0 : 1e4;
  }
  return { slab, reliquary };
}

/** The hero's life held whole each frame, but where a check reads it. */
const keepWhole = (): Record<string, never> => {
  G.player.life = G.player.stats.maxLife;
  return {};
};

// --- the waves ---------------------------------------------------------------------------------------------

/** What wave `wave` of `biome` should send: the Twins on the Crypt's 15th and every 20th after, else its own boss. */
function wantedOf(biome: BiomeId, wave: number): EnemyId[] {
  const twins = biome === 'crypt' && wave >= FIRST_WAVE && (wave - FIRST_WAVE) % EVERY === 0;
  return twins ? ['twinslab', 'twinreliquary'] : [BIOMES[biome].boss];
}

/** Wave `wave` set off from its countdown as the game begins one (`startNextWave`: its banner put up), then let
 *  start: the bosses its run holds for it, and the banner's line. The wave is stopped before it sends anyone. */
async function bossesSent(lab: Lab, wave: number): Promise<{ bosses: EnemyId[]; banner: string }> {
  const run = G.run!;
  run.wave = wave;
  startNextWave();
  const banner = document.querySelector('#banner .b-sub')?.textContent ?? '';
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', WAVE_FRAMES, `wave ${wave} never started`);
  const bosses = (run.boss ?? []).map((unit) => unit.type);
  run.queue.length = 0;
  run.boss = null;
  run.phase = 'countdown';
  run.timer = 1e4;
  return { bosses, banner };
}

/** Each battleground's boss waves: the bosses the run sends, its banner and the Continue button's name. */
async function judgeWaves(lab: Lab, biome: BiomeId, lines: string[], problems: string[]): Promise<void> {
  const met: string[] = [];
  for (const wave of BOSS_WAVES) {
    const sent = await bossesSent(lab, wave);
    const wanted = wantedOf(biome, wave);
    met.push(`${wave} ${sent.bosses.join('+') || 'none'}`);
    if (sent.bosses.join() !== wanted.join()) {
      problems.push(`waves: ${biome} wave ${wave}: the run sent [${sent.bosses.join(', ')}], not [${wanted.join(', ')}]`);
    }
    const boss = bossOfWave(biome, wave);
    if (boss && !sent.banner.includes(boss.banner)) {
      problems.push(`waves: ${biome} wave ${wave}: the banner said "${sent.banner}", not its boss's line "${boss.banner}"`);
    }
    const named = wanted[0] === 'twinslab' ? 'Ossuary Twins' : BIOMES[biome].bossShort;
    if (boss?.short !== named) problems.push(`waves: ${biome} wave ${wave}: the Continue button would name ${boss?.short}`);
  }
  lines.push(`waves: ${biome}: ${met.join(', ')}`);
}

/** The Crypt's 15th let come: both twins risen, by one gate, within their chain's reach. */
async function twinsCome(lab: Lab, lines: string[], problems: string[]): Promise<void> {
  const run = G.run!;
  run.wave = FIRST_WAVE;
  startNextWave();
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', WAVE_FRAMES, `wave ${FIRST_WAVE} never started`);
  // (the wave's foes taken out but its bosses, who come once the rest has come and none stands)
  run.queue.length = 0;
  run.dealt = Math.max(1, run.dealt);
  const risen = (): Enemy[] => G.enemies.filter((foe) => foe.alive && foe.def.shares && foe.spawning <= 0);
  await lab.until(() => risen().length >= 2 || !run.boss, COME_FRAMES, 'the 15th wave\'s bosses never came');
  await lab.until(() => risen().length >= 2, COME_FRAMES, 'the Twins never both rose', keepWhole);
  const [a, b] = risen();
  const apart = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  lines.push(`waves: crypt wave ${FIRST_WAVE} let come: ${a.type} and ${b.type} risen ${fixed(apart, 1)} m apart `
    + `(their chain's reach ${TWINS.chain.max} m)`);
  if (apart >= TWINS.chain.max) problems.push(`waves: the Twins rose ${fixed(apart, 1)} m apart, past their chain's reach`);
}

/** Each battleground's boss waves, then the Twins let come. */
async function waves(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  const special = BIOMES.crypt.bossWaves;
  if (options.canary) BIOMES.crypt.bossWaves = undefined;
  try {
    for (const biome of BIOME_IDS) {
      await standIn(lab, options.fixture, biome);
      lab.letWavesCome();
      await judgeWaves(lab, biome, lines, problems);
    }
    if (!options.canary) {
      await standIn(lab, options.fixture, 'crypt');
      lab.letWavesCome();
      await twinsCome(lab, lines, problems);
    }
  } finally {
    BIOMES.crypt.bossWaves = special;
  }
}

// --- the fight ---------------------------------------------------------------------------------------------

/** A hit on either takes the pair's life from both. */
async function shared(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  const def = ENEMIES.twinslab;
  const partner = def.shares;
  if (options.canary) def.shares = undefined;
  try {
    const { slab, reliquary } = await pairAt(lab, 12, false);
    const blow = slab.maxLife * 0.1;
    slab.takeDamage(blow, {});
    reliquary.takeDamage(blow, {});
    await lab.step(2);
    const left = (slab.life / slab.maxLife + reliquary.life / reliquary.maxLife) / 2;
    lines.push(`fight: two hits of a tenth each, one on each: Slab ${fixed(slab.life / slab.maxLife)}, Reliquary `
      + `${fixed(reliquary.life / reliquary.maxLife)} of the pair's life`);
    if (Math.abs(slab.life - reliquary.life) > 1) {
      problems.push(`fight: their lives parted (${fixed(slab.life, 0)} against ${fixed(reliquary.life, 0)})`);
    }
    if (Math.abs(left - 0.8) > 0.01) problems.push(`fight: two tenths taken left ${fixed(left)} of the pair's life, not 0.80`);
  } finally {
    def.shares = partner;
  }
}

/** Past its reach the chain snaps: the hero between them hurt, the pair dragged nearer. */
async function chain(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  const reach = TWINS.chain.max;
  if (options.canary) TWINS.chain.max = 1e3;
  try {
    const { slab, reliquary } = await pairAt(lab, 9, false);
    // (Reliquary set past the chain's reach across the hero, so he stands on the line between them)
    const way = new THREE.Vector3(G.player.pos.x - slab.pos.x, 0, G.player.pos.z - slab.pos.z).normalize();
    reliquary.pos.copy(slab.pos).addScaledVector(way, reach + 4);
    const apart = (): number => Math.hypot(reliquary.pos.x - slab.pos.x, reliquary.pos.z - slab.pos.z);
    const was = apart();
    const hero = G.player;
    const takeDamage = hero.takeDamage;
    let snaps = 0;
    let hurt = 0;
    setFxSink((name) => { if (name === 'chainSnap') snaps++; });
    // (what reaches him counted as it lands: the set-up keeps his life whole)
    hero.takeDamage = (...args) => {
      const result = takeDamage.apply(hero, args);
      hurt += result?.taken ?? 0;
      return result;
    };
    try {
      await lab.step(40);
    } finally {
      setFxSink(null);
      hero.takeDamage = takeDamage;
    }
    const now = apart();
    lines.push(`fight: ${fixed(was, 1)} m apart, the hero between them: ${snaps} snaps, the hero hurt ${fixed(hurt, 0)}, `
      + `${fixed(now, 1)} m apart after`);
    if (snaps === 0) problems.push('fight: the chain never snapped past its reach');
    if (hurt <= 0) problems.push('fight: the chain swept through the hero and hurt him not at all');
    if (now > was - 2) problems.push(`fight: the snap dragged them only from ${fixed(was, 1)} to ${fixed(now, 1)} m apart`);
  } finally {
    TWINS.chain.max = reach;
  }
}

/** At half the one that took more collapses, paying nothing; the other enters its phase. */
async function collapse(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  const hooks = hooksOf('twinslab')!;
  const hurt = hooks.hurt;
  if (options.canary) hooks.hurt = undefined;
  try {
    const { slab, reliquary } = await pairAt(lab, 12, false);
    // (Slab struck harder: three hits of a tenth on him, two on Reliquary, the last over half)
    for (const twin of [slab, reliquary, slab, reliquary, slab]) {
      twin.takeDamage(twin.maxLife * 0.105, {});
      await lab.step(1);
    }
    await lab.step(30);
    const fell = [slab, reliquary].filter((twin) => !twin.alive).map((twin) => twin.type);
    lines.push(`fight: Slab took ${fixed(slab.taken / slab.maxLife)}, Reliquary ${fixed(reliquary.taken / reliquary.maxLife)}: `
      + `fallen [${fell.join(', ')}], Reliquary's phase ${reliquary.bossPhase}, its life ${fixed(reliquary.life / reliquary.maxLife)}`);
    if (fell.join() !== 'twinslab') problems.push(`fight: at half [${fell.join(', ')}] fell, not Slab alone (who took more)`);
    else if (!slab.noSpoils) problems.push('fight: the twin that collapsed at half would pay its spoils');
    if (reliquary.alive && reliquary.bossPhase < 1) problems.push('fight: the twin left standing never took its brother\'s power');
  } finally {
    hooks.hurt = hurt;
  }
}

/** Frames until Reliquary begins a mend, the hero kept whole. */
async function untilMend(lab: Lab, reliquary: Enemy): Promise<void> {
  await lab.until(() => reliquary.action?.name === 'mend', MEND_WAIT, 'Reliquary never began a mend', keepWhole);
}

/** Reliquary's mend raises the pair's life; a stun in its channel breaks it. */
async function mend(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  const heal = TWINS.mend.heal;
  if (options.canary) TWINS.mend.heal = 0;
  try {
    // (the hero far off, the pair thinking: hurt through Reliquary alone, Slab unhit)
    const { slab, reliquary } = await pairAt(lab, 24, true);
    reliquary.takeDamage(reliquary.maxLife * 0.25, {});
    await untilMend(lab, reliquary);
    const before = reliquary.life;
    await lab.until(() => reliquary.action?.name !== 'mend', 4 * FPS, 'the mend never ended', keepWhole);
    const raised = (reliquary.life - before) / reliquary.maxLife;
    lines.push(`fight: a mend raised the pair's life by ${fixed(raised, 3)} of it (its heal ${heal}); `
      + `Slab ${fixed(slab.life / slab.maxLife, 3)}`);
    if (raised < heal * (1 - MEND_MOST_OFF)) problems.push(`fight: a mend raised the pair's life by ${fixed(raised, 3)}, not ${heal}`);
    if (Math.abs(slab.life - reliquary.life) > 1) problems.push('fight: the mend healed Reliquary alone, not the pair');
    // the next, stunned a second into its channel
    await untilMend(lab, reliquary);
    await lab.step(FPS, keepWhole);
    const stunned = reliquary.life;
    reliquary.daze(1.5);
    await lab.step(4 * FPS, keepWhole);
    const after = (reliquary.life - stunned) / reliquary.maxLife;
    lines.push(`fight: a mend stunned a second in: the pair's life raised by ${fixed(after, 3)} after`);
    if (after > heal * 0.5) problems.push(`fight: a stunned mend still healed ${fixed(after, 3)} of the pair's life`);
  } finally {
    TWINS.mend.heal = heal;
  }
}

/** Each of the Twins' rules in turn, each on a fresh set-up in the Crypt. */
async function fight(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  for (const check of [shared, chain, collapse, mend]) {
    await standIn(lab, options.fixture, 'crypt');
    await check(lab, options, lines, problems);
  }
}

// --- compiles ----------------------------------------------------------------------------------------------

/** Every effect of the Twins' fight drawn: no program compiled meanwhile. */
async function compiles(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<void> {
  await standIn(lab, options.fixture, 'crypt');
  const { slab, reliquary } = await pairAt(lab, 9, false);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(2);
    const before = PIPELINES.made;
    const hero = G.player.pos;
    fx('chainSnap', slab.id, slab.pos.x, slab.pos.z, reliquary.pos.x, reliquary.pos.z, 0);
    fx('skullVolley', reliquary.id, reliquary.pos.x, reliquary.pos.z, hero.x, hero.z, 5, 0);
    fx('twinCharge', slab.id, slab.pos.x, slab.pos.z, hero.x, hero.z, 0);
    fx('tele', slab.id, hero.x + 1, hero.z + 1, TWINS.slam.radius, 0.5, 0xffb060);
    fx('slam', hero.x + 1, hero.z + 1, TWINS.slam.radius, 0xffb060, 1, 0, 4, slab.id);
    fx('twinMend', reliquary.id, slab.id, 2);
    fx('twinMended', reliquary.id, slab.id);
    fx('bossPhase', reliquary.id, 1);
    if (options.canary) {
      const odd = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1), new THREE.MeshPhongMaterial({ color: 0x123456, flatShading: true }));
      odd.position.copy(slab.pos).setY(2);
      G.scene.add(odd);
      await lab.step(4);
      G.scene.remove(odd);
    }
    await lab.step(60);
    const compiled = PIPELINES.made - before;
    lines.push(`compiles: ${compiled} programs compiled drawing the chain's snap, a volley, a charge, a slam, a mend and a phase`);
    if (compiled > 0) problems.push(`compiles: ${compiled} programs compiled in the Twins' fight`);
  } finally {
    lab.drawing = drawing;
  }
}

// --- pictures ----------------------------------------------------------------------------------------------

/** `pictures`: the pair in each moment, from behind the hero, above and the game's view. */
async function pictures(lab: Lab, options: TwinsOptions, lines: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const moments: Pictured[] = [];
  const { slab, reliquary } = await pairAt(lab, 11, false);
  const middle = (): THREE.Vector3 => slab.pos.clone().add(reliquary.pos).multiplyScalar(0.5).setY(2.8);
  // (each turned as the hero faces: he's turned on them first, so `back` looks at their fronts past him)
  const faceThem = (at: THREE.Vector3): void => {
    G.player.facing = Math.atan2(at.x - G.player.pos.x, at.z - G.player.pos.z);
  };
  const seen = (label: string, note: string): void => {
    faceThem(middle());
    moments.push(lab.picture(label, ['back', 'above'], [note], { at: middle(), distance: 15 }));
  };
  const close = (who: Enemy, label: string, note: string): void => {
    faceThem(who.pos);
    moments.push(lab.picture(label, ['back', 'right'], [note], { at: who.pos.clone().setY(2.8), distance: 10 }));
  };
  const act = async (who: Enemy, name: string, share: number): Promise<void> => {
    who.dazed = 0;
    who.cd = 0;
    const reached = (): boolean => who.action?.name === name && who.action.t / who.action.dur >= share;
    await lab.until(reached, 12 * FPS, `${who.type} never reached its ${name}`, keepWhole);
    who.dazed = 1e4;
  };
  const before = (who: Enemy, metres: number): THREE.Vector3 =>
    who.pos.clone().add(new THREE.Vector3(Math.sin(who.facing) * metres, 0, Math.cos(who.facing) * metres));
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(30, keepWhole);
    seen('1 the Ossuary Twins', 'Slab and Reliquary, bound by their chain of bone, one life between them');
    close(slab, '2 Slab (close)', 'broad, a mantle of skulls, a tombstone for a weapon');
    close(reliquary, '3 Reliquary (close)', 'thin and hooded, a casket of floating skulls');
    G.player.pos.copy(before(slab, 4.5));
    await act(slab, 'slam', 0.3);
    seen('4 grave slam warning', 'the slab lifted over his head a second, its ring before him');
    reliquary.brain.hitAt = G.time;
    await act(reliquary, 'volley', 0.55);
    await lab.step(12, keepWhole);
    seen('5 skull volley', 'three to five skulls curving in on the hero, each on its own arc');
    const way = new THREE.Vector3(reliquary.pos.x - slab.pos.x, 0, reliquary.pos.z - slab.pos.z).normalize();
    reliquary.pos.copy(slab.pos).addScaledVector(way, TWINS.chain.max + 2);
    await lab.step(3, keepWhole);
    seen('6 the chain snaps', 'drifted too far apart: the chain snaps tight, dragging them together, hurting anyone between');
    await lab.step(60, keepWhole);
    slab.takeDamage(slab.maxLife * 0.2, {});
    slab.brain.hitAt = G.time - 10;
    await act(reliquary, 'mend', 0.4);
    seen('7 mend', 'Slab hurt and untouched: Reliquary raises its casket and mends him (a stun breaks it)');
    reliquary.cancelAction();
    slab.takeDamage(slab.life - slab.maxLife * 0.45, {});
    await lab.step(50, keepWhole);
    seen('8 Slab collapses', 'at half the one that took more collapses; Reliquary takes up the slab: faster, his brother\'s slam too');
    G.player.pos.copy(before(reliquary, 4));
    await act(reliquary, 'slam', 0.3);
    close(reliquary, '9 Reliquary\'s slam', 'alone, the thin one brings his brother\'s slam down');
  } finally {
    lab.drawing = drawing;
  }
  lines.push(`pictures: ${moments.length} moments`);
  return moments;
}

// --- their look --------------------------------------------------------------------------------------------

/** the most triangles each twin's model may draw (a phone's budget for one boss) */
const TWIN_TRIANGLES = 45_000;
/** how far off a twin the whole pictures are taken from (m), the height they're framed on, the skull's distance */
const LOOK_FROM = 12;
const LOOK_Y = 2.8;
const SKULL_FROM = 4;
/** how far behind the hero the other twin is sent for each one's pictures (m) */
const OTHER_OFF = 30;
/** how far below the top of a twin its skull's middle is (m) */
const SKULL_DOWN = 0.6;

/** The triangles a geometry draws. */
const trianglesIn = (geometry: THREE.BufferGeometry): number =>
  (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

/** The triangles a model draws, by its meshes' geometries (each drawn once). */
function trianglesOf(root: THREE.Object3D): number {
  const seen = new Set<THREE.BufferGeometry>();
  let count = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    count += trianglesIn(mesh.geometry);
  });
  return Math.round(count);
}

/** The triangles of each of a model's meshes, the most first: its depth in the model's tree and its material's colour,
 *  so a budget can be cut where it goes. */
function trianglesByMesh(root: THREE.Object3D, most: number): string {
  const rows: [string, number][] = [];
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    let depth = 0;
    for (let at: THREE.Object3D | null = mesh.parent; at && at !== root; at = at.parent) depth++;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const colour = material.color ? `#${material.color.getHexString()}` : material.type;
    rows.push([`depth ${depth} ${colour}`, Math.round(trianglesIn(mesh.geometry))]);
  });
  rows.sort((a, b) => b[1] - a[1]);
  return rows.slice(0, most).map(([what, count]) => `${what} ${count}`).join(', ');
}

/** The triangles of each sculpted bone as Slab's measures make it, meshed alone: what a model's budget is spent on. */
function bonesTriangles(): string {
  const span = 1.85;
  const thick = 0.17;
  const hip = 0.464;
  const bones: [string, THREE.BufferGeometry][] = [
    ['heavy skull', twinSkull(0.0092, 'heavy')], ['long skull', twinSkull(0.0092, 'long')], ['jaw', jaw(0.0082)],
    ['small skull', skull(0.019)], ['small jaw', jaw(0.016)],
    ['pelvis', pelvis(hip)], ['scapula', scapula(span * 0.44)], ['sternum', sternum(span * 0.38)],
    ['femur', femur(1.05, thick * 0.55)], ['tibia', tibia(0.82, thick * 0.52)], ['humerus', humerus(1.25, thick * 0.48)],
    ['forearm', forearm(1.15, thick * 0.41)],
  ];
  const listed = bones.map(([name, geometry]) => `${name} ${Math.round(trianglesIn(geometry))}`).join(', ');
  for (const [, geometry] of bones) geometry.dispose();
  return listed;
}

/** Where `who`'s skull is drawn, in the world: just under the top of its body as posed. */
function skullOf(who: Enemy): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(who.model.root);
  return who.pos.clone().setY(box.max.y - SKULL_DOWN);
}

/** a foe's own way of finding its target, while `blind` has it find none */
type Seeing = { pickTarget: () => boolean };
const sight = new WeakMap<Enemy, () => boolean>();

/** `foe` finding no target, so thinking nothing (without a daze's stars over it) until `sighted`. */
function blind(foe: Enemy): void {
  const seeing = foe as unknown as Seeing;
  if (!sight.has(foe)) sight.set(foe, seeing.pickTarget);
  seeing.pickTarget = () => false;
}

/** `foe` finding its target again. */
function sighted(foe: Enemy): void {
  const own = sight.get(foe);
  if (own) (foe as unknown as Seeing).pickTarget = own;
  sight.delete(foe);
}

/** `look`: each twin alone, standing, from its front, its back and both sides, and its skull close up; its triangles
 *  held to `TWIN_TRIANGLES`. Taken without its stars: thinking, finding no target, a frame. */
async function look(lab: Lab, options: TwinsOptions, lines: string[], problems: string[]): Promise<Pictured[]> {
  await standIn(lab, options.fixture, 'crypt');
  const moments: Pictured[] = [];
  const { slab, reliquary } = await pairAt(lab, 12, false);
  // (the chain to his brother hidden: drawn, it glared across every picture of either)
  const lay = slab.model.root.userData.layChain as (to: THREE.Vector3 | null, taut: number) => void;
  slab.model.root.userData.layChain = (_to: THREE.Vector3 | null, taut: number) => lay(null, taut);
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (const [who, name, other] of [[slab, 'Slab', reliquary], [reliquary, 'Reliquary', slab]] as const) {
      // (the other one sent well off behind the hero, so each stands alone in its pictures)
      const away = new THREE.Vector3(G.player.pos.x - who.pos.x, 0, G.player.pos.z - who.pos.z).normalize();
      other.pos.copy(G.player.pos).addScaledVector(away, OTHER_OFF);
      const toHero = Math.atan2(G.player.pos.x - who.pos.x, G.player.pos.z - who.pos.z);
      await lab.step(20, () => {
        for (const twin of [who, other]) {
          twin.dazed = 0;
          blind(twin);
        }
        who.facing = who.targetFacing = toHero;
        return keepWhole();
      });
      G.player.facing = Math.atan2(who.pos.x - G.player.pos.x, who.pos.z - G.player.pos.z);
      // (views by the hero: he faces it, so `back` is its front, `front` its back)
      const whole = { at: who.pos.clone().setY(LOOK_Y), distance: LOOK_FROM };
      moments.push(lab.picture(`${name} front and back`, ['back', 'front'], [`${name} from its front and its back`], whole));
      moments.push(lab.picture(`${name} sides`, ['left', 'right'], [`${name} from both sides`], whole));
      moments.push(lab.picture(`${name} skull`, ['back', 'left', 'right'], [`${name}'s skull, its face and both sides`],
        { at: skullOf(who), distance: SKULL_FROM }));
      for (const twin of [who, other]) {
        sighted(twin);
        twin.dazed = 1e4;
      }
      const count = trianglesOf(who.model.root);
      lines.push(`look: ${name} draws ${count} triangles (at most ${TWIN_TRIANGLES}); the most: ${trianglesByMesh(who.model.root, 10)}`);
      if (count > TWIN_TRIANGLES) problems.push(`look: ${name}'s model draws ${count} triangles, over ${TWIN_TRIANGLES}`);
    }
  } finally {
    lab.drawing = drawing;
    slab.model.root.userData.layChain = lay;
  }
  lines.push(`look: each bone at Slab's size: ${bonesTriangles()}`);
  return moments;
}

// --- the command -------------------------------------------------------------------------------------------

/** the parts that judge, each a function of the same shape */
const JUDGED: Record<Exclude<TwinsPart, 'pictures' | 'look'>, typeof waves> = { waves, fight, compiles };

/** `lab twins`: each part asked for in turn. */
export async function twins(lab: Lab, options: TwinsOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const parts = options.parts ?? TWINS_PARTS;
  const was = G.arena.biome;
  try {
    for (const part of parts) {
      if (part === 'pictures') moments.push(...await pictures(lab, options, lines));
      else if (part === 'look') moments.push(...await look(lab, options, lines, problems));
      else await JUDGED[part](lab, options, lines, problems);
    }
  } finally {
    if (G.arena.biome !== was) G.arena.setBiome(was);
  }
  if (!options.canary) return { text: lines.join('\n'), problems, moments };
  lines.push(`canary: ${problems.length} faults caught`);
  const judged = parts.filter((part) => part !== 'pictures' && part !== 'look');
  const missed = judged.filter((part) => !problems.some((problem) => problem.startsWith(`${part}:`)));
  return { text: lines.join('\n'), problems: missed.map((part) => `canary: the ${part} part's planted fault went uncaught`), moments };
}
