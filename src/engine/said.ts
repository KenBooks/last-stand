// The engine's self-check: what failed while it loaded or drew, kept, shown to the player and offered as a report.
// A pipeline a device's GPU refuses draws nothing, and one drawn with made the whole frame invalid: a phone's
// village all black with every count of the frame as it should be, and what the GPU said only on a console the
// phone doesn't show (from the owner: "why are we guessing, add self diagnostics, if anything failed during load,
// show a report message and offer to click send"). Heard here: the device's own errors and its loss, a shader's
// compile messages, a pipeline's refusal (`pipelinesAside.ts`), what the engine logs as an error (its panics), and,
// whatever was or wasn't said, the frame itself drawn black (`watchFrame`: read back small, a few times after the
// load). `lab rustcheck` plants a failure in each and holds this to catching every one (tools/lab/page/rustFaults.ts).
// The first of each is kept with what the device is; a notice at the page's foot says so and sends them as a
// performance report (`perf/consent.ts` `sendFault`), which `lab trace` reads.

/** how many different faults are kept, how much of each, and how much of the first the notice shows */
const KEPT = 12;
const LONGEST = 1500;
const SHOWN = 160;

const faults: string[] = [];
/** what the device is, said once it's made: its adapter, and the limits a refusal may turn on */
let device = '';
let notice: HTMLElement | null = null;
let line: HTMLElement | null = null;

/** The faults so far, the first of each, oldest first. */
export const faultsSoFar = (): readonly string[] => faults;

/** A harness's: the faults forgotten and their notice put away, before its next plant. */
export function clearFaults(): void {
  faults.length = 0;
  blacks = 0;
  notice?.remove();
  notice = line = null;
}

/** the engine's canvas, a small copy of it to read, and how many checks in a row found it black */
let drawn: HTMLCanvasElement | null = null;
let small: CanvasRenderingContext2D | null = null;
let blacks = 0;
/** the copy's size, the brightest a black pixel is (of 255), and the black checks in a row that are a fault */
const SMALL = [16, 9] as const;
const BLACK = 2;
const BLACK_CHECKS = 3;
/** the frames after the load the frame is checked at: three, a second apart at 60 frames a second */
const CHECKED_AT = [90, 150, 210];

/**
 * The frame just drawn checked for being all black, in the task that drew it (the canvas's picture is gone after
 * it): `BLACK_CHECKS` in a row are a fault. A GPU that refuses the frame says so on some devices and not on
 * others; a black frame is black on all of them. Costs a read back from the GPU, so it's asked a few times alone.
 */
export function frameChecked(): void {
  if (!drawn) return;
  small ??= Object.assign(document.createElement('canvas'), { width: SMALL[0], height: SMALL[1] })
    .getContext('2d', { willReadFrequently: true });
  if (!small) return;
  small.drawImage(drawn, 0, 0, SMALL[0], SMALL[1]);
  const pixels = small.getImageData(0, 0, SMALL[0], SMALL[1]).data;
  let brightest = 0;
  for (let at = 0; at < pixels.length; at += 4) brightest = Math.max(brightest, pixels[at], pixels[at + 1], pixels[at + 2]);
  blacks = brightest <= BLACK ? blacks + 1 : 0;
  if (blacks === BLACK_CHECKS) fault('the frame is black', `every pixel of ${drawn.width}x${drawn.height}, ${BLACK_CHECKS} checks in a row`);
}

/** The engine's frame on `canvas` checked at its few frames after the load (`frame` counted from it). */
export function watchFrame(canvas: HTMLCanvasElement, frame: number): void {
  drawn = canvas;
  if (CHECKED_AT.includes(frame)) frameChecked();
}

/** A fault of `kind` kept, and the notice shown: `text` what was said of it. */
export function fault(kind: string, text: string): void {
  const said = `${kind}: ${text}`.slice(0, LONGEST);
  if (faults.length >= KEPT || faults.includes(said)) return;
  faults.push(said);
  show();
}

/** The report's lines: the device, then each fault. */
function report(): string[] {
  return [device || 'the device: not made', ...faults.map((said, at) => `${at + 1}. ${said}`)];
}

function button(label: string, pressed: () => void): HTMLButtonElement {
  const made = document.createElement('button');
  made.textContent = label;
  made.style.cssText = 'font:600 13px/1 system-ui,sans-serif;color:#fff;background:#7a2a20;border:1px solid #e08a7c;'
    + 'border-radius:6px;padding:10px 14px;min-height:40px;cursor:pointer;flex:none';
  made.addEventListener('click', pressed);
  return made;
}

