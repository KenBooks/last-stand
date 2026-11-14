// The Google branch of lab cloud: real controls, a separate browser window and the lightweight callback page.
// OAuth replies are fixtures intercepted locally; no request reaches a player's account or Google's service.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Device, SCREENS } from './cloudDevice.mjs';
import { OUT } from './paths.mjs';

/** Fullscreen state and requests are played by the fixture; no native fullscreen or keyboard lock is taken. */
function installFullScreenSpy() {
  const state = { full: true, requests: 0, exits: 0, openedFull: 0, refuse: false };
  window.__googleFullscreen = state;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true, get: () => state.full ? document.documentElement : null,
  });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: async () => {
    state.exits++;
    state.full = false;
    document.dispatchEvent(new Event('fullscreenchange'));
  } });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: async () => {
    state.requests++;
    if (state.refuse) throw new Error('User activation required');
    state.full = true;
    document.dispatchEvent(new Event('fullscreenchange'));
  } });
  const open = window.open;
  window.open = (...args) => {
    if (state.full) state.openedFull++;
    return open.apply(window, args);
  };
}

/** The real waiting dialog at all required desktop, tablet and phone sizes. */
async function waitingDialog(page, context, pictures) {
  const device = new Device('Google', page, context);
  device.devtools = await context.newCDPSession(page);
  const lines = [];
  const screens = [...SCREENS, { name: '1180x820', width: 1180, height: 820, ratio: 1, touch: false }];
  try {
    for (const screen of screens) {
      await device.showOn(screen);
      const fit = await device.call('cloudFit');
      assert.deepEqual(fit.problems, [], `Google waiting dialog at ${screen.name}`);
      lines.push(`Waiting dialog ${screen.name}: fits`);
      if (pictures) {
        const folder = join(OUT, 'cloud');
        mkdirSync(folder, { recursive: true });
        const { data } = await device.devtools.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(folder, `google-waiting-${screen.name}.png`), Buffer.from(data, 'base64'));
      }
      if (screen.touch) await device.leaveTouch();
    }
    return lines;
  } finally {
    await device.devtools.send('Emulation.clearDeviceMetricsOverride');
    await device.devtools.detach();
  }
}

