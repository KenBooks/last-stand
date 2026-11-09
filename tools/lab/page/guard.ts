// Attack/block regression (#399), driven through the real input and independent touch captures.
import type { Lab, Report, Pictured } from './lab';
import { middleOf } from './lab';
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { hurtPlayer } from '../../../src/combat/damage';
import { element, showTouchControls } from './touchStick';
import type { Player } from '../../../src/entities/player';

/** Plant a guard that fails to lower and require the regression to detect it. */
export interface GuardOptions {
  canary: boolean;
}

const blocking = (hero: Player): boolean => Boolean(hero.channel?.skill.def.block);
const shieldHeld = () => ({ m2: true });

type Check = (condition: boolean, message: string) => void;
type GuardView = 'third' | 'first';

interface GuardCase {
  lab: Lab;
  hero: Player;
  check: Check;
  moments: Pictured[];
}

interface ViewCase extends GuardCase {
  view: GuardView;
}

interface TouchCase extends GuardCase {
  shield: HTMLElement;
  attack: HTMLElement;
}

async function checkAttackWindow(scenario: ViewCase): Promise<void> {
  const { lab, hero, check, moments, view } = scenario;
  await lab.step(20, shieldHeld);
  check(blocking(hero), `${view}: shield was never raised`);
  moments.push(await lab.screen(`${view}-guard`));
  check(hurtPlayer(hero, 40) === 0, `${view}: raised guard did not block the frontal control hit`);

  await lab.step(1, () => ({ m0: true, m2: true }));
  check(hero.casting?.skill.def.impl === 'cleave', `${view}: attack could not begin while blocking`);
  check(!blocking(hero), `${view}: raised block remained active during the swing`);
  check(hurtPlayer(hero, 40) === 40, `${view}: swing did not expose the hero to a frontal hit`);
  let protectedSwingFrames = 0;
  const watchSwing = (): void => {
    if (hero.casting && blocking(hero)) protectedSwingFrames++;
  };
  await lab.step(7, shieldHeld, watchSwing);
  moments.push(await lab.screen(`${view}-swing-shield-down`));
  for (let frame = 0; frame < 120 && hero.casting; frame++) await lab.step(1, shieldHeld, watchSwing);
  check(!hero.casting, `${view}: swing never finished`);
  check(blocking(hero), `${view}: shield did not return in the update that ended the attack`);
  await lab.step(15, shieldHeld);
  check(protectedSwingFrames === 0, `${view}: shield protected an unfinished swing`);
  moments.push(await lab.screen(`${view}-guard-returned`));
  hero.guardUntil = 0;
  check(hurtPlayer(hero, 40) === 0, `${view}: resumed guard did not block`);
}

function checkFailedCasts(scenario: ViewCase): void {
  const { hero, check, view } = scenario;
  // A failed Power Strike must leave the current channel and its visual ward alone.
  const power = hero.known.get('powerStrike')!;
  const original = hero.channel;
  hero.cooldowns.set('powerStrike', 5);
  check(!hero.tryCast(power, '3') && hero.channel === original, `${view}: cooldown failure dropped the guard`);
  hero.cooldowns.delete('powerStrike');
  const energy = hero.energy;
  hero.energy = 0;
  check(!hero.tryCast(power, '3') && hero.channel === original, `${view}: energy failure dropped the guard`);
  hero.energy = energy;
}

async function checkGuardRecovery(scenario: ViewCase): Promise<void> {
  const { lab, hero, check, view } = scenario;
  const energy = hero.energy;
  // No free re-raise when the swing ends with too little energy, or while the guard is broken.
  await lab.step(1, () => ({ m0: true, m2: true }));
  const ending = hero.casting;
  check(Boolean(ending), `${view}: low-energy case never started a swing`);
  if (ending) ending.t = ending.dur - window.__labClock.frame / 2000;
  const regeneration = hero.stats.energyRegen;
  hero.stats.energyRegen = 0;
  hero.energy = 0;
  await lab.step(1, shieldHeld);
  check(!hero.casting && !blocking(hero), `${view}: guard resumed without energy`);
  hero.energy = energy;
  hero.guardBroken = G.time + 1;
  await lab.step(2, shieldHeld);
  check(!blocking(hero), `${view}: staggered hero raised a guard`);
  hero.guardBroken = 0;
  hero.stats.energyRegen = regeneration;
  await lab.step(1, shieldHeld);
  check(blocking(hero), `${view}: recovered guard did not resume`);
}

async function checkReleasedBlock(scenario: ViewCase): Promise<void> {
  const { lab, hero, check, view } = scenario;
  // Let block go while the sword is still in motion: it must not resume itself.
  await lab.step(1, () => ({ m0: true, m2: true }));
  check(Boolean(hero.casting), `${view}: release case never started an attack`);
  await lab.until(() => !hero.casting, 120, 'released-block swing never ended');
  check(!blocking(hero), `${view}: released guard came back`);
  const tempest = hero.known.get('tempest')!;
  hero.startChannel(tempest, '1');
  check(!hero.tryCast(hero.known.get('cleave')!, 'mouse0'), `${view}: another channel became interruptible`);
  hero.stopChannel();
}

