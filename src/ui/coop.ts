// Co-op UI: the "Play together" room dialog, the lobby's room bar, and in a run the partners'
// frames and nameplates, the downed state and the revive prompt.
import { G } from '../state';
import { COOP } from '../data/balance';
import { session, hostRoom, joinRoom, leaveRoom, inviteLink, partners } from '../net/session';
import { whenWarm } from '../game/warm';
import { READYING } from './readying';
import { serverUp, SERVER_DOWN } from '../net/transport';
import { isCoop } from '../net/role';
import { cleanTag, savedTag, tagProblem, TAG_MAX } from '../net/nameTag';
import { anchorLabel, removeLabel, project, onLayout } from './floaters';
import { Label, ORDER } from './overlay/layer';
import { ALLY_BAR, ALLY_NAME, barArt, barStep } from './overlay/bars';
import { drawText, measure, OUTLINE, type TextStyle } from './overlay/paint';
import { renderLobbyOptions } from './menus';
import { openSaves } from './saves';
import { isTouch } from './touch';
import { uiScales } from './scale';
import { sfx } from '../core/audio';
import { lookFacing } from '../core/renderer';
import { reportLinks, bindReportLinks } from './netHud';
import { bindColourPicker, colourPickerHtml } from './colourPicker';
import { heroColour } from '../data/heroColours';
import type { Player } from '../entities/player';
import { flyingFree, toggleFree, watchedPlayer, watchNext } from '../game/spectate';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** What a player is called in co-op: its name tag (the hero's class where it has none, solo). */
export function nameOf(p: Player): string {
  if (p.local) return isCoop() && session.tag ? session.tag : p.cls.name;
  return p.tag || p.cls.name;
}

/** a partner's dot in the room's list, in its hero's colour */
const dotColour = (p: Player): string => {
  const c = heroColour(p.colour);
  return c ? ` style="--dot:${c.swatch}"` : '';
};

const who = (p: Player): string => `${nameOf(p)} · ${p.slot === 0 ? 'host' : 'partner'} · ${p.cls.name}`;

let touchRevive = false;
/** a room hosted or joined: before the programs are warm, once they are (a partner's hero is any class) */
const host = whenWarm(['heroes'], (tag: string) => void hostRoom(tag), READYING.coop);
const join = whenWarm(['heroes'], (code: string, tag: string) => void joinRoom(code, tag), READYING.coop);
/** a room code from an invite link, waiting in the dialog for a name tag */
let invited = '';
/** what's wrong with the name tag as last tried, said under it */
let tagNote = '';
/** Whether the touch revive button is held. */
export const touchReviving = (): boolean => touchRevive;

export function initCoop(): void {
  $('#btn-coop').onclick = () => { sfx.click(); openCoop(true); };
  $('#btn-coop-close').onclick = () => { sfx.click(); openCoop(false); };
  $('#coop').onclick = (e) => { if (e.target === $('#coop')) openCoop(false); };
  const rv = $('#btn-revive');
  const hold = (on: boolean) => (e: Event) => { e.preventDefault(); touchRevive = on; };
  rv.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) rv.addEventListener(ev, hold(false));
  bindSpectate();
  renderCoop();
}

/** The watching bar's buttons (`game/spectate.ts`), each a key's touch path: the next and previous partner and free
 *  flight (the camera turns by two fingers twisted, `ui/touch.ts`, as it does everywhere on touch). */
function bindSpectate(): void {
  const bar = $('#spectate');
  $('.sp-prev', bar).onclick = () => watchNext(-1);
  $('.sp-next', bar).onclick = () => watchNext(1);
  $('.sp-free', bar).onclick = () => toggleFree();
}

/** what the watching bar last said: its words changed only as they do */
let barSaid = '';
/** The watching bar: who is watched (or the free camera), and the keys for each of its buttons. */
function sayWatching(bar: HTMLElement): void {
  const free = flyingFree();
  const p = watchedPlayer();
  const name = free ? 'Free camera' : p ? `Watching ${nameOf(p)}` : 'Watching';
  const keys = free ? 'WASD fly · Q / E turn · F follow' : 'LMB next · RMB previous · Q / E turn · F free camera';
  const said = `${name}|${keys}|${free}`;
  if (said === barSaid) return;
  barSaid = said;
  $('.sp-name', bar).textContent = name;
  $('.sp-keys', bar).textContent = keys;
  $('.sp-free', bar).textContent = free ? 'Follow' : 'Free camera';
}

