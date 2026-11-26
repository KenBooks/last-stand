// `staffs`' healing beam (Lifethread, src/combat/skills/lifethread.ts): whom it lands on, its heal a second on the
// hero, its ramp held on one target (up to its most, kept through a moment off him, begun again past that) and its
// chain (a full healer holding his own beam on another passes the heal on, more for each healer it passes).
// - Whom it lands on: asked with stand-in allies in the room for a call (`threadTarget`).
// - Held on himself as a player holds it, his Health kept at 30%: every frame heals, its first frames at the flat heal
//   and his share of his most Health, and it grows to its most and no further.
// - Its ramp and its chain, the skill's frame stepped by itself with stand-ins in the room (no frame of the game runs
//   with them there): the heal on the hero read each step, as the healed one's game heals.
// `--canary` takes the ramp's most and grace away and the chain's bonus, which the ramp's and the chain's checks must
// all catch.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Player } from '../../../src/entities/player';
import type { SkillDef } from '../../../src/types';
import { G } from '../../../src/state';
import lifethread, { threadTarget, threadHeal } from '../../../src/combat/skills/lifethread';
import { pressing } from './cast';
import { ahead, emptyFound, skillOf, type Found } from './staffsKit';

/** how far ahead of the hero the beam's aim is (m) */
const AIM_AHEAD = 7;
/** the seconds the beam is held on himself: past its ramp's most */
const HELD_SECONDS = 7;
/** how far a ramp read may be off what it should be */
const RAMP_SLACK = 0.04;
/** what the owner asked of it, held here rather than read off its data, which the canary changes: its ramp's pace and
 *  most ("make it plus 25% a sec until 2x"), and each healer down a chain adding a tenth ("10% healing bonus per
 *  chain link") */
const ASKED = { perSecond: 0.25, most: 2, perLink: 0.1 };
/** the beam's state as the skill keeps it, whatever it holds */
type ThreadState = ReturnType<typeof lifethread.start>;

/** Someone in the room for the beam: where he stands, his Health and most Health, and the beam he holds, if any. */
interface StandIn {
  at: THREE.Vector3;
  life?: number;
  maxLife?: number;
  /** whom his own Lifethread is held on */
  beamOn?: Player;
}

/** most Health of a stand-in unless it says */
const STAND_IN_LIFE = 3000;

/** A stand-in for a partner (another game's hero: never healed here). */
function standIn(ask: StandIn): Player {
  const maxLife = ask.maxLife ?? STAND_IN_LIFE;
  const channel = ask.beamOn ? { skill: { impl: lifethread }, state: { on: ask.beamOn } } : null;
  return {
    pos: ask.at,
    aim: ask.at.clone(),
    castPoint: ask.at.clone().setY(1.5),
    alive: true,
    away: false,
    local: false,
    quiet: true,
    life: ask.life ?? maxLife,
    stats: { maxLife, damagePct: 0 },
    channel,
  } as unknown as Player;
}

/** Runs `work` with `others` in the room, taken out again at once. */
function withIn<T>(others: Player[], work: () => T): T {
  G.players.push(...others);
  try {
    return work();
  } finally {
    G.players.length -= others.length;
  }
}

/** Whom the beam lands on with `allies` in the room. */
function landsOn(lab: Lab, def: SkillDef, allies: Player[]): Player {
  return withIn(allies, () => threadTarget(lab.player, { range: def.range ?? 0, arc: def.arc ?? 0 }));
}

/** Whom the beam lands on in each case of allies before him. */
function choices(lab: Lab, def: SkillDef, found: Found): void {
  const hero = lab.player;
  const range = def.range ?? 0;
  const before = standIn({ at: ahead(lab, 5, 0.5) });
  const nearer = standIn({ at: ahead(lab, AIM_AHEAD - 0.5, -0.3) });
  const off = standIn({ at: ahead(lab, 5 * Math.cos(0.7), 5 * Math.sin(0.7)) });
  const fallen = standIn({ at: ahead(lab, 5) });
  (fallen as { alive: boolean }).alive = false;
  const cases: [string, Player[], Player][] = [
    ['an ally in the cone', [before], before],
    ['two allies, one nearer the aim', [before, nearer], nearer],
    ['an ally 40° off the aim', [off], hero],
    ['an ally past his reach', [standIn({ at: ahead(lab, range + 2) })], hero],
    ['a fallen ally in the cone', [fallen], hero],
    ['no ally', [], hero],
  ];
  for (const [name, allies, expected] of cases) {
    const got = landsOn(lab, def, allies);
    const who = (player: Player): string => (player === hero ? 'himself' : `the ally ${allies.indexOf(player) + 1}`);
    found.lines.push(`  beam, ${name}: lands on ${who(got)}`);
    if (got !== expected) found.problems.push(`the beam with ${name} landed on ${who(got)}, not ${who(expected)}`);
  }
}

