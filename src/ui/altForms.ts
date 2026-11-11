// Range dragging and select lists for the Alt cursor, without opening an OS popup or releasing mouse look.
interface Point { x: number; y: number }
let range: { input: HTMLInputElement; initial: string } | null = null;
let picker: { select: HTMLSelectElement; menu: HTMLElement; active: number } | null = null;

export function beginAltRange(target: Element | null, at: Point): boolean {
  if (!(target instanceof HTMLInputElement) || target.type !== 'range' || target.disabled) return false;
  range = { input: target, initial: target.value };
  target.focus({ preventScroll: true });
  dragAltRange(at);
  return true;
}

export function dragAltRange(at: Point): void {
  if (!range) return;
  const field = range.input, box = field.getBoundingClientRect(), style = getComputedStyle(field);
  const vertical = style.writingMode.startsWith('vertical');
  const size = vertical ? box.height : box.width;
  // Native range thumbs are 16 CSS px; account for the UI's zoom when measuring their travel.
  const inset = Math.min(size / 2, 8 * size / Math.max(1, vertical ? field.offsetHeight : field.offsetWidth));
  let share = Math.max(0, Math.min(1, ((vertical ? at.y - box.top : at.x - box.left) - inset) / Math.max(1, size - inset * 2)));
  if (style.direction === 'rtl') share = 1 - share;
  const min = Number(field.min) || 0, max = field.max === '' ? 100 : Number(field.max);
  const step = field.step === 'any' ? 0 : Number(field.step) || 1;
  let value = min + share * (max - min);
  if (step > 0) value = min + Math.round((value - min) / step) * step;
  const before = field.value;
  field.valueAsNumber = Math.max(min, Math.min(max, Number(value.toPrecision(12))));
  if (field.value !== before) field.dispatchEvent(new Event('input', { bubbles: true }));
}

export function endAltRange(): boolean {
  if (!range) return false;
  const { input, initial } = range;
  range = null;
  if (input.value !== initial) input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
  return true;
}

export function closeAltSelect(): void {
  if (!picker) return;
  const { select, menu } = picker;
  picker = null;
  select.setAttribute('aria-expanded', 'false');
  select.removeAttribute('aria-controls');
  menu.remove();
}

export function outsideAltSelect(target: Element | null): void {
  if (picker && target !== picker.select && !picker.menu.contains(target)) closeAltSelect();
}

function choose(index: number): void {
  if (!picker) return;
  const { select, menu } = picker;
  if (menu.querySelector<HTMLButtonElement>(`[data-option="${index}"]`)?.disabled) return;
  const changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  closeAltSelect();
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function highlight(index: number): void {
  if (!picker) return;
  picker.active = index;
  for (const button of picker.menu.querySelectorAll<HTMLElement>('[data-option]')) {
    button.classList.toggle('active', Number(button.dataset.option) === index);
  }
  picker.menu.setAttribute('aria-activedescendant', `alt-option-${index}`);
}

export function openAltSelect(select: HTMLSelectElement): void {
  const same = picker?.select === select;
  closeAltSelect();
  if (same || select.disabled) return;
  const menu = document.createElement('div');
  menu.id = 'alt-select'; menu.className = 'alt-select'; menu.tabIndex = -1;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', select.getAttribute('aria-label') ?? select.dataset.in ?? 'Options');
  for (const [index, option] of [...select.options].entries()) {
    const button = document.createElement('button');
    button.type = 'button'; button.tabIndex = -1; button.id = `alt-option-${index}`;
    button.dataset.option = String(index); button.textContent = option.label;
    button.disabled = option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
    button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.selected));
    menu.append(button);
  }
  const box = select.getBoundingClientRect(), style = getComputedStyle(select);
  const scale = box.height / Math.max(1, select.offsetHeight);
  menu.style.minWidth = `${box.width}px`;
  menu.style.fontFamily = style.fontFamily;
  menu.style.fontSize = `${parseFloat(style.fontSize) * scale}px`;
  menu.style.setProperty('--alt-option-height', `${Math.max(24, box.height)}px`);
  document.body.append(menu);
  const size = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(box.left, innerWidth - size.width - 8))}px`;
  menu.style.top = `${box.bottom + size.height + 4 <= innerHeight - 8 ? box.bottom + 4 : Math.max(8, box.top - size.height - 4)}px`;
  picker = { select, menu, active: select.selectedIndex };
  highlight(select.selectedIndex);
  select.setAttribute('aria-expanded', 'true'); select.setAttribute('aria-controls', menu.id);
  menu.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-option]');
    if (button) choose(Number(button.dataset.option));
  });
  menu.focus({ preventScroll: true });
  menu.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
}

export function altSelectKey(event: KeyboardEvent): void {
  if (!picker) return;
  const options = [...picker.menu.querySelectorAll<HTMLButtonElement>('button')].filter((button) => !button.disabled);
  const current = options.findIndex((button) => Number(button.dataset.option) === picker!.active);
  let next = current;
  if (event.key === 'ArrowDown') next = Math.min(options.length - 1, current + 1);
  else if (event.key === 'ArrowUp') next = Math.max(0, current - 1);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = options.length - 1;
  else if (event.key === 'Enter' || event.key === ' ') choose(picker.active);
  else if (event.key === 'Escape' || event.key === 'Tab') closeAltSelect();
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    const found = options.findIndex((button, i) => i > current && button.textContent?.toLowerCase().startsWith(event.key.toLowerCase()));
    next = found >= 0 ? found : options.findIndex((button) => button.textContent?.toLowerCase().startsWith(event.key.toLowerCase()));
  }
  else return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (picker && options[next]) {
    highlight(Number(options[next].dataset.option));
    options[next].scrollIntoView({ block: 'nearest' });
  }
}