/** the co-op server as last checked: asked each time the dialog opens with no room */
let server: 'checking' | 'up' | 'down' = 'checking';
let checkNo = 0;
async function checkServer(): Promise<void> {
  const n = ++checkNo;
  server = 'checking';
  renderCoop();
  const up = await serverUp();
  if (n !== checkNo) return;
  server = up ? 'up' : 'down';
  renderCoop();
}

/**
 * An invite link: straight into the friend's room as the name tag kept from last time, or with none kept, the room
 * dialog asking for one, the room's code filled in.
 */
export function joinInvited(code: string): void {
  const tag = savedTag();
  if (!tagProblem(tag)) {
    join(code, tag);
    return;
  }
  invited = code;
  openCoop(true);
}

/** The name tag typed in the dialog, or null (said under it, and the field focused) if it can't be used. */
function typedTag(body: HTMLElement): string | null {
  const field = $<HTMLInputElement>('#coop-tag', body);
  const tag = cleanTag(field.value);
  const problem = tagProblem(tag);
  if (problem) {
    tagNote = problem;
    const note = $('.coop-tag-note', body);
    note.textContent = problem;
    note.classList.remove('hidden');
    field.focus();
    return null;
  }
  tagNote = '';
  return tag;
}

function openCoop(open: boolean): void {
  $('#coop').classList.toggle('hidden', !open);
  if (!open) return;
  if (session.status === 'off' || session.status === 'failed') void checkServer();
  else renderCoop();
}