async function send(sender: HTMLButtonElement): Promise<void> {
  sender.disabled = true;
  if (line) line.textContent = 'Sending the report...';
  // (the sender loaded as it's asked for: imported here at the load, it made a cycle through the renderer)
  const { sendFault } = await import('../perf/consent');
  const sent = await sendFault(report());
  if (line) line.textContent = 'code' in sent ? `Report sent, thank you. Its code: ${sent.code}` : `The report couldn't be sent (${sent.error})`;
  sender.disabled = false;
  if ('code' in sent) sender.remove();
}

/** The notice at the page's foot: that the renderer failed, the first fault, Send report and a way to put it away. */
function show(): void {
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'rust-fault';
    notice.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;display:flex;gap:10px;'
      + 'align-items:center;flex-wrap:wrap;padding:8px 10px;border-radius:8px;background:rgba(40,6,4,0.94);'
      + 'border:1px solid #e08a7c;color:#ffd9d2;font:12px/1.35 system-ui,sans-serif;max-height:45vh;overflow:auto';
    line = document.createElement('div');
    line.style.cssText = 'flex:1 1 220px;min-width:0;overflow-wrap:anywhere';
    const sender = button('Send report', () => { void send(sender); });
    const away = button('Dismiss', () => notice?.remove());
    notice.append(line, sender, away);
    document.body.append(notice);
  }
  if (line) line.textContent = `The renderer hit a problem on this device (${faults.length}): ${faults[0].slice(0, SHOWN)}`;
}

interface Info { vendor?: string; architecture?: string; device?: string; description?: string }
interface Message { type: string; message: string; lineNum: number }
interface Module { getCompilationInfo?: () => Promise<{ messages: Message[] }> }
interface Watched {
  addEventListener(type: string, heard: (event: { error?: { message?: string; constructor?: { name?: string } } }) => void): void;
  lost: Promise<{ reason?: string; message?: string }>;
  limits: Record<string, number>;
  features: Iterable<string>;
  adapterInfo?: Info;
  createShaderModule(descriptor: { label?: string }): Module;
}

/** the limits a pipeline or a pass may be refused by, said with the device */
const LIMITS = ['maxTextureDimension2D', 'maxTextureDimension3D', 'maxTextureArrayLayers', 'maxBindingsPerBindGroup',
  'maxSampledTexturesPerShaderStage', 'maxSamplersPerShaderStage', 'maxStorageBuffersPerShaderStage',
  'maxUniformBufferBindingSize', 'maxInterStageShaderVariables', 'maxColorAttachmentBytesPerSample'];

/** The engine's device heard from here on: its errors, its loss, each shader's compile errors. `info` its adapter's. */
export function watchDevice(gpu: object, info: Info | undefined): void {
  const watched = gpu as Watched;
  const adapter = info ?? watched.adapterInfo ?? {};
  const limits = LIMITS.map((name) => `${name} ${watched.limits?.[name]}`).join(', ');
  device = `the device: ${adapter.vendor ?? '?'} ${adapter.architecture ?? ''} ${adapter.device ?? ''} `
    + `${adapter.description ?? ''} | features: ${[...watched.features].join(' ') || 'none'} | ${limits}`;
  watched.addEventListener('uncapturederror', (event) => {
    fault(`the GPU (${event.error?.constructor?.name ?? 'error'})`, event.error?.message ?? 'said nothing');
  });
  void watched.lost.then((lost) => fault('the device was lost', `${lost.reason ?? ''} ${lost.message ?? ''}`));
  const make = watched.createShaderModule;
  watched.createShaderModule = (descriptor) => {
    const module = make.call(watched, descriptor);
    void module.getCompilationInfo?.().then((compiled) => {
      const errors = compiled.messages.filter((message) => message.type === 'error');
      if (errors.length) {
        const first = errors.slice(0, 3).map((message) => `line ${message.lineNum}: ${message.message}`).join(' | ');
        fault(`the shader "${descriptor.label ?? ''}" didn't compile`, first);
      }
    });
    return module;
  };
}

/** From here on, what's logged as an error on the console is a fault (the engine's panics, wgpu's own reports). Once. */
export function keepWhatsSaid(): void {
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => {
    consoleError(...parts);
    fault('said', parts.map(String).join(' '));
  };
}
