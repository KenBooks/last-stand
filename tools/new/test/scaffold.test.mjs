// The scaffold's copies, names and markers, and every kind's default sibling still in the repo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { KINDS } from '../kinds.mjs';
import { copiesFor, copyProblem, idProblem, marked, markerName, renamed } from '../scaffold.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** The repo's files, as new.mjs hands them to the scaffold. */
const REPO_FILES = {
  exists: (/** @type {string} */ file) => fs.existsSync(path.join(ROOT, file)),
  list: (/** @type {string} */ folder) => fs.readdirSync(path.join(ROOT, folder)).sort(),
};

/** Files that exist as the set names them, folders listed from it. @param {string[]} paths */
function fakeFiles(paths) {
  return {
    exists: (/** @type {string} */ file) => paths.includes(file),
    list: (/** @type {string} */ folder) => paths.filter((p) => p.startsWith(folder)).map((p) => p.slice(folder.length)),
  };
}

test('an id is camelCase from a lower-case letter', () => {
  assert.equal(idProblem('spitter'), undefined);
  assert.equal(idProblem('bonePile2'), undefined);
  assert.ok(idProblem('Spitter'));
  assert.ok(idProblem('bone-pile'));
  assert.ok(idProblem('2pile'));
});

test('the sibling\'s id is renamed as a word of its own and capitalised, never inside another word', () => {
  const text = "import { buildImp } from '../models/imp';\nfoeModels({ imp: buildImp }); // Imp, important";
  const out = renamed(text, 'imp', 'spitter');
  assert.equal(out, "import { buildImp } from '../models/spitter';\nfoeModels({ spitter: buildImp }); // Spitter, important");
});

test('code is marked with a name the typecheck refuses; markup and styles with a note', () => {
  assert.match(marked('a.ts', 'x\n', 'imp'), new RegExp(`^// new: .*\\n${markerName('imp')};\\nx\\n$`));
  assert.match(marked('a.html', '<div></div>\n', 'talk'), /^<!-- new: .* -->\n<div>/);
  assert.match(marked('_a.scss', 'a {}\n', 'talk'), /^\/\/ new: .*\na \{\}/);
  assert.equal(marked('a.txt', 'x', 'talk'), 'x');
  assert.match(marked('a.ts', 'x\r\ny\r\n', 'imp'), /;\r\nx\r\n/, 'keeps the file\'s line endings');
});

test('a screen\'s folder is copied whole, its files renamed', () => {
  const files = fakeFiles(['src/ui/screens/trade/trade.ts', 'src/ui/screens/trade/_trade.scss',
    'src/ui/screens/trade/trade-ask.html']);
  const copies = copiesFor(KINDS.screen, 'trade', 'bazaar', files).map((c) => c.to);
  assert.deepEqual(copies.sort(), ['src/ui/screens/bazaar/_bazaar.scss', 'src/ui/screens/bazaar/bazaar-ask.html',
    'src/ui/screens/bazaar/bazaar.ts']);
});

test('a place with no build of its own copies its data alone', () => {
  const files = fakeFiles(['src/data/places/notice.ts']);
  assert.deepEqual(copiesFor(KINDS.place, 'notice', 'well', files), [
    { from: 'src/data/places/notice.ts', to: 'src/data/places/well.ts' },
  ]);
});

test('a missing sibling or a file already there stops it', () => {
  const files = fakeFiles(['src/data/foes/imp.ts', 'src/entities/foes/imp.ts', 'src/entities/foes/brute.ts']);
  assert.match(copyProblem(KINDS.foe, 'ghoul', 'spitter', files) ?? '', /no src\/data\/foes\/ghoul\.ts/);
  assert.match(copyProblem(KINDS.foe, 'imp', 'brute', files) ?? '', /already there/);
  assert.equal(copyProblem(KINDS.foe, 'imp', 'spitter', files), undefined);
});

test('every kind\'s default sibling is in the repo, each of its files', () => {
  for (const [name, kind] of Object.entries(KINDS)) {
    assert.equal(copyProblem(kind, kind.like, 'zzNewCheck', REPO_FILES), undefined, name);
    for (const copy of copiesFor(kind, kind.like, 'zzNewCheck', REPO_FILES)) {
      assert.ok(REPO_FILES.exists(copy.from), `${name}: ${copy.from}`);
    }
  }
});
