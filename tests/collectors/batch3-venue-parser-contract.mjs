import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseBatch3VenuePayload, SourceStructureChangedError } from '../../scripts/parsers/batch3-venue-parser.mjs';

export function runBatch3VenueContract(sourceId, fixtureName = sourceId) {
  test(`${sourceId}: fixture parser 계약`, async () => {
    const fixture = JSON.parse(await readFile(new URL(`../fixtures/food-popups/${fixtureName}.json`, import.meta.url), 'utf8'));
    assert.equal(fixture.metadata.sourceId, sourceId);
    assert.ok(fixture.metadata.officialUrl);
    assert.ok(fixture.metadata.capturedAt);
    assert.ok(fixture.metadata.fixturePurpose);
    const result = parseBatch3VenuePayload(fixture.payload, { today: '2026-08-05' });
    assert.equal(result.rows.length, 1);
    const row = result.rows[0];
    assert.equal(row.name, '여름 디저트 팝업');
    assert.equal(row.brand, '먹당베이커리');
    assert.equal(row.venue, fixture.expected.venue);
    assert.equal(row.branch, fixture.expected.branch);
    assert.equal(row.address, fixture.expected.address);
    assert.equal(row.startDate, '2026-08-01');
    assert.equal(row.endDate, '2026-08-31');
    assert.equal(row.imageUrl, fixture.expected.imageUrl);
    assert.equal(row.sourceUrl, fixture.expected.sourceUrl);
    assert.equal(row.sourceItemId, 'evt-100');
    assert.equal(row.category, 'food-popup');
    assert.ok(result.stats.fetchedCount >= result.rows.length);
    assert.deepEqual(result.stats.rejectionReasons, { duplicate_source_item: 1, expired: 1, not_food: 1, not_popup: 1, invalid_date: 1, structure_changed: 1 });
    assert.equal(result.stats.duplicateSourceItemCount, 1);
    assert.equal(parseBatch3VenuePayload({ ...fixture.payload, items: [] }, { today: '2026-08-05' }).sourceHealth.status, 'success_empty');
    assert.throws(() => parseBatch3VenuePayload(fixture.structureChanged), SourceStructureChangedError);
  });
}
