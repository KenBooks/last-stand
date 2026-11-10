// The lab's cloud saves (`npm run lab -- cloud`): two devices, the side's page (A) and a partner's in a context of its
// own (B), each with its own passkey (cloudDevice.mjs), playing the save slots screen's cloud bar and dialogs against
// a saves service of the lab's own (savesService.mjs, server/saves). Their slots are seeded as the game keeps them,
// each hero told apart by the tags of his stash's items (page/cloud.ts), and every scenario is held to what each
// device and the service hold after it:
//   link     A makes an account and chooses slot 2 as the cloud save: slots 1 and 2 swap, the service holds slot 2's
//   download B signs in by A's code with every slot full: the dialog names the slot lost before anything changes;
//            confirmed, slot 1 holds the cloud's heroes and the others shift along, the last one gone
//   conflict the mage changed on both while B was offline: B is asked, keeps the cloud's, and its own copy is lost as
//            the dialog said (no slot free); then the warrior so on A, whose own copy goes to its free slot 3
//   merge    different heroes changed on each: both sync with no question, each ending with both changes
// The screen is pictured signed out, signed in and in each dialog at a phone's, a tablet's and desktops' sizes
// (`out/cloud`). `--canary` drops the mage's stash item from every copy of him B downloads: `download` must fail.
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { Device } from './cloudDevice.mjs';
import { startSavesService } from './savesService.mjs';
import { OUT } from './paths.mjs';

/** where the pictures go */
const PICTURES = join(OUT, 'cloud');
/** a hero's profile entry, as slot 1 names it (src/loot/slotData.ts) */
const PROFILE = (classId) => `last-stand.profile.${classId}.v1`;

/** what the browser logs for a call a device made while offline (`Device.offline`) */
const CUT_LINK = 'net::ERR_INTERNET_DISCONNECTED';

/** Each scenario's name, in the order they run (each builds on the ones before it). */
export const CLOUD_SCENARIOS = ['link', 'download', 'conflict', 'merge'];

/** A device's slots as a line: `1: mage[A2-mage] warrior[A2-warrior] | 2: ... | 3: empty`. */
export function slotsText(slots) {
  return Object.entries(slots).map(([slot, heroes]) => `${slot}: ${heroesText(heroes)}`).join(' | ');
}

/** A slot's heroes as text, by class in order, each with his stash's tags. */
export function heroesText(heroes) {
  const classes = Object.keys(heroes).sort();
  if (!classes.length) return 'empty';
  return classes.map((classId) => `${classId}[${[...heroes[classId]].sort().join(',')}]`).join(' ');
}

/** The heroes a save read back from the service holds, as a slot's (the tags of each one's stash). */
export function heroesOfSave(save) {
  const heroes = {};
  for (const [name, part] of Object.entries(save)) {
    if (!name.startsWith('hero.')) continue;
    const classId = name.slice('hero.'.length);
    const profile = JSON.parse(part.value[PROFILE(classId)] ?? 'null');
    if (profile) heroes[classId] = profile.stash.map((item) => item.id);
  }
  return heroes;
}

/** A problem if `seen` isn't `wanted` (both as text), said as `what`. */
function expect(problems, what, seen, wanted) {
  if (seen !== wanted) problems.push(`${what}: ${seen}, not ${wanted}`);
}

/**
 * Runs the scenarios on `side` (its page device A, a partner's B); resolves to the report: a line a scenario with
 * what each device and the service held, the pictures' lines, and the problems.
 */
export async function runCloud(side, { canary = false, pictures = true } = {}) {
  const origin = new URL(side.url).origin;
  const service = await startSavesService(origin);
  const devices = [];
  try {
    const a = new Device('A', side.page, side.context);
    devices.push(a);
    const partner = await side.openPartner(side.heroClass);
    const b = new Device('B', partner, side.partnerContexts.at(-1));
    devices.push(b);
    for (const device of devices) await device.start(service.url);
    const run = { a, b, service, canary, pictures, shots: [] };
    return await runScenarios(run);
  } finally {
    for (const device of devices) await device.offline(false).catch(() => {});
    // (each call a device made while its link was cut is logged by the browser as an error: the scenario's own)
    side.errors = side.errors.filter((error) => !error.includes(CUT_LINK));
    await side.closePartner();
    await service.close();
  }
}

