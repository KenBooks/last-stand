// The Google branch of lab cloud: real controls, a separate browser window and the lightweight callback page.
// OAuth replies are fixtures intercepted locally; no request reaches a player's account or Google's service.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Device, SCREENS } from './cloudDevice.mjs';
import { OUT } from './paths.mjs';

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
    await page.locator('#btn-saves').click();
    await page.evaluate(() => { document.querySelector('.sc-google').hidden = false; });
    const popupPromise = context.waitForEvent('page');
    phase = 'opening Google window';
    await page.locator('.sc-google').click();
    const popup = await popupPromise;
    await popup.waitForURL('**/privacy.html');
    phase = 'returning the Google sign-in';
    assert.equal(begins.length, 1);
    assert.equal(await popup.evaluate(() => window.opener), null);
    lines.push(...await waitingDialog(page, context, pictures));
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
    assert.ok(callbackRequests.every((url) => !/\/src\/|\/assets\/|three/.test(url)));
    lines.push('Google sign-in: original game preserved, nonce redeemed once, callback loaded no game assets');

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
    lines.push('Cancel: no session created, game remains usable');

    // A refused window must preserve the existing nonce-bound redirect path. Intercept navigation to observe it.
    await page.evaluate(() => { window.open = () => null; });
    phase = 'checking blocked-window fallback';
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
    await page.unroute('**/privacy.html', redirectRoute);
    lines.push('Blocked popup: same-tab redirect retains the tab-bound nonce');
    return { text: lines.join('\n'), problems: [] };
  } catch (error) {
    const dialog = await page.locator('#cloud-dialog').innerText().catch(() => '(page closed)');
    throw new Error(`lab cloud/google, ${phase}: ${error.message}; dialog: ${dialog}`);
  } finally {
    await context.unroute('**/saves/**', routeSaves);
    for (const popup of context.pages()) {
      if (popup !== page) await popup.close();
    }
  }
}
