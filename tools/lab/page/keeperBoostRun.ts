// The ale's boost through the player's own portal, training, wave decisions and return controls.
import { ALE_BOOST } from '../../../src/data/tavern';
import { hurtPlayer } from '../../../src/combat/damage';
import { ALE_STACKS } from '../../../src/game/aleBoost';
import { enterRoom, leaveRoom } from '../../../src/game/rooms';
import { villageObject } from '../../../src/game/village';
import { G } from '../../../src/state';
import { stand, useByE, viewAs } from './houses';
import type { Lab, Report } from './lab';
import { choosingAle, pickAle, takeMug, waitingMug } from './takeAle';

const WAIT = 900;
const HUD_ALE = '#buffs .ale .bt';

async function click(lab: Lab, selector: string): Promise<void> {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element?.checkVisibility()) throw new Error(`lab: ale boost: ${selector} never showed`);
  await lab.clickOn(element);
}

async function drink(lab: Lab): Promise<void> {
  if (G.arena.room !== 'tavern') {
    enterRoom('tavern');
    await lab.until(() => G.arena.room === 'tavern', WAIT, 'ale boost: the tavern never opened');
  }
  await viewAs(lab, 'top');
  const room = G.arena.rooms!.tavern;
  const keeper = villageObject('keeper')!;
  const tv = room.tavern?.();
  if (!tv) throw new Error('lab: ale boost: the tavern has no keeper');
  await stand(lab, keeper.stand, Math.PI / 2);
  room.serveAle?.(G.player);
  await lab.until(() => waitingMug(tv) >= 0, WAIT, 'ale boost: no mug was served');
  await takeMug(lab, tv);
  await lab.until(choosingAle, 90, 'ale boost: the mug choice never showed');
  await pickAle(lab, 'drink');
  await lab.until(() => !G.player.casting?.skill.def.ale, 360, 'ale boost: the drink never finished');
  await lab.step(1);
}

async function start(lab: Lab, training: boolean, problems: string[]): Promise<void> {
  if (G.arena.room) leaveRoom();
  const object = villageObject(training ? 'ghost' : 'crypt')!;
  await stand(lab, object.stand, 0);
  await useByE(lab, object, problems);
  await lab.step(15);
  await click(lab, '#btn-start');
  await lab.until(() => G.mode === 'run' && G.run?.training === training, WAIT, 'ale boost: wrong run mode');
  await lab.step(2);
}

/** Skip the fight while leaving the production update to clear the wave, emit the event and show the decision. */
async function clearWave(lab: Lab, wave: number): Promise<void> {
  const run = G.run;
  if (run?.wave !== wave || run.phase !== 'countdown') throw new Error(`lab: ale boost: wave ${wave} never began`);
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', 30, 'ale boost: the countdown never ended');
  if (!run.queue.length || run.pending || G.enemies.some((enemy) => enemy.alive)) {
    throw new Error(`lab: ale boost: wave ${wave} did not reach the pre-spawn fixture`);
  }
  run.queue = [];
  run.boss = null;
  await lab.until(() => run.phase === 'cleared', 30, 'ale boost: the wave never cleared');
  await lab.step(35);
}

async function returnToVillage(lab: Lab): Promise<void> {
  await lab.until(() => !!document.querySelector('#btn-summary')?.checkVisibility(), 240,
    'ale boost: the summary never opened');
  await click(lab, '#btn-summary');
  await lab.until(() => G.mode === 'menu' && !G.run, WAIT, 'ale boost: the summary did not return to the village');
  await lab.step(2);
}

/** Verify a normal run consumes the buff, training leaves it waiting, and bank/death remove any remainder. */
export async function boostThroughRun(lab: Lab, canary: boolean): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  const base = G.player.stats.maxLife;
  const expectedText = `+${Math.round(ALE_BOOST.life * 100)}%`;
  const lifeMatches = (waves: number): boolean =>
    Math.abs(G.player.stats.maxLife - base * (1 + (waves > 0 ? ALE_BOOST.life : 0))) <= 1e-5;
  const expect = (stage: string, waves: number, waiting = false): void => {
    const hud = document.querySelector(HUD_ALE)?.textContent ?? '';
    const notice = document.querySelector('#ale-fortified');
    const showing = !!notice?.checkVisibility();
    if (!lifeMatches(waves)) problems.push(`${stage}: wrong max health (${G.player.stats.maxLife})`);
    if (hud !== (waves > 0 ? `${expectedText} · ${waves}` : '')) problems.push(`${stage}: wrong ale HUD (${hud})`);
    if (showing !== waiting || (waiting && !notice?.textContent?.includes(`${expectedText} health in your next run, for ${ALE_BOOST.waves} waves`))) {
      problems.push(`${stage}: wrong Fortified by ale notice`);
    }
  };

  await drink(lab);
  expect('first drink in the tavern', 0, true);
  const before = ALE_STACKS.canary;
  if (canary) {
    try {
      ALE_STACKS.canary = true;
      await drink(lab);
      await start(lab, false, problems);
      const stacked = base * (1 + ALE_BOOST.life) ** 2;
      const caught = !lifeMatches(ALE_BOOST.waves) && Math.abs(G.player.stats.maxLife - stacked) <= 1e-5;
      lines.push(`boost canary: ${caught ? 'caught stacking through the portal' : 'stacking went unseen'}`);
      if (!caught) problems.push('boost canary: the second drink did not produce the planted stacked health');
      return { text: lines.join('\n'), problems };
    } finally {
      ALE_STACKS.canary = before;
    }
  }
  await drink(lab);
  expect('second drink in the tavern', 0, true);
  await start(lab, true, problems);
  expect('training start', 0);
  await clearWave(lab, 1);
  expect('training clear', 0);
  await click(lab, '#decision .bank');
  await returnToVillage(lab);
  expect('returned from training', 0, true);

  await start(lab, false, problems);
  expect('normal run start after two ales', ALE_BOOST.waves);
  for (let wave = 1; wave <= ALE_BOOST.waves; wave++) {
    await clearWave(lab, wave);
    expect(`wave ${wave} cleared`, ALE_BOOST.waves - wave);
    if (wave === ALE_BOOST.waves) break;
    await click(lab, '#decision .cont');
    await lab.until(() => G.run?.wave === wave + 1, 90, 'ale boost: Continue did not advance the wave');
  }
  await click(lab, '#decision .bank');
  await returnToVillage(lab);
  expect('banked after boost expired', 0);
  lines.push('training preserved the pending ale; normal Continue spent one HUD wave per clear until expiry');

  for (const ending of ['bank', 'death']) {
    await drink(lab);
    expect(`fresh ale before ${ending}`, 0, true);
    await start(lab, false, problems);
    expect(`fresh run before ${ending}`, ALE_BOOST.waves);
    if (ending === 'bank') {
      const wave = G.run!.wave;
      await clearWave(lab, wave);
      await click(lab, '#decision .bank');
    } else {
      G.player.guardUntil = 0;
      hurtPlayer(G.player, 1e9);
    }
    await lab.until(() => G.player.out === (ending === 'bank' ? 'banked' : 'dead'), 90, `ale boost: no ${ending}`);
    if (!lifeMatches(0)) problems.push(`${ending}: max health stayed boosted after the run ended`);
    await returnToVillage(lab);
    expect(`returned after ${ending}`, 0);
  }
  await drink(lab);
  expect('fresh ale after death', 0, true);
  lines.push('early banking and lethal damage cleared the remaining boost; fresh ale worked after both endings');
  return { text: lines.join('\n'), problems };
}