/** The room dialog and the lobby's room bar, for the session as it stands. */
export function renderCoop(): void {
  renderLobbyOptions();
  renderBar();
  const body = $('#coop .coop-body');
  const others = partners();
  const s = session.status;
  if (s === 'off' || s === 'failed') {
    const up = server === 'up';
    // (asked to rename: the tag that was taken, picked for retyping, and the room's code kept to join again)
    const rename = s === 'failed' && session.renameAsked;
    const code = invited || (rename ? session.code : '');
    const tagValue = rename ? session.tag : savedTag();
    body.innerHTML = `
      <p class="coop-intro">Fight side by side over the internet, up to ${COOP.maxPlayers} heroes. Each brings their own hero and gear and keeps their own spoils.</p>
      <p class="coop-intro">Starting over together? <button class="link coop-saves">Pick an empty save slot</button> first: your saved heroes stay as they are.</p>
      ${server === 'down' ? `<div class="coop-offline" role="status"><p>${esc(SERVER_DOWN)}</p><button class="btn" id="btn-coop-retry">Try again</button></div>`
        : server === 'checking' ? '<p class="coop-checking" role="status">Checking the co-op server…</p>'
        : s === 'failed' ? `<p class="coop-error" role="alert">${esc(session.error)}</p>` : ''}
      <label class="coop-tag${rename ? ' taken' : ''}${up ? '' : ' off'}"><span>Your name tag</span>
        <input id="coop-tag" maxlength="${TAG_MAX}" value="${esc(tagValue)}" placeholder="Name" autocomplete="nickname" spellcheck="false" enterkeyhint="done"${up ? '' : ' disabled'}></label>
      <p class="coop-tag-note${tagNote ? '' : ' hidden'}" role="alert">${esc(tagNote)}</p>
      ${colourPickerHtml(false)}
      <div class="coop-choice${up ? '' : ' off'}">
        <div class="coop-col"><div class="coop-h">Host</div><p>Open a room and send your friend the link.</p>
          <button class="btn primary" id="btn-coop-host"${server === 'up' ? '' : ' disabled'}>Open a room</button></div>
        <div class="coop-col"><div class="coop-h">Join</div><p>Enter the code your friend sent.</p>
          <form class="coop-join"><input id="coop-code" maxlength="8" placeholder="CODE" value="${esc(code)}" autocomplete="off" spellcheck="false" aria-label="Room code"${server === 'up' ? '' : ' disabled'}><button class="btn" type="submit"${server === 'up' ? '' : ' disabled'}>Join</button></form></div>
      </div>
      ${reportLinks()}`;
    bindReportLinks(body);
    bindColourPicker(body, false);
    $('#btn-coop-host', body).onclick = () => {
      if (server !== 'up') return;
      const tag = typedTag(body);
      if (tag === null) return;
      sfx.click();
      invited = '';
      host(tag);
    };
    const tagField = $<HTMLInputElement>('#coop-tag', body);
    // (Enter in the name tag: join with the code if there is one, else just done typing)
    tagField.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if ($<HTMLInputElement>('#coop-code', body).value.trim().length >= 4) $<HTMLFormElement>('.coop-join', body).requestSubmit();
      else tagField.blur();
    };
    if (rename && up) {
      tagField.focus();
      tagField.select();
    }
    const retry = $('#btn-coop-retry', body) as HTMLElement | null;
    if (retry) retry.onclick = () => { sfx.click(); void checkServer(); };
    $('.coop-saves', body).onclick = () => { sfx.click(); openCoop(false); openSaves(true); };
    $<HTMLFormElement>('.coop-join', body).onsubmit = (e) => {
      e.preventDefault();
      const typed = $<HTMLInputElement>('#coop-code', body).value.trim();
      if (typed.length < 4 || server !== 'up') return;
      const tag = typedTag(body);
      if (tag === null) return;
      sfx.click();
      invited = '';
      join(typed, tag);
    };
    return;
  }
  if (s === 'joining') {
    body.innerHTML = `<p class="coop-wait">Joining room <b class="coop-code">${esc(session.code)}</b>…</p>
      <p class="coop-intro">Finding the host on the co-op server.</p>
      <button class="btn" id="btn-coop-leave">Cancel</button>
      ${reportLinks()}`;
  } else {
    const list = others.length
      ? others.map((p) => `<li><span class="coop-dot"${dotColour(p)}></span>${esc(who(p))}</li>`).join('')
      : `<li class="coop-wait">Waiting for a friend to join…</li>`;
    body.innerHTML = `
      <div class="coop-room">Room <b class="coop-code">${esc(session.code)}</b></div>
      ${s === 'hosting' ? `<div class="coop-link"><input readonly value="${esc(inviteLink())}" aria-label="Invite link"><button class="btn" id="btn-coop-copy">Copy link</button></div>` : ''}
      <ul class="coop-list">${list}</ul>
      ${colourPickerHtml(true)}
      <p class="coop-intro">${s === 'hosting' ? 'You pick the battleground and start the run; your friends come along.' : 'The host picks the battleground and starts the run.'}
        After each wave everyone decides: bank and leave, or continue together.</p>
      <button class="btn danger" id="btn-coop-leave">Leave room</button>
      ${reportLinks()}`;
    const copy = $('#btn-coop-copy', body) as HTMLElement | null;
    if (copy) copy.onclick = () => {
      sfx.click();
      navigator.clipboard?.writeText(inviteLink()).then(() => { copy.textContent = 'Copied'; }, () => $<HTMLInputElement>('.coop-link input', body).select());
    };
  }
  bindReportLinks(body);
  $('#btn-coop-leave', body).onclick = () => { sfx.click(); leaveRoom(); };
}

/** The lobby's line about the room (hidden solo). */
function renderBar(): void {
  const bar = $('#coop-bar');
  bar.classList.toggle('hidden', session.status === 'off' || session.status === 'failed');
  const others = partners();
  const text = session.status === 'joining' ? `Joining room ${session.code}…`
    : others.length ? `With ${others.map(nameOf).join(', ')}` : 'Waiting for a friend…';
  bar.innerHTML = `<span class="cb-room">Room <b>${esc(session.code)}</b></span><span class="cb-who">${esc(text)}</span>`;
  bar.onclick = () => { sfx.click(); openCoop(true); };
  $('#btn-coop').textContent = isCoop() ? 'Room' : 'Play together';
}

// --- name tags over the heroes ----------------------------------------------------------------
/** A player's name tag over their head (their life under it), and the step of its bar it was last painted at. */
interface NameTag { label: Label; shown: number }
const nameTags = new Map<Player, NameTag>();

/**
 * Whether a player's tag shows: in a room, in the lobby and in a run, every player's, our own too ("name tags should
 * be visible above other players in lobby, and above me as well"); not over one away in the other place, hidden (the
 * hall of heroes hides them), fallen, or our own through our eyes.
 */
