import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('restaurant thumbnails do not show a category label', async () => {
  const app = await readFile('app.js', 'utf8');

  assert.match(app, /<div class="listing-photo neutral-photo" data-place-photo><span data-photo-badge>사진 없음<\/span><\/div>/u);
  assert.doesNotMatch(app, /data-place-photo data-category-label=/u);
  assert.doesNotMatch(app, /data-photo-badge>\$\{escapeHtml\(categoryLabel\(r\)\)\}/u);
});
