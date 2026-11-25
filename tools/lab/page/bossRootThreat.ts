// The Rootmother against a hero who moves (tools/lab `boss --parts rootThreat,rootSurvive`): from Kenneth, "root
// mother needs to be harder, its too easy to beat. It should throw more sticks at the ground, like combos, and they
// should even try to predict your path". `threat` reads every boss on a hero standing still; a player runs, so this
// reads her on a hero 11 m past her body who stands, runs straight (back and forth along a line across hers to him),
// strafes (round her at his distance) or zigzags (round her, turning across his way every `ZIG` s), each steered by
// the touch stick as a player steers him, at her whole life and in her later phases. What lands on him is counted (his
// own `takeDamage`), his Health kept whole meanwhile, and said as a share of his most Health a minute.
//
// `rootSurvive`: the hero with the lab's starting gear and his Health his own, strafing and zigzagging from her rise,
// and how long he lasts (up to `SURVIVE` s).
//
// `--canary` takes her damage away: every row must read nothing landing, and the part says so.
import * as THREE from 'three';
import type { Frame, Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { cameraYaw } from '../../../src/core/renderer';
import { ENEMIES } from '../../../src/data/enemies';
import { forgetBeats } from '../../../src/entities/bossKit';
import { bossAt, fixed, standIn, type BossOptions } from './boss';

/** the wave she is measured at (her rung), frames a second, and the frames each case runs */
const WAVE = 10;
const FPS = 60;
const CASE_FRAMES = 20 * FPS;
/** how far off her body the hero keeps (m) */
const AWAY = 11;
/** her life's shares in her later phases (her second, and her rage) */
const LATER = [0.45, 0.2];
/** a straight run's half length along its line (m), and a zigzag's turn: its angle off his way round her (rad) and
 *  how long each leg runs (s) */
const RUN_HALF = 13;
const ZIG_ANGLE = 0.9;
const ZIG = 0.8;
/** how hard the stick pulls him back to his distance from her (a share a metre off it) */
const KEEP = 0.25;
/** the longest a survival case runs (s) */
const SURVIVE = 75;

/** How the hero moves through a case. */
export type Move = 'stand' | 'straight' | 'strafe' | 'zigzag';
const MOVES: Move[] = ['stand', 'straight', 'strafe', 'zigzag'];

/** One case's damage: his Health's share a minute that landed, and how many hits. */
interface Landed { share: number; hits: number; did: string }

/** The touch stick pushed to walk the hero along world way (x, z), as the screen turns it. */
function stickToward(x: number, z: number): [number, number] {
  const yaw = cameraYaw(), cy = Math.cos(yaw), sy = Math.sin(yaw), length = Math.hypot(x, z) || 1;
  return [(x * cy - z * sy) / length, (x * sy + z * cy) / length];
}

/** A hero's steering through a case: each frame the way the stick is pushed (none for standing). */
export class Steer {
  private readonly start: THREE.Vector3;
  private readonly line: THREE.Vector3;
  private forth = 1;
  private leg = 1;
  private legFrom = 0;

  constructor(private readonly move: Move, private readonly boss: Enemy, private readonly away: number) {
    const hero = G.player.pos;
    this.start = hero.clone();
    // (his straight run's line: across hers to him)
    this.line = new THREE.Vector3(hero.z - boss.pos.z, 0, boss.pos.x - hero.x).normalize();
    this.legFrom = G.time;
  }

  /** The frame's input for this move. */
  frame(): Frame {
    if (this.move === 'stand') return { stick: [0, 0] };
    const hero = G.player.pos;
    if (this.move === 'straight') {
      const along = (hero.x - this.start.x) * this.line.x + (hero.z - this.start.z) * this.line.z;
      if (along > RUN_HALF) this.forth = -1;
      if (along < -RUN_HALF) this.forth = 1;
      return { stick: stickToward(this.line.x * this.forth, this.line.z * this.forth) };
    }
    const out = new THREE.Vector3(hero.x - this.boss.pos.x, 0, hero.z - this.boss.pos.z);
    const off = out.length();
    out.normalize();
    // (round her, kept at his distance from her body)
    const round = new THREE.Vector3(out.z, 0, -out.x);
    const keep = Math.max(-1, Math.min(1, (this.away + this.boss.radius - off) * KEEP));
    let way = round.clone().addScaledVector(out, keep);
    if (this.move === 'zigzag') {
      if (G.time - this.legFrom >= ZIG) {
        this.leg = -this.leg;
        this.legFrom = G.time;
      }
      way = round.clone().multiplyScalar(Math.cos(ZIG_ANGLE))
        .addScaledVector(out, Math.sin(ZIG_ANGLE) * this.leg + keep);
    }
    return { stick: stickToward(way.x, way.z) };
  }
}

/** The stick let go (the lab leaves it where a frame left it, and the next set-up walked him off his spot). */
async function letGo(lab: Lab): Promise<void> {
  await lab.step(1, () => ({ stick: [0, 0] }));
}

/** She risen `AWAY` m past her body from the hero at wave 10, her life at `life` of its most, thinking. */
async function herAt(lab: Lab, options: BossOptions, life: number): Promise<Enemy> {
  await standIn(lab, options.fixture, 'forest');
  const boss = await bossAt(lab, 'rootmother', ENEMIES.rootmother.radius + AWAY, true, WAVE);
  // (the set-up turns the clock back: the case before's claimed beats refused her attacks through this one)
  forgetBeats();
  // (the canary: her damage taken away, read-only to the game, set here alone)
  if (options.canary) (boss as { damage: number }).damage = 0;
  // (taken by a hit, as the fight takes it: set alone, its later phase never began)
  if (life < 1) boss.takeDamage(boss.life - life * boss.maxLife, {});
  return boss;
}

/** What lands on the hero moving as `move` for a case, his Health kept whole. */
async function oneCase(lab: Lab, options: BossOptions, move: Move, life: number): Promise<Landed> {
  const boss = await herAt(lab, options, life);
  const hero = G.player;
  const steer = new Steer(move, boss, AWAY);
  const own = hero.takeDamage.bind(hero);
  let taken = 0, hits = 0;
  hero.takeDamage = (amount, type, from) => {
    const r = own(amount, type, from);
    if (r && r.taken > 0) {
      taken += r.taken;
      hits++;
    }
    hero.life = hero.stats.maxLife;
    return r;
  };
  // (what she did: each action she began, by name)
  const did: string[] = [];
  let was: unknown = null;
  try {
    await lab.step(CASE_FRAMES, () => steer.frame(), () => {
      if (boss.action && boss.action !== was) did.push(boss.action.name);
      was = boss.action;
    });
  } finally {
    hero.takeDamage = own;
    await letGo(lab);
  }
  return { share: taken / hero.stats.maxLife / (CASE_FRAMES / FPS / 60), hits, did: did.join(' ') };
}

/** `rootThreat`: what lands on a hero standing, running straight, strafing and zigzagging, whole and later. */
export async function rootThreat(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const cls = G.player.cls.id;
  lines.push(`rootThreat: the ${cls} ${AWAY} m off her body, the Rootmother at wave ${WAVE}, ${CASE_FRAMES / FPS} s a `
    + 'case: the damage landing on him, a share of his most Health a minute (hits)');
  for (const move of MOVES) {
    const row: string[] = [];
    const did: string[] = [];
    let landed = 0;
    for (const life of [1, ...LATER]) {
      const got = await oneCase(lab, options, move, life);
      landed += got.share;
      const at = life === 1 ? 'whole' : `at ${life * 100}%`;
      row.push(`${at} ${fixed(got.share * 100, 0)}% (${got.hits})`);
      did.push(`${at}: ${got.did || 'nothing'}`);
    }
    lines.push(`rootThreat: ${move}: ${row.join(', ')}`);
    lines.push(`rootThreat: ${move}: what she did, ${did.join('; ')}`);
    if (options.canary && landed > 0) problems.push(`rootThreat: ${move}: ${fixed(landed * 100, 0)}% landed with her damage taken away`);
  }
  if (options.canary) problems.push('rootThreat: canary: her damage taken away');
}

/** How long the hero lasts moving as `move` from her rise, his Health his own (s; `SURVIVE` if he outlasts it). */
async function lasts(lab: Lab, options: BossOptions, move: Move): Promise<number> {
  const boss = await herAt(lab, options, 1);
  const steer = new Steer(move, boss, AWAY);
  const from = G.time;
  const fell = (): boolean => G.player.life <= 0 || G.player.downed;
  for (let f = 0; f < SURVIVE * FPS && !fell(); f++) await lab.step(1, () => steer.frame());
  const t = fell() ? G.time - from : SURVIVE;
  await letGo(lab);
  return t;
}

/** `rootSurvive`: how long the hero with the starting gear lasts strafing and zigzagging round her. */
export async function rootSurvive(lab: Lab, options: BossOptions, lines: string[], problems: string[]): Promise<void> {
  const cls = G.player.cls.id;
  const row: string[] = [];
  for (const move of ['strafe', 'zigzag'] as Move[]) {
    const t = await lasts(lab, options, move);
    row.push(`${move} ${t >= SURVIVE ? `past ${SURVIVE}` : fixed(t, 1)} s`);
  }
  lines.push(`rootSurvive: the ${cls} with the starting gear, ${AWAY} m off the Rootmother at wave ${WAVE}, `
    + `attacking nothing: ${row.join(', ')}`);
  if (options.canary) problems.push('rootSurvive: canary: nothing planted');
}