const tagShows = (p: Player): boolean => isCoop() && G.players.includes(p) && !p.away && p.obj.visible && p.alive
  && !(p.local && lookFacing() !== null);

function nameTagFor(p: Player): NameTag {
  let t = nameTags.get(p);
  if (t) return t;
  const label = anchorLabel(ORDER.tag, () => (tagShows(p)
    ? { x: p.pos.x, y: p.obj.position.y + p.model.height + 0.45, z: p.pos.z } : null));
  t = { label, shown: -1 };
  nameTags.set(p, t);
  return t;
}

/** Every frame: each player's name tag in a room, painted again when its name or its bar's step changes. */
export function updateNameTags(): void {
  for (const [p, t] of nameTags) {
    if (isCoop() && G.players.includes(p)) continue;
    removeLabel(t.label);
    nameTags.delete(p);
  }
  if (!isCoop()) return;
  for (const p of G.players) {
    const t = nameTagFor(p);
    const share = Math.max(0, p.life / p.stats.maxLife);
    const look = { ...ALLY_BAR, name: nameOf(p), nameStyle: ALLY_NAME };
    const step = barStep(look, share);
    if (step !== t.shown) {
      t.shown = step;
      t.label.show(barArt(look, share));
    }
  }
}

/** The players' name tags as drawn this frame (`lab coop` holds them to every hero shown). */
export function nameTagLabels(): { player: Player; label: Label }[] {
  return [...nameTags].map(([player, t]) => ({ player, label: t.label }));
}

// --- in a run ------------------------------------------------------------------------------
/** A partner's frame in the corner. */
interface Tag { frame: HTMLElement; frameFill: HTMLElement; state: HTMLElement }
const tags = new Map<Player, Tag>();
/** the marker on a downed partner (over them, or at the screen's edge pointing the way to them), and in reach of
 *  them, the prompt to raise them */
let downMark: Label | null = null;
let raisePrompt: HTMLElement | null = null;
/** the downed partner the marker is placed for this frame, and whether we're in reach of them */
let marked: { downed: Player; near: boolean } | null = null;
/** the whole seconds the marker last showed, so it beats as each one goes */
let shownSecond = -1;
/** how high over a downed body its marker floats, m (lower, it hid the body from the top-down view) */
const MARK_HEIGHT = 2.1;
/** the seconds left from which the marker beats harder */
const HURRY = 8;

/** how far in from the screen's edges a downed partner's marker's ring stays (px, at the HUD's scale): its arrow clear
 *  of the hotbar and the wave's badge */
const EDGE = { side: 80, top: 120, bottom: 185 };
/** the ring's radius (px, at the HUD's scale): the marker is placed by its ring's middle */
const RING = 38;

function markFor(): Label {
  if (downMark) return downMark;
  downMark = new Label(ORDER.marker);
  downMark.shown = false;
  // (placed after the camera has moved, with the rest of the labels)
  onLayout(placeMark);
  return downMark;
}

function promptFor(): HTMLElement {
  if (raisePrompt) return raisePrompt;
  const el = document.createElement('div');
  el.className = 'rvprompt hidden';
  el.innerHTML = '<div class="rp-line"><kbd>E</kbd><span>Hold to revive</span></div><div class="rp-bar"><div></div></div>';
  $('#hud').appendChild(el);
  raisePrompt = el;
  return el;
}

/** In reach of a downed partner (keyboard and mouse: touch has its button), the prompt to hold E, and the revive. */
function promptRaise(downed: Player | undefined, near: boolean): void {
  const el = promptFor();
  const shown = !!downed && near && !isTouch();
  el.classList.toggle('hidden', !shown);
  if (!shown) return;
  $('span', el).textContent = downed.revive > 0 ? `Reviving ${nameOf(downed)}…` : `Hold to revive ${nameOf(downed)}`;
  $('.rp-bar div', el).style.width = `${(downed.revive * 100).toFixed(0)}%`;
}

/** when the marker last beat (s, the page's clock: CSS's animation ran on it), and whether that beat was a hurried one */
let beatAt = -Infinity, hurried = false;
/** a beat's length (s) */
const BEAT = 0.8;
const reduceMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** The marker beats once as each second of a downed partner's clock goes, harder near its end (a heartbeat). */
function beat(second: number): void {
  if (second === shownSecond) return;
  const first = shownSecond < 0;
  shownSecond = second;
  if (first) return;
  beatAt = performance.now() / 1000;
  hurried = second <= HURRY;
}

