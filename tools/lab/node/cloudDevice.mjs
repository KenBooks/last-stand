// A device of `lab cloud`'s (tools/lab/node/cloud.mjs): one game in a browser context of its own, with a passkey of its
// own on a virtual authenticator of the browser's (the DevTools protocol's WebAuthn domain, so the game's
// `navigator.credentials` answers as a phone's or a PC's would, with no system prompt), pointed at the lab's saves
// service, its link to it cut and given back as a device going offline does, and its screen pictured at a phone's,
// a tablet's and desktops' sizes with the cloud bar and dialog held to the window (page/cloud.ts `cloudFit`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** how often a wait asks the page again, ms */
const POLL_MS = 100;
/** how long a wait for the cloud's sync or a dialog lasts before it fails, ms */
const WAIT_MS = 20_000;
/** what a resize is given to be laid out before a picture, ms (the page's frames stand still on the lab's clock) */
const SETTLE_MS = 250;

/** the authenticator every device has: a platform one (Windows Hello's, a phone's), the user verified by it */
const AUTHENTICATOR = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

/** The screens each moment is pictured on (src/ui/AGENTS.md's sizes): desktops, an upright tablet, a phone held
 *  sideways (touch, last: a mouse move takes the page back out of touch mode). */
export const SCREENS = [
  { name: '1024x700', width: 1024, height: 700, ratio: 1, touch: false },
  { name: '1920x1080', width: 1920, height: 1080, ratio: 1, touch: false },
  { name: '820x1180', width: 820, height: 1180, ratio: 1, touch: false },
  { name: '844x390', width: 844, height: 390, ratio: 2, touch: true },
];

/** The promise's value, resolved after `ms`. */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One game on the lab's saves service: its page, its context and its DevTools session. */
export class Device {
  /**
   * @param name what reports call it (`A`, `B`)
   * @param page its game's page, booted
   * @param context the page's browser context (its storage and network are the device's alone)
   */
  constructor(name, page, context) {
    this.name = name;
    this.page = page;
    this.context = context;
    this.devtools = null;
    this.serviceUrl = null;
  }

  /** The device given its passkey's authenticator and pointed at the service at `serviceUrl` (`?server=`). */
  async start(serviceUrl) {
    this.serviceUrl = serviceUrl;
    this.devtools = await this.context.newCDPSession(this.page);
    await this.devtools.send('WebAuthn.enable');
    await this.devtools.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR });
    // (the game reads `?server=` on every call, src/net/transport.ts `serverHttp`: no boot again)
    await this.page.evaluate((server) => {
      const address = new URL(location.href);
      address.searchParams.set('server', server);
      history.replaceState(history.state, '', address);
    }, serviceUrl);
  }

  /** Calls `fn` of page/cloud.ts in the page with `args`. */
  call(fn, args) {
    return this.page.evaluate(async ([fn, args]) => {
      const cloud = await import('/tools/lab/page/cloud.ts');
      return cloud[fn](args);
    }, [fn, args]);
  }

  /** What the device shows of the cloud now (page/cloud.ts `CloudState`). */
  state() {
    return this.call('cloudState');
  }

  /** Every slot's heroes on the device now. */
  slots() {
    return this.call('cloudSlots');
  }

  /** Clicks the element `selector` names, as the mouse would. */
  async click(selector) {
    await this.page.locator(selector).first().click({ timeout: WAIT_MS });
  }

  /** Waits until `test` holds of the cloud's state; throws, saying what it waited for and what it saw, if it never
   *  does. */
  async until(test, what) {
    const started = Date.now();
    let state = await this.state();
    while (!test(state)) {
      if (Date.now() - started > WAIT_MS) {
        const seen = `${state.status}${state.message ? ` (${state.message})` : ''}, dialog "${state.dialog.title}"`;
        throw new Error(`lab: cloud: ${this.name} never ${what}: it shows ${seen}`);
      }
      await pause(POLL_MS);
      state = await this.state();
    }
    return state;
  }

  /** Syncs now by the bar's Sync now and waits for it to end synced; returns the state then. */
  async syncNow() {
    const before = (await this.state()).lastSync;
    await this.click('#saves .sv-cloud .sc-sync');
    return this.until((state) => state.status !== 'syncing' && state.lastSync > before || state.dialog.open,
      'synced after Sync now');
  }

  /** The device's link to the saves service cut (`true`) or given back, as a device going offline and online. */
  async offline(cut) {
    const pattern = `${this.serviceUrl}/**`;
    if (cut) await this.context.route(pattern, (route) => route.abort('internetdisconnected'));
    else await this.context.unroute(pattern);
  }

  /**
   * This moment pictured on each of `SCREENS` into `folder` (`<label>-<screen>.png`), the bar and the dialog held to
   * the window on each; returns the lines and problems found.
   */
  async picture(folder, label) {
    mkdirSync(folder, { recursive: true });
    const lines = [];
    const problems = [];
    for (const screen of SCREENS) {
      await this.showOn(screen);
      const file = join(folder, `${label}-${screen.name}.png`);
      const { data } = await this.devtools.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(data, 'base64'));
      const fit = await this.call('cloudFit');
      lines.push(`    ${screen.name}: ${fit.lines.join(', ')}`);
      problems.push(...fit.problems.map((problem) => `${label} at ${screen.name}: ${problem}`));
      if (screen.touch) await this.leaveTouch();
    }
    await this.devtools.send('Emulation.clearDeviceMetricsOverride');
    await pause(SETTLE_MS);
    return { lines, problems };
  }

  /** The page put on `screen` (and in touch mode by a finger's tap on a title, which does nothing). */
  async showOn(screen) {
    const metrics = { width: screen.width, height: screen.height, deviceScaleFactor: screen.ratio, mobile: false };
    await this.devtools.send('Emulation.setDeviceMetricsOverride', metrics);
    await pause(SETTLE_MS);
    if (!screen.touch) return;
    await this.devtools.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const at = await this.page.evaluate(() => {
      const dialog = document.getElementById('cloud-dialog');
      const open = dialog && !dialog.classList.contains('hidden');
      const title = document.querySelector(open ? '#cloud-dialog .sm-title' : '#saves .sv-title');
      const box = title.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    const point = { x: at.x, y: at.y, id: 0 };
    await this.devtools.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await this.devtools.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(SETTLE_MS);
  }

  /** Touch mode left as a mouse moving takes the page out of it (src/ui/touch.ts). */
  async leaveTouch() {
    await this.devtools.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    for (const x of [5, 9]) await this.devtools.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 5 });
  }
}
