// What the developer panel sets, as an invited agent reads and sets it (agent.ts, #529): the panel's own controls,
// found on the page by what they're marked with and worked as a click or a typed value works them, so the agent sets
// exactly what the owner can, through the same code, and a control added to the panel is the agent's too.
import { refreshPanel } from './panel';

/** One of the panel's controls: its name, what it holds now, and what it may be set to where that's a list. */
export interface PanelControl {
  name: string;
  /** `toggle`: on or off; `press`: a button, set to anything to press it (or to one of its `options`); `choice`: one
   *  of its `options`; `value`: a number or a text; `check`: ticked or not */
  kind: 'toggle' | 'press' | 'choice' | 'value' | 'check';
  value: boolean | string | number | null;
  options?: string[];
  disabled?: boolean;
}

const panel = (): HTMLElement => {
  const found = document.getElementById('dev-panel');
  if (!found) throw new Error('the developer panel is not built yet');
  return found;
};
const all = <T extends HTMLElement>(selector: string): T[] => [...panel().querySelectorAll<T>(selector)];
/** buttons that come in a set, one of them lit or each pressed with its own value: the set's name, and its mark */
const SETS: { name: string; data: string; kind: 'choice' | 'press' }[] = [
  { name: 'speed', data: 'speed', kind: 'choice' },
  { name: 'overlay', data: 'perf', kind: 'choice' },
  { name: 'class', data: 'class', kind: 'choice' },
  { name: 'spawn', data: 'spawn', kind: 'press' },
  { name: 'style', data: 'style', kind: 'press' },
];
const PART = 'part:';
/** a set's button's value: what it's marked with, a weapon style's by its name */
const setValue = (button: HTMLElement, data: string): string =>
  (data === 'style' ? button.textContent ?? '' : button.dataset[data] ?? '');

/** Every control of the panel as it stands. */
export function panelControls(): PanelControl[] {
  refreshPanel();
  const controls: PanelControl[] = [];
  for (const button of all<HTMLButtonElement>('button[data-act]')) {
    const toggle = button.classList.contains('dv-tog');
    controls.push({
      name: button.dataset.act!, kind: toggle ? 'toggle' : 'press',
      value: toggle ? button.classList.contains('on') : null, disabled: button.disabled || undefined,
    });
  }
  for (const set of SETS) {
    const buttons = all<HTMLButtonElement>(`button[data-${set.data}]`);
    if (!buttons.length) continue;
    const lit = buttons.find((button) => button.classList.contains('on'));
    controls.push({
      name: set.name, kind: set.kind, value: set.kind === 'choice' && lit ? setValue(lit, set.data) : null,
      options: buttons.map((button) => setValue(button, set.data)),
    });
  }
  for (const field of all<HTMLInputElement | HTMLSelectElement>('[data-in]')) {
    const name = field.dataset.in!;
    if (field instanceof HTMLSelectElement) {
      controls.push({ name, kind: 'choice', value: field.value, options: [...field.options].map((o) => o.value) });
    } else if (field.type === 'checkbox') controls.push({ name, kind: 'check', value: field.checked });
    else controls.push({ name, kind: 'value', value: field.type === 'text' ? field.value : Number(field.value) });
  }
  for (const part of all<HTMLInputElement>('[data-part]')) {
    controls.push({ name: PART + part.dataset.part!, kind: 'check', value: part.checked, disabled: part.disabled || undefined });
  }
  return controls;
}

function press(button: HTMLButtonElement, name: string): void {
  if (button.disabled) throw new Error(`${name} can't be pressed now (it's disabled in the panel)`);
  button.click();
}

const asBoolean = (value: unknown, name: string): boolean => {
  if (value === true || value === 'true' || value === 'on' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'off' || value === 0 || value === '0') return false;
  throw new Error(`${name} is on or off: give true or false, not ${JSON.stringify(value)}`);
};

/** One control set to `value`, as the owner's own click or typing sets it. Throws, saying what it takes, at a name
 *  the panel hasn't or a value it can't hold. */
export function setControl(name: string, value: unknown): void {
  refreshPanel();
  if (name.startsWith(PART)) {
    const key = name.slice(PART.length);
    const part = all<HTMLInputElement>('[data-part]').find((each) => each.dataset.part === key);
    if (!part) throw new Error(`no part "${key}" in the panel's frame parts`);
    if (part.disabled) throw new Error(`${name} can't be changed while the panel profiles`);
    if (part.checked !== asBoolean(value, name)) part.click();
    return;
  }
  const set = SETS.find((each) => each.name === name);
  if (set) {
    const buttons = all<HTMLButtonElement>(`button[data-${set.data}]`);
    const wanted = buttons.find((button) => setValue(button, set.data) === String(value));
    if (!wanted) throw new Error(`${name} takes one of ${buttons.map((button) => setValue(button, set.data)).join(', ')}`);
    if (set.kind === 'press' || !wanted.classList.contains('on')) press(wanted, name);
    return;
  }
  const button = all<HTMLButtonElement>('button[data-act]').find((each) => each.dataset.act === name);
  if (button) {
    const toggle = button.classList.contains('dv-tog');
    if (!toggle || button.classList.contains('on') !== asBoolean(value, name)) press(button, name);
    return;
  }
  const field = all<HTMLInputElement | HTMLSelectElement>('[data-in]').find((each) => each.dataset.in === name);
  if (!field) throw new Error(`the panel has no "${name}" (look lists its controls)`);
  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    if (field.checked !== asBoolean(value, name)) field.click();
    return;
  }
  if (field instanceof HTMLSelectElement && ![...field.options].some((option) => option.value === String(value))) {
    throw new Error(`${name} takes one of ${[...field.options].map((option) => option.value).join(', ')}`);
  }
  field.value = String(value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}
