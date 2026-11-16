// Trading banked gear between two players of a room, in the lobby (the window is ui/trade.ts, the swap on a profile
// loot/trade.ts; from play: "create trading b/w players in party"). One asks another, both games open the window,
// each puts items of its stash in its offer and sees the other's live; both accept, and the swap is made on both
// games at once, or on neither.
//
// The swap is decided once, by the host's game, so the two can't disagree: each trader's accept says exactly what
// it gives and gets (the items' ids, and the revision of each side's offer it saw), and goes to the host as well as
// the partner. The host rules a trade done only when both accepts it holds name the same two offers, and tells both
// traders (`trdone`, naming the revisions it matched); each game then makes the swap on its own player's profile
// alone, as it accepted it. Anything else ends it with nothing moved, said once by the host (`trend`): a cancel, a
// trader gone from the room, a run or a duel starting. An offer changed after an accept resets both accepts (each
// game resets its own, and tells the host it no longer accepts). Every item in an accept stays locked in its stash
// (loot/trade.ts `tradeLocked`) until the host has ruled on the trade, so it can't leave the stash between the accept
// and the swap.
//
// What a partner's game sends is checked as it comes (`cleanOffer`), and each game checks the swap against its own
// profile before it lets its player accept (`swapProblem`: the stash's room, gear its class can use).
import { G } from '../state';
import { RUN, TRADE } from '../data/balance';
import { saveProfile } from '../loot/profile';
import { saveSlot } from '../loot/saveSlots';
import { applySwap, cleanOffer, offerProblem, swapProblem, tradeLocked } from '../loot/trade';
import { throwItem } from '../game/groundItems';
import { netLog } from './netlog';
import type { Player } from '../entities/player';
import type { Item, Profile } from '../types';

/** How the trade's messages go out and who is in the room (set by net/session.ts while a room is open). */
export interface TradeNet {
  /** our own peer id on the link */
  self(): string;
  /** the host's peer id (ours on the host) */
  host(): string;
  /** a message to one game (its peer id) */
  send(to: string, m: Record<string, unknown>): void;
  /** a partner's hero by its peer id (null: not in the room) */
  partner(id: string): Player | null;
  /** whether a partner is in a run (or readying one) */
  inRun(id: string): boolean;
}

/** An accept as we sent it: what we give (ids of our stash) and get (their offer's items), for which revisions of
 *  our offer and theirs, and the profile and save slot it was made on. */
interface Accept { give: string[]; get: Item[]; giveRev: number; getRev: number; profile: Profile; slot: number }

/** The trade this game is in: with whom, where it stands, both offers and both accepts. */
interface Trade {
  /** made by the asker, the same on both games */
  id: string;
  /** the partner's peer id */
  with: string;
  /** we asked and wait for the answer, we were asked and haven't answered, or it's open */
  phase: 'asking' | 'asked' | 'open';
  /** when the ask was made or heard (s, the page's clock) */
  at: number;
  /** our offer: ids of our stash's items, and its revision (each change makes a new one) */
  mine: string[];
  mineRev: number;
  /** their offer as it came, and its revision */
  theirs: Item[];
  theirsRev: number;
  /** whether we accept the offers as they stand, and whether they said they do (for these revisions) */
  accepted: boolean;
  theirAccept: boolean;
}

/** What the window shows of the trade (ui/trade.ts). */
export interface TradeView {
  phase: Trade['phase'];
  partner: Player | null;
  mine: Item[];
  theirs: Item[];
  accepted: boolean;
  theirAccept: boolean;
  /** why our Accept can't be pressed (null: it can) */
  problem: string | null;
}

/** What happened last, said in the window or over the lobby (a trade ended, or done). */
export interface TradeNote { text: string; at: number; done: boolean }

let net: TradeNet | null = null;
let trade: Trade | null = null;
/** every accept we sent that the host hasn't ruled on yet, by trade id (their items stay locked meanwhile) */
const accepts = new Map<string, Accept[]>();
let asked = 0;
let note: TradeNote | null = null;
const listeners: (() => void)[] = [];
const now = (): number => performance.now() / 1000;

/** The host's record of a trade it rules on: both traders (each sender and the partner it names, kept when an
 *  accept is withdrawn, so a ruling that ends it reaches both), each one's latest accept as told, and whether it has
 *  ruled. */
interface Ruling { traders: Set<string>; by: Map<string, HostAccept>; decided: boolean }
/** An accept as the host is told it: its sender's partner, the ids each way and the revisions. */
interface HostAccept { with: string; give: string[]; get: string[]; giveRev: number; getRev: number }
const rulings = new Map<string, Ruling>();

/** Runs `fn` whenever the trade changes (the window draws it again). */
export function onTradeChange(fn: () => void): void { listeners.push(fn); }
function changed(): void { for (const fn of listeners) fn(); }

