import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parsePremiumList } from '../../scripts/parsers/batch3-venue-parser.mjs';
import { runBatch3VenueContract } from './batch3-venue-parser-contract.mjs';

runBatch3VenueContract('shinsegae-simon-premium-outlets');
test('premium outlets: 실제 공식 목록 축약 구조', async () => {
  const f = JSON.parse(await readFile(new URL('../fixtures/food-popups/shinsegae-simon-premium-outlets.json', import.meta.url)));
  const items = parsePremiumList(f.validList, { branchCode: '01', venue: f.expected.venue, address: f.expected.address });
  assert.equal(items[0].sourceItemId, '01-100');
  assert.equal(items[0].startDate, '2026-08-01');
});
