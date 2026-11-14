// `lab denied`: the sound a press that casts nothing makes (#572: `Player.denied`, `sfx.denied` in src/core/audio.ts).
// A skill on a key is pressed as the player presses it, on a set-up each: while it cools (a knock, once), held down
// while it cools (once, not again as the key is tried frame after frame), mashed while it cools (no more often than
// the player's throttle lets it), short of energy (a fizzle), ready (none, and it casts), and in free casting (none).
// A channel pressed short of energy fizzles too, and an aimed skill let go while it cools knocks. A partner's copy
// never presses (it runs no input, `updateRemote`), so its refusal is asked of the player itself: a copy that isn't
// this game's own hero plays nothing. What's read is what the game asks the sound module to play. `canary` breaks the
// throttle, which the mashing must catch.
import type { Fixture, Frame, Lab, Report } from './lab';
import type { SkillKey } from '../../../src/types';
import type { KnownSkill, Player } from '../../../src/entities/player';
import { sfx, type Denial } from '../../../src/core/audio';
import { SKILL_KEYS } from '../../../src/loot/loadout';
import { pressing } from './cast';

/** What `lab denied` is given: the set-up, and whether the canary runs. */
export interface DeniedOptions { fixture: Fixture; canary: boolean }

/** the least time between two denied sounds the player allows (s, `DENIED_EVERY` in src/entities/player.ts) */
const DENIED_EVERY = 0.3;
/** a cooldown set on the skill pressed (s): longer than any case runs */
const COOLING = 30;
/** the frames a case runs after its press, for a late sound to be heard and a drawn shot to be loosed */
const AFTER_FRAMES = 90;
/** how long a key is held down while its skill cools, and how long one is mashed (frames) */
const HOLD_FRAMES = 120;
const MASH_FRAMES = 180;
/** a mashed key's beat: down a frame of every this many */
const MASH_BEAT = 4;
/** how long an aimed skill's key is held before it's let go (frames) */
const AIM_FRAMES = 30;
/** how long a channel's key is held short of energy (frames: its regeneration fills enough to start it in a few
 *  tenths of a second) */
const CHANNEL_FRAMES = 10;

/** A skill on a key, pressed in the cases. */
interface Pressed { key: SkillKey; skill: KnownSkill }

/** What a case heard: the denied sounds asked for, the casts made, and why the hero last refused a press. */
interface Heard { sounds: Denial[]; casts: number; refused: Denial | null }

/** The first skill on a key `fits` takes, or null. */
function skillWhere(hero: Player, fits: (skill: KnownSkill) => boolean): Pressed | null {
  for (const key of SKILL_KEYS) {
    const skill = hero.skillAt(key);
    if (skill && fits(skill)) return { key, skill };
  }
  return null;
}

/** A skill pressed and cast at once (no channel, not aimed), with a cooldown and a cost, needing no target. */
function plainSkill(hero: Player): Pressed {
  const found = skillWhere(hero, (skill) => !skill.impl.channel && !skill.def.aimed && !skill.impl.canCast
    && skill.def.cooldown >= 1 && skill.def.cost > 0);
  if (!found) throw new Error(`lab: denied: the ${hero.cls.id} has no skill pressed to cast with a cooldown and a cost`);
  return found;
}

/** Every denied sound and every cast of `impl` from here, until `stop`. */
function listen(hero: Player, impl: string): { heard(): Heard; stop(): void } {
  const play = sfx.denied;
  const fire = hero.fire;
  const sounds: Denial[] = [];
  let casts = 0;
  sfx.denied = (why: Denial) => {
    sounds.push(why);
    return play(why);
  };
  hero.fire = function (this: Player, skill, target, power) {
    if (skill.def.impl === impl) casts++;
    return fire.call(this, skill, target, power);
  };
  return {
    heard: () => ({ sounds: [...sounds], casts, refused: hero.refused }),
    stop: () => {
      sfx.denied = play;
      delete (hero as { fire?: unknown }).fire;
    },
  };
}

