// Developer controls and an unmistakable mode label, installed only by the developer module.
export function initDevHelp(): void {
  const label = document.createElement('div');
  label.className = 'dv-mode-label';
  label.textContent = 'Dev mode enabled';
  document.querySelector('#pause .pb-tabs')!.before(label);
  const help = document.createElement('section');
  help.className = 'dv-help';
  help.setAttribute('aria-label', 'Dev mode controls');
  const general = [
    ['F8', 'Open / close the developer panel'], ['F7', 'Freeze / resume the simulation'], ['F9', 'Enter / leave free camera'],
  ];
  const camera = [
    ['WASD / arrows', 'Fly'], ['Q / E', 'Fly down / up'], ['Drag', 'Look around'], ['Wheel', 'Change flight speed (shown in the hint)'],
    ['Shift / Ctrl', 'Fly faster / slower'], ['F', 'Freeze / resume while flying'], ['.', 'One frame forward while frozen'], ['R', 'Move the free camera back over the hero'],
  ];
  const rows = (list: string[][]): string => `<dl>${list.map(([key, action]) => `<div><dt><kbd>${key}</kbd></dt><dd>${action}</dd></div>`).join('')}</dl>`;
  help.innerHTML = `<h3>Developer controls</h3>${rows(general)}
    <h3>Free camera controls</h3><p>Free camera freezes the game on entry. While flying, its controls replace the hero’s.</p>${rows(camera)}
    <p>Touch: choose the Dev tab or edge tab to open the panel. Free camera has fly, Freeze and Leave buttons.</p>`;
  document.querySelector('#pause [data-pause-page=controls]')!.prepend(help);
}