/** A heartbeat's swell at `k` (0 to 1) through it, peaking at `big`: two pulses, the second smaller. */
function heartbeat(k: number, big: number): number {
  const keys: [number, number][] = [[0, 1], [0.12, big], [0.26, 1], [0.4, 1 + (big - 1) * 0.6], [0.6, 1], [1, 1]];
  for (let i = 1; i < keys.length; i++) {
    const [k0, s0] = keys[i - 1], [k1, s1] = keys[i];
    if (k <= k1) {
      const t = (k - k0) / (k1 - k0), eased = 1 - (1 - t) * (1 - t);
      return s0 + (s1 - s0) * eased;
    }
  }
  return 1;
}

/** Which partner is down for the marker, and whether we're in reach (its look and place are set with the labels). */
function markDowned(downed: Player | undefined, near: boolean): void {
  markFor();
  marked = downed ? { downed, near } : null;
  if (!downed) shownSecond = -1;
}

const DOWN_RED = '#ff2a1e';
const WHAT: TextStyle = { face: 'display', size: 18, color: '#ff6a5a', spacing: 0.5, shadows: OUTLINE };
const FAR: TextStyle = { face: 'body', size: 15, color: '#ffd8d0', shadows: OUTLINE };
const SECONDS: TextStyle = { face: 'display', size: 32, color: '#fff0ec', shadows: OUTLINE };

/**
 * A downed partner's marker, every frame: over them where the view shows them, else at the screen's edge on the way to
 * them with an arrow pointing there; their clock running out round its ring, the revive filling it, how far they are.
 * (A small ring over the body alone was lost from sight as soon as the body was off screen.)
 */
function placeMark(): void {
  const mark = downMark!;
  mark.shown = !!marked;
  if (!marked) return;
  const { downed, near } = marked;
  const me = G.player;
  // (its edges' margins are px of the UI's reference layout, at the HUD's scale)
  const ui = uiScales.hud;
  const w = window.innerWidth, h = window.innerHeight;
  const p = project(downed.pos.x, downed.obj.position.y + MARK_HEIGHT, downed.pos.z);
  const left = EDGE.side * ui, right = w - EDGE.side * ui, top = EDGE.top * ui, bottom = h - EDGE.bottom * ui;
  const inView = !p.behind && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  let x = p.x, y = p.y, turn = 0;
  if (!inView) {
    // along the way from the middle of the screen to them (behind the camera, the projection points the other way)
    const cx = w / 2, cy = (top + bottom) / 2;
    let dx = (p.x - cx) * (p.behind ? -1 : 1), dy = (p.y - cy) * (p.behind ? -1 : 1);
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
    const reach = Math.min(Math.abs(dx) > 1e-3 ? (right - cx) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-3 ? (bottom - cy) / Math.abs(dy) : Infinity);
    x = cx + dx * reach;
    y = cy + dy * reach;
    turn = Math.atan2(dy, dx);
  }
  // (pointing down, its words go above the ring, out of the arrow's way)
  const above = !inView && Math.abs(y - bottom) < 1;
  const bleedLeft = Math.max(0, downed.bleed);
  const second = Math.ceil(bleedLeft);
  // (while someone raises them their clock stops, and so does the beat)
  if (downed.revive <= 0) beat(second);
  const what = near ? (isTouch() ? 'Hold Revive' : 'Hold E') : downed.revive > 0 ? 'Being raised' : `${nameOf(downed)} is down`;
  const far = `${Math.round(Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z))} m`;
  const since = performance.now() / 1000 - beatAt;
  const beating = downed.revive <= 0 && since < BEAT;
  const big = hurried ? 1.3 : 1.16, swell = beating ? heartbeat(since / BEAT, big) : 1;
  const art = markArt({
    left: bleedLeft / COOP.bleedOut, raised: downed.revive, second, what, far, above, edge: !inView, turn,
    // (with reduced motion, the glow alone beats)
    scale: reduceMotion?.matches ? 1 : swell, glow: (swell - 1) / (big - 1),
  });
  mark.show(art);
  mark.x = x;
  mark.y = y;
  mark.ax = 0.5;
  mark.ay = art.ringY / art.h;
}

