// The owner's coding session invited into the game he is playing (#529): a button in the developer panel asks our
// relay for an invitation (server/relay/agents.mjs: a room kind of its own, opened for previews and dev builds alone)
// and shows its one-time code to paste to the session (`npm run lab -- join <code>`). When an agent gives that code
// the game asks its player first; nothing the agent sends is read before he lets it in. While one is connected a
// badge says so over everything, with a button to send it away. Solo only: it isn't offered in a co-op room, and
// opening or joining one sends the agent away. The agent is no player: it has no hero and nothing in a save.
//
// What it may do is agentSteps.ts: look, take pictures, set what the panel sets, and run code in this page. That code
// runs as the page's own, so it reaches what the page reaches: this site's storage, with its saves and, where the
// player signed in to cloud saves here, that sign-in. The invitation and the question both say so.
import { session } from '../net/session';
import { serverHttp, serverUp } from '../net/transport';
import { signedIn } from '../loot/cloud';
import { initSteps, runStep, stepsFrame, type AgentStep, type StepHooks } from './agentSteps';
import { madeCount, makesFrame, unmake } from './agentMakes';

type Phase = 'off' | 'opening' | 'invited' | 'asking' | 'connected';
const link = {
  phase: 'off' as Phase,
  ws: null as WebSocket | null,
  code: '',
  /** when the code stops being good unjoined (the browser's clock, ms) */
  until: 0,
  /** what the panel says under the button: how the last invitation ended */
  note: '',
  /** why the relay said it ended, as it closed */
  ended: '',
};
let section: HTMLElement, ask: HTMLElement, badge: HTMLElement;
let shown = '';

const ENDS: Record<string, string> = {
  expired: 'The code expired unused.',
  agent: 'The agent left.',
  coop: 'Co-op opened: the agent was sent away.',
  kicked: 'The agent was sent away.',
  refused: 'The agent was refused.',
  cancelled: 'The invitation was withdrawn.',
};
const WHAT_IT_MAY = 'It can look at the game, take pictures of it, set what this panel sets, build things into the scene and run code in this page.';
const CLOUD = 'You are signed in to cloud saves here: code run in this page can read that sign-in and this site\'s saves.';
const inCoop = (): boolean => session.status !== 'off';
/** the command the owner pastes to his session (the relay named where it isn't the build's own) */
function command(): string {
  const server = serverHttp().replace(/^http/, 'ws');
  const elsewhere = new URLSearchParams(location.search).has('server') ? ` --server ${server}` : '';
  return `npm run lab -- join ${link.code}${elsewhere}`;
}

/** An invitation asked of the relay: its code shown once it answers. */
function invite(): void {
  if (link.phase !== 'off' || inCoop()) return;
  link.phase = 'opening';
  link.note = '';
  link.ended = '';
  const ws = new WebSocket(`${serverHttp().replace(/^http/, 'ws')}/agent/open`);
  link.ws = ws;
  ws.onmessage = (event) => {
    if (link.ws !== ws || typeof event.data !== 'string') return;
    let message: { t?: string; code?: string; ttl?: number; why?: string; d?: unknown };
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.t === 'invite' && typeof message.code === 'string') {
      link.phase = 'invited';
      link.code = message.code;
      link.until = Date.now() + (message.ttl ?? 0);
    } else if (message.t === 'asks' && link.phase === 'invited') link.phase = 'asking';
    else if (message.t === 'end') link.ended = message.why ?? '';
    // (an agent's step: read only once the player has let it in)
    else if ('d' in message && link.phase === 'connected') void answer(ws, message.d);
    render();
  };
  ws.onclose = () => {
    if (link.ws !== ws) return;
    if (link.phase !== 'opening') { end(ENDS[link.ended] ?? 'The link to the relay was lost.'); return; }
    end('The relay opened no invitation.');
    void whyRefused().then((why) => { if (link.phase === 'off' && link.note === 'The relay opened no invitation.') { link.note = why; render(); } });
  };
  render();
}

/** Why the relay opened no invitation, as far as the page can tell: it is down, it is a relay from before agent rooms
 *  (a preview is served by main's relay: a relay change reaches it only once merged and deployed), or this page isn't
 *  one it opens them for. */
async function whyRefused(): Promise<string> {
  if (!await serverUp()) return 'The relay is offline, so no agent can be invited right now.';
  const ours = /^(pr|c)-[a-z0-9-]+\.ls\.wellscoped\.dev$/.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return ours
    ? 'The relay is up but opened no invitation: it has no agent rooms yet (they come with the relay deployed from main), or too many invitations are open.'
    : 'The relay opens invitations for PR previews and dev builds alone, not for this page.';
}