/** The heal a second the hero's beam gives him before its ramp, as the skill reckons it. */
const healOnHim = (lab: Lab, def: SkillDef): number =>
  threadHeal(def, lab.player.stats.damagePct, lab.player.stats.maxLife);

/** Held on himself as a player holds it: every frame heals, from the flat heal and his share, up to its most. */
async function heldOnHimself(lab: Lab, def: SkillDef, found: Found): Promise<void> {
  const hero = lab.player;
  const aim = ahead(lab, AIM_AHEAD);
  lab.lifeShare = 0.3;
  const low = hero.stats.maxLife * lab.lifeShare;
  const frameSeconds = window.__labClock.frame / 1000;
  const gains: number[] = [];
  let beamSeen = false;
  const frames = Math.round(HELD_SECONDS / frameSeconds);
  await lab.step(frames, () => pressing('mouse0', aim, true), () => {
    gains.push(hero.life - low);
    beamSeen ||= Boolean(G.scene.getObjectByName('Lifethread: beam'));
  });
  await lab.step(10, () => ({ aim }));
  lab.lifeShare = 1;
  // (each frame's heal as a share of the beam's unramped one: what its ramp raised it by)
  const base = healOnHim(lab, def);
  const raised = gains.map((gain) => (gain / frameSeconds - hero.stats.lifeRegen) / base);
  const first = raised.findIndex((share) => share > 0.5);
  const flowing = first < 0 ? [] : raised.slice(first);
  const dry = flowing.filter((share) => share <= 0).length;
  const at = (seconds: number): number => flowing[Math.min(flowing.length - 1, Math.round(seconds / frameSeconds))];
  const most = Math.max(...flowing);
  const mid = 3;
  const midShould = Math.min(ASKED.most, 1 + ASKED.perSecond * mid);
  found.lines.push(`  beam on himself: ${base.toFixed(1)} Health a second unramped `
    + `(${def.heal} at +${Math.round(hero.stats.damagePct)}% all damage and `
    + `${((def.healPct ?? 0) * 100).toFixed(1)}% of his ${Math.round(hero.stats.maxLife)})`);
  found.lines.push(`  held on himself: ×${at(0).toFixed(2)} its first frame, ×${at(mid).toFixed(2)} at ${mid} s, `
    + `×${at(HELD_SECONDS - 1.5).toFixed(2)} at ${HELD_SECONDS - 1.5} s, ×${most.toFixed(2)} at most; `
    + `${dry} of ${flowing.length} frames healing nothing`);
  if (!beamSeen) found.problems.push('the beam was never drawn while its key was held');
  if (G.scene.getObjectByName('Lifethread: beam')) found.problems.push('the beam was still drawn after its key was let go');
  if (!flowing.length) {
    found.problems.push('the beam never healed him');
    return;
  }
  if (Math.abs(at(0) - 1) > RAMP_SLACK) found.problems.push(`the beam's first frame healed ×${at(0).toFixed(2)}, not ×1`);
  if (Math.abs(at(mid) - midShould) > RAMP_SLACK) {
    found.problems.push(`the beam held ${mid} s healed ×${at(mid).toFixed(2)}, not ×${midShould.toFixed(2)}`);
  }
  if (most > ASKED.most + RAMP_SLACK) {
    found.problems.push(`the beam's ramp rose to ×${most.toFixed(2)}, past its ×${ASKED.most}`);
  }
  const late = at(HELD_SECONDS - 1.5);
  if (Math.abs(late - ASKED.most) > RAMP_SLACK) {
    found.problems.push(`the beam held ${HELD_SECONDS - 1.5} s healed ×${late.toFixed(2)}, not ×${ASKED.most}`);
  }
  if (dry > 0) found.problems.push(`the beam healed nothing in ${dry} frames: it must heal every frame`);
}

/** The beam's frame stepped by itself (`steps` frames of the lab's), the hero's Health set to 30% before each: what
 *  each step healed him, as a share of the beam's unramped heal on him. */
