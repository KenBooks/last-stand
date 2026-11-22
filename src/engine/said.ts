// What the engine or the GPU says while it draws, shown on the page: a pipeline or a pass the GPU refuses draws
// nothing and says so on the console alone (wgpu logs the device's uncaptured errors there), which a phone doesn't
// show. From play, a phone's village all black with every count of the frame as it should be, and nothing to read.
// The first few things said are kept (`saidSoFar`) and written small at the page's foot, to read or to picture.

/** how many different things are kept, and how much of each is shown */
const KEPT = 4;
const SHOWN = 420;

const said: string[] = [];
let box: HTMLElement | null = null;

/** What's been said so far, the first of each, oldest first. */
export const saidSoFar = (): readonly string[] => said;

function show(): void {
  if (!box) {
    box = document.createElement('pre');
    box.id = 'rust-said';
    box.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;margin:0;padding:4px 6px;z-index:99999;'
      + 'font:10px/1.25 monospace;color:#ffb3a8;background:rgba(40,0,0,0.82);white-space:pre-wrap;'
      + 'pointer-events:none;max-height:40vh;overflow:hidden';
    document.body.append(box);
  }
  box.textContent = said.map((line, at) => `${at + 1}. ${line.slice(0, SHOWN)}`).join('\n');
}

/** From here on, what's said as an error on the console is kept and shown. Once. */
export function keepWhatsSaid(): void {
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => {
    consoleError(...parts);
    const line = parts.map(String).join(' ');
    if (said.length >= KEPT || said.includes(line)) return;
    said.push(line);
    show();
  };
}
