// Training grounds (#405): exercise the lobby and controller against a real normal-run damage control.
import type { Lab, Report, Pictured } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS } from '../../../src/data/biomes';
import { setBiomeSetting } from '../../../src/game/biome';
import { startRun, abandonRun, updateRun, gainLoot, hostLeft } from '../../../src/game/run';
import { hurtPlayer, hitEnemy } from '../../../src/combat/damage';
import { clearEnemies } from '../../../src/entities/enemy';
import { loadProfile, saveProfile } from '../../../src/loot/profile';
import { renderMenu, renderLobbyOptions, selectedWave } from '../../../src/ui/menus';
import type { DamageType } from '../../../src/types';

/** The command's deliberate fault must be found without leaving it in the game. */
export interface TrainingOptions {
  canary: boolean;
}

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const profileText = (): string => JSON.stringify(G.profile);

/** Verify saved progression, mode controls and reward isolation on a fresh lab page. */
export async function training(lab: Lab, options: TrainingOptions): Promise<Report> {
  const problems: string[] = [];
  const lines: string[] = [];
  const moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) problems.push(message);
  };
  if (G.mode !== 'menu') throw new Error('training: the fresh page must begin in the lobby');

  // Seed the old shape, then load through the real migration. A global clear cannot unlock another biome.
  const biome = BIOME_IDS[0];
  const other = BIOME_IDS[1];
  G.profile.records.bestBanked = { [biome]: 2 };
  delete (G.profile.records as Partial<typeof G.profile.records>).bestReached;
  saveProfile(G.profile);
  G.profile = loadProfile(G.profile.classId);
  check(G.profile.records.bestReached[biome] === 2, 'migration lost the known banked wave');
  check(!G.profile.records.bestReached[other], 'migration invented progression in another biome');

  setBiomeSetting(biome);
  startRun(4);
  check(G.profile.records.bestReached[biome] === 4, 'attempting a wave did not save it immediately');
  // A lethal normal blow is the control: training's later immunity cannot pass because damage is broken.
  lab.player.guardUntil = 0;
  const normalLife = lab.player.life;
  hurtPlayer(lab.player, 1e9);
  check(lab.player.life < normalLife, 'normal-run control took no damage');
  abandonRun();
  G.profile = loadProfile(G.profile.classId);
  check(G.profile.records.bestReached[biome] === 4, 'a failed wave was lost on profile reload');
  check(G.profile.records.bestBanked[biome] === 2, 'dying unlocked an ordinary arena start');
  lab.player.reset();
  lab.player.sandbox = true;
  renderMenu();
  check(selectedWave() === 2, 'Arena offered an unbanked wave');
  await lab.clickOn(element('#opt-training [data-training="true"]'));
  check(selectedWave() === 4, 'Training did not offer the failed wave');
  moments.push(await lab.screen('training-lobby'));
  const before = profileText();
  await lab.clickOn(element('#btn-start'));
  await lab.until(() => G.mode === 'run' && Boolean(G.run?.training), 600, 'training never started');
  check(!lab.player.sandbox, 'training incorrectly granted free casts');
  const run = G.run!;
  check(run.wave === 4, 'training started a different wave');
  check(profileText() === before, 'starting training changed the saved profile');

  const damageTypes: DamageType[] = ['physical', 'arcane', 'fire', 'cold', 'lightning', 'vitality'];
  for (const type of damageTypes) {
    lab.player.guardUntil = 0;
    const life = lab.player.life;
    const ward = lab.player.ward;
    const dealt = hurtPlayer(lab.player, 100, type);
    check(dealt === 0 && lab.player.life === life && lab.player.ward === ward, `${type} hurt the training hero`);
  }
  if (options.canary) {
    run.training = false;
    lab.player.guardUntil = 0;
    const life = lab.player.life;
    hurtPlayer(lab.player, 100);
    const caught = lab.player.life < life;
    check(caught, 'damage canary was missed');
    lines.push(`damage canary: ${caught ? 'caught' : 'missed'}`);
    run.training = true;
    lab.player.life = lab.player.stats.maxLife;
  }

  // Real enemy spawn/kill events exercise both loot paths and the crowd uniforms.
  const foe = lab.spawnFoe('husk', new lab.THREE.Vector3(4, 0, 4));
  await lab.step(120);
  check(foe.model.kit.u.uDissolve.value >= 0.28, 'projection has no screen-door dissolve');
  check(foe.model.kit.u.uFrozen.value > 0.3 && !foe.castsShadow, 'projection has an ordinary solid look');
  const edge = foe.model.kit.u.uEdge.value;
  check(Math.max(edge.r, edge.g, edge.b) < 0.2, 'projection glow is too bright');
  moments.push(await lab.screen('training-projection'));
  foe.invulnerable = false;
  hitEnemy(foe, 1e9, { by: lab.player, skill: lab.player.cls.skills[0] });
  check(!foe.alive, 'the projection could not be killed');
  check(run.score === 0 && run.bag.length === 0, 'a projection kill awarded score or loot');
  const item = Object.values(G.profile.equipped).find(Boolean)!;
  gainLoot(item);
  check(run.bag.length === 0, 'training accepted a late loot report');
  clearEnemies();
  run.phase = 'fighting';
  run.queue = [];
  run.boss = null;
  run.pending = 0;
  updateRun(0.1);
  check(String(run.phase) === 'cleared', 'training wave never cleared');
  await lab.step(35);
  check(run.bag.length === 0, 'training received scheduled wave rewards');
  check(element('.cont-label').textContent === 'Repeat wave 4', 'training offered an unreached next wave');
  check(element('.bank-label').textContent === 'Leave training', 'training offered banking rewards');
  moments.push(await lab.screen('training-cleared'));
  element('#decision .cont').click();
  updateRun(0.1);
  check(run.wave === 4 && String(run.phase) === 'countdown', 'repeat advanced beyond the selected wave');
  hostLeft();
  check(profileText() === before, 'training/disconnect changed the saved profile');
  check(element('.sm-title').textContent === 'Training Complete', 'training showed an ordinary reward summary');
  abandonRun();
  check(profileText() === before, 'abandoning training changed the saved profile');
  renderLobbyOptions();
  lines.push('migration, failed-wave reload, banked-only Arena and reached-wave Training: checked');
  lines.push('normal damage control, training damage types, projection kill, late loot and wave rewards: checked');
  lines.push('repeat, host disconnect and abandon: no score, loot or profile changes');
  return { text: lines.join('\n'), problems, moments };
}