function stepped(lab: Lab, caster: Player, def: SkillDef, st: ThreadState, steps: number): number[] {
  const hero = lab.player;
  const frameSeconds = window.__labClock.frame / 1000;
  const base = healOnHim(lab, def) * frameSeconds;
  const shares: number[] = [];
  for (let step = 0; step < steps; step++) {
    const low = hero.stats.maxLife * 0.3;
    hero.life = low;
    lifethread.tick(caster, def, frameSeconds, st);
    shares.push((hero.life - low) / base);
  }
  hero.life = hero.stats.maxLife;
  return shares;
}

/** Runs `work` with a beam of `caster`'s begun, and ends it after. */
function withBeam<T>(caster: Player, def: SkillDef, work: (st: ThreadState) => T): T {
  const st = lifethread.start(caster, def);
  try {
    return work(st);
  } finally {
    lifethread.stop(caster, def, st);
  }
}

/** The seconds a stretch of frames takes */
const framesOf = (seconds: number): number => Math.round(seconds / (window.__labClock.frame / 1000));

/** Its ramp: begun again on a switch past its grace, kept through a moment off him, begun again by a new hold. */
function ramped(lab: Lab, def: SkillDef, found: Found): void {
  const hero = lab.player;
  hero.aim.copy(ahead(lab, AIM_AHEAD));
  // (a canary's grace is endless: the moment off him is read within a second whatever it is)
  const grace = Math.min(def.ramp?.grace ?? 0, 1);
  const ally = standIn({ at: ahead(lab, 5) });
  const read = withBeam(hero, def, (st) => {
    const held = stepped(lab, hero, def, st, framesOf(3)).at(-1)!;
    withIn([ally], () => stepped(lab, hero, def, st, framesOf(1)));
    const switched = stepped(lab, hero, def, st, framesOf(3));
    withIn([ally], () => stepped(lab, hero, def, st, framesOf(grace * 0.4)));
    const back = stepped(lab, hero, def, st, 1)[0];
    return { held, afterSwitch: switched[0], beforeFlick: switched.at(-1)!, back };
  });
  const again = withBeam(hero, def, (st) => stepped(lab, hero, def, st, 1)[0]);
  found.lines.push(`  ramp: ×${read.held.toFixed(2)} held 3 s; switched to an ally 1 s and back ×`
    + `${read.afterSwitch.toFixed(2)}; off him ${(grace * 0.4).toFixed(2)} s (within its ${grace} s) and back `
    + `×${read.back.toFixed(2)} (×${read.beforeFlick.toFixed(2)} before); let go and held again ×${again.toFixed(2)}`);
  if (Math.abs(read.afterSwitch - 1) > RAMP_SLACK) {
    found.problems.push(`the ramp was ×${read.afterSwitch.toFixed(2)} after a switch to an ally and back, not begun again`);
  }
  if (read.back < read.beforeFlick - RAMP_SLACK) {
    found.problems.push(`the ramp fell from ×${read.beforeFlick.toFixed(2)} to ×${read.back.toFixed(2)} over a `
      + 'moment off him within its grace');
  }
  if (Math.abs(again - 1) > RAMP_SLACK) found.problems.push(`a new hold began at ×${again.toFixed(2)}, not ×1`);
}

/** One case of the chain: who stands where, whom the caster aims at, and what the hero at its end should take. */
interface ChainCase {
  name: string;
  /** the others in the room, the caster first */
  room: (lab: Lab) => { caster: Player; aimAt: Player; others: Player[] };
  /** what he should take as a share of an unramped heal on him */
  should: number;
}

/** to the hero's side, where the caster and the healers in the chain stand (m): his beam's cone points away */
const SIDE = { caster: 4, healer: 7, second: 10, third: 13 };