/** What the marker shows: the share of the clock left and of the revive done, its words, and how it's placed
 *  (`above`: its words over the ring; `edge`: the arrow turned `turn` towards them), its beat's swell. */
interface MarkLook {
  left: number; raised: number; second: number; what: string; far: string;
  above: boolean; edge: boolean; turn: number; scale: number; glow: number;
}

/** The marker's art, and where its ring's middle is down it (px of the UI's reference layout: the labels are drawn
 *  at the HUD's scale). */
function markArt(m: MarkLook): { w: number; h: number; ringY: number; paint(c: CanvasRenderingContext2D, s: number): void } {
  const R = RING, reach = 68 + 8;
  const what = measure(m.what, WHAT), far = measure(m.far, FAR);
  const gap = 2, words = what.h + far.h + gap, pad = 8;
  const box = reach * 2, w = Math.max(box, what.w + pad * 2, far.w + pad * 2);
  const h = box + words + pad;
  const ringY = m.above ? h - box / 2 : box / 2;
  return {
    w, h, ringY,
    paint(c, s) {
      const cx = w / 2, cy = ringY;
      if (m.edge) {
        // the arrow: out past the ring towards them
        c.save();
        c.translate(cx, cy);
        c.rotate(m.turn);
        c.shadowColor = 'rgba(0,0,0,.85)';
        c.shadowBlur = 5 * s;
        c.fillStyle = DOWN_RED;
        c.beginPath();
        c.moveTo(46, -14);
        c.lineTo(68, 0);
        c.lineTo(46, 14);
        c.closePath();
        c.fill();
        c.restore();
      }
      c.save();
      c.translate(cx, cy);
      c.scale(m.scale, m.scale);
      // its glow, stronger at the beat's peak, and a dark rim round it
      c.fillStyle = 'rgba(40,0,0,.6)';
      c.shadowColor = `rgba(255,42,30,${0.7 + 0.3 * m.glow})`;
      c.shadowBlur = (18 + 12 * m.glow) * s;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
      c.shadowColor = '#000';
      c.shadowBlur = 4 * s;
      c.fill();
      c.shadowColor = 'transparent';
      c.shadowBlur = 0;
      // the clock: red from the top round as much as is left
      if (m.left > 0) {
        c.fillStyle = DOWN_RED;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.left));
        c.closePath();
        c.fill();
      }
      // the dark face inside it
      const r = R - 7, face = c.createRadialGradient(0, 0, 0, 0, 0, r * Math.SQRT2);
      face.addColorStop(0, '#5a0a06');
      face.addColorStop(0.75, '#1c0403');
      c.fillStyle = face;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      // the revive filling a gold band round the face's edge
      if (m.raised > 0) {
        const inner = r * 0.86;
        c.strokeStyle = '#ffe6a0';
        c.lineWidth = r - inner;
        c.beginPath();
        c.arc(0, 0, (r + inner) / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.raised));
        c.stroke();
      }
      c.restore();
      // the seconds in the middle, and the words under the ring (over it at the bottom edge)
      const sec = measure(String(m.second), SECONDS);
      drawText(c, sec, cx - sec.w / 2, cy - sec.h / 2, SECONDS, s);
      // (over it, the column turned round as the page's was: the distance on top, the words next to the ring)
      const top = m.above ? cy - R - gap - words : cy + R + gap;
      const whatY = m.above ? top + far.h + gap : top, farY = m.above ? top : top + what.h + gap;
      drawText(c, what, cx - what.w / 2, whatY, WHAT, s);
      drawText(c, far, cx - far.w / 2, farY, FAR, s);
    },
  };
}

function tagFor(p: Player): Tag {
  let t = tags.get(p);
  if (t) return t;
  const frame = document.createElement('div');
  frame.className = 'pf';
  frame.innerHTML = `<div class="pf-name">${esc(who(p))}</div><div class="pf-bar"><div class="pf-fill"></div></div><div class="pf-state"></div>`;
  $('#party').appendChild(frame);
  t = { frame, frameFill: $('.pf-fill', frame), state: $('.pf-state', frame) };
  tags.set(p, t);
  return t;
}