/** The input of a case's frame: `key` held or not over the hero's aim, the throttle broken first by the canary. */
function frameOf(lab: Lab, key: SkillKey, held: boolean, canary: boolean): Frame {
  if (canary) lab.player.deniedAt = -99;
  return pressing(key, lab.player.aim.clone(), held);
}

/** The hero as a run has him before a case: full energy, nothing cooling, no sound played lately, and casting
 *  counted (a set-up leaves free casting as the case before it set it: the cases after the free one were all free). */
function runsState(hero: Player): void {
  hero.energy = hero.stats.maxEnergy;
  hero.cooldowns.clear();
  hero.deniedAt = -99;
  hero.sandbox = false;
}

/** A case on a set-up of its own: `prepare` puts the hero in its state, `held(frame)` says whether `key` is down in
 *  each of `frames` frames (then `AFTER_FRAMES` up), and what it heard is returned. */
async function play(
  lab: Lab, fixture: Fixture, pressed: Pressed, prepare: (hero: Player) => void,
  frames: number, held: (frame: number) => boolean, canary = false,
): Promise<Heard> {
  await lab.setup(fixture);
  const hero = lab.player;
  runsState(hero);
  prepare(hero);
  const ears = listen(hero, pressed.skill.def.impl);
  try {
    await lab.step(frames, (frame) => frameOf(lab, pressed.key, held(frame), canary));
    await lab.step(AFTER_FRAMES, () => frameOf(lab, pressed.key, false, canary));
    return ears.heard();
  } finally {
    ears.stop();
  }
}

/** The line of a case and its problems: `wanted` the sounds it must hear (each its kind), `casts` how many casts. */
function judge(name: string, heard: Heard, wanted: Denial[], casts: number): { line: string; problems: string[] } {
  const said = heard.sounds.length ? heard.sounds.join(', ') : 'nothing';
  const line = `${name}: heard ${said}, cast ${heard.casts}`;
  const problems: string[] = [];
  if (heard.sounds.join() !== wanted.join()) {
    problems.push(`${name}: heard ${said}, wanted ${wanted.length ? wanted.join(', ') : 'nothing'}`);
  }
  if (heard.casts !== casts) problems.push(`${name}: cast ${heard.casts} times, wanted ${casts}`);
  return { line, problems };
}

/** The press in free casting: refused for its cooldown (the cooldown set by hand: free casting sets none), and
 *  heard not at all. */
function judgeFree(heard: Heard): { line: string; problems: string[] } {
  const judged = judge('a press in free casting', heard, [], 0);
  if (heard.refused !== 'cooldown') {
    judged.problems.push(`a press in free casting: never refused (${heard.refused}): nothing was asked`);
  }
  return judged;
}

/** How many knocks a key mashed for `frames` may make at the most, and the fewest that say it wasn't muted. */
function mashBounds(frames: number): { most: number; least: number } {
  const seconds = frames * window.__labClock.frame / 1000;
  const most = Math.floor(seconds / DENIED_EVERY) + 1;
  return { most, least: Math.ceil(most / 2) };
}

/** The mashing judged against the throttle. */
function judgeMash(name: string, heard: Heard): { line: string; problems: string[] } {
  const { most, least } = mashBounds(MASH_FRAMES);
  const presses = Math.ceil(MASH_FRAMES / MASH_BEAT);
  const knocks = heard.sounds.filter((why) => why === 'cooldown').length;
  const line = `${name}: ${presses} presses, ${knocks} knocks (wanted ${least} to ${most}), cast ${heard.casts}`;
  const problems: string[] = [];
  if (knocks > most) problems.push(`${name}: ${knocks} knocks, more than the throttle's ${most}`);
  if (knocks < least) problems.push(`${name}: ${knocks} knocks, fewer than ${least}: the presses went unheard`);
  if (knocks !== heard.sounds.length) problems.push(`${name}: heard ${heard.sounds.join(', ')}, knocks alone wanted`);
  if (heard.casts) problems.push(`${name}: cast ${heard.casts} times while it cooled`);
  return { line, problems };
}

/** A partner's copy: the player's own refusal asked of a hero that isn't this game's, the throttle open. Its line and
 *  problems, and the same asked of this game's own hero beside it (which must sound, or nothing was asked). */