/** Sets how messages go out (null: the room is gone, and with it every trade: nothing moves). */
export function setTradeNet(n: TradeNet | null): void {
  if (!n && (trade || accepts.size)) endLocal('The room is gone: nothing was traded.');
  net = n;
  rulings.clear();
}

/** The trade as the window shows it (null: none). */
export function tradeView(): TradeView | null {
  if (!trade || !net) return null;
  const p = G.profile;
  const mine = trade.mine.map((id) => p.stash.find((it) => it.id === id)).filter((it): it is Item => !!it);
  return {
    phase: trade.phase, partner: net.partner(trade.with), mine, theirs: trade.theirs,
    accepted: trade.accepted, theirAccept: trade.theirAccept, problem: acceptProblem(),
  };
}

/** The last thing said of a trade (null: nothing, or it's been taken). */
export const tradeNote = (): TradeNote | null => note;

/** Whether a trade is under way here (the window open, or an accept still waiting for the host's word): the class
 *  and the save slot stay as they are meanwhile. */
export const tradeBusy = (): boolean => !!trade || accepts.size > 0;

/** Whether the partner `id` can be asked to trade now (null), or why not. */
export function askProblem(id: string): string | null {
  if (!net) return 'Not in a room';
  if (G.mode !== 'menu') return 'Only in the lobby';
  if (trade) return 'Already trading';
  if (!net.partner(id)) return 'Not in the room';
  if (net.inRun(id)) return 'In a run';
  return null;
}

/** We ask the partner `id` to trade. */
export function askTrade(id: string): void {
  if (askProblem(id) || !net) return;
  trade = blank(`${net.self()}:${++asked}`, id, 'asking');
  note = null;
  net.send(id, { t: 'tr?', id: trade.id });
  changed();
}

/** We answer the ask we were asked. */
export function answerTrade(yes: boolean): void {
  if (!trade || trade.phase !== 'asked' || !net) return;
  net.send(trade.with, { t: 'try', id: trade.id, yes });
  if (yes) trade.phase = 'open';
  else trade = null;
  changed();
}

/** Puts an item of our stash in our offer, or takes it out. */
export function toggleOffer(id: string): void {
  if (!trade || trade.phase !== 'open') return;
  const i = trade.mine.indexOf(id);
  if (i >= 0) trade.mine.splice(i, 1);
  else {
    const it = G.profile.stash.find((s) => s.id === id);
    if (!it || trade.mine.length >= TRADE.most || offerProblem(it, partnerClass())) return;
    trade.mine.push(id);
  }
  trade.mineRev++;
  lock();
  resetAccepts();
  net!.send(trade.with, { t: 'tro', id: trade.id, rev: trade.mineRev, items: tradeView()!.mine });
  changed();
}

/** We accept the offers as they stand, or no longer do. */
export function setAccept(on: boolean): void {
  if (!trade || trade.phase !== 'open' || !net || trade.accepted === on) return;
  if (on && acceptProblem()) return;
  trade.accepted = on;
  const give = [...trade.mine];
  const msg = {
    t: 'tra', id: trade.id, on, with: trade.with, give, get: trade.theirs.map((it) => it.id),
    giveRev: trade.mineRev, getRev: trade.theirsRev,
  };
  if (on) {
    const list = accepts.get(trade.id) ?? [];
    list.push({ give, get: trade.theirs, giveRev: trade.mineRev, getRev: trade.theirsRev, profile: G.profile, slot: saveSlot() });
    accepts.set(trade.id, list);
    lock();
  }
  net.send(trade.with, msg);
  toHost(msg);
  changed();
}

/** We cancel the trade (the window's Cancel, Esc): the partner and the host are told; nothing moves. */
export function cancelTrade(why = 'cancelled the trade'): void {
  if (!trade || !net) return;
  const t = trade;
  if (t.phase !== 'asked') net.send(t.with, { t: 'trx', id: t.id, why });
  else net.send(t.with, { t: 'try', id: t.id, yes: false });
  toHost({ t: 'trx', id: t.id, why, with: t.with });
  trade = null;
  note = { text: 'Trade cancelled: nothing was traded.', at: now(), done: false };
  // (with no accept of ours sent, the host can't rule it done: its items are free at once)
  lock();
  changed();
}

/** Our trade ends at once, nothing moved (a run starting). An accept of ours the host may have ruled on keeps its
 *  items locked till its word, which the host sends before a run's start. */
export function endTrades(why: string): void {
  if (!trade) return;
  cancelTrade(why);
  note = { text: `Trade off (${why}): nothing was traded.`, at: now(), done: false };
}

/** Every frame: an ask unanswered for `TRADE.askFor` is let go. */
export function updateTrade(): void {
  if (!trade || trade.phase === 'open' || now() - trade.at < TRADE.askFor) return;
  if (trade.phase === 'asking') {
    cancelTrade('asked too long ago');
    note = { text: 'No answer: the trade was let go.', at: now(), done: false };
  } else answerTrade(false);
  changed();
}

