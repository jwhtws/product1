import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('restaurant thumbnails do not show a category label', async () => {
  const [app, home] = await Promise.all([
    readFile('app.js', 'utf8'),
    readFile('index.html', 'utf8')
  ]);

  assert.match(app, /<div class="listing-photo neutral-photo" data-place-photo><span data-photo-badge>사진 없음<\/span><\/div>/u);
  assert.doesNotMatch(app, /data-place-photo data-category-label=/u);
  assert.doesNotMatch(app, /data-photo-badge>\$\{escapeHtml\(categoryLabel\(r\)\)\}/u);
  assert.match(app, /<div class="card-top restaurant-card-top"><button class="save/u);
  assert.doesNotMatch(app, /<div class="card-top"><span class="category">\$\{escapeHtml\(r\.category \|\| '음식점'\)\}<\/span>/u);
  assert.match(home, /app\.js\?v=20260901-mobile-critical-path-1/u);
});
