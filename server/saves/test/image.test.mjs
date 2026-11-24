// The image (Dockerfile) holds every module the service imports: its COPY names each file, and a module added to the
// service but not there crashes the deployed container at its start (#700's friends.mjs failed every deploy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SERVICE = resolve(import.meta.dirname, '..');

/** The files the Dockerfile's COPY lines put in the image (the last argument is the destination). */
function copiedFiles() {
  const dockerfile = readFileSync(join(SERVICE, 'Dockerfile'), 'utf8');
  const copies = dockerfile.split('\n').filter((line) => line.startsWith('COPY '));
  return new Set(copies.flatMap((line) => line.split(/\s+/).slice(1, -1)));
}

/** The service's own modules `file` imports (`from './x.mjs'`). */
function localImports(file) {
  const source = readFileSync(join(SERVICE, file), 'utf8');
  return [...source.matchAll(/from '\.\/([\w-]+\.mjs)'/g)].map((match) => match[1]);
}

test('the image holds every module the service imports, from its entry point on', () => {
  const copied = copiedFiles();
  const entry = /CMD \["node", "([\w-]+\.mjs)"\]/.exec(readFileSync(join(SERVICE, 'Dockerfile'), 'utf8'))?.[1];
  assert.ok(entry, 'the Dockerfile names its entry point');
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...localImports(file));
  }
  const missing = [...seen].filter((file) => !copied.has(file));
  assert.deepEqual(missing, [], `the Dockerfile's COPY lacks ${missing.join(', ')}`);
});
