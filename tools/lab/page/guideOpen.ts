// `lab guide`: the guide's first opening and a walk through every page of it (ui/guide/; from Victor's review of #665:
// "when opening the guide section for the first time, it lags for 1-2sec"). From the lobby, G opens it as a player's
// key does, then every section and every entry is opened in turn, a frame each, and frames run on until its pictures
// are all made. Each frame is timed by the browser's own clock, and the page's long tasks (50 ms and more, which
// include its style, layout and paint) are listened for over the whole walk: the longest of either must stay under
// `MOST_MS`. The game's own renderer must link no program for it (the guide's pictures are drawn by a renderer of its
// own). Its pictures are made behind the lobby (ui/guide/portraits.ts), and first while it's open: the walk starts with
// none made and the lobby's own building held, as on a first visit while the fight's warm-up runs (from play: "icons
// not loading in guide": one picture after 20 s, most after a minute), and every foe's, boss's and hero's picture must
// be drawn within `PICTURES_MS` of G. `canary=stall` makes them all again at once as it opens, as they were made before
// they were made behind the lobby: the stall must be caught; `canary=slow` makes them behind the lobby alone, as they
// were before they were made while the guide is open: the pictures not drawn in time must be caught. A page's own
// picture must be drawn within `SHOWN_MS` of the page's opening, or, where the browser was still compiling it then,
// within `SHOWN_MS` of that compile's end (Victor on #665: "model renders take 5-10sec to appear"; the compile is the
// browser's own, which the lab's browser at below normal priority on a busy PC takes up to 12 s over, and is
// reported apart), and every place still waiting for its picture must show its spinner (the same: "a loading
// indicator for each placeholder that's not supposed to be empty").
import { realWait, type Lab, type Report } from './lab';
import { G } from '../../../src/state';
import * as portraits from '../../../src/ui/guide/portraits';
import { toLobby } from './hallMoves';
import * as behind from '../../../src/game/behind';
import { perfClock } from '../../../src/ui/perfHud';

/** Options of `lab guide`. */
export interface GuideOptions {
  /** plant a fault the measure must catch: every picture made at once as the guide opens (`stall`), or made behind
   *  the lobby alone, not while the guide is open (`slow`) */
  canary?: 'stall' | 'slow';
}

/** the longest a frame or a long task may take over the walk (ms): a frame at 60 a second is 17, and a held frame
 *  much past 100 is seen as a hitch */
const MOST_MS = 100;
/** the frames the lobby is left to settle, and the most real time the pictures are given to be made (ms: their
 *  compiles, encodings and the heads' workers run on the browser's clock, which a busy machine slows; 1500 frames 5 ms
 *  apart ran out twice on the shared PC, the pictures made in 370 to 540 frames when it was quiet) */
const SETTLE = 60;
const MOST_REAL_MS = 20000;
/** the longest every picture may take to be drawn from G (ms, by the browser's clock), the browser's compiles in it:
 *  in the lab's browser on the owner's PC, 8 to 10 s (made behind the lobby alone, as they were, never) */
const PICTURES_MS = 20000;
/** `who`'s picture's pieces of the page's own work, how many and how long in all, with the compile it waited for: what
 *  a late picture spent its time on. */
function piecesOf(who: string, from: number): string {
  const own = portraits.portraitPieces.filter((p) => p.what.startsWith(`${who}:`));
  const worked = own.filter((p) => !p.waited);
  const waited = own.filter((p) => p.waited).reduce((sum, p) => sum + p.ms, 0);
  const sum = worked.reduce((total, p) => total + p.ms, 0);
  // (each with when it began, from the page's opening or its compile's end: where a late picture waited)
  const each = worked.map((p) => `${p.what.slice(who.length + 2)} ${p.ms.toFixed(0)} at ${(p.at - from).toFixed(0)}`);
  return `${worked.length} pieces, ${sum.toFixed(0)} ms in all (${each.join(', ')}); its compile waited ${waited.toFixed(0)} ms`;
}

/**
 * How long the card spent on the pictures' draws between `from` and `to` (ms): the browser's work, left out of the
 * page's time as its compile is. A program's first draw is where ANGLE compiles it for the card
 * (`docs/agents/shaders.md`): the Twins' draws were sent before their pages opened and the card had them done 200 to
 * 350 ms after, every piece of the page's own in a frame of the opening; and one picture is drawn at a time, so a
 * page's own waited for the card to finish the picture before it (`lab guide`'s late pieces, each with when it began).
 * The draws are one after another, so their times on the card never overlap.
 */
function onCard(from: number, to: number): number {
  let ms = 0;
  for (const times of portraits.portraitTimes.values()) {
    const end = Math.min(times.onCard, to);
    if (Number.isFinite(end)) ms += Math.max(0, end - Math.max(times.sent, from));
  }
  return ms;
}

/** the longest a page's own picture may take to be drawn from the page's opening, or from the end of its compile if
 *  that came later (ms, by the browser's clock): a frame or two, a few more on a busy PC */