/** A trade message from the partner `from` (or one of the host's rulings). */
export function tradeHeard(from: string, m: Record<string, unknown>): void {
  if (!net || typeof m.id !== 'string') return;
  const id = m.id;
  // (the host rules on accepts and cancels, whoever's trade it is)
  if (net.host() === net.self() && (m.t === 'tra' || m.t === 'trx')) rule(from, m);
  if (m.t === 'trdone' && from === net.host()) { done(id, m.revs); return; }
  if (m.t === 'trend' && from === net.host()) { ended(id, typeof m.why === 'string' ? m.why : ''); return; }
  if (m.t === 'tr?') {
    if (askProblem(from)) net.send(from, { t: 'try', id, yes: false, busy: true });
    else {
      trade = blank(id, from, 'asked');
      changed();
    }
    return;
  }
  if (!trade || trade.id !== id || trade.with !== from) {
    // (a yes to an ask we let go: told it's off)
    if (m.t === 'try' && m.yes === true) net.send(from, { t: 'trx', id, why: 'let the ask go' });
    return;
  }
  if (m.t === 'try' && trade.phase === 'asking') {
    if (m.yes === true) trade.phase = 'open';
    else {
      trade = null;
      note = { text: m.busy ? 'They are busy: ask again in a moment.' : 'They declined the trade.', at: now(), done: false };
    }
  } else if (m.t === 'tro' && trade.phase === 'open') {
    const items = cleanOffer(m.items);
    if (!items || typeof m.rev !== 'number' || m.rev <= trade.theirsRev) return;
    trade.theirs = items;
    trade.theirsRev = m.rev;
    resetAccepts();
  } else if (m.t === 'tra' && trade.phase === 'open') {
    // (their accept counts for the offers as they stand here: one for an offer since changed is stale)
    trade.theirAccept = m.on === true && m.giveRev === trade.theirsRev && m.getRev === trade.mineRev;
  } else if (m.t === 'trx') {
    trade = null;
    note = { text: 'They cancelled the trade: nothing was traded.', at: now(), done: false };
    lock();
  } else return;
  changed();
}

/** A partner left the room: the host rules every trade of theirs off; here, ours with them ends. */
export function tradePeerLeft(id: string): void {
  if (net && net.host() === net.self()) {
    for (const [tid, r] of rulings) {
      if (r.decided || !r.traders.has(id)) continue;
      decide(tid, r, null, 'a trader left the room');
    }
  }
  if (trade?.with !== id) return;
  // (no accept of ours sent: the host can't rule it done, so it's off here at once; else its items stay locked
  // until the host's word, which a ruling it made before they left may still bring as done)
  if (!accepts.has(trade.id)) ended(trade.id, 'they left the room');
  else {
    trade = null;
    note = { text: 'They left the room: waiting for the host\'s word…', at: now(), done: false };
    changed();
  }
}

/** The host starts a run or a duel: every trade in the room ends first, nothing moved (sent before the start, so
 *  each guest hears it first). */
export function endRoomTrades(): void {
  if (!net || net.host() !== net.self()) return;
  for (const [tid, r] of rulings) if (!r.decided) decide(tid, r, null, 'a run started');
  if (trade) cancelTrade('a run started');
}

// --- the host's rulings ---------------------------------------------------------------------------

/** The host hears an accept (or its withdrawal) or a cancel from `from`. */
function rule(from: string, m: Record<string, unknown>): void {
  const id = m.id as string;
  const r = rulings.get(id) ?? { traders: new Set<string>(), by: new Map(), decided: false };
  rulings.set(id, r);
  if (r.decided) return;
  r.traders.add(from);
  if (typeof m.with === 'string') r.traders.add(m.with);
  if (m.t === 'trx') { decide(id, r, null, typeof m.why === 'string' ? m.why : 'cancelled'); return; }
  const ids = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length <= TRADE.most ? v as string[] : null);
  const give = ids(m.give), get = ids(m.get);
  if (m.on !== true || !give || !get || typeof m.with !== 'string' || typeof m.giveRev !== 'number' || typeof m.getRev !== 'number') {
    r.by.delete(from);
    return;
  }
  r.by.set(from, { with: m.with, give, get, giveRev: m.giveRev, getRev: m.getRev });
  const mine = r.by.get(from)!, theirs = r.by.get(m.with);
  if (!theirs || theirs.with !== from) return;
  // (both in the lobby, still in the room)
  const here = (p: string) => (p === net!.self() ? G.mode === 'menu' : !!net!.partner(p) && !net!.inRun(p));
  if (!here(from) || !here(m.with)) { decide(id, r, null, 'a trader is not in the lobby'); return; }
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (mine.giveRev !== theirs.getRev || mine.getRev !== theirs.giveRev) return;
  if (!same(mine.give, theirs.get) || !same(mine.get, theirs.give)) return;
  decide(id, r, { [from]: [mine.giveRev, mine.getRev], [m.with]: [theirs.giveRev, theirs.getRev] }, '');
}

