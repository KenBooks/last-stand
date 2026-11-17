// `lab guide`: the guide's first opening and a walk through every page of it (ui/guide/; from Victor's review of #665:
// "when opening the guide section for the first time, it lags for 1-2sec"). From the lobby, G opens it as a player's
// key does, then every section and every entry is opened in turn, a frame each, and frames run on until its pictures
// are all made. Each frame is timed by the browser's own clock, and the page's long tasks (50 ms and more, which
// include its style, layout and paint) are listened for over the whole walk: the longest of either must stay under
// `MOST_MS`. The game's own renderer must link no program for it (the guide's pictures are drawn by a renderer of its
// own). Its pictures are made behind the lobby before it opens (ui/guide/portraits.ts); `canary` forgets them and makes
// them all again at once as it opens, as they were made before: the stall must be caught.
import { realWait, type Lab, type Report } from './lab';
import { G } from '../../../src/state';
import * as portraits from '../../../src/ui/guide/portraits';
import { toLobby } from './hallMoves';
import * as behind from '../../../src/game/behind';
import { perfClock } from '../../../src/ui/perfHud';

/** Options of `lab guide`. */
export interface GuideOptions {
  /** plant the fault the measure must catch: every picture made again at once as the guide opens */
  canary?: boolean;
}

/** the longest a frame or a long task may take over the walk (ms): a frame at 60 a second is 17, and a held frame
 *  much past 100 is seen as a hitch */
const MOST_MS = 100;
/** the frames the lobby is left to settle, and the most real time the pictures are given to be made (ms: their
 *  compiles, encodings and the heads' workers run on the browser's clock, which a busy machine slows; 1500 frames 5 ms
 *  apart ran out twice on the shared PC, the pictures made in 370 to 540 frames when it was quiet) */
const SETTLE = 60;
const MOST_REAL_MS = 20000;
/** the longest moments listed */
const LISTED = 6;

/** The browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame). */
function realNow(): number {
  return (window as unknown as { __labClock: { realNow: () => number } }).__labClock.realNow();
}

/** One moment of the walk and what it took by the browser's clock (ms); a frame's, when it began and ended. */
interface Moment { what: string; ms: number; from?: number; to?: number }

