import { test } from 'node:test';
import { deepStrictEqual, rejects } from 'node:assert/strict';
import { readPicturedReport } from '../node/picturedReport.mjs';

test('reads the metadata and each moment separately, preserving their order', async () => {
  const value = {
    text: 'report',
    problems: ['a problem'],
    moments: [{ label: 'first', tiles: ['image one'] }, { label: 'second', tiles: ['image two'] }],
  };
  const transferred = [];
  const report = {
    async evaluate(fn, argument) {
      const part = fn(value, argument);
      transferred.push(part);
      return part;
    },
  };
  deepStrictEqual(await readPicturedReport(report), value);
  deepStrictEqual(transferred, [
    { text: 'report', problems: ['a problem'], count: 2 },
    value.moments[0],
    value.moments[1],
  ]);
});

test('propagates an error transferring a moment', async () => {
  const report = {
    async evaluate(fn, index) {
      if (index === 0) throw new Error('picture lost');
      return fn({ text: '', problems: [], moments: [{}] });
    },
  };
  await rejects(readPicturedReport(report), /picture lost/);
});
