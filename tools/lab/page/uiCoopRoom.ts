// `lab ui`'s in-room Play together states (`coopRoom` and `coopRoomTouch`): the party list as a guest sees it
// alongside the host (Host badge + Trade button) and a second partner with a long name tag. Verifies that every
// card stays one height, Host + Trade never overlap Gear level / Best wave, Trade never pokes out of its card
// (especially on landscape touch phones where touch buttons are 36 css px tall), and stats align across cards.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { CLASSES } from '../../../src/data/classes/index';
import { session } from '../../../src/net/session';
import { openCoop, renderCoop } from '../../../src/ui/coop';
import type { Player } from '../../../src/entities/player';
import type { Found } from './uiKit';

const TAP_AT = { x: 0.5, y: 0.4 };
const TOUCH_FRAMES = 2;
/** minimum tappable height for the Trade button on touch (actual css px) */
const MIN_TOUCH_PX = 32;

export const COOP_ROOM_CANARY = {
  name: 'overlaps',
  what: 'Host/Trade column narrowed to 48 px overlapping stats',
};

let saved: {
  status: typeof session.status;
  code: string;
  tag: string;
  slot: number;
  max: number;
} | null = null;

function mockPartner(slot: number, tag: string, clsId: string, colour: string, best: number): { id: string; peer: unknown } {
  const cls = CLASSES[clsId] ?? G.player.cls;
  const player = {
    local: false,
    slot,
    tag,
    cls,
    colour,
    portrait: null,
  } as unknown as Player;
  const id = `lab-peer-${slot}`;
  return {
    id,
    peer: {
      id,
      slot,
      tag,
      colour,
      player,
      look: { cls: cls.id, eq: G.profile.equipped, av: null, best },
      inRun: false,
      room: 0,
      readying: false,
      readyShare: 0,
      placed: true,
    },
  };
}

