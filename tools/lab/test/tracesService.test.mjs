// `lab ui`'s bug report read-back (node/tracesService.mjs `checkReportSent`) against a service of the lab's own: a
// report posted as the form posts one, read back and held to the line the page wrote; its picture lost on the way,
// caught; with the canary, that loss is what must be caught.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkReportSent, startTracesService } from '../node/tracesService.mjs';

const ORIGIN = 'http://localhost:5173';
const TEXT = 'The warrior\'s arm went through his shield as he walked while blocking.';
let service;

before(async () => {
  service = await startTracesService(ORIGIN);
});

after(async () => {
  await service?.close();
});

/** A JPEG's markers as the server reads its size: start, a frame 640x360, end. */
function jpeg() {
  const frame = [0xff, 0xc0, 0, 17, 8, 1, 0x68, 2, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Buffer.from([0xff, 0xd8, ...frame, 0xff, 0xd9]);
}

/** The report posted as the form posts it (`picture`: whether its picture goes); the page's text for it back. */
async function sent(picture) {
  const body = JSON.stringify({
    kind: 'looks', text: TEXT, expected: '', facts: ['Where: the lobby', 'Build: abc1234'],
    picture: picture ? jpeg().toString('base64') : null,
  });
  const response = await fetch(`${service.url}/traces/reports`, { method: 'POST', body, headers: { origin: ORIGIN } });
  assert.equal(response.status, 201);
  const { code } = await response.json();
  const line = `  sent to the reports service: ${code}, kind looks, what happened ${TEXT.length} characters, `
    + `picture ${jpeg().length} bytes`;
  return { text: line, problems: [], code };
}

test('a report read back as sent passes, its code taken out of the text', async () => {
  const result = await sent(true);
  const checked = await checkReportSent(result, service, false);
  assert.deepEqual(checked.problems, []);
  assert.ok(!checked.text.includes(result.code));
  assert.match(checked.text, /read back from the reports service with its token: looks, 70 characters, 2 facts/);
});

test('a report that came back without its picture is a problem, and the canary\'s plant when asked', async () => {
  const lost = await checkReportSent(await sent(false), service, false);
  assert.deepEqual(lost.problems, ['the report came back without its picture']);
  const canary = await checkReportSent(await sent(false), service, true);
  assert.deepEqual(canary.problems, []);
  assert.match(canary.text, /canary: the report's picture dropped on its way caught/);
  const missed = await checkReportSent(await sent(true), service, true);
  assert.equal(missed.problems.length, 1);
});

test('a report never sent is a problem', async () => {
  const checked = await checkReportSent({ text: '  sent to the reports service: nothing', problems: [] }, service, false);
  assert.deepEqual(checked.problems, ['the bug report was never sent to the reports service']);
});