/** `lab guide`'s report. */
export async function guideOpen(lab: Lab, options: GuideOptions): Promise<Report> {
  const canary = Boolean(options.canary);
  await toLobby(lab);
  if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(SETTLE);
  if (document.getElementById('guide')?.classList.contains('hidden') === false) throw new Error('lab: guide: it was open before G');

  // (the page's long tasks over the walk, each with when it began by the browser's clock)
  const tasks: Moment[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) tasks.push({ what: 'a long task of the page\'s', ms: e.duration, from: e.startTime, to: e.startTime + e.duration });
  });
  observer.observe({ type: 'longtask', buffered: false });
  const frames: Moment[] = [];
  // (the building behind the lobby timed by the browser's clock, as `lab behind` times it: its slowest piece named)
  const pieces: Moment[] = [];
  const timed = async (what: string, input?: Parameters<Lab['step']>[1]): Promise<void> => {
    const start = realNow();
    await lab.step(1, input);
    const end = realNow();
    frames.push({ what, ms: end - start, from: start, to: end });
    if (behind.behindFrame.longest > 0) pieces.push({ what: behind.behindFrame.slowest, ms: behind.behindFrame.longest });
  };
  const clock = perfClock.now;
  perfClock.now = realNow;
  const programs = G.renderer.info.programs?.length ?? 0;

  try {
    // (the opening: G's frame, and the frames after it, which make what it asked for)
    await timed('G pressed: the guide opening', () => ({ keys: ['g'] }));
    if (canary) {
      const start = realNow();
      portraits.remakeAllNow();
      frames.push({ what: 'canary: every picture made again at once', ms: realNow() - start });
    }
    if (document.getElementById('guide')?.classList.contains('hidden') !== false) throw new Error('lab: guide: G never opened it');
    for (let i = 0; i < 5; i++) await timed(`frame ${i + 1} after the opening`);
    // (every section and every entry, a frame each)
    let pages = 0;
    for (const section of ['foes', 'bosses', 'heroes', 'tips']) {
      document.querySelector<HTMLElement>(`#guide [data-gs="${section}"]`)!.click();
      await timed(`${section} opened`);
      const entries = [...document.querySelectorAll<HTMLElement>('#guide [data-ge]')].map((e) => e.dataset.ge!);
      for (const entry of entries) {
        const start = realNow();
        document.querySelector<HTMLElement>(`#guide [data-ge="${entry}"]`)!.click();
        frames.push({ what: `${section}: ${entry}'s page made`, ms: realNow() - start });
        await timed(`${section}: ${entry} shown`);
        pages++;
        if (!document.querySelector('#guide .gd-page')?.textContent?.trim()) throw new Error(`lab: guide: ${entry}'s page is empty`);
      }
    }
    // (frames on till every picture laid in the guide is made: the workers and the pictures' compiles run on real time)
    let waited = 0;
    const pending = (): number => [...document.querySelectorAll<HTMLImageElement>('#guide img[data-foe]')].filter((i) => !i.getAttribute('src') && !i.classList.contains('none')).length;
    document.querySelector<HTMLElement>('#guide [data-gs="foes"]')!.click();
    const giveUp = realNow() + MOST_REAL_MS;
    while (pending() > 0 && realNow() < giveUp) {
      await timed('a frame as the pictures are made');
      await realWait(5);
      waited++;
    }
    const left = pending();
    const waitingFor = [...document.querySelectorAll<HTMLImageElement>('#guide img[data-foe]')].filter((i) => !i.getAttribute('src') && !i.classList.contains('none')).map((i) => i.dataset.foe);
    const made = [...document.querySelectorAll<HTMLImageElement>('#guide img[data-foe][src]')].length;
    // (a long task's report comes in a task after it)
    await realWait(50);
    observer.disconnect();
    const linked = (G.renderer.info.programs?.length ?? 0) - programs;

    // (a long task begun before G was the lobby's own, not the guide's: told apart, not judged)
    const walkFrom = frames[0]?.from ?? 0;
    const before = tasks.filter((t) => t.from! < walkFrom - 1);
    tasks.splice(0, tasks.length, ...tasks.filter((t) => !before.includes(t)));
    // (each long task named by the frame it fell in, or the one before it: the browser's paint after a frame's script)
    for (const t of tasks) {
      const by = frames.filter((f) => f.from! <= t.from! + 1).pop();
      if (by) t.what = `a long task of the page's, ${t.from! <= by.to! ? 'in' : 'after'} "${by.what}"`;
    }
    const all = [...frames, ...tasks].sort((a, b) => b.ms - a.ms);
    const slowestPieces = [...portraits.portraitPieces].sort((a, b) => b.ms - a.ms).slice(0, 5);
    const longest = all[0] ?? { what: 'nothing', ms: 0 };
    const opening = frames.slice(0, 6).reduce((most, f) => Math.max(most, f.ms), 0);
    const lines = [
      `the guide opened by G and walked through ${pages} pages; ${made} pictures made, ${left} still waiting after ${waited} frames${left ? ` (${waitingFor.join(', ')}; ${portraits.portraitState()})` : ''}`,
      `the opening's longest frame ${opening.toFixed(1)} ms; the walk's longest moment ${longest.ms.toFixed(1)} ms (${longest.what}), at most ${MOST_MS}`,
      `the longest: ${all.slice(0, LISTED).map((m) => `${m.what} ${m.ms.toFixed(1)} ms`).join('; ')}`,
      `long tasks of the page's: ${tasks.length}${before.length ? ` (and ${before.length} begun before G, the lobby's own: ${before.map((t) => `${t.ms.toFixed(0)} ms`).join(', ')})` : ''}; programs the game's renderer linked: ${linked}`,
      `the pictures' renderer made in ${portraits.portraitPieces.find((p) => p.what === 'the renderer made')?.ms.toFixed(1) ?? '(not this walk)'} ms; their slowest pieces: ${slowestPieces.map((p) => `${p.what} ${p.ms.toFixed(1)} ms`).join('; ') || 'none'}`,
    ];
    const slow = longest.ms > MOST_MS;
    if (canary) {
      return { text: [...lines, 'canary: every picture made at once as the guide opened'].join('\n'), problems: slow ? [] : ['the pictures made at once were missed'] };
    }
    const problems = [slow ? lines[1] : '', linked ? lines[3] : '', left ? lines[0] : ''].filter(Boolean);
    return { text: lines.join('\n'), problems };
  } finally {
    perfClock.now = clock;
    observer.disconnect();
  }
}
