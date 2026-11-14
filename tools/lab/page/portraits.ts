// Verify optional portrait downloads through the real co-op picker; only image resource requests count.
import type { Lab, Report, Pictured } from './lab';
import { realWait } from './lab';
import { touchMode } from './uiTouch';
import { G } from '../../../src/state';
import { role } from '../../../src/net/role';
import { renderCoop, updateCoopHud } from '../../../src/ui/coop';
import { portraitIds, portraitOf, savePortrait, receivePortrait } from '../../../src/net/portraits';
import { portraitUrl } from '../../../src/ui/portraitArt';
import { classOutline } from '../../../src/ui/classOutlines';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { portraitHtml, syncPortrait } from '../../../src/ui/portraitPicker';
import type { Player } from '../../../src/entities/player';

/** Plant another class's image request and require the resource audit to catch it. */
export interface PortraitOptions {
  canary: boolean;
}

const element = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

/** The classes whose actual image resources were requested, excluding the manifest's JavaScript. */
function requestedClasses(): string[] {
  const classes = performance.getEntriesByType('resource').flatMap((entry) => {
    const match = entry.name.match(/portrait-(mage|warrior|ranger)-\d{2}[^/]*\.webp/);
    return match ? [match[1]] : [];
  });
  return [...new Set(classes)];
}

