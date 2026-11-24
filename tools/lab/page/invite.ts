// `lab invite`'s side of a page (tools/lab/node/inviteCheck.mjs): the developer panel's Agent section, its question
// and its badge worked as the player works them (the browser's own clicks, `lab.clickOn`), and what they show read
// off the page; the game's own state read beside it, for what an agent's steps are checked against.
import { G } from '../../../src/state';
import { session } from '../../../src/net/session';
import { cheats, time } from '../../../src/dev/index';
import { frameApart, frameShot } from '../../../src/core/renderer';
import { freeCamOn } from '../../../src/dev/freeCam';
import { panelOpen, togglePanel } from '../../../src/dev/panel';
import type { Lab } from './lab';

/** What the page shows of an invitation, and the game's state under it. */
export interface InviteState {
  /** the panel's section: whether Invite agent can be pressed, the command it shows, its note */
  canInvite: boolean; command: string; note: string;
  /** the question up, and its line about cloud saves; the badge up */
  asked: boolean; cloud: string; badge: boolean;
  /** the game's own: its co-op session, its hero's class, god mode, the panel's wave field, the free camera */
  session: string; heroClass: string; god: boolean; wave: string; flying: boolean;
  /** what an agent's code left on the page (`window.__invite`), if anything */
  marks: string[];
  /** the panel's line on what an agent made (none while nothing is), and the made things' groups in the scene */
  made: string; groups: string[];
}

const text = (element: Element | null): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const shown = (selector: string): boolean => {
  const element = document.querySelector(selector);
  return Boolean(element && !element.classList.contains('hidden'));
};
const marks = (): string[] => ((window as unknown as { __invite?: string[] }).__invite ?? []);

/** What the page shows now. */
export function inviteState(): InviteState {
  const invite = document.querySelector<HTMLButtonElement>('#dev-panel [data-agent=invite]');
  return {
    canInvite: Boolean(invite && !invite.disabled),
    command: document.querySelector<HTMLInputElement>('#dev-panel [data-agent=command]')?.value ?? '',
    note: text(document.querySelector('#dev-panel .dv-agent-note')),
    asked: shown('#dev-agent-ask'), cloud: text(document.querySelector('#dev-agent-ask .da-cloud')),
    badge: shown('#dev-agent-badge'),
    session: session.status, heroClass: G.player.cls.id, god: cheats.god,
    wave: document.querySelector<HTMLInputElement>('#dev-panel [data-in=wave]')?.value ?? '', flying: freeCamOn(),
    marks: [...marks()],
    made: shown('#dev-panel .dv-agent-made') ? text(document.querySelector('#dev-panel .dv-agent-made span')) : '',
    groups: G.scene.children.filter((each) => each.name.startsWith('agent:')).map((each) => each.name),
  };
}

/** One of the invitation's buttons clicked by the mouse (`invite`, `cancel`, `unmake`, `accept`, `refuse`, `kick`, the badge's `draw` and `clear`): the panel
 *  opened first for its own. */
export async function invitePress(lab: Lab, { what }: { what: string }): Promise<void> {
  const inPanel = what === 'invite' || what === 'cancel' || what === 'unmake';
  if (inPanel && !panelOpen()) togglePanel(true);
  const button = document.querySelector<HTMLElement>(`[data-agent=${what}]`);
  if (!button) throw new Error(`lab: invite: the page has no ${what} button`);
  if (inPanel) button.scrollIntoView({ block: 'center' });
  await lab.clickOn(button);
}

/** The developer panel put away: it lies over the left of the screen, where another dialog's buttons may be. */
export function invitePanelAway(): void {
  if (panelOpen()) togglePanel(false);
}

/** Frames run: the game reads co-op's state and counts a picture's frames by them. `drawn`: each drawn too (the lab
 *  steps without drawing otherwise), as a picture is taken from a frame as it's drawn. */