/** Every frame of a co-op run: the party frame, nameplates, the downed note and the revive prompt. */
export function updateCoopHud(): void {
  // partners gone from the room take their nameplate and frame with them
  for (const [p, t] of tags) if (!G.players.includes(p)) { t.frame.remove(); tags.delete(p); }
  if (!isCoop()) { hideRunBits(); return; }
  // out of the run and watching: our bars, skills and spoils have nothing more to show
  $('#hud').classList.toggle('watching', !!G.player.out);
  const others = G.players.filter((p) => !p.local);
  for (const p of others) {
    const t = tagFor(p);
    const share = Math.max(0, p.life / p.stats.maxLife);
    t.frameFill.style.width = `${(share * 100).toFixed(1)}%`;
    const state = p.away ? 'In the lobby' : p.out === 'banked' ? (G.run?.training ? 'Left training' : 'Banked') : p.out === 'dead' ? 'Fallen'
      : p.downed ? (p.revive > 0 ? 'Being revived…' : `Down · ${Math.ceil(p.bleed)}s`) : '';
    if (t.state.textContent !== state) t.state.textContent = state;
    t.frame.classList.toggle('down', p.downed);
    t.frame.classList.toggle('out', !!p.out || p.away);
  }


  // down: how long is left, and that a teammate can help
  const me = G.player;
  const note = $('#down-note');
  const down = me.downed && !me.out;
  note.classList.toggle('hidden', !down);
  if (down) {
    const raiser = others.find((p) => p.reviving && Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) < COOP.reviveRange);
    note.innerHTML = `<b>You are down</b><span>${me.revive > 0 ? `${esc(raiser ? nameOf(raiser) : 'A teammate')} is raising you…` : `Bleeding out in ${Math.ceil(me.bleed)}s. A teammate can revive you.`}</span>
      <div class="dn-bar"><div style="width:${(me.revive * 100).toFixed(0)}%"></div></div>`;
  }

  // watching the rest of the run: who, and the controls (game/spectate.ts)
  const watching = !!me.out && !!G.run && G.run.phase !== 'over' && others.some((p) => p.inRun);
  const spec = $('#spectate');
  spec.classList.toggle('hidden', !watching || !$('#summary').classList.contains('hidden'));
  if (watching) sayWatching(spec);

  // a downed partner: the marker on the nearest (or at the screen's edge), and on touch the button to hold
  const downed = me.active ? nearestDowned(others) : undefined;
  const near = !!downed && Math.hypot(downed.pos.x - me.pos.x, downed.pos.z - me.pos.z) < COOP.reviveRange;
  markDowned(downed, near);
  promptRaise(downed, near);
  const rv = $('#btn-revive');
  rv.classList.toggle('hidden', !(near && isTouch()));
  if (!near) touchRevive = false;
}

/** The nearest partner down in the run (a party of four may have more than one). */
function nearestDowned(others: Player[]): Player | undefined {
  const me = G.player;
  const far = (p: Player): number => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
  return others.filter((p) => p.downed && p.inRun).sort((a, b) => far(a) - far(b))[0];
}

/** The run's co-op bits taken off as the lobby is entered: `updateCoopHud` runs in a run alone, and the HUD kept its
 *  watching look (its bars and skills hidden) through the lobby's practice after a run the player left. */
export function hideRunBits(): void {
  $('#hud').classList.remove('watching');

  $('#down-note').classList.add('hidden');
  $('#spectate').classList.add('hidden');
  $('#btn-revive').classList.add('hidden');
  marked = null;
  raisePrompt?.classList.add('hidden');
  shownSecond = -1;
}

/** The decision panel's line about the partners: who is still deciding, who continues, who left. */
export function partyDecision(): string {
  if (!isCoop() || !G.run) return '';
  const r = G.run;
  const rows = G.players.filter((p) => !p.local && !p.away).map((p) => {
    const s = p.out === 'banked' ? (r.training ? 'left training' : 'banked and left') : p.out === 'dead' ? 'fell' : r.votes.has(p.slot) ? 'continues' : 'is deciding…';
    return `${nameOf(p)} (${p.slot === 0 ? 'host, ' : ''}${p.cls.name}) ${s}`;
  });
  return rows.join(' · ');
}

/** Waiting on the others after choosing Continue. */
export const waitingForParty = (): boolean => !!G.run && isCoop() && G.run.votes.has(G.player.slot);