/** Read the UI's actual downloads and choices without assuming the manifest's bookkeeping is correct. */
export async function portraits(lab: Lab, options: PortraitOptions): Promise<Report> {
  performance.setResourceTimingBufferSize(4096); // Boot assets can fill the browser's default 250-entry buffer.
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) problems.push(message);
  };
  const classId = G.player.cls.id;
  check(requestedClasses().length === 0, 'portraits downloaded before the picker or a choice needed them');
  check(portraitOf(G.player) === null, 'the default was not None');
  renderCoop();
  element('#coop').classList.remove('hidden');
  const summary = element('#coop .portrait-picker summary');
  await lab.clickOn(summary);
  await realWait(0); // details dispatches toggle on the browser's clock, after the click.
  const images = [...document.querySelectorAll<HTMLImageElement>('#coop .portrait-options img')];
  await Promise.all(images.map((image) => image.decode()));
  await realWait(0);
  check(images.length === portraitIds(classId).length, 'picker did not show the enabled male portraits');
  check(requestedClasses().every((loaded) => loaded === classId), 'picker downloaded another class');
  check(requestedClasses().includes(classId), 'picker image downloads were not recorded');
  check(document.querySelectorAll('#coop .portrait-option').length === 5, 'portraits are not exactly five');
  check(Boolean(document.querySelector('#coop .portrait-clear [aria-label="No portrait"]')),
    'None is not outside the portrait row');
  const tops = images.map((image) => image.getBoundingClientRect().top);
  check(tops.every((top) => Math.abs(top - tops[0]) < 1), 'the five portraits wrap onto another row');
  moments.push(await lab.screen('portrait-picker'));
  await lab.clickOn(element('#coop .portrait-option[aria-label="Portrait 1"]'));
  const first = portraitIds(classId)[0];
  check(portraitOf(G.player) === first, 'selecting a portrait did not keep it');
  const preview = document.querySelector<HTMLImageElement>('#coop summary .party-portrait');
  check(Boolean(preview?.src), 'selected portrait did not appear in the preview');

  // Exercise the partner rendering path too, and verify clearing removes the image instead of loading a default.
  const partner = { local: false, cls: { id: classId } } as Player;
  receivePortrait(partner, first);
  const listPicture = document.createElement('span');
  syncPortrait(listPicture, partner);
  check(listPicture.querySelectorAll('img').length === 1, 'partner picture did not render');
  receivePortrait(partner, null);
  syncPortrait(listPicture, partner);
  check(!listPicture.querySelector('img'), 'cleared portrait still made an image');
  check(!listPicture.hidden && Boolean(listPicture.querySelector('svg.party-portrait.outline')),
    'a player with no portrait showed no class outline');
  const outlines = CLASS_IDS.map((id) => classOutline(id));
  check(new Set(outlines).size === CLASS_IDS.length, 'two classes share an outline');
  await lab.clickOn(element('#coop .portrait-picker summary'));
  await realWait(0);
  await lab.clickOn(element('#coop .portrait-none[aria-label="No portrait"]'));
  check(portraitOf(G.player) === null && !portraitHtml(G.player).includes('<img'), 'None retained a portrait image');
  check(!document.querySelector('#coop summary img'), 'None retained a preview image');
  const previousRole = role.current;
  const life = G.player.life;
  const hudHidden = element('#hud').classList.contains('hidden');
  const menuHidden = element('#menu').classList.contains('hidden');
  const screen = { width: innerWidth, height: innerHeight, ratio: devicePixelRatio };
  try {
    element('#coop').classList.add('hidden');
    element('#menu').classList.add('hidden');
    element('#hud').classList.remove('hidden');
    role.current = 'host';
    savePortrait(classId, first);
    updateCoopHud();
    await (element('#party .self img') as HTMLImageElement).decode();
    check(element('#party').firstElementChild?.classList.contains('self') === true,
      'current player card was not first in the top-left list');
    const card = element('#party .self');
    check(!card.textContent?.includes('You · '), 'current player card still said You');
    check(element('#party .self .pf-class').textContent === G.player.cls.name, 'card class was missing');
    const probe = document.createElement('span');
    probe.style.color = G.player.cls.accent;
    card.appendChild(probe);
    check(getComputedStyle(element('#party .self .pf-class')).color === getComputedStyle(probe).color,
      'class colour differed from Hero Selection');
    probe.remove();
    const border = getComputedStyle(card);
    check(parseFloat(border.borderLeftWidth) >= 3 && border.borderLeftStyle === 'solid'
      && [border.borderTopWidth, border.borderRightWidth, border.borderBottomWidth].every((width) => parseFloat(width) === 0),
      'own card did not have a thick plain border on the left only');
    check(!card.querySelector('.pf-host'), 'Host text still occupied a separate row');
    const picture = element('#party .self .pf-portrait');
    check(picture.classList.contains('host') === (G.player.slot === 0), 'host star showed for the wrong player');
    if (G.player.slot === 0) {
      const star = getComputedStyle(picture, '::after');
      check(star.content.includes('★') && star.position === 'absolute' && star.left === '1px' && star.bottom === '0px',
        'host star was not over the bottom-left corner of the portrait');
    }
    for (const [width, height] of [[1024, 700], [1920, 1080], [844, 390], [1180, 820], [820, 1180]]) {
      await lab.showOn({ width, height, ratio: 1 });
      if (width <= 1180 && width !== 1024) await touchMode(lab);
      const name = element('#party .self .pf-name').getBoundingClientRect();
      const cls = element('#party .self .pf-class').getBoundingClientRect();
      const content = element('#party .self .pf-content').getBoundingClientRect();
      check(Math.abs(name.top - cls.top) < 2 && name.right <= cls.left && Math.abs(cls.right - content.right) < 2,
        `${width}x${height}: name and class were not left/right on one line`);
      check(card.scrollWidth <= card.clientWidth, `${width}x${height}: card content overflowed`);
      moments.push(await lab.screen(`player-card-${width}x${height}`, [], '#party'));
    }
    G.player.life = G.player.stats.maxLife / 2;
    updateCoopHud();
    check(element('#party .self .pf-fill').style.width === '50%', 'own card health was not updated');
  } finally {
    G.player.life = life;
    await lab.showOn(screen);
    element('#hud').classList.toggle('hidden', hudHidden);
    element('#menu').classList.toggle('hidden', menuHidden);
    role.current = previousRole;
    updateCoopHud();
  }
  check(!document.querySelector('#party .self'), 'own co-op card remained after leaving co-op');
  if (options.canary) {
    const other = classId === 'mage' ? 'warrior' : 'mage';
    const image = new Image();
    image.src = portraitUrl(portraitIds(other)[0])!;
    await image.decode();
    await realWait(0);
    check(requestedClasses().includes(other), 'canary: another class download went unnoticed');
  }
  element('#coop').classList.add('hidden');
  savePortrait(classId, null);
  return {
    text: 'None at boot; enabled male image downloads on open; selection, partner rendering and clearing checked',
    problems,
    moments,
  };
}