/** The chain's cases: one full healer, one with room, two full ones, and a ring of two that never reaches him. */
function chainCases(): ChainCase[] {
  const bonus = ASKED.perLink;
  const beside = (lab: Lab, metres: number): THREE.Vector3 => ahead(lab, 0, metres);
  return [
    {
      name: 'through a full healer',
      room: (lab) => {
        const healer = standIn({ at: beside(lab, SIDE.healer), beamOn: lab.player });
        return { caster: standIn({ at: beside(lab, SIDE.caster) }), aimAt: healer, others: [healer] };
      },
      should: 1 + bonus,
    },
    {
      name: 'a healer with room',
      room: (lab) => {
        const healer = standIn({ at: beside(lab, SIDE.healer), beamOn: lab.player, life: STAND_IN_LIFE / 2 });
        return { caster: standIn({ at: beside(lab, SIDE.caster) }), aimAt: healer, others: [healer] };
      },
      should: 0,
    },
    {
      name: 'through two full healers',
      room: (lab) => {
        const second = standIn({ at: beside(lab, SIDE.second), beamOn: lab.player });
        const healer = standIn({ at: beside(lab, SIDE.healer), beamOn: second });
        return { caster: standIn({ at: beside(lab, SIDE.caster) }), aimAt: healer, others: [healer, second] };
      },
      should: 1 + 2 * bonus,
    },
    {
      name: 'a ring of two full healers',
      room: (lab) => {
        const second = standIn({ at: beside(lab, SIDE.second) });
        const healer = standIn({ at: beside(lab, SIDE.healer), beamOn: second });
        (second as { channel: unknown }).channel = { skill: { impl: lifethread }, state: { on: healer } };
        return { caster: standIn({ at: beside(lab, SIDE.caster) }), aimAt: healer, others: [healer, second] };
      },
      should: 0,
    },
    {
      // (a ring must end where it comes round, whatever its length: from the owner, "check the connected/linked
      // graph for cycles, to ensure we dont get infinite healing power")
      name: 'a ring of three full healers',
      room: (lab) => {
        const third = standIn({ at: beside(lab, SIDE.third) });
        const second = standIn({ at: beside(lab, SIDE.second), beamOn: third });
        const healer = standIn({ at: beside(lab, SIDE.healer), beamOn: second });
        (third as { channel: unknown }).channel = { skill: { impl: lifethread }, state: { on: healer } };
        return { caster: standIn({ at: beside(lab, SIDE.caster) }), aimAt: healer, others: [healer, second, third] };
      },
      should: 0,
    },
  ];
}

/** Its chain: a partner's beam on a full healer whose own is on the hero heals the hero, more by each link. */
function chained(lab: Lab, def: SkillDef, found: Found): void {
  // (the caster a stand-in with no All Damage: an unramped heal on him is the one at no gear)
  const unramped = threadHeal(def, 0, lab.player.stats.maxLife);
  const ownBase = healOnHim(lab, def);
  const firstRamp = 1 + (def.ramp?.perSecond ?? 0) * window.__labClock.frame / 1000;
  for (const chainCase of chainCases()) {
    const { caster, aimAt, others } = chainCase.room(lab);
    caster.aim.copy(aimAt.pos);
    const took = withIn([caster, ...others], () => withBeam(caster, def, (st) => {
      return stepped(lab, caster, def, st, 1)[0] * ownBase / unramped / firstRamp;
    }));
    found.lines.push(`  chain, ${chainCase.name}: he took ×${took.toFixed(3)} of a beam on him `
      + `(×${chainCase.should.toFixed(2)} expected)`);
    if (Math.abs(took - chainCase.should) > 0.01) {
      found.problems.push(`the chain ${chainCase.name} gave him ×${took.toFixed(3)}, not ×${chainCase.should.toFixed(2)}`);
    }
  }
}

/** the ring along the beam its width is read at, and its sides (as the skill's tube: 24 rings of 6) */
const WIDTH_RING = 12;
const RING_SIDES = 6;
/** how much thicker the owner's "visually thicker" asks one carried beam to be, at least */
const THICKER_LEAST = 1.2;

/** The beam's outer tube's width at its middle ring, from its geometry as drawn (two sides across from each other). */
function beamWidth(): number {
  const beam = G.scene.getObjectByName('Lifethread: beam') as THREE.Mesh | undefined;
  if (!beam) return 0;
  const pos = beam.geometry.attributes.position as THREE.BufferAttribute;
  const side = new THREE.Vector3().fromBufferAttribute(pos, WIDTH_RING * RING_SIDES);
  const across = new THREE.Vector3().fromBufferAttribute(pos, WIDTH_RING * RING_SIDES + RING_SIDES / 2);
  return side.distanceTo(across);
}

/** What his beam shows for one step with the hero full and `feeders` holding theirs on him: its width, the count at
 *  his aim and its place. */
