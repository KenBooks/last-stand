// A held skill's preview while letting go would cast nothing (on its cooldown, short of energy): turned red, with the
// seconds of its cooldown counting down in it, and back to the skill's own look as it's ready, so it can be held
// through the cooldown and let go once it is. Veilstep's first, now every aimed skill's (`SkillDef.aimed`).
import * as THREE from 'three';
import { damp } from '../../util';
import { anchorLabel, textArt } from '../../ui/floaters';
import { ORDER, type Label } from '../../ui/overlay/layer';
import { OUTLINE, type TextStyle } from '../../ui/overlay/paint';
import type { Player } from '../../entities/player';
import type { SkillDef } from '../../types';

/** the preview's colour while letting go would cast nothing */
export const NOT_READY = 0xff3a2c;
/** how fast a preview turns from red to its own look and back (1/s: a turn of a moment, once, never a flash) */
const TURN_RATE = 10;
/** the countdown's pop as each new second comes: its size at first, and over how long it settles (s: once a second,
 *  well under a flash) */
const COUNT_POP = 1.3;
const COUNT_SETTLE = 0.18;
const COUNT_STYLE: TextStyle = {
  face: 'display', weight: 700, size: 36, color: '#ff6a58',
  shadows: [...OUTLINE, { x: 0, y: 0, blur: 12, color: 'rgba(60, 0, 0, .9)' }],
};

/** A point of the world (m). */
export interface At {
  x: number;
  y: number;
  z: number;
}

/** Whether letting go now would cast `def`: its cooldown over and the energy for it (the lobby's free casting has both). */
export const readyToGo = (player: Player, def: SkillDef): boolean =>
  player.cooldownLeft(def.impl) <= 0 && (player.sandbox || player.energy >= def.cost);

const red = new THREE.Color(NOT_READY);
/** each skill's preview's readiness, by the skill's `impl` (tools/lab reads them) */
const readinesses = new Map<string, Readiness>();

/** The readiness of the preview of the skill whose `impl` is `impl`, once it has been shown. */
export const readinessOf = (impl: string): Readiness | null => readinesses.get(impl) ?? null;

/** One preview's readiness: how far it has turned red, and the countdown in it. */
export class Readiness {
  /** how far it has turned red: 0 the skill's own look, 1 red */
  red = 0;
  /** the second of the cooldown the countdown shows (0: none) */
  second = 0;
  /** whether the preview showed this frame */
  shown = false;
  private label: Label | null = null;
  private at: At | null = null;
  private since = 0;

  /** The readiness of the preview of the skill whose `impl` is `impl`. */
  constructor(impl: string) {
    readinesses.set(impl, this);
  }

  /**
   * Shown this frame for `player`'s `def`, its countdown at `at`: how far red it is now (red too while `blocked`: where
   * it's aimed it can't be cast, as the Hedgeward's wall with something in its way). Shown afresh it starts in the
   * look it has (pressed on cooldown, it never starts in its own).
   */
  show(player: Player, def: SkillDef, at: At, dt: number, blocked = false): number {
    const goal = readyToGo(player, def) && !blocked ? 0 : 1;
    this.red = this.shown ? damp(this.red, goal, TURN_RATE, dt) : goal;
    this.shown = true;
    const left = player.cooldownLeft(def.impl);
    this.count(left > 0 ? Math.ceil(left) : 0, at, dt);
    return this.red;
  }

  /** Not shown: its countdown gone, and shown again it starts afresh. */
  hide(dt: number): void {
    this.shown = false;
    this.count(0, null, dt);
  }

  /** `own` turned as far towards red as the preview has, at `bright`, into `out`. */
  tint(out: THREE.Color, own: THREE.Color, bright: number): THREE.Color {
    return out.copy(own).lerp(red, this.red).multiplyScalar(bright);
  }

  /** The countdown showing `second` (0: none) at `at`, painted only as it changes, popping as each comes. */
  private count(second: number, at: At | null, dt: number): void {
    if (second && !this.label) {
      this.label = anchorLabel(ORDER.float, () => this.at);
      this.label.ax = this.label.ay = 0.5;
    }
    if (second !== this.second) {
      this.second = second;
      this.since = 0;
      if (second) this.label!.show(textArt(String(second), COUNT_STYLE));
    }
    this.at = second ? at : null;
    this.since += dt;
    if (this.label) this.label.scale = 1 + (COUNT_POP - 1) * Math.max(0, 1 - this.since / COUNT_SETTLE);
  }
}