async function checkCanary(scenario: GuardCase): Promise<void> {
  const { lab, hero, check } = scenario;
  await lab.step(1, shieldHeld);
  const stop = hero.stopChannel;
  hero.stopChannel = () => {};
  let caught = false;
  try {
    hero.tryCast(hero.known.get('cleave')!, 'mouse0');
    caught = Boolean(hero.casting) && blocking(hero);
  } finally {
    delete (hero as { stopChannel?: unknown }).stopChannel;
    stop.call(hero);
  }
  check(caught, 'canary: a guard that stayed raised during the swing was missed');
  await lab.until(() => !hero.casting, 120, 'canary swing never finished');
}

/** Run each combat case in order, with the same fixture and pose history as the original regression. */
async function checkView(lab: Lab, view: GuardView, check: Check, moments: Pictured[], canary: boolean): Promise<void> {
  await lab.setup({ gear: 'shield', view });
  const hero = lab.player;
  hero.sandbox = false;
  hero.stats.block = 0;
  hero.stats.blockAmount = 20;
  hero.stats.armor = 0;
  hero.guardUntil = 0;
  const scenario = { lab, hero, view, check, moments };
  await checkAttackWindow(scenario);
  checkFailedCasts(scenario);
  await checkGuardRecovery(scenario);
  await checkReleasedBlock(scenario);
  if (canary) await checkCanary(scenario);
}

async function checkTouchAttack(scenario: TouchCase): Promise<void> {
  const { lab, hero, check, shield, attack, moments } = scenario;
  await lab.touchDown(middleOf(shield), 1);
  await lab.step(5);
  check(blocking(hero), 'touch: shield did not take its hold');
  await lab.touchDown(middleOf(attack), 2);
  await lab.step(1);
  check(input.touch.has('mouse0') && input.touch.has('mouse2'), 'touch: second skill finger displaced the shield');
  check(Boolean(hero.casting) && !blocking(hero), 'touch: attack did not lower the shield');
  await lab.touchUp(2);
  await lab.until(() => !hero.casting, 120, 'touch attack never finished');
  check(blocking(hero), 'touch: held shield did not return after attack');
  moments.push(await lab.screen('touch-guard-returned'));
}

async function checkTouchRelease(scenario: TouchCase): Promise<void> {
  const { lab, hero, check, attack } = scenario;
  await lab.touchDown(middleOf(attack), 2);
  await lab.step(1);
  await lab.touchUp(1);
  await lab.touchUp(2);
  await lab.until(() => !hero.casting, 120, 'touch release attack never finished');
  check(!blocking(hero) && input.touch.size === 0, 'touch: released fingers left a held guard or attack');
}

async function checkLostCapture(scenario: TouchCase): Promise<void> {
  const { lab, hero, check, shield } = scenario;
  let captured = -1;
  shield.addEventListener('pointerdown', (event) => { captured = event.pointerId; }, { once: true });
  await lab.touchDown(middleOf(shield), 1);
  await lab.step(2);
  check(captured >= 0 && blocking(hero), 'touch: cancellation control never held a shield');
  if (captured >= 0) shield.releasePointerCapture(captured);
  await window.__labClock.realFrame();
  await lab.step(1);
  check(!input.touch.has('mouse2') && !blocking(hero), 'touch: lost capture left block held');
  await lab.touchUp(1);
}

async function checkTouch(lab: Lab, check: Check, moments: Pictured[]): Promise<void> {
  await lab.setup({ gear: 'shield', view: 'third' });
  await showTouchControls(lab);
  const scenario = {
    lab,
    hero: lab.player,
    check,
    moments,
    shield: element('#touch-skills .tk-mouse2'),
    attack: element('#touch-skills .tk-mouse0'),
  };
  await checkTouchAttack(scenario);
  await checkTouchRelease(scenario);
  await checkLostCapture(scenario);
}

/** Check the guard's combat window, release/cost failures, touch path and existing pose transitions. */
export async function guard(lab: Lab, options: GuardOptions): Promise<Report> {
  if (lab.player.cls.id !== 'warrior') throw new Error('guard needs --class warrior');
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const check: Check = (condition, message) => {
    if (!condition) problems.push(message);
  };
  for (const view of ['third', 'first'] as const) {
    await checkView(lab, view, check, moments, options.canary && view === 'third');
  }
  await checkTouch(lab, check, moments);
  return {
    text: 'third/first person: attack window, immediate guard return, release, failed casts and channel isolation; '
      + 'two touch fingers: hold, attack, resume and release checked',
    problems,
    moments,
  };
}