export async function inviteStep(lab: Lab, { frames, drawn }: { frames: number; drawn: boolean }): Promise<void> {
  const drawing = lab.drawing;
  lab.drawing = drawing || drawn;
  try {
    await lab.step(frames);
  } finally {
    lab.drawing = drawing;
  }
}

/** How much a picture an agent was sent shows: its size as decoded, and how far its pixels' brightness ranges
 *  (0 to 255: a blank frame's is 0). */
export async function invitePictureStats(_lab: Lab, { type, data }: { type: string; data: string }): Promise<{ width: number; height: number; range: number }> {
  const blob = await (await fetch(`data:${type};base64,${data}`)).blob();
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let least = 255, most = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    least = Math.min(least, light);
    most = Math.max(most, light);
  }
  return { width: image.width, height: image.height, range: Math.round(most - least) };
}

/** how far a pixel's brightness must differ (0 to 255) to count as changed */
const CHANGED = 24;

/** A picture's pixels, decoded. */
async function pixelsOf(type: string, data: string): Promise<ImageData> {
  const image = await createImageBitmap(await (await fetch(`data:${type};base64,${data}`)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** The share of two pictures' middles (the middle third each way, where a placed camera looks) whose pixels differ. */
export async function invitePictureDiff(_lab: Lab, { type, a, b }: { type: string; a: string; b: string }): Promise<number> {
  const one = await pixelsOf(type, a), other = await pixelsOf(type, b);
  if (one.width !== other.width || one.height !== other.height) throw new Error('lab: invite: two pictures of two sizes');
  let changed = 0, count = 0;
  for (let y = Math.floor(one.height / 3); y < (one.height * 2) / 3; y++) {
    for (let x = Math.floor(one.width / 3); x < (one.width * 2) / 3; x++) {
      const i = (y * one.width + x) * 4;
      const light = (data: Uint8ClampedArray): number => (data[i] + data[i + 1] + data[i + 2]) / 3;
      count++;
      if (Math.abs(light(one.data) - light(other.data)) > CHANGED) changed++;
    }
  }
  return changed / count;
}

/** Whether a picture from a camera of the agent's own waits for the next frame (`frameApart`). */
export const inviteApartAsked = (): boolean => frameApart.take !== null;

/** The next frame as the player is shown it (the engine's canvas after the frame's own draw). */
async function frameShown(lab: Lab): Promise<ImageData> {
  const taken = new Promise<HTMLCanvasElement>((resolve) => {
    frameShot.take = resolve;
  });
  await inviteStep(lab, { frames: 1, drawn: true });
  const canvas = await taken;
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * The frame an agent's picture from its own camera is drawn in, against the frame before it, the game frozen between
 * them: the share of the player's frame that changed (none, if the picture is drawn apart from it). Call with the
 * picture asked for and waiting (`inviteApartAsked`). `leak`, the canary: the game's camera left where the agent's
 * stood as its picture was handed over, so the frame's own draw is from there.
 */
export async function inviteFrameBeside(lab: Lab, { leak }: { leak: boolean }): Promise<{ changed: number; taken: boolean }> {
  const asked = frameApart.take;
  if (!asked) throw new Error('lab: invite: no picture from a camera of its own is waiting');
  const frozen = time.frozen;
  time.frozen = true;
  try {
    // (the picture held back for the frame before it)
    frameApart.take = null;
    const before = await frameShown(lab);
    let taken = false;
    frameApart.take = {
      camera: asked.camera,
      taken(canvas) {
        taken = true;
        if (leak) {
          G.camera.position.copy(asked.camera.position);
          G.camera.quaternion.copy(asked.camera.quaternion);
          G.camera.updateMatrixWorld();
        }
        asked.taken(canvas);
      },
    };
    const beside = await frameShown(lab);
    let changed = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      const light = (data: Uint8ClampedArray): number => (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (Math.abs(light(before.data) - light(beside.data)) > CHANGED) changed++;
    }
    return { changed: changed / (before.data.length / 4), taken };
  } finally {
    time.frozen = frozen;
  }
}
