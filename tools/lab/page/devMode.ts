// Developer controls through their real panel: lobby tabs, flight, frozen starts, training, refills and reset.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { hurtPlayer } from '../../../src/combat/damage';
import { overFrame, viewMode, viewSettled } from '../../../src/core/renderer';
import { HIDDEN_LAYER } from '../../../src/core/layers';
import { cheats, time } from '../../../src/dev/index';
import { refreshPanel, togglePanel } from '../../../src/dev/panel';
import { freeCamOn, freeCamSpeed } from '../../../src/dev/freeCam';
import { touchMode } from './uiTouch';
import { showPause, pauseTab } from '../../../src/ui/menus';
import { realWait, type Lab, type Pictured, type Report } from './lab';

const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`dev: missing ${selector}`);
  return found;
};

export async function devMode(lab: Lab, options: { canary: boolean }): Promise<Report> {
  const problems: string[] = [], lines: string[] = [], moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) problems.push(message); };
  const running = (): boolean => G.mode === 'run';
  if (G.mode !== 'menu') throw new Error('dev: must boot in the lobby');
  for (let i = 0; !document.getElementById('dev-panel') && i < 100; i++) await realWait(20);
  element('#dev-panel');
  const click = async (selector: string): Promise<void> => {
    const control = element(selector);
    control.scrollIntoView({ block: 'nearest' });
    await lab.clickOn(control);
    await lab.step(2);
    if (control.classList.contains('fold-tab')) await realWait(350);
    refreshPanel();
  };
  const action = (name: string): Promise<void> => click(`#dev-panel [data-act=${name}]`);
  const started = async (): Promise<void> => {
    for (let i = 0; G.mode !== 'run' && i < 1000; i++) { await lab.step(1); await realWait(10); }
    if (G.mode !== 'run') throw new Error('dev: wave never started after warming');
  };
  await click('[data-dev-tab=dev]');

  await lab.showOn({ width: 1920, height: 1080, ratio: 1 });
  await click('#hero-fold');
  moments.push(await lab.screen('dev-folded-tabs'));
  const heroTab = element('#hero-fold').getBoundingClientRect(), devTab = element('#dev-fold').getBoundingClientRect();
  check(devTab.top >= heroTab.bottom && devTab.width > 0 && devTab.right <= innerWidth,
    'collapsed Hero and Dev tabs were not stacked within the screen');
  await click('#dev-fold');
  check(!element('.menu-left').classList.contains('folded') && !element('#dev-panel').classList.contains('hidden'),
    'collapsed Dev tab did not open Dev');
  await click('#hero-fold');
  await click('#hero-fold');
  check(element('#dev-panel').classList.contains('hidden'), 'collapsed Hero tab did not open Hero');
  await click('#gear-fold');
  moments.push(await lab.screen('equipment-folded-tabs'));
  const gearTab = element('#gear-fold').getBoundingClientRect(), attrsTab = element('#attrs-fold').getBoundingClientRect();
  check(attrsTab.top >= gearTab.bottom && attrsTab.width > 0 && attrsTab.left >= 0,
    'collapsed Equipment and Attributes tabs were not stacked within the screen');
  await click('#attrs-fold');
  check(!element('.menu-right').classList.contains('folded') && element('.menu-right [data-tab=attrs]').classList.contains('active'),
    'collapsed Attributes tab did not open Attributes');
  await click('#gear-fold'); await click('#gear-fold');
  check(element('.menu-right [data-tab=gear]').classList.contains('active'), 'collapsed Equipment tab did not open Equipment');
  await click('[data-dev-tab=dev]');
  check(!document.querySelector('#dev-panel [data-act=close]'), 'redundant panel close button remained');
  check(element('#dev-panel').parentElement === element('.menu-left'), 'Dev did not share the left hero panel');
  check(getComputedStyle(element('.ml-body')).display === 'none', 'Hero content remained under Dev');
  await click('[data-dev-tab=hero]');
  check(getComputedStyle(element('.ml-body')).display !== 'none', 'Hero tab did not restore its content');
  await click('[data-dev-tab=dev]');

  const parts = [...document.querySelectorAll<HTMLInputElement>('[data-part]')];
  check(parts.length >= 7 && parts.every((part) => part.checked), 'frame parts did not start included');
  await click('[data-part="the hero"]');
  check(!G.player.obj.visible, 'unchecking Hero did not hide it');
  await action('parts');
  check(G.player.obj.visible && parts.every((part) => part.checked), 'Check all did not restore the frame');
  const draw = overFrame.draw;
  await action('labels');
  check(overFrame.draw !== draw, 'World labels did nothing outside flight');
  await action('labels');
  check(overFrame.draw === draw, 'World labels did not restore their draw');

  const opacity = element<HTMLInputElement>('[data-in=opacity]');
  opacity.value = '0'; opacity.dispatchEvent(new Event('input', { bubbles: true }));
  check(Number(opacity.value) === 50 && element('[data-out=opacity]').textContent === '50%', 'opacity could fall below its readable minimum');
  moments.push(await lab.screen('dev-opacity-minimum'));
  opacity.value = '95'; opacity.dispatchEvent(new Event('input', { bubbles: true }));

  for (const [width, height] of [[1024, 700], [1920, 1080], [844, 390], [1180, 820], [820, 1180]]) {
    await lab.showOn({ width, height, ratio: 1 });
    if (width === 844 || width === 1180 || width === 820) await touchMode(lab);
    refreshPanel();
    const panel = element('#dev-panel'), rect = panel.getBoundingClientRect();
    check(rect.width > 0 && rect.left >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1,
      `${width}x${height}: panel did not fit the viewport`);
    check(panel.scrollWidth <= panel.clientWidth + 1, `${width}x${height}: panel content overflowed`);
    moments.push(await lab.screen(`dev-${width}x${height}`));
    togglePanel(false);
    showPause(true); pauseTab('controls');
    const marker = element('.dv-mode-label');
    check(marker.textContent?.includes('Dev mode') === true && marker.getBoundingClientRect().width > 0,
      `${width}x${height}: pause did not clearly label developer mode`);
    const help = element('.dv-help');
    check(['F7', 'F8', 'F9', 'Wheel', 'WASD'].every((key) => help.textContent?.includes(key)), 'developer shortcuts missing from pause controls');
    check(help.scrollWidth <= help.clientWidth + 1, `${width}x${height}: developer help overflowed`);
    moments.push(await lab.screen(`dev-controls-${width}x${height}`));
    const pages = element('#pause .pb-pages');
    pages.scrollTop = pages.scrollHeight;
    const controlsBottom = element('#pause .controls-help').getBoundingClientRect().bottom;
    check(controlsBottom <= pages.getBoundingClientRect().bottom + 1,
      `${width}x${height}: controls could not scroll clear of the build footer`);
    if (width === 1920) moments.push(await lab.screen('dev-controls-scrolled'));
    pages.scrollTop = 0;
    showPause(false); togglePanel(true);
  }
  await lab.showOn({ width: 1920, height: 1080, ratio: 1 });
  await action('fly');
  refreshPanel();
  check(freeCamOn() && time.frozen, 'free camera did not freeze the game');
  check(getComputedStyle(element('#dev-panel')).scrollbarWidth === 'thin'
    && getComputedStyle(element('#dev-panel')).scrollbarColor !== 'auto', 'free-camera panel retained a native unthemed scrollbar');
  const speed = freeCamSpeed();
  await lab.wheel({ x: innerWidth * 0.7, y: innerHeight * 0.4 }, -100);
  check(freeCamSpeed() > speed && element('.df-speed').textContent?.includes(freeCamSpeed().toFixed(1)) === true,
    'wheel speed did not appear in the flight hint');
  moments.push(await lab.screen('dev-flight-speed'));

  // Start from the frozen camera: the real controller must resume time and spawn projections.
  togglePanel(true);
  refreshPanel();
  await click('[data-in=training]');
  await action('start');
  await started();
  check(!time.frozen && !freeCamOn() && !!G.run?.training, 'training remained frozen or started as an ordinary run');
  await lab.until(() => G.enemies.some((foe) => foe.alive && !foe.def.dummy && foe.spawning <= 0), 1000,
    'training did not spawn ghost enemies');
  const health = G.player.life;
  G.player.guardUntil = 0;
  hurtPlayer(G.player, 1e6);
  check(G.player.life === health, 'training enemies could hurt the hero');
  moments.push(await lab.screen('dev-training'));

  await action('free');
  check(cheats.free, 'No costs did not switch on');
  const refilled = (): boolean => G.player.energy === G.player.stats.maxEnergy && G.player.cooldowns.size === 0;
  for (let i = 0; i < 3; i++) {
    G.player.energy = 0;
    G.player.cooldowns.set('test-dev-refill', 20);
    await lab.step(1);
    check(refilled(), 'No costs did not keep refilling');
  }
  if (options.canary) {
    G.player.energy = 0;
    check(!refilled(), 'canary: a drained resource was not detected');
    lines.push('canary: a drained resource detected');
  }
  await action('free');
  await action('reset');
  check(running() && G.run?.wave === 1 && G.run.training, 'reset did not restart the loaded training wave');
  check(G.player.alive && G.player.life === G.player.stats.maxLife && time.scale === 1, 'reset left the hero dead or time slowed');
  await action('lobby');
  await action('reset');
  check(G.mode === 'menu' && G.player.alive, 'reset did not restore the loaded lobby');
  lines.push('tabs, frame inclusion, labels, opacity, five viewport layouts, flight speed, frozen training start, no costs, reset checked');

  // Walk the camera into the head at 0.1x: the head must leave the drawn layers before entry.
  await action('start');
  await started();
  await lab.press('KeyV');
  await lab.until(() => viewSettled(), 120, 'third person did not settle');
  time.scale = 0.1;
  await lab.press('KeyV');
  const neck = G.player.model.joints!.neck;
  let nearFrames = 0, exposed = 0;
  await lab.step(400, () => ({}), () => {
    if (viewMode() !== 'first') return;
    const near = neck.getWorldPosition(new THREE.Vector3()).distanceTo(G.camera.position) < 0.8;
    if (!near) return;
    nearFrames++;
    neck.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && object.layers.test(G.camera.layers)
        && !object.layers.isEnabled(HIDDEN_LAYER)) exposed++;
    });
  });
  check(nearFrames > 0 && exposed === 0, `slow first-person entry exposed head meshes (${exposed}, ${nearFrames} nearby frames)`);
  lines.push(`0.1x first-person entry: ${nearFrames} nearby frames, ${exposed} exposed head meshes`);
  G.player.guardUntil = 0;
  G.player.takeDamage(1e9, 'physical', null);
  check(!G.player.alive, 'death recovery control did not kill the hero');
  await action('reset');
  check(running() && G.player.alive && G.run?.wave === 1, 'Reset did not restart the wave after death');
  await action('lobby');
  return { text: lines.join('\n'), problems, moments };
}
