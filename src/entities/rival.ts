// A rival: an opposing hero in a duel (game/duel.ts; #406), standing among the foes on the local hero's own game so
// that every skill meets him as it meets a foe (they all look through `G.enemies` and strike through `hitEnemy`). He is
// where the hero's reports have him, drawn by nothing (the hero's own body is what's seen), and takes no damage here:
// what a skill deals him is told to his own game (`RivalHooks.dealt`), which works the hit out as its screen has it.
import * as THREE from 'three';
import { Enemy, type DamageInfo } from './enemy';
import { HERO_RADIUS, type Player } from './player';
import { createKit } from '../core/materials';
import { CROWD_LAYER } from '../core/layers';
import { PVP } from '../data/balance';
import { G } from '../state';
import type { DamageType, EnemyDef, Model, XZ } from '../types';

/** What a skill did to a rival, for his own game: its damage (a hero's share of it already, `PVP.damage`) and what
 *  came with it. */
export interface RivalHit {
  amount: number; type: DamageType; crit: boolean;
  knock?: number; from?: XZ; chill?: number; freeze?: number; daze?: number;
  /** a charge met him: the way it shoves him (its length 1) */
  shove?: XZ;
}

/** What the duel gives its rivals. */
export interface RivalHooks {
  /** whether he still stands in for his hero (the duel on, the hero in the room) */
  stands(rival: Rival): boolean;
  /** whether hits land now (a round being fought) */
  open(): boolean;
  /** whether `by` is on his side (its shots pass him by) */
  friend(rival: Rival, by: Player): boolean;
  dealt(to: Player, hit: RivalHit): void;
}

/** What a rival is as a foe: a hero's size, and nothing of a foe's own (made as it's first needed: this module is
 *  loaded while the hero's own is) */
const rivalDef = (): EnemyDef => ({
  name: 'Rival', model: '', ai: 'idle', life: 1, damage: 0, damageType: 'physical', speed: 5, radius: HERO_RADIUS,
  range: 0, windup: 0, recover: 0, cooldown: 0, cost: 0, score: 0,
});

/** how wide the body a shot or the aim meets is (m): a hero's trunk, narrower than the circle he's kept off others by */
const TRUNK = 0.3;
/** a charge shoves him once in this long (s): it meets him every frame it runs through him */
const SHOVE_GAP = 1;

/** the body's one material: never drawn (its mesh is on the layer no camera draws, as a crowd's bodies are) */
const hullMaterial = new THREE.MeshBasicMaterial();
const hulls = new Map<number, THREE.BufferGeometry>();

/** The body a shot, an arrow or the aim meets: a column of the hero's height, kept by its height for every rival. */
function hullOf(height: number): THREE.BufferGeometry {
  const key = Math.round(height * 100);
  let g = hulls.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(TRUNK, TRUNK, height, 10).translate(0, height / 2, 0);
    g.userData.shared = true;
    hulls.set(key, g);
  }
  return g;
}

function standIn(player: Player): { def: EnemyDef; model: Model; reach: { top: number; out: number; crown: number } } {
  const height = player.model.height;
  const root = new THREE.Group();
  const hull = new THREE.Mesh(hullOf(height), hullMaterial);
  hull.layers.set(CROWD_LAYER);
  root.add(hull);
  const model: Model = { root, kit: createKit(), animate: () => undefined, height, dispose: () => undefined };
  return { def: rivalDef(), model, reach: { top: height, out: TRUNK, crown: height } };
}

export class Rival extends Enemy {
  private shovedAt = -Infinity;

  constructor(readonly player: Player, name: string, private readonly hooks: RivalHooks) {
    super('dummy', { pos: player.pos, name, maxLife: player.stats.maxLife, training: false, standIn: standIn(player) });
    this.spawning = 0;
    this.follow();
  }

  private follow(): void {
    const p = this.player;
    this.pos.set(p.pos.x, 0, p.pos.z);
    this.obj.position.copy(p.obj.position);
    this.facing = this.targetFacing = p.facing;
    this.vel.set(p.remote.vx, 0, p.remote.vz);
    this.knock.set(0, 0, 0);
    this.alive = p.active;
    this.invulnerable = !this.hooks.open();
    this.life = Math.max(0, Math.min(this.maxLife, p.life));
  }

  /** Where his hero is shown, standing while he does; false once he no longer stands in for him. */
  override update(_dt: number): boolean {
    if (!this.hooks.stands(this)) return false;
    this.follow();
    this.paintBar();
    return true;
  }

  private get struck(): boolean { return this.alive && !this.invulnerable; }

  /** A hero's share of the hit, told to his own game: his life here is his reports'. */
  override takeDamage(amount: number, info: DamageInfo = {}): number {
    if (!this.struck) return 0;
    const dealt = amount * PVP.damage;
    this.hooks.dealt(this.player, {
      amount: dealt, type: info.type ?? 'physical', crit: !!info.crit, knock: info.knock, from: info.from, chill: info.chill, freeze: info.freeze,
    });
    return dealt;
  }

  override daze(seconds: number): void {
    if (this.struck) this.hooks.dealt(this.player, { amount: 0, type: 'physical', crit: false, daze: seconds });
  }

  /** A charge shoves a hero aside and dazes him, it doesn't carry him: he is his own game's to move. */
  override carry(_by: Player, way: XZ, seconds: number): void {
    if (!this.struck || G.time - this.shovedAt < SHOVE_GAP) return;
    this.shovedAt = G.time;
    this.hooks.dealt(this.player, { amount: 0, type: 'physical', crit: false, shove: { x: way.x, z: way.z }, daze: seconds });
  }

  override evade(): void {}
  override toss(): void {}

  override struckBy(by?: Player): boolean { return !by || !this.hooks.friend(this, by); }
}
