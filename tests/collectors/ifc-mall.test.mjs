import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { detailFields, parseIfcList } from '../../scripts/parsers/batch3-venue-parser.mjs';
import { runBatch3VenueContract } from './batch3-venue-parser-contract.mjs';

runBatch3VenueContract('ifc-mall');
test('IFC몰: 실제 공식 JSON 축약 구조', async () => {
  const f = JSON.parse(await readFile(new URL('../fixtures/food-popups/ifc-mall.json', import.meta.url)));
  const [item] = parseIfcList(f.validApiResponse);
  assert.equal(item.sourceItemId, '20000000100');
  assert.equal(item.startDate, '2026-08-01');
  assert.match(item.imageUrl, /ifcmallseoul/u);
  const detail = detailFields(f.validDetail, f.expected.sourceUrl);
  assert.equal(detail.title, '여름 디저트 팝업');
  assert.equal(detail.endDate, '2026-08-31');
  assert.match(detail.imageUrl, /ifcmallseoul/u);
  assert.throws(() => parseIfcList({ nowItems: [] }), /nowList/u);
});
