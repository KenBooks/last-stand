// Skill behavior registry. Class data files reference these by `impl` name.
//
// Instant skill:  { anim, cast(player, def, target) }
// Channel skill:  { anim, start(player, def, state), tick(player, def, dt, state), stop(player, def, state) }
// `anim` selects the caster pose ('cast' | 'slam' | 'buff' | 'channel' | null).
import splinterBolt from './splinterBolt';
import starfall from './starfall';
import voidLance from './voidLance';
import glacialNova from './glacialNova';
import maelstrom from './maelstrom';
import blink from './blink';
import cinderburst from './cinderburst';
import stormcall from './stormcall';
import lifethread from './lifethread';
import potion from './potion';
import cleave from './cleave';
import crescent from './crescent';
import tempest from './tempest';
import bullRush from './bullRush';
import raiseShield from './raiseShield';
import powerStrike from './powerStrike';
import twinFangs from './twinFangs';
import ironBellow from './ironBellow';
import savageFists from './savageFists';
import pounce from './pounce';
import rampage from './rampage';
import bloodrush from './bloodrush';
import wrath from './wrath';
import unchained from './unchained';
import { bowShot, piercingShot } from './ranger';
import arrowRain from './arrowRain';
import quarryMark from './quarryMark';
import strawman from './strawman';

import type { SkillImpl } from './types';

export const SKILL_IMPLS: Record<string, SkillImpl> = {
  splinterBolt, cinderburst, stormcall, lifethread, starfall, voidLance, glacialNova, maelstrom, blink, potion,
  cleave, crescent, raiseShield, tempest, bullRush, powerStrike, ironBellow, twinFangs,
  savageFists, pounce, rampage, bloodrush, wrath, unchained,
  nockShot: bowShot, fanShot: bowShot, piercingShot, arrowRain, quarryMark, strawman,
};