/** Every scenario in turn (stopped at the first that throws: the ones after build on it). */
async function runScenarios(run) {
  const lines = [];
  const problems = [];
  const steps = { link, download, conflict, merge };
  const results = {};
  for (const name of CLOUD_SCENARIOS) {
    let result;
    try {
      result = await steps[name](run);
    } catch (error) {
      result = { lines: [], problems: [String(error.message ?? error)] };
    }
    results[name] = result;
    lines.push(`${name}: ${result.problems.length ? 'FAIL' : 'ok'}`, ...result.lines.map((line) => `  ${line}`));
    problems.push(...result.problems.map((problem) => `${name}: ${problem}`));
    if (run.canary && name === 'download') break;
    if (result.problems.length && result.lines.length === 0) break;
  }
  lines.push('pictures (out/cloud):', ...run.shots.flatMap((shot) => shot.lines));
  problems.push(...run.shots.flatMap((shot) => shot.problems));
  if (!run.canary) return { text: lines.join('\n'), problems };
  // (the canary's drop must fail the download, and is the only problem the command reports then)
  const caught = results.download.problems.length > 0;
  lines.push(`canary, the mage's stash item dropped from B's download: ${caught ? 'caught' : 'went unseen'}`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: an item dropped from a synced save went unseen'] };
}

/** The moment pictured on every screen, if pictures are asked for. */
async function shoot(run, device, label) {
  if (!run.pictures) return;
  const shot = await device.picture(PICTURES, label);
  run.shots.push({ lines: [`  ${label} (${device.name}):`, ...shot.lines], problems: shot.problems });
}

/** Opens the save slots screen from the lobby, as the player does. */
async function openSaves(device) {
  await device.click('#btn-saves');
  await device.until((state) => state.savesOpen, 'opened the save slots screen');
}

/** `link`: A, slots 1 and 2 filled, makes an account and makes slot 2 the cloud save. */
async function link(run) {
  const { a, service } = run;
  const problems = [];
  await a.call('cloudSeed', { 1: { mage: ['A1-mage'] }, 2: { mage: ['A2-mage'], warrior: ['A2-warrior'] } });
  await openSaves(a);
  await shoot(run, a, 'signed-out');
  await a.click('#saves .sv-cloud .sc-new');
  const asked = await a.until((state) => state.dialog.open, 'asked which save goes to the cloud');
  expect(problems, 'the dialog after the new account', asked.dialog.title, 'Which save goes to the cloud?');
  await shoot(run, a, 'choose');
  await a.click('#cloud-dialog .cd-slot[data-slot="2"]');
  const synced = await a.until((state) => state.linked && state.status === 'synced', 'synced slot 1 as the cloud save');
  const slots = await a.slots();
  const wanted = '1: mage[A2-mage] warrior[A2-warrior] | 2: mage[A1-mage] | 3: empty';
  expect(problems, 'A\'s slots', slotsText(slots), wanted);
  const save = await service.readSave(synced.token);
  const kept = heroesText(heroesOfSave(save));
  expect(problems, 'the service\'s save', kept, 'mage[A2-mage] warrior[A2-warrior]');
  await shoot(run, a, 'signed-in');
  await accountMenu(run, problems);
  const lines = [`A's slots: ${slotsText(slots)}`, `the service holds ${kept} (${Object.keys(save).join(', ')})`];
  return { lines, problems };
}

/** The bar's Account dropdown on A: opened by its button, pictured, and closed by a click elsewhere on the screen,
 *  as a dropdown closes (the owner: "should be possible to dismiss Account dropdown by clicking anywhere else"). */
async function accountMenu(run, problems) {
  const { a } = run;
  await a.click('#saves .sc-more > summary');
  await a.until((state) => state.menuOpen, 'opened the Account menu');
  await shoot(run, a, 'account-menu');
  await a.click('#saves .sv-title');
  const after = await a.state();
  if (after.menuOpen) problems.push('the Account menu stayed open after a click elsewhere');
}

/** The canary's drop: every copy of the mage B reads from the service loses his stash's items. */
async function dropMageItems(route) {
  const answer = await route.fetch();
  const value = JSON.parse(gunzipSync(await answer.body()).toString('utf8'));
  const profile = JSON.parse(value[PROFILE('mage')]);
  profile.stash = [];
  value[PROFILE('mage')] = JSON.stringify(profile);
  await route.fulfill({ response: answer, body: gzipSync(JSON.stringify(value)) });
}

/** `download`: B, every slot full, signs in by A's code; the cloud's save comes down into slot 1. */
async function download(run) {
  const { a, b } = run;
  const problems = [];
  const seeded = { 1: { ranger: ['B1-ranger'] }, 2: { warrior: ['B2-warrior'] }, 3: { mage: ['B3-mage'] } };
  await b.call('cloudSeed', seeded);
  const before = slotsText(await b.slots());
  // (Sign in elsewhere shows on production alone, src/ui/cloudSaves.ts `onProduction`: A's code made as it makes it)
  const code = await a.call('cloudMakeCode');
  if (run.canary) await b.context.route(`${run.service.url}/saves/save/hero.mage`, dropMageItems);
  await openSaves(b);
  await b.click('#saves .sv-cloud .sc-code');
  await b.until((state) => state.dialog.open, 'asked for a sign-in code');
  await shoot(run, b, 'code');
  await b.page.locator('#cloud-dialog .cd-code').fill(code);
  await b.click('#cloud-dialog .dc-buttons .primary');
  const asked = await b.until((state) => state.dialog.open && state.dialog.title.includes('cloud save comes'),
    'was told the cloud save comes down');
  if (!/slot 3\b[^.]*overwritten and lost/.test(asked.dialog.text)) {
    problems.push(`the dialog never names slot 3 as lost: "${asked.dialog.text}"`);
  }
  expect(problems, 'B\'s slots while it asks', slotsText(await b.slots()), before);
  await shoot(run, b, 'download');
  await b.click('#cloud-dialog .dc-buttons .danger');
  await b.until((state) => state.linked && state.status === 'synced' && !state.dialog.open, 'synced the download');
  const slots = await b.slots();
  const wanted = '1: mage[A2-mage] warrior[A2-warrior] | 2: ranger[B1-ranger] | 3: warrior[B2-warrior]';
  expect(problems, 'B\'s slots', slotsText(slots), wanted);
  if (run.canary) await b.context.unroute(`${run.service.url}/saves/save/hero.mage`);
  const lines = [`code dialog said: ${oneLine(asked.dialog.text)}`, `B's slots: ${slotsText(slots)}`,
    'A\'s code made by the game\'s call (Sign in elsewhere shows on production alone)'];
  return { lines, problems };
}

/** Text on one line, cut to a length a report reads. */
function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * A hero changed on both devices while `away` was offline, the change on `home` synced first; `away` comes back and
 * syncs: it must be asked, the dialog saying where its own copy goes (`fate`), and keeps the cloud's. Returns the
 * dialog's state and the lines and problems.
 */
async function conflictOn(run, { home, away, classId, tags, fate, label }) {
  const problems = [];
  await away.offline(true);
  await home.call('cloudAddItem', { classId, tag: tags.home });
  await home.syncNow();
  await away.call('cloudAddItem', { classId, tag: tags.away });
  await away.click('#saves .sv-cloud .sc-sync');
  await away.until((state) => state.status === 'offline', 'went offline as its link was cut');
  if ((await away.state()).dialog.open) problems.push(`${away.name} asked something while offline`);
  const before = slotsText(await away.slots());
  await away.offline(false);
  await away.click('#saves .sv-cloud .sc-sync');
  const asked = await away.until((state) => state.dialog.open && state.dialog.title.includes('changed in two places'),
    `was asked which ${classId} to keep`);
  if (!fate.test(asked.dialog.text)) problems.push(`the dialog never says ${fate}: "${oneLine(asked.dialog.text)}"`);
  expect(problems, `${away.name}'s slots while it asks`, slotsText(await away.slots()), before);
  await shoot(run, away, label);
  await away.page.locator('#cloud-dialog .dc-buttons button', { hasText: 'Keep the cloud\'s' }).click();
  await away.until((state) => !state.dialog.open && state.pending === 0 && state.status === 'synced',
    'settled the conflict');
  return { asked, problems };
}

/** `conflict`: the mage on B (no slot free: its copy lost), then the warrior on A (its copy to slot 3). */
async function conflict(run) {
  const { a, b } = run;
  const lost = /No slot is free[^.]*lost/;
  const onB = await conflictOn(run, { home: a, away: b, classId: 'mage', tags: { home: 'A-edit', away: 'B-edit' },
    fate: lost, label: 'conflict-lost' });
  const problems = [...onB.problems];
  const bSlots = await b.slots();
  const wantedB = '1: mage[A-edit,A2-mage] warrior[A2-warrior] | 2: ranger[B1-ranger] | 3: warrior[B2-warrior]';
  expect(problems, 'B\'s slots after keeping the cloud\'s mage', slotsText(bSlots), wantedB);
  await a.syncNow();
  const onA = await conflictOn(run, { home: b, away: a, classId: 'warrior',
    tags: { home: 'B-edit', away: 'A-edit' }, fate: /goes to slot 3/, label: 'conflict-spare' });
  problems.push(...onA.problems);
  const aSlots = await a.slots();
  const wantedA = '1: mage[A-edit,A2-mage] warrior[A2-warrior,B-edit] | 2: mage[A1-mage] '
    + '| 3: warrior[A-edit,A2-warrior]';
  expect(problems, 'A\'s slots after keeping the cloud\'s warrior', slotsText(aSlots), wantedA);
  const lines = [`B asked: ${oneLine(onB.asked.dialog.title)}; B's slots: ${slotsText(bSlots)}`,
    `A asked: ${oneLine(onA.asked.dialog.title)}; A's slots: ${slotsText(aSlots)}`];
  return { lines, problems };
}

/** `merge`: the warrior changed on A and the mage on B: each syncs with no question and ends with both. */
async function merge(run) {
  const { a, b, service } = run;
  const problems = [];
  await b.syncNow();
  await a.call('cloudAddItem', { classId: 'warrior', tag: 'A-merge' });
  await b.call('cloudAddItem', { classId: 'mage', tag: 'B-merge' });
  for (const device of [a, b, a]) {
    const state = await device.syncNow();
    if (state.dialog.open || state.pending) problems.push(`${device.name} was asked: "${state.dialog.title}"`);
  }
  const wanted = 'mage[A-edit,A2-mage,B-merge] warrior[A-merge,A2-warrior,B-edit]';
  const aOne = heroesText((await a.slots())[1]);
  const bOne = heroesText((await b.slots())[1]);
  const kept = heroesText(heroesOfSave(await service.readSave((await a.state()).token)));
  expect(problems, 'A\'s slot 1', aOne, wanted);
  expect(problems, 'B\'s slot 1', bOne, wanted);
  expect(problems, 'the service\'s save', kept, wanted);
  return { lines: [`A's slot 1: ${aOne}`, `B's slot 1: ${bOne}`, `the service: ${kept}`], problems };
}
