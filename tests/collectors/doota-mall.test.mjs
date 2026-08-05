import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDootaList } from '../../scripts/parsers/batch3-venue-parser.mjs';
import { runBatch3VenueContract } from './batch3-venue-parser-contract.mjs';

runBatch3VenueContract('doota-mall');
test('두타몰: 실제 공식 JSON 축약 구조', async () => {
  const f = JSON.parse(await readFile(new URL('../fixtures/food-popups/doota-mall.json', import.meta.url)));
  const [item] = parseDootaList(f.validApiResponse);
  assert.equal(item.sourceItemId, '100');
  assert.equal(item.endDate, '2026-08-31');
  assert.match(item.sourceUrl, /event_view/u);
});