async function partner(lab: Lab, fixture: Fixture, pressed: Pressed): Promise<{ line: string; problems: string[] }> {
  await lab.setup(fixture);
  const hero = lab.player;
  runsState(hero);
  hero.cooldowns.set(pressed.skill.def.impl, COOLING);
  const ears = listen(hero, pressed.skill.def.impl);
  const own = hero as { local: boolean };
  const problems: string[] = [];
  try {
    own.local = false;
    hero.deniedAt = -99;
    const refused = hero.tryCast(pressed.skill, pressed.key) ? null : hero.refused;
    if (refused !== 'cooldown') problems.push(`partner: its press wasn't refused for its cooldown (${refused})`);
    hero.denied('cooldown');
    const copy = ears.heard().sounds.length;
    own.local = true;
    hero.deniedAt = -99;
    hero.denied('cooldown');
    const mine = ears.heard().sounds.length - copy;
    if (copy) problems.push(`partner: a partner's copy played ${copy} denied sounds`);
    if (!mine) problems.push('partner: this game\'s own hero played none beside it: nothing was asked');
    return { line: `partner: a partner's copy heard ${copy}, this game's own hero ${mine}`, problems };
  } finally {
    own.local = true;
    ears.stop();
  }
}

/** `lab denied`: every case, judged. */
export async function denied(lab: Lab, options: DeniedOptions): Promise<Report> {
  const { fixture } = options;
  await lab.setup(fixture);
  const hero = lab.player;
  const plain = plainSkill(hero);
  const impl = plain.skill.def.impl;
  const cool = (each: Player): void => { each.cooldowns.set(impl, COOLING); };
  const once = (frame: number): boolean => frame === 0;
  const judged = [
    judge('a press while it cools', await play(lab, fixture, plain, cool, 1, once), ['cooldown'], 0),
    judge('held down while it cools', await play(lab, fixture, plain, cool, HOLD_FRAMES, () => true), ['cooldown'], 0),
    judgeMash('mashed while it cools',
      await play(lab, fixture, plain, cool, MASH_FRAMES, (frame) => frame % MASH_BEAT === 0)),
    judge('a press short of energy',
      await play(lab, fixture, plain, (each) => { each.energy = 0; }, 1, once), ['energy'], 0),
    judge('a press ready', await play(lab, fixture, plain, () => {}, 1, once), [], 1),
    judgeFree(await play(lab, fixture, plain, (each) => { cool(each); each.sandbox = true; }, 1, once)),
  ];
  const channel = skillWhere(hero, (skill) => Boolean(skill.impl.channel) && skill.def.cost > 0);
  if (channel) {
    const heard = await play(lab, fixture, channel, (each) => { each.energy = 0; }, CHANNEL_FRAMES, () => true);
    judged.push(judge(`${channel.skill.def.impl} held short of energy`, heard, ['energy'], 0));
  }
  const aimed = skillWhere(hero, (skill) => Boolean(skill.def.aimed) && !skill.impl.channel && skill.def.cooldown >= 1);
  if (aimed) {
    const coolAimed = (each: Player): void => { each.cooldowns.set(aimed.skill.def.impl, COOLING); };
    const heard = await play(lab, fixture, aimed, coolAimed, AIM_FRAMES, () => true);
    judged.push(judge(`${aimed.skill.def.impl} aimed and let go while it cools`, heard, ['cooldown'], 0));
  }
  judged.push(await partner(lab, fixture, plain));
  const lines = [`the ${hero.cls.id}, ${impl} on ${plain.key}`, ...judged.map((each) => `  ${each.line}`)];
  const problems = judged.flatMap((each) => each.problems);
  if (options.canary) {
    const heard = await play(lab, fixture, plain, cool, MASH_FRAMES, (frame) => frame % MASH_BEAT === 0, true);
    const caught = judgeMash('canary', heard).problems.some((problem) => problem.includes('more than the throttle'));
    lines.push(`canary (the throttle broken, mashed while it cools): ${caught ? 'caught' : 'missed'}`);
    if (!caught) problems.push('canary: a mashed key with no throttle went unseen');
  }
  return { text: lines.join('\n'), problems };
}
