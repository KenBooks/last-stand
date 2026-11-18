// The sheet's images (node/sheetImage.mjs): a long sheet's parts named after its first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partFile } from '../node/sheetImage.mjs';

test("a sheet's first part is its file, the rest numbered before the extension", () => {
  assert.equal(partFile('out/sit/sheet.png', 1), 'out/sit/sheet.png');
  assert.equal(partFile('out/sit/sheet.png', 2), 'out/sit/sheet-2.png');
  assert.equal(partFile('out\\gait\\film-main-3.png', 4), 'out\\gait\\film-main-3-4.png');
  assert.equal(partFile('out/sheet', 2), 'out/sheet-2');
});
