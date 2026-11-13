// Training-specific checks on each of the two real game pages carried by the co-op lab.
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS } from '../../../src/data/biomes';
import { saveProfile } from '../../../src/loot/profile';
import { renderMenu, selectTraining } from '../../../src/ui/menus';
import { hurtPlayer, hitEnemy } from '../../../src/combat/damage';
import { gainLoot } from '../../../src/game/run';

/** Steps driven together by the lab's existing co-op link. */
export interface TrainingStep {
  step: 'prepare' | 'lobby' | 'fight' | 'spawn' | 'repeat' | 'leave' | 'finished' | 'canary';
  host?: boolean;
}

let saved = '';
const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

/** Inspect real lobby controls and each peer's damage/reward path, without replacing the transport. */
export async function trainingCoop(lab: Lab, command: TrainingStep): Promise<Report> {
  const problems: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) problems.push(message);
  };
  if (command.step === 'prepare') {
    const biome = BIOME_IDS[0];
    G.profile.records.bestBanked = { [biome]: 1 };
    G.profile.records.bestReached = { [biome]: command.host ? 4 : 1 };
    saveProfile(G.profile);
    saved = JSON.stringify(G.profile);
    G.arena.setBiome(biome);
    renderMenu();
    // (the ghost's choice, as its card makes it: talked to in `training`)
    if (command.host) selectTraining(true);
  } else if (command.step === 'lobby') {
    check(element('#btn-start').textContent === 'Enter the Training Grounds' || !command.host,
      'host mode not shown');
    check(element('.wv-val').textContent?.includes('Wave 4') === true, 'host reached wave not shown');
    if (!command.host) {
      const choices = document.querySelectorAll<HTMLButtonElement>('#opt-biome button, #opt-wave button');
      check([...choices].every((button) => button.disabled), 'guest can override the host selection');
    }
  } else if (command.step === 'fight' || command.step === 'canary') {
    const run = G.run!;
    check(run.training && run.wave === 4, 'host training mode/wave not used');
    check(!lab.player.sandbox, 'training has lobby free casting');
    lab.player.guardUntil = 0;
    const life = lab.player.life;
    if (command.step === 'canary') run.training = false;
    const control = lab.player.stats.maxLife / 2 + lab.player.stats.blockAmount;
    const damage = hurtPlayer(lab.player, command.step === 'canary' ? control : 1e5);
    const hurt = damage > 0 || lab.player.life < life;
    if (command.step === 'canary') {
      check(hurt, 'training immunity canary was missed');
      run.training = true;
      lab.player.reset();
    } else check(!hurt, 'training peer took enemy damage');
    const item = Object.values(G.profile.equipped).find(Boolean)!;
    gainLoot(item);
    check(run.bag.length === 0 && run.score === 0, 'training peer accepted loot/score');
    check(JSON.stringify(G.profile) === saved, 'training peer changed its profile');
  } else if (command.step === 'spawn') {
    const foe = lab.spawnFoe('husk', new lab.THREE.Vector3(4, 0, 4));
    foe.spawning = 0;
    foe.invulnerable = false;
    hitEnemy(foe, 1e9, { by: lab.player, skill: lab.player.cls.skills[0] });
    check(!foe.alive, 'training foe could not be killed');
    check(G.run!.score === 0 && G.run!.bag.length === 0, 'host kill awarded training rewards');
  } else if (command.step === 'repeat') {
    check(G.run!.wave === 4, 'training advanced beyond the selected wave');
    element('#decision .cont').click();
  } else if (command.step === 'leave') {
    element('#decision .bank').click();
  } else if (command.step === 'finished') {
    check(G.mode === 'menu', 'training peer did not return to the lobby');
    check(JSON.stringify(G.profile) === saved, 'training bank changed progression, stash or records');
  }
  return { text: command.step, problems };
}