/** A step run and answered: its result, or what went wrong. */
async function answer(ws: WebSocket, step: unknown): Promise<void> {
  const id = (step as { id?: unknown } | null)?.id;
  let reply: Record<string, unknown>;
  try {
    if (!step || typeof step !== 'object') throw new Error('a step is an object');
    reply = { id, ok: true, result: await runStep(step as AgentStep) };
  } catch (error) {
    reply = { id, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
  if (link.ws !== ws || link.phase !== 'connected' || ws.readyState !== WebSocket.OPEN) return;
  let text: string;
  try { text = JSON.stringify({ d: reply }); } catch (error) { text = JSON.stringify({ d: { id, ok: false, error: `the result can't be sent: ${(error as Error).message}` } }); }
  ws.send(text);
}

/** The link closed, whoever ended it, and the panel saying why. */
function end(note: string): void {
  const ws = link.ws;
  link.ws = null;
  link.phase = 'off';
  link.code = '';
  link.note = note;
  if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
  render();
}

function accept(): void {
  if (link.phase !== 'asking' || !link.ws) return;
  link.ws.send(JSON.stringify({ t: 'accept' }));
  link.phase = 'connected';
  render();
}

/** Whether an agent is connected now (a harness's read). */
export const agentConnected = (): boolean => link.phase === 'connected';

/** Once a frame (index.ts): co-op opened sends the agent away and withdraws an invitation; an unjoined code's time
 *  runs down; what an agent made is shown in its place and moved by the game's step `dt` (s). */
export function agentFrame(dt: number): void {
  stepsFrame();
  makesFrame(dt);
  if (link.phase !== 'off' && inCoop()) end(ENDS.coop);
  render();
}

/** The panel's section, the question and the badge as things stand, written only when they change. */
function render(): void {
  if (!section) return;
  const left = link.phase === 'invited' ? Math.max(0, Math.ceil((link.until - Date.now()) / 60_000)) : 0;
  const state = [link.phase, link.code, link.note, inCoop(), left, signedIn(), madeCount()].join('|');
  if (state === shown) return;
  shown = state;
  const off = link.phase === 'off';
  const inviteButton = section.querySelector<HTMLButtonElement>('[data-agent=invite]')!;
  inviteButton.disabled = !off || inCoop();
  section.querySelector<HTMLElement>('[data-agent=cancel]')!.classList.toggle('hidden', off || link.phase === 'connected');
  section.querySelector<HTMLElement>('.dv-agent-code')!.classList.toggle('hidden', link.phase !== 'invited');
  section.querySelector<HTMLInputElement>('[data-agent=command]')!.value = link.phase === 'invited' ? command() : '';
  const notes: Record<Phase, string> = {
    off: inCoop() ? 'Leave the co-op room to invite an agent: it joins a solo game alone.' : link.note,
    opening: 'Asking the relay…',
    invited: `Paste this to your coding session. Good for one join, for ${left} min more. ${WHAT_IT_MAY}${signedIn() ? ` ${CLOUD}` : ''}`,
    asking: 'An agent gave the code: answer the question.',
    connected: 'An agent is connected.',
  };
  section.querySelector('.dv-agent-note')!.textContent = notes[link.phase];
  const count = madeCount();
  section.querySelector<HTMLElement>('.dv-agent-made')!.classList.toggle('hidden', count === 0);
  section.querySelector('.dv-agent-made span')!.textContent = `Made by an agent: ${count}`;
  ask.classList.toggle('hidden', link.phase !== 'asking');
  ask.querySelector('.da-cloud')!.textContent = signedIn() ? CLOUD : '';
  badge.classList.toggle('hidden', link.phase !== 'connected');
}

function onClick(event: MouseEvent): void {
  const act = (event.target as HTMLElement).closest<HTMLElement>('[data-agent]')?.dataset.agent;
  if (act === 'invite') invite();
  else if (act === 'cancel') end(ENDS.cancelled);
  else if (act === 'copy') void navigator.clipboard?.writeText(command()).catch(() => { /* the field is there to select */ });
  else if (act === 'command') (event.target as HTMLInputElement).select();
  else if (act === 'accept') accept();
  else if (act === 'refuse') end(ENDS.refused);
  else if (act === 'kick') end(ENDS.kicked);
  else if (act === 'unmake') { unmake(); render(); }
}

/** The panel's Agent section, the question and the badge built (the panel is: `initPanel` first). */
export function initAgent(hooks: StepHooks): void {
  initSteps(hooks);
  const details = document.createElement('details');
  details.open = true;
  section = details;
  section.className = 'dv-agent';
  section.innerHTML = `<summary>Agent</summary>
    <div class="dv-row"><button data-agent="invite" title="Lets your coding session look at this game and run code in it">Invite agent</button><button data-agent="cancel" class="hidden">Withdraw</button></div>
    <div class="dv-row dv-agent-code hidden"><input data-agent="command" readonly aria-label="The command to paste to your coding session"><button data-agent="copy">Copy</button></div>
    <div class="dv-note dv-agent-note"></div>
    <div class="dv-row dv-agent-made hidden"><span></span><button data-agent="unmake" title="Takes what an agent built into the scene out of it">Remove</button></div>`;
  const panel = document.getElementById('dev-panel')!;
  panel.insertBefore(section, panel.querySelector('.dv-scroll-cue'));

  ask = document.createElement('div');
  ask.id = 'dev-agent-ask';
  ask.className = 'hidden';
  ask.setAttribute('role', 'alertdialog');
  ask.innerHTML = `<div class="da-box"><b>An agent wants to join</b>
    <p>It gave the code you invited it with. ${WHAT_IT_MAY} Nothing runs until you let it in.</p>
    <p class="da-cloud"></p>
    <div class="da-acts"><button data-agent="accept">Let it in</button><button data-agent="refuse">Refuse</button></div></div>`;
  badge = document.createElement('div');
  badge.id = 'dev-agent-badge';
  badge.className = 'hidden';
  badge.innerHTML = '<span>Agent connected</span><button data-agent="kick" title="Send the agent away">Kick</button>';
  document.body.append(ask, badge);
  for (const piece of [section, ask, badge]) piece.addEventListener('click', onClick);
  // (the code's minutes while the panel is open and no frame is drawn to count them)
  setInterval(render, 5000);
  render();
}