/** The host rules once: done (`revs`: each trader's accepted revisions) or off (`why`), told to both traders. */
function decide(id: string, r: Ruling, revs: Record<string, [number, number]> | null, why: string): void {
  r.decided = true;
  netLog(`trade ${id} ${revs ? 'done' : `off (${why})`}`);
  const m = revs ? { t: 'trdone', id, revs } : { t: 'trend', id, why };
  for (const p of r.traders) {
    if (p === net!.self()) {
      if (revs) done(id, revs);
      else ended(id, why);
    } else if (net!.partner(p)) net!.send(p, m);
  }
}

// --- each trader's side ----------------------------------------------------------------------------

/** The host ruled the trade done: the swap made on our profile as we accepted it. */
function done(id: string, revs: unknown): void {
  const mineRevs = (revs as Record<string, unknown> | null)?.[net?.self() ?? ''];
  const list = accepts.get(id) ?? [];
  const accept = Array.isArray(mineRevs) ? list.find((a) => a.giveRev === mineRevs[0] && a.getRev === mineRevs[1]) : undefined;
  accepts.delete(id);
  if (trade?.id === id) trade = null;
  if (!accept) {
    netLog(`trade ${id} ruled done for an accept this game never made`);
    lock();
    changed();
    return;
  }
  // (the hero it was accepted on: in play still, or loaded afresh from the same save, or left for another, its own
  // save then written in its own slot)
  const same = G.profile.classId === accept.profile.classId && saveSlot() === accept.slot;
  const p = same ? G.profile : accept.profile;
  if (!same) netLog(`trade ${id}: the hero changed under it`);
  const added = applySwap(p, accept.give, accept.get);
  // (more than the stash holds, an item picked off the floor meanwhile: the newest of the trade at our feet)
  const over = p.stash.length - RUN.bagLimit;
  if (over > 0) for (const it of p.stash.splice(0, over)) throwItem(it);
  saveProfile(p, accept.slot);
  lock();
  const got = added.length, gave = accept.give.length;
  note = { text: `Trade done: you gave ${gave} item${gave === 1 ? '' : 's'} and got ${got}.`, at: now(), done: true };
  changed();
}

/** The trade `id` ended with nothing moved (the host's word, or the room's). */
function ended(id: string, why: string): void {
  const ours = trade?.id === id || accepts.has(id);
  accepts.delete(id);
  if (trade?.id === id) trade = null;
  if (ours) note = { text: `Trade off (${why}): nothing was traded.`, at: now(), done: false };
  lock();
  changed();
}

/** Every trade here ends with nothing moved (the room is gone). */
function endLocal(text: string): void {
  trade = null;
  accepts.clear();
  note = { text, at: now(), done: false };
  lock();
  changed();
}

/** The locked items: our offer's, and every item an accept still waiting for the host's word gives. */
function lock(): void {
  tradeLocked.clear();
  for (const id of trade?.mine ?? []) tradeLocked.add(id);
  for (const list of accepts.values()) for (const a of list) for (const id of a.give) tradeLocked.add(id);
}

/** Both accepts off (an offer changed): ours told to the partner and the host. */
function resetAccepts(): void {
  if (!trade) return;
  trade.theirAccept = false;
  if (trade.accepted) {
    trade.accepted = false;
    const msg = { t: 'tra', id: trade.id, on: false, with: trade.with };
    net!.send(trade.with, msg);
    toHost(msg);
  }
}

/** A message for the host's rulings: sent to it, or heard here if we are the host. */
function toHost(m: Record<string, unknown>): void {
  if (!net) return;
  if (net.host() === net.self()) rule(net.self(), m);
  else if (net.host() !== trade?.with) net.send(net.host(), m);
  // (the host is the partner: the message sent to the partner reaches its rulings too)
}

/** Why our Accept can't be pressed now (null: it can). */
function acceptProblem(): string | null {
  if (!trade || trade.phase !== 'open') return 'The trade is not open';
  if (!trade.mine.length && !trade.theirs.length) return 'Nothing offered yet';
  return swapProblem(G.profile, trade.mine, trade.theirs);
}

const partnerClass = (): string | null => (trade && net?.partner(trade.with)?.cls.id) ?? null;

function blank(id: string, partner: string, phase: Trade['phase']): Trade {
  return { id, with: partner, phase, at: now(), mine: [], mineRev: 0, theirs: [], theirsRev: 0, accepted: false, theirAccept: false };
}
