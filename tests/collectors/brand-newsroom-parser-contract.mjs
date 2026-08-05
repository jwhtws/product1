import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseBrandNewsroomPayload, SourceStructureChangedError } from '../../scripts/parsers/brand-newsroom-parser.mjs';

export function runBrandNewsroomParserContract(sourceId) {
  test(`${sourceId}: valid/empty/expired/duplicate/non_food/structure_changed fixture`, async () => {
    const fixture = JSON.parse(await readFile(new URL(`../fixtures/food-popups/${sourceId}.json`, import.meta.url), 'utf8'));
    const parse = items => parseBrandNewsroomPayload({ ...fixture.source, items }, { today: '2026-08-05' });
    const valid = parse(fixture.valid.items);
    assert.equal(valid.rows.length, 1);
    assert.equal(valid.rows[0].id, `brand:${sourceId}:valid-1`);
    assert.equal(valid.rows[0].brand, fixture.source.brand);
    assert.equal(valid.rows[0].venue, '성수 테스트키친');
    assert.equal(valid.rows[0].category, 'food-popup');
    assert.equal(valid.sourceHealth.status, 'success_with_items');
    assert.deepEqual(parse(fixture.empty.items).stats.rejectionReasons, {});
    assert.equal(parse(fixture.empty.items).sourceHealth.status, 'success_empty');
    assert.deepEqual(parse(fixture.expired.items).stats.rejectionReasons, { expired: 1 });
    const duplicate = parse(fixture.duplicate.items);
    assert.equal(duplicate.rows.length, 1);
    assert.equal(duplicate.stats.duplicateSourceItemCount, 1);
    assert.deepEqual(duplicate.stats.rejectionReasons, { duplicate_source_item: 1 });
    assert.deepEqual(parse(fixture.non_food.items).stats.rejectionReasons, { not_food: 1 });
    assert.throws(() => parseBrandNewsroomPayload({ ...fixture.source, ...fixture.structure_changed }), SourceStructureChangedError);
  });
}
