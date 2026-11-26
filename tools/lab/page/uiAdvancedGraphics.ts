// Advanced graphics, through the pause menu's real choices and a change of preset.
import { readCookie, removeCookie, writeCookie } from '../../../src/core/cookies';
import { lampShadowsAllowed } from '../../../src/core/lamps';
import { advancedSetting, qualityLevel, qualitySetting } from '../../../src/core/quality';
import { bloomDrawn } from '../../../src/core/renderer';
import { burst, particles } from '../../../src/fx/particles';
import { isTouch } from '../../../src/ui/touch';
import type { Lab } from './lab';
import { openPause } from './uiPause';
import type { Found } from './uiKit';

const COOKIE = 'last-stand-advanced';
const CHOICES = {
  bloomShare: 0,
  grassSpread: 2,
  floorPlants: false,
  simpleTrees: false,
  particles: 0.5,
  lampShadows: false,
} as const;
type Key = keyof typeof CHOICES;
const KEYS = Object.keys(CHOICES) as Key[];

/** The selected-button regression the lab must detect independently of the saved setting. */
export const ADVANCED_CANARY = { name: 'bloomShare selection', what: 'a wrong selected Bloom button' };

/** Resolve UI targets strictly so missing controls cannot pass as untested. */
function target(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`lab: missing Advanced graphics control ${selector}`);
  return node;
}

/** Press the displayed control with the current input method and its real browser hit target. */
async function press(lab: Lab, node: HTMLElement): Promise<void> {
  if (!isTouch()) {
    await lab.clickOn(node);
    return;
  }
  node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const box = node.getBoundingClientRect();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (!node.contains(document.elementFromPoint(x, y))) {
    throw new Error(`lab: Advanced graphics control ${node.textContent} cannot be tapped`);
  }
  await lab.tap({ x, y });
}

/** Open the native disclosure so the UI lab can picture the controls before changing them. */
export async function openAdvancedGraphics(lab: Lab): Promise<void> {
  openPause('settings', false);
  await press(lab, target('.opt-advanced summary'));
  if (!target('.opt-advanced').hasAttribute('open')) throw new Error('lab: Advanced graphics did not expand');
}

/** Close the disclosure so it does not affect other pause-menu states. */
export function closeAdvancedGraphics(): void {
  target('.opt-advanced').removeAttribute('open');
}

/** Read the active choice from the rendered control, including the empty value for Auto. */
function selectionOk(key: Key, value: string): boolean {
  const selected = document.querySelectorAll<HTMLButtonElement>(`#opt-adv-${key} .active`);
  return selected.length === 1 && selected[0].dataset.v === value;
}

/** Read the outputs affected by Bloom, Lamp shadows and Particles on the live game. */
function outputs(lab: Lab): string {
  const previous = particles.glow.count;
  let spawned: number;
  try {
    burst(lab.player.pos, { count: 8 });
    spawned = particles.glow.count - previous;
  } finally {
    particles.glow.count = previous;
  }
  return `bloom ${bloomDrawn() ? 'on' : 'off'}, lamp shadows ${lampShadowsAllowed() ? 'on' : 'off'}, ${spawned}/8 particles`;
}

/** Check each choice in the UI and cookie, then verify live overrides outlast a preset change and Auto clears them. */
export async function checkAdvancedGraphics(lab: Lab, canary: boolean): Promise<Found> {
  const lines: string[] = [];
  const problems: string[] = [];
  const previousQuality = qualitySetting();
  const previousCookie = readCookie(COOKIE);
  const previousChoices = new Map(KEYS.map((key) => [key, advancedSetting(key)]));
  const checkOutputs = (phase: string, expected: string): void => {
    const actual = outputs(lab);
    lines.push(`  ${phase}: ${actual}`);
    if (actual !== expected) problems.push(`${phase}: expected ${expected}, got ${actual}`);
  };
  const choosePreset = async (level: 'high' | 'medium'): Promise<void> => {
    openPause('performance', false);
    await press(lab, target(`#opt-quality button[data-q="${level}"]`));
    if (qualityLevel() !== level) problems.push(`the ${level} preset did not take effect`);
    openPause('settings', false);
  };
  try {
    await choosePreset('high');
    for (const key of KEYS) {
      await press(lab, target(`#opt-adv-${key} button[data-v="${CHOICES[key]}"]`));
    }
    if (canary) {
      target('#opt-adv-bloomShare button[data-v="0"]').classList.remove('active');
      target('#opt-adv-bloomShare button[data-v="1"]').classList.add('active');
    }
    const kept = JSON.parse(readCookie(COOKIE) ?? '{}') as Record<string, unknown>;
    for (const key of KEYS) {
      if (!selectionOk(key, String(CHOICES[key]))) problems.push(`${key} selection did not show the clicked choice`);
      if (kept[key] !== CHOICES[key]) problems.push(`${key} did not save the clicked value and type`);
    }
    checkOutputs('High overridden', 'bloom off, lamp shadows off, 4/8 particles');
    await choosePreset('medium');
    checkOutputs('Medium overridden', 'bloom off, lamp shadows off, 4/8 particles');

    for (const key of KEYS) {
      await press(lab, target(`#opt-adv-${key} button[data-v=""]`));
      if (!selectionOk(key, '')) problems.push(`${key} did not select Auto`);
    }
    const cleared = JSON.parse(readCookie(COOKIE) ?? '{}') as Record<string, unknown>;
    for (const key of KEYS) {
      if (key in cleared) problems.push(`${key} remained in the cookie after Auto`);
    }
    checkOutputs('Medium restored by Auto', 'bloom on, lamp shadows on, 8/8 particles');
    lines.push(`  ${KEYS.length} controls checked for selected buttons and typed cookie values`);
  } finally {
    // Use the original controls to restore their labels as well as the runtime settings.
    for (const [key, value] of previousChoices) {
      target(`#opt-adv-${key} button[data-v="${value ?? ''}"]`).click();
    }
    if (previousCookie === null) removeCookie(COOKIE);
    else writeCookie(COOKIE, previousCookie);
    target(`#opt-quality button[data-q="${previousQuality}"]`).click();
  }
  return { lines, problems };
}
