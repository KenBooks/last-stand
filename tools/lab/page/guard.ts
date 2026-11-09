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

/** Check the guard's combat window, release/cost failures, touch path and existing pose transitions. */
export async function guard(lab: Lab, options: GuardOptions): Promise<Report> {
  if (lab.player.cls.id !== 'warrior') throw new Error('guard needs --class warrior');
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) problems.push(message);
  };
  for (const view of ['third', 'first'] as const) {
    await lab.setup({ gear: 'shield', view });
    const hero = lab.player;
    hero.sandbox = false;
    hero.stats.block = 0;
    hero.stats.blockAmount = 20;
    hero.stats.armor = 0;
    hero.guardUntil = 0;
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

    // Let block go while the sword is still in motion: it must not resume itself.
    await lab.step(1, () => ({ m0: true, m2: true }));
    check(Boolean(hero.casting), `${view}: release case never started an attack`);
    await lab.until(() => !hero.casting, 120, 'released-block swing never ended');
    check(!blocking(hero), `${view}: released guard came back`);
    const tempest = hero.known.get('tempest')!;
    hero.startChannel(tempest, '1');
    check(!hero.tryCast(hero.known.get('cleave')!, 'mouse0'), `${view}: another channel became interruptible`);
    hero.stopChannel();
    if (options.canary && view === 'third') {
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
  }

  await lab.setup({ gear: 'shield', view: 'third' });
  await showTouchControls(lab);
  const hero = lab.player;
  const shield = element('#touch-skills .tk-mouse2');
  const attack = element('#touch-skills .tk-mouse0');
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
  await lab.touchDown(middleOf(attack), 2);
  await lab.step(1);
  await lab.touchUp(1);
  await lab.touchUp(2);
  await lab.until(() => !hero.casting, 120, 'touch release attack never finished');
  check(!blocking(hero) && input.touch.size === 0, 'touch: released fingers left a held guard or attack');
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
  return {
    text: 'third/first person: attack window, immediate guard return, release, failed casts and channel isolation; '
      + 'two touch fingers: hold, attack, resume and release checked',
    problems,
    moments,
  };
}