export async function openCoopRoom(lab: Lab, touch = false): Promise<void> {
  if (touch && !document.body.classList.contains('touch')) {
    await lab.tap({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
    await lab.step(TOUCH_FRAMES);
  }
  saved = {
    status: session.status,
    code: session.code,
    tag: session.tag,
    slot: G.player.slot,
    max: session.max,
  };
  session.status = 'joined';
  session.code = 'ZCGMS';
  session.tag = 'Test';
  session.max = 4;
  G.player.slot = 1;
  session.peers.clear();
  const host = mockPartner(0, 'Neolisk', 'mage', 'purple', 12);
  const third = mockPartner(2, 'LongPartnerTag16', 'warrior', 'gold', 24);
  (session.peers as Map<string, unknown>).set(host.id, host.peer);
  (session.peers as Map<string, unknown>).set(third.id, third.peer);
  openCoop(true);
  renderCoop();
  await lab.step(1);
}

export function closeCoopRoom(): void {
  session.peers.clear();
  if (saved) {
    session.status = saved.status;
    session.code = saved.code;
    session.tag = saved.tag;
    session.max = saved.max;
    G.player.slot = saved.slot;
    saved = null;
  }
  openCoop(false);
}

function overlaps(a: DOMRect, b: DOMRect, slop = 0.5): boolean {
  return a.left < b.right - slop && a.right > b.left + slop && a.top < b.bottom - slop && a.bottom > b.top + slop;
}

function measureRoom(state: string, touch: boolean): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  const modal = document.querySelector<HTMLElement>('#coop .modal-box');
  if (!modal || document.getElementById('coop')!.classList.contains('hidden')) {
    return { lines, problems: [`${state}: the dialog isn't shown`] };
  }
  const box = modal.getBoundingClientRect();
  lines.push(`  room dialog: ${box.width.toFixed(0)}x${box.height.toFixed(0)} px`);
  if (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) {
    problems.push(`${state}: the dialog reaches past the window`);
  }
  const cards = [...modal.querySelectorAll<HTMLElement>('.coop-list > .coop-card')];
  if (cards.length < 3) problems.push(`${state}: expected at least 3 party cards, got ${cards.length}`);
  const heights = cards.map((card) => card.getBoundingClientRect().height);
  if (heights.length && Math.max(...heights) - Math.min(...heights) > 1.5) {
    problems.push(`${state}: party cards differ in height (${heights.map((h) => h.toFixed(1)).join(', ')} px)`);
  }
  const statBoxes: DOMRect[] = [];
  cards.forEach((card, index) => {
    const cr = card.getBoundingClientRect();
    const label = `card ${index + 1}`;
    const face = card.querySelector<HTMLElement>('.coop-card-face')?.getBoundingClientRect();
    const who = card.querySelector<HTMLElement>('.coop-card-who')?.getBoundingClientRect();
    const stats = card.querySelector<HTMLElement>('.coop-card-stats')?.getBoundingClientRect();
    const mark = card.querySelector<HTMLElement>('.coop-card-mark');
    const host = card.querySelector<HTMLElement>('.coop-card-host')?.getBoundingClientRect();
    const trade = card.querySelector<HTMLElement>('.coop-trade')?.getBoundingClientRect();
    if (stats && stats.width > 0) statBoxes.push(stats);
    const cols: [string, DOMRect][] = [];
    if (face) cols.push(['face', face]);
    if (who) cols.push(['who', who]);
    if (stats && stats.width > 0) cols.push(['stats', stats]);
    if (mark) {
      for (const child of [...mark.children] as HTMLElement[]) {
        const rect = child.getBoundingClientRect();
        if (rect.width > 0) cols.push([child.className.split(' ')[0] || 'mark', rect]);
      }
    }
    for (let i = 0; i < cols.length; i++) {
      const [nameA, rectA] = cols[i];
      if (rectA.top < cr.top - 1 || rectA.bottom > cr.bottom + 1 || rectA.left < cr.left - 1 || rectA.right > cr.right + 1) {
        problems.push(`${state}: ${label} ${nameA} overflows its card`);
      }
      for (let j = i + 1; j < cols.length; j++) {
        const [nameB, rectB] = cols[j];
        if (overlaps(rectA, rectB)) {
          problems.push(`${state}: ${label} ${nameA} overlaps ${nameB}`);
        }
      }
    }
    if (host && trade && overlaps(host, trade)) {
      problems.push(`${state}: ${label} Host badge overlaps Trade button`);
    }
    if (touch && trade && trade.height < MIN_TOUCH_PX - 0.5) {
      problems.push(`${state}: ${label} Trade button too short on touch (${trade.height.toFixed(1)} px)`);
    }
  });
  if (statBoxes.length > 1) {
    const lefts = statBoxes.map((r) => r.left);
    if (Math.max(...lefts) - Math.min(...lefts) > 1.5) {
      problems.push(`${state}: stats columns misaligned across cards (${lefts.map((l) => l.toFixed(1)).join(', ')})`);
    }
  }
  lines.push(`  party cards: ${cards.length} cards (${heights[0]?.toFixed(1) ?? 0} px tall), ${problems.length} layout problems`);
  return { lines, problems };
}

export function coopRoomShown(state: 'coopRoom' | 'coopRoomTouch', canary: boolean): Found {
  const touch = state === 'coopRoomTouch';
  const found = measureRoom(state, touch);
  if (!canary) return found;
  const hostCard = document.querySelector<HTMLElement>('#coop .coop-card:has(.coop-card-host)');
  if (!hostCard) return { lines: found.lines, problems: [...found.problems, `${state}: canary: no host card`] };
  const prev = hostCard.style.gridTemplateColumns;
  hostCard.style.gridTemplateColumns = '36px minmax(0, 1fr) auto 48px';
  const planted = measureRoom(state, touch);
  hostCard.style.gridTemplateColumns = prev;
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}
