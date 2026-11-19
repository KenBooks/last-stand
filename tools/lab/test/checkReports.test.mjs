// A check's reports against another check's, how each run went aside (node/checkReports.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from '../node/paths.mjs';
import { compareReports, resultLines } from '../node/checkReports.mjs';

test('a boot, a side read back from the cache and the command\'s time aside; every result line kept', () => {
  const text = [
    'eb13911: booted the warrior (20.0 s)',
    'this tree: booted the mage at low@518400 (14.1 s)',
    'this tree: booted the ranger (43.2 s: the server 0.0, the page loaded 3.1, the loading screen 20.0)',
    'eb13911: as it ran 2026-10-28T22:13:04.000Z (kept in tools/lab/out/ab-cache; --fresh runs it again)',
    'this tree: joints past their ranges: anatomy: hipL.flexion -37 deg',
    '  3.53 steps a second (12.0 s of it moving)',
    '(114.8 s)',
  ].join('\n');
  assert.deepEqual(resultLines(text), [
    'this tree: joints past their ranges: anatomy: hipL.flexion -37 deg',
    '  3.53 steps a second (12.0 s of it moving)',
  ]);
});

test('reports of the same name compared: the same, differing, or missing from the other check', () => {
  mkdirSync(OUT, { recursive: true });
  const root = mkdtempSync(join(OUT, 'check-reports-'));
  try {
    const mine = join(root, 'mine');
    const like = join(root, 'like');
    mkdirSync(mine);
    mkdirSync(like);
    writeFileSync(join(mine, 'a.txt'), 'this tree: booted the mage (9.0 s)\nhops 1\n(30.0 s)');
    writeFileSync(join(like, 'a.txt'), 'this tree: booted the mage (19.0 s)\nhops 1\n(60.0 s)');
    writeFileSync(join(mine, 'b.txt'), 'hops 2');
    writeFileSync(join(like, 'b.txt'), 'hops 3');
    writeFileSync(join(mine, 'c.txt'), 'hops 0');
    const compared = compareReports(mine, like);
    assert.deepEqual(compared.map((report) => [report.name, report.same]), [['a.txt', true], ['b.txt', false],
      ['c.txt', false]]);
    assert.match(compared[1].text, /hops 3/);
    assert.match(compared[2].text, /none in/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