const SHOWN_MS = 150;
/** the longest a page's own picture is waited for (ms) */
const SHOWN_WAIT_MS = 15000;
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
  const canary = options.canary;
  await toLobby(lab);
  if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(SETTLE);
  if (document.getElementById('guide')?.classList.contains('hidden') === false) throw new Error('lab: guide: it was open before G');
  // (a first visit's: no picture made yet, and the lobby's own building held, as the fight's warm-up holds it)
  const most = behind.BEHIND.most;
  behind.BEHIND.most = 0;
  portraits.portraitPlant.notWhileOpen = canary === 'slow';
  portraits.forgetPortraits();

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
    const opened = frames[0].from!;
    let allDrawn = Infinity;
    const drawn = (): void => { if (allDrawn === Infinity && !portraits.portraitsLeft().length) allDrawn = realNow() - opened; };
    if (canary === 'stall') {
      const start = realNow();
      portraits.remakeAllNow();
      frames.push({ what: 'canary: every picture made again at once', ms: realNow() - start });
    }
    if (document.getElementById('guide')?.classList.contains('hidden') !== false) throw new Error('lab: guide: G never opened it');
    for (let i = 0; i < 5; i++) await timed(`frame ${i + 1} after the opening`);
    // (every section and every entry, a frame each, and each page's own picture waited for)
    let pages = 0;
    const shown: { who: string; from: number; ms: number; frames: number; compiling: number }[] = [];
    // (every place waiting for its picture must show its spinner: its turning ring, the place's `::after`)
    const bare = new Set<string>();
    let waitingSeen = 0;
    const spinners = (): void => {
      for (const place of document.querySelectorAll<HTMLElement>('#guide .gd-pic.waiting')) {
        waitingSeen++;
        // (it turns, unless the player asked for less motion: the lab's page may)
        const ring = getComputedStyle(place, '::after');
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (ring.content === 'none' || parseFloat(ring.width) < 6 || (!still && ring.animationName !== 'gd-spin')) bare.add(place.dataset.foe!);
      }
    };
    for (const section of ['foes', 'bosses', 'heroes', 'tips']) {
      const sectionAt = realNow();
      document.querySelector<HTMLElement>(`#guide [data-gs="${section}"]`)!.click();
      const sectionMade = realNow();
      frames.push({ what: `${section}'s list made`, ms: sectionMade - sectionAt, from: sectionAt, to: sectionMade });
      await realWait(0);
      await timed(`${section} opened`);
      const entries = [...document.querySelectorAll<HTMLElement>('#guide [data-ge]')].map((e) => e.dataset.ge!);
      for (const entry of entries) {
        const start = realNow();
        document.querySelector<HTMLElement>(`#guide [data-ge="${entry}"]`)!.click();
        // (its times kept as a frame's: a long task in it is named by it, not by the frame before)
        const made = realNow();
        frames.push({ what: `${section}: ${entry}'s page made`, ms: made - start, from: start, to: made });
        // (the browser let go after the click, as a player's click is a task of its own and the game's frame another:
        // stepped in the same task, a page's click, the spinners' styles read and the frame after it were one long
        // task, the mage's 150 to 195 ms, where in a page of its own the same page made none)
        await realWait(0);
        spinners();
        await timed(`${section}: ${entry} shown`);
        // (its own picture waited for, as a player looks at it: frames on till it's drawn)
        const own = document.querySelector<HTMLElement>('#guide .gd-page .gd-pic');
        if (own) {
          let frameCount = 1;
          while (own.classList.contains('waiting') && realNow() - start < (canary === 'slow' ? 2000 : SHOWN_WAIT_MS)) {
            spinners();
            await timed(`${section}: ${entry}, its picture waited for`);
            await realWait(2);
            frameCount++;
          }
          const who = own.dataset.foe! as portraits.Who;
          const times = portraits.portraitTimes.get(who);
          const compiled = times?.compiled ?? -Infinity;
          const from = Math.max(start, compiled);
          const now = realNow();
          const ms = own.classList.contains('waiting') ? Infinity : now - from - onCard(from, now);
          shown.push({ who, from, ms, frames: frameCount, compiling: compiled > start ? compiled - start : 0 });
        }
        drawn();
        pages++;
        if (!document.querySelector('#guide .gd-page')?.textContent?.trim()) throw new Error(`lab: guide: ${entry}'s page is empty`);
      }
    }
    // (frames on till every picture laid in the guide is made: the workers and the pictures' compiles run on real time)
    let waited = 0;
    const pending = (): number => document.querySelectorAll('#guide .gd-pic.waiting').length;
    document.querySelector<HTMLElement>('#guide [data-gs="foes"]')!.click();
    // (given till every picture is made, at most `MOST_REAL_MS` more: whether in time is judged by `allDrawn`)
    const giveUp = realNow() + (canary === 'slow' ? 2000 : MOST_REAL_MS);
    while ((pending() > 0 || allDrawn === Infinity) && realNow() < giveUp) {
      await timed('a frame as the pictures are made');
      drawn();
      await realWait(5);
      waited++;
    }
    const notDrawn = portraits.portraitsLeft();
    const left = pending();
    const waitingFor = [...document.querySelectorAll<HTMLElement>('#guide .gd-pic.waiting')].map((i) => i.dataset.foe);
    const made = document.querySelectorAll('#guide .gd-pic:not(.waiting):not(.none)').length;
    const slowest = [...shown].sort((a, b) => b.ms - a.ms)[0];
    const lateShown = shown.filter((s) => s.ms > SHOWN_MS);
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
    const slowestPieces = portraits.portraitPieces.filter((p) => !p.waited).sort((a, b) => b.ms - a.ms).slice(0, 5);
    const compiles = portraits.portraitPieces.filter((p) => p.waited).map((p) => p.ms);
    const slowCompiles = portraits.portraitPieces.filter((p) => p.waited).sort((a, b) => b.ms - a.ms).slice(0, 3).map((p) => `${p.what.split(':')[0]} ${(p.ms / 1000).toFixed(1)} s`).join(', ');
    const longest = all[0] ?? { what: 'nothing', ms: 0 };
    const opening = frames.slice(0, 6).reduce((most, f) => Math.max(most, f.ms), 0);
    const lines = [
      `the guide opened by G and walked through ${pages} pages; ${made} pictures made, ${left} still waiting after ${waited} frames${left ? ` (${waitingFor.join(', ')}; ${portraits.portraitState()})` : ''}`,
      notDrawn.length
        ? `every foe's, boss's and hero's picture drawn: no, ${notDrawn.length} not drawn ${((realNow() - opened) / 1000).toFixed(1)} s after G (${notDrawn.join(', ')}), at most ${PICTURES_MS / 1000} s`
        : `every foe's, boss's and hero's picture drawn ${(allDrawn / 1000).toFixed(2)} s after G, none made before it and the lobby's own building held; at most ${PICTURES_MS / 1000} s`,
      `each page's own picture drawn after its opening (or its compile's end, if later): slowest ${slowest ? `${slowest.who} ${Number.isFinite(slowest.ms) ? `${slowest.ms.toFixed(0)} ms` : 'never'}` : '(none)'}, at most ${SHOWN_MS} ms${lateShown.length ? `; late: ${lateShown.map((s) => `${s.who} ${Number.isFinite(s.ms) ? `${s.ms.toFixed(0)} ms` : 'never'}`).join(', ')}` : ''} (${shown.map((s) => `${s.who} ${Number.isFinite(s.ms) ? s.ms.toFixed(0) : 'never'}${s.compiling ? ` after ${(s.compiling / 1000).toFixed(1)} s of its compile` : ''}`).join(', ')})`,
      `places seen waiting for their picture: ${waitingSeen}, ${bare.size ? `without a spinner: ${[...bare].join(', ')}` : 'each with its spinner'}`,
      `the opening's longest frame ${opening.toFixed(1)} ms; the walk's longest moment ${longest.ms.toFixed(1)} ms (${longest.what}), at most ${MOST_MS}`,
      `the longest: ${all.slice(0, LISTED).map((m) => `${m.what} ${m.ms.toFixed(1)} ms`).join('; ')}`,
      `long tasks of the page's: ${tasks.length}${before.length ? ` (and ${before.length} begun before G, the lobby's own: ${before.map((t) => `${t.ms.toFixed(0)} ms`).join(', ')})` : ''}; programs the game's renderer linked: ${linked}`,
      `the browser's compiles of the pictures, waited for: ${compiles.length ? `${compiles.length}, ${Math.min(...compiles).toFixed(0)} to ${Math.max(...compiles).toFixed(0)} ms, ${compiles.reduce((a, b) => a + b, 0).toFixed(0)} ms in all (the longest: ${slowCompiles})` : 'none'}`,
      `the pictures' renderer made in ${portraits.portraitPieces.find((p) => p.what === 'the renderer made')?.ms.toFixed(1) ?? '(not this walk)'} ms; their slowest pieces: ${slowestPieces.map((p) => `${p.what} ${p.ms.toFixed(1)} ms`).join('; ') || 'none'}`,
      ...lateShown.map((s) => `  ${s.who}, late: ${piecesOf(s.who, s.from)}`),
    ];
    const slow = longest.ms > MOST_MS;
    const late = allDrawn > PICTURES_MS;
    if (canary === 'stall') {
      return { text: [...lines, 'canary: every picture made at once as the guide opened'].join('\n'), problems: slow ? [] : ['the pictures made at once were missed'] };
    }
    if (canary === 'slow') {
      return { text: [...lines, 'canary: the pictures made behind the lobby alone, not while the guide is open'].join('\n'), problems: late && lateShown.length ? [] : ['the pictures not made while the guide is open were missed'] };
    }
    const problems = [late ? lines[1] : '', lateShown.length ? lines[2] : '', bare.size || !waitingSeen ? lines[3] : '', slow ? lines[4] : '', linked ? lines[6] : '', left ? lines[0] : ''].filter(Boolean);
    return { text: lines.join('\n'), problems };
  } finally {
    perfClock.now = clock;
    observer.disconnect();
    behind.BEHIND.most = most;
    portraits.portraitPlant.notWhileOpen = false;
  }
}