/** Exercises sign-in without reloading, cancellation, link completion and blocked-popup redirect fallback. */
export async function runGoogleWindow(side, { canary = false, pictures = true } = {}) {
  const page = side.page;
  const context = side.context;
  const originalUrl = page.url();
  const lines = [];
  const begins = [];
  const finishes = [];
  const code = 'lab-google-landing-code-1234567890';
  let purpose = 'signin';
  let phase = 'opening save slots';
  let failBegin = false;
  let holdBegin = false;
  let heldBegin = null;
  let expectedServiceError = false;
  const account = {
    id: 'lab-google-account', created: Date.now(), passkeys: [], google: true, sites: [],
    session: { via: 'google', email: 'player@example.test' },
  };
  const routeSaves = async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    if (path.endsWith('/signout')) body = {};
    else if (path.endsWith('/health')) body = { google: true };
    else if (path.endsWith('/auth/google')) {
      if (holdBegin) { heldBegin = route; return; }
      if (failBegin) {
        expectedServiceError = true;
        await route.fulfill({ status: 503, body: 'Sign-in temporarily unavailable',
          headers: { 'access-control-allow-origin': new URL(originalUrl).origin } });
        return;
      }
      const begin = request.postDataJSON();
      begins.push(begin);
      purpose = begin.purpose;
      // Hold the window at a harmless local document until the scenario sends Google's answer.
      body = { url: new URL('privacy.html', originalUrl).href };
    } else if (path.endsWith('/auth/google/finish')) {
      const finish = request.postDataJSON();
      finishes.push(finish);
      assert.equal(finish.nonce, begins.at(-1).nonce);
      assert.equal(finish.code, code);
      body = purpose === 'link' ? { linked: true, account } : { token: 'lab-google-token', account };
    } else if (path.endsWith('/account')) body = account;
    else if (path.endsWith('/save')) body = { site: 'lab', updated: 0, parts: {} };
    else throw new Error(`lab google: unexpected saves request ${request.method()} ${path}`);
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': new URL(originalUrl).origin } });
  };
  await context.route('**/saves/**', routeSaves);
  try {
    await page.evaluate(() => { window.__googleBootMarker = {}; });
    // (in the village the Save slot button is on the chronicle's card)
    await page.evaluate(async () => (await import('/tools/lab/page/cloud.ts')).cloudAtChronicle());
    await page.locator('#btn-saves').click();
    await page.evaluate(installFullScreenSpy);
    await page.evaluate(() => { document.querySelector('.sc-google').hidden = false; });
    const popupPromise = context.waitForEvent('page');
    phase = 'opening Google window';
    await page.locator('.sc-google').click();
    const popup = await popupPromise;
    await popup.waitForURL('**/privacy.html');
    const left = await page.evaluate(() => window.__googleFullscreen);
    assert.equal(left.full, false);
    assert.equal(left.exits, 1);
    assert.equal(left.openedFull, 0, 'fullscreen exits before the popup opens');
    assert.equal(await page.evaluate(async () => {
      const { input } = await import('/src/core/input.ts');
      return input.pressed.has('escape');
    }), false, 'a programmatic exit must not inject an Escape/pause action');
    assert.equal(await page.evaluate(async () => {
      const fullscreen = await import('/src/ui/autoFullScreen.ts');
      fullscreen.armAutoFullScreen(true);
      return fullscreen.autoFullArmed();
    }), false, 'waiting controls cannot re-arm fullscreen behind the popup');
    phase = 'returning the Google sign-in';
    assert.equal(begins.length, 1);
    assert.equal(await popup.evaluate(() => window.opener), null);
    lines.push(...await waitingDialog(page, context, pictures));
    await popup.evaluate(() => {
      window.__googleFocusRequests = 0;
      window.focus = () => { window.__googleFocusRequests++; };
    });
    await page.locator('#cloud-dialog button').filter({ hasText: /^Show Google window$/ }).click();
    assert.equal(await popup.evaluate(() => window.__googleFocusRequests), 1);
    lines.push('Show Google window: requests foreground during sign-in without starting another attempt');
    const callback = new URL(begins.at(-1).returnPath, originalUrl);
    assert.match(callback.pathname, /google-signin\.html$/);
    assert.ok(!callback.search.includes(begins.at(-1).nonce), 'the nonce stays in the original game');
    const callbackRequests = [];
    popup.on('request', (request) => callbackRequests.push(request.url()));
    if (canary) {
      await popup.goto(callback.href + '#cloud-google=invalid');
      await page.waitForTimeout(400);
      assert.equal(finishes.length, 0, 'malformed return must not be redeemed');
      await page.locator('#cloud-dialog button').filter({ hasText: /^Cancel$/ }).click();
      lines.push('canary: invalid landing code rejected');
      return { text: lines.join('\n'), problems: [] };
    }
    await popup.goto(callback.href + '#cloud-google=' + code).catch((error) => {
      if (!popup.isClosed()) throw error;
    });
    await page.waitForFunction(() => document.querySelector('#cloud-dialog .sm-title')?.textContent
      === 'Which save goes to the cloud?', null, { polling: 100 });
    phase = 'checking the preserved game';
    assert.equal(page.url(), originalUrl);
    assert.equal(await page.evaluate(() => Boolean(window.__googleBootMarker)), true);
    assert.equal(finishes.length, 1);
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), true);
    assert.ok(callbackRequests.every((url) => !/\/src\/|\/assets\/|three/.test(url)));
    lines.push('Google sign-in: fullscreen exited before popup and restored on success; game/nonce preserved');

    const linkPopupPromise = context.waitForEvent('page');
    phase = 'opening the Google link window';
    await page.evaluate(async () => {
      const ui = await import('/src/ui/cloudSaves.ts');
      ui.closeDialog();
      // Link is production-only in the UI; the fixture calls the same cloud flow on this localhost origin.
      const cloud = await import('/src/loot/cloud.ts');
      window.__googleLink = cloud.goToGoogle('link', new AbortController().signal);
    });
    const linkPopup = await linkPopupPromise;
    await linkPopup.waitForURL('**/privacy.html');
    phase = 'returning the Google link';
    const linkCallback = new URL(begins.at(-1).returnPath, originalUrl);
    await linkPopup.goto(linkCallback.href + '#cloud-google=' + code).catch((error) => {
      if (!linkPopup.isClosed()) throw error;
    });
    assert.equal((await page.evaluate(() => window.__googleLink)).kind, 'linked');
    lines.push('Google linking: completes inside the existing session');

    phase = 'ignoring a return after the account changed';
    const stalePopupPromise = context.waitForEvent('page');
    await page.evaluate(async () => {
      const cloud = await import('/src/loot/cloud.ts');
      window.__googleStale = cloud.goToGoogle('signin', new AbortController().signal);
    });
    const stalePopup = await stalePopupPromise;
    await stalePopup.waitForURL('**/privacy.html');
    const staleCallback = new URL(begins.at(-1).returnPath, originalUrl);
    await page.evaluate(async () => {
      const cloud = await import('/src/loot/cloud.ts');
      await cloud.signOut();
    });
    await stalePopup.goto(staleCallback.href + '#cloud-google=' + code).catch((error) => {
      if (!stalePopup.isClosed()) throw error;
    });
    assert.equal(await page.evaluate(() => window.__googleStale), null);
    assert.equal(finishes.length, 2, 'an obsolete attempt cannot create a new session');
    lines.push('Account changed while Google was open: late return discarded before finishing');

    await page.evaluate(async () => {
      const cloud = await import('/src/loot/cloud.ts');
      await cloud.signOut();
      const ui = await import('/src/ui/cloudSaves.ts');
      ui.renderCloudBar();
      document.querySelector('.sc-google').hidden = false;
    });
    const cancelPopupPromise = context.waitForEvent('page');
    phase = 'checking cancellation';
    await page.locator('.sc-google').click();
    const cancelPopup = await cancelPopupPromise;
    await cancelPopup.waitForURL('**/privacy.html');
    await page.locator('#cloud-dialog button').filter({ hasText: /^Cancel$/ }).click();
    await page.waitForFunction(() => document.querySelector('#cloud-dialog').classList.contains('hidden'),
      null, { polling: 100 });
    assert.equal(finishes.length, 2);
    assert.equal(page.url(), originalUrl);
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), true);
    lines.push('Cancel in game: fullscreen restored, no session created, game remains usable');

    phase = 'closing the native popup';
    const closePopupPromise = context.waitForEvent('page');
    await page.locator('.sc-google').click();
    const closePopup = await closePopupPromise;
    await closePopup.waitForURL('**/privacy.html');
    await page.evaluate(() => { window.__googleFullscreen.refuse = true; });
    await closePopup.close();
    await page.bringToFront();
    await page.waitForFunction(() => document.querySelector('#cloud-dialog').classList.contains('hidden'),
      null, { polling: 100 });
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), false);
    await page.evaluate(() => { window.__googleFullscreen.refuse = false; });
    await page.mouse.click(1, 1);
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), true);
    assert.equal(finishes.length, 2);
    lines.push('Native popup close: waiting dialog closes; refused fullscreen restored on next real interaction');

    phase = 'Google cancellation';
    const declinePopupPromise = context.waitForEvent('page');
    await page.locator('.sc-google').click();
    const declinePopup = await declinePopupPromise;
    await declinePopup.waitForURL('**/privacy.html');
    const declineCallback = new URL(begins.at(-1).returnPath, originalUrl);
    await declinePopup.goto(declineCallback.href + '#cloud-google-error=cancelled').catch((error) => {
      if (!declinePopup.isClosed()) throw error;
    });
    await page.waitForFunction(() => document.querySelector('#cloud-dialog').classList.contains('hidden'),
      null, { polling: 100 });
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), true);
    assert.equal(finishes.length, 2);
    lines.push('Google cancellation: no extra error dialog, previous fullscreen restored');

    phase = 'windowed cancellation';
    await page.evaluate(async () => {
      const fullscreen = await import('/src/ui/autoFullScreen.ts');
      await fullscreen.leaveFullScreen();
    });
    const requestsBefore = await page.evaluate(() => window.__googleFullscreen.requests);
    const windowedPopupPromise = context.waitForEvent('page');
    await page.locator('.sc-google').click();
    const windowedPopup = await windowedPopupPromise;
    await windowedPopup.waitForURL('**/privacy.html');
    await windowedPopup.close();
    await page.bringToFront();
    await page.waitForFunction(() => document.querySelector('#cloud-dialog').classList.contains('hidden'),
      null, { polling: 100 });
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), false);
    assert.equal(await page.evaluate(() => window.__googleFullscreen.requests), requestsBefore);
    lines.push('Windowed start: native popup close leaves the game windowed');

    phase = 'closing before the address request answers';
    holdBegin = true;
    const waitingPopupPromise = context.waitForEvent('page');
    await page.locator('.sc-google').click();
    const waitingPopup = await waitingPopupPromise;
    for (let tries = 0; tries < 30 && !heldBegin; tries++) await page.waitForTimeout(50);
    assert.ok(heldBegin, 'the address request must actually be pending');
    await waitingPopup.close();
    await page.bringToFront();
    await page.waitForFunction(() => document.querySelector('#cloud-dialog').classList.contains('hidden'),
      null, { polling: 100, timeout: 5000 });
    await heldBegin.fulfill({ json: { url: new URL('privacy.html', originalUrl).href } }).catch(() => {});
    heldBegin = null;
    holdBegin = false;
    assert.equal(finishes.length, 2);
    lines.push('Native close during pending address request: waiting dialog cancels without waiting for network');

    phase = 'a refused Google sign-in';
    await page.evaluate(() => document.documentElement.requestFullscreen());
    const refusedPopupPromise = context.waitForEvent('page');
    await page.locator('.sc-google').click();
    const refusedPopup = await refusedPopupPromise;
    await refusedPopup.waitForURL('**/privacy.html');
    const refusedCallback = new URL(begins.at(-1).returnPath, originalUrl);
    await refusedPopup.goto(refusedCallback.href + '#cloud-google-error=refused').catch((error) => {
      if (!refusedPopup.isClosed()) throw error;
    });
    await page.waitForFunction(() => document.querySelector('#cloud-dialog .cd-body')?.textContent
      .includes("Google didn't confirm"), null, { polling: 100 });
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), true);
    await page.locator('#cloud-dialog button').filter({ hasText: /^OK$/ }).click();
    lines.push('Refused sign-in: readable error in the game, prior fullscreen restored');

    phase = 'an address request failure';
    failBegin = true;
    await page.locator('.sc-google').click();
    await page.waitForFunction(() => document.querySelector('#cloud-dialog .cd-body')?.textContent
      .includes('Sign-in temporarily unavailable'), null, { polling: 100 });
    assert.equal(await page.evaluate(() => window.__googleFullscreen.full), true);
    assert.equal(context.pages().filter((candidate) => candidate !== page).length, 0);
    await page.locator('#cloud-dialog button').filter({ hasText: /^OK$/ }).click();
    failBegin = false;
    lines.push('Network/service failure: popup closed, prior fullscreen restored, retry remains available');

    // A refused window must preserve the existing nonce-bound redirect path. Intercept navigation to observe it.
    await page.evaluate(() => { window.open = () => null; });
    phase = 'checking blocked-window fallback';
    const requestsBeforeRedirect = await page.evaluate(() => window.__googleFullscreen.requests);
    await page.evaluate(() => {
      window.addEventListener('pagehide', () => {
        sessionStorage.setItem('lab-google-fullscreen-before-redirect', JSON.stringify(window.__googleFullscreen));
      }, { once: true });
    });
    let redirected = false;
    const redirectRoute = async (route) => {
      redirected = true;
      await route.fulfill({ contentType: 'text/html', body: '<title>Lab Google redirect</title>' });
    };
    await page.route('**/privacy.html', redirectRoute);
    const redirectNavigation = page.waitForURL('**/privacy.html');
    await page.locator('.sc-google').click();
    await redirectNavigation;
    assert.equal(begins.at(-1).returnPath, new URL(originalUrl).pathname + new URL(originalUrl).search);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('last-stand.cloud.google-nonce')),
      begins.at(-1).nonce);
    assert.ok(redirected);
    const fullscreenAtRedirect = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('lab-google-fullscreen-before-redirect')));
    assert.equal(fullscreenAtRedirect.full, false);
    assert.equal(fullscreenAtRedirect.requests, requestsBeforeRedirect, 'do not restore just before redirect');
    await page.unroute('**/privacy.html', redirectRoute);
    lines.push('Blocked popup: same-tab redirect retains the tab-bound nonce');
    return { text: lines.join('\n'), problems: [] };
  } catch (error) {
    const dialog = await page.locator('#cloud-dialog').innerText().catch(() => '(page closed)');
    throw new Error(`lab cloud/google, ${phase}: ${error.message}; dialog: ${dialog}`);
  } finally {
    if (expectedServiceError) {
      // Exactly one intentional HTTP failure belongs to this fixture, not the game's page-error verdict.
      const index = side.errors.findIndex((error) => error.includes('status of 503 (Service Unavailable)'));
      if (index >= 0) side.errors.splice(index, 1);
    }
    if (heldBegin) await heldBegin.abort().catch(() => {});
    await context.unroute('**/saves/**', routeSaves);
    for (const popup of context.pages()) {
      if (popup !== page) await popup.close();
    }
  }
}
