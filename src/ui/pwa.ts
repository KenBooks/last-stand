// Installable, offline game (PWA). Registers the service worker that scripts/pwa.ts builds, offers
// the browser's install prompt from the lobby, and once a new version took over, reloads onto it by itself while the
// player hasn't started playing (#578), else offers the reload in the lobby. Production builds only: the dev server has
// no worker.
import { G } from '../state';
import { sfx } from '../core/audio';

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

/** Chrome's install prompt event (not in the DOM typings). */
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

/** whether the player has played yet: a key, a click or a touch on the page since it loaded (a reload onto a new version
 *  then would cost them nothing; once they have, it waits for their say in the lobby) */
let played = false;
/** how long after one reload onto a new version another may come by itself (ms): never a loop */
const RELOAD_APART_MS = 60_000;
const RELOADED_KEY = 'last-stand.updated-at';

/** Reloads onto the new version by itself if the player hasn't played yet and it didn't just do so; whether it did. */
function reloadUnplayed(): boolean {
  if (played) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
    if (Date.now() - last < RELOAD_APART_MS) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}

export function initPwa(): void {
  initInstall();
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const playing = () => { played = true; };
  for (const type of ['keydown', 'pointerdown']) window.addEventListener(type, playing, { capture: true, once: true });
  const base = import.meta.env.BASE_URL;
  const sw = navigator.serviceWorker;
  let hadWorker = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    // a new deploy's worker took over (it does at once): this page still runs the old build. Not played yet (still
    // loading, or the lobby untouched), it reloads onto the new one at once: from play, "reloading or reopening the
    // game does not always load the latest version" (a slow network's page came from the old worker's cache after its
    // 4 s wait, and a tab reopened from memory never loaded at all; the toast in the lobby waited for a click)
    if (hadWorker) { stale().then((old) => { if (old && !reloadUnplayed()) offerUpdate(() => location.reload()); }); return; }
    // first install: the worker now sees requests, so fetch the fonts again to cache them for offline
    hadWorker = true;
    cacheFonts();
  });
  // updateViaCache 'none': update checks skip the HTTP cache (Pages sends max-age=600)
  sw.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }).then((reg) => {
    // a tab left open checks again when it comes back into view, and so does one restored from the browser's memory
    // (a page shown again from its back/forward cache, or an app reopened: no load, so no check of its own)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) reg.update().catch(() => {}); });
  }).catch(() => { /* no worker (private mode, file://): the game still runs online */ });
}

/** This page runs an older build than the controlling worker serves (its bundle isn't in that cache). */
async function stale(): Promise<boolean> {
  const worker = navigator.serviceWorker.controller;
  if (!worker) return false;
  try {
    const name = await new Promise<string>((res, rej) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => res(e.data as string);
      worker.postMessage('cache', [ch.port2]);
      setTimeout(rej, 3000);
    });
    return !(await (await caches.open(name)).match(import.meta.url, { ignoreVary: true }));
  } catch { return false; }
}

/** The fonts are cross-origin (Google Fonts); re-requesting them through the worker stores them. */
async function cacheFonts(): Promise<void> {
  const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
  if (!link) return;
  try {
    const css = await (await fetch(link.href)).text();
    for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)) fetch(m[1]).catch(() => {});
  } catch { /* offline: next time */ }
}

/** A new version took over: offer a reload in the lobby (never in the middle of a run). */
function offerUpdate(apply: () => void): void {
  const toast = $('#update-toast');
  const show = () => { if (G.mode === 'menu') toast.classList.remove('hidden'); else setTimeout(show, 2000); };
  toast.querySelector<HTMLElement>('.ut-reload')!.onclick = () => { sfx.click(); toast.classList.add('hidden'); apply(); };
  toast.querySelector<HTMLElement>('.ut-later')!.onclick = () => { sfx.click(); toast.classList.add('hidden'); };
  show();
}

/** Running as the installed app (its own window, not a browser tab). */
const installed = (): boolean =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

type Platform = 'ios' | 'android' | 'other';
function platform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; its touch screen gives it away
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'other';
}

/** Where the browser keeps "add to home screen" when it offers no prompt of its own. */
function steps(p: Platform): string {
  if (p === 'ios') return `<p>Tap the <b class="gold">Share</b> button (the square with an arrow) in the browser bar, then <b class="gold">Add to Home Screen</b>.</p>
    <p>No such entry? Open this page in <b>Safari</b> and try again.</p>`;
  return `<p>Open the browser menu (<b class="gold">&#8942;</b>, top or bottom corner) and pick <b class="gold">Install app</b> or <b class="gold">Add to Home screen</b>.</p>
    <p>No such entry? Open this page in <b>Chrome</b> and try again.</p>`;
}

/**
 * The Install link. Chrome and Edge fire a prompt event, and the link opens that prompt. Safari and
 * Firefox never do (and Chrome holds it back for a while), so on a phone or tablet the link is
 * always there, and without a prompt it shows where the browser keeps "add to home screen".
 */
function initInstall(): void {
  const btn = $('#btn-install'), modal = $('#install');
  const p = platform();
  let prompt: InstallPrompt | null = null;
  const show = (on: boolean): void => { btn.classList.toggle('hidden', !on || installed()); };
  show(p !== 'other');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    show(true);
  });
  window.addEventListener('appinstalled', () => { prompt = null; show(false); });
  $('#btn-install-close').onclick = () => { sfx.click(); modal.classList.add('hidden'); };
  btn.onclick = async () => {
    sfx.click();
    if (!prompt) {
      modal.querySelector<HTMLElement>('.install-steps')!.innerHTML = steps(p);
      modal.classList.remove('hidden');
      return;
    }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    prompt = null;   // a prompt can be shown once; the steps are still there if it was dismissed
    show(outcome !== 'accepted' && p !== 'other');
  };
}