function linkedStep(lab: Lab, def: SkillDef, feeders: Player[], onFeeder = false):
{ width: number; count: number; atAim: boolean } {
  const hero = lab.player;
  // (his beam on an ally of its own, or on the first feeder: a ring of two)
  const ally = standIn({ at: ahead(lab, 5) });
  const on = onFeeder ? feeders[0] : ally;
  hero.aim.copy(on.pos);
  hero.life = hero.stats.maxLife;
  const room = onFeeder ? feeders : [ally, ...feeders];
  return withIn(room, () => withBeam(hero, def, (st) => {
    lifethread.tick(hero, def, window.__labClock.frame / 1000, st);
    const at = st.linkAt;
    const atAim = Boolean(st.linkLabel && at && Math.hypot(at.x - hero.aim.x, at.z - hero.aim.z) < 1e-3);
    return { width: beamWidth(), count: st.links, atAim };
  }));
}

/** A beam carrying another's on (his full, a partner's on him): thicker, by each it carries, and its count at his aim. */
function linkedLook(lab: Lab, def: SkillDef, found: Found): void {
  const hero = lab.player;
  const behind = (metres: number): THREE.Vector3 => ahead(lab, -metres);
  const feeder = (metres: number): Player => standIn({ at: behind(metres), beamOn: hero });
  const alone = linkedStep(lab, def, []);
  const one = linkedStep(lab, def, [feeder(3)]);
  const two = linkedStep(lab, def, [feeder(3), feeder(4)]);
  // (his beam on the one feeding him, both full: the ring counted once)
  const ring = linkedStep(lab, def, [standIn({ at: ahead(lab, 5), beamOn: hero })], true);
  found.lines.push(`  linked: the beam ${alone.width.toFixed(3)} m wide alone, ${one.width.toFixed(3)} carrying one, `
    + `${two.width.toFixed(3)} carrying two; the count at his aim ${alone.count}, ${one.count}, ${two.count}, `
    + `and ${ring.count} in a ring of two`);
  if (ring.count !== 1) found.problems.push(`a ring of two healers counted ${ring.count} links, not 1`);
  if (one.width < alone.width * THICKER_LEAST) {
    found.problems.push(`a beam carrying another's was ${one.width.toFixed(3)} m wide, not thicker than its `
      + `${alone.width.toFixed(3)}`);
  }
  if (two.width <= one.width) found.problems.push('a beam carrying two was no thicker than one carrying one');
  if (alone.count !== 0 || one.count !== 1 || two.count !== 2) {
    found.problems.push(`the count at his aim read ${alone.count}, ${one.count}, ${two.count}, not 0, 1, 2`);
  }
  if (!one.atAim || !two.atAim) found.problems.push('the count of the beams carried was not shown at his aim');
}

/** The beam whole: whom it lands on, its heal held on himself, its ramp and its chain. */
export async function thread(lab: Lab, setUp: () => Promise<void>): Promise<Found> {
  const found = emptyFound();
  await setUp();
  const def = skillOf(lab, 'lifethread');
  choices(lab, def, found);
  await heldOnHimself(lab, def, found);
  ramped(lab, def, found);
  chained(lab, def, found);
  linkedLook(lab, def, found);
  return found;
}

/** The faults the canary plants on the beam's data: no most, no end to its grace, no bonus down a chain. */
function plantFaults(def: SkillDef): () => void {
  const { ramp, passBonus } = def;
  def.ramp = { perSecond: ramp?.perSecond ?? ASKED.perSecond, most: 3, grace: Infinity };
  def.passBonus = 0;
  return () => {
    def.ramp = ramp;
    def.passBonus = passBonus;
  };
}

/** what each planted fault must be found as (a problem's start) */
const PLANTED = ['the beam\'s ramp rose to', 'the ramp was', 'the chain through a full healer'];

/** `--canary`: the beam run with its faults planted; each must be found. */
export async function threadCanary(lab: Lab, setUp: () => Promise<void>): Promise<Found> {
  await setUp();
  const restore = plantFaults(skillOf(lab, 'lifethread'));
  let planted: Found;
  try {
    planted = await thread(lab, async () => undefined);
  } finally {
    restore();
  }
  const found = emptyFound();
  for (const fault of PLANTED) {
    const caught = planted.problems.some((problem) => problem.startsWith(fault));
    found.lines.push(`  canary, "${fault}...": ${caught ? 'caught' : 'missed'}`);
    if (!caught) found.problems.push(`the beam's canary went unseen: no "${fault}..."`);
  }
  return found;
}
