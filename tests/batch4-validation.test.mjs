import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BATCH4_BRAND_SOURCES } from '../scripts/collectors/batch4-brand-newsrooms.mjs';
import { COLLECTOR_SCOPES } from '../scripts/collectors/registry.mjs';
import { parseBrandNewsroomPayload, SourceStructureChangedError } from '../scripts/parsers/brand-newsroom-parser.mjs';

const targets = [
  ['cj-cheiljedang-newsroom', 'brand-cj-cheiljedang'],
  ['ottogi-newsroom', 'brand-ottogi'],
  ['samyang-foods-newsroom', 'brand-samyang-foods'],
  ['orion-newsroom', 'brand-orion'],
  ['ediya-news', 'brand-ediya'],
  ['gongcha-news', 'brand-gongcha'],
  ['dongwon-fnb-news', 'brand-dongwon-fnb'],
  ['pulmuone-newsroom', 'brand-pulmuone'],
  ['kyochon-news', 'brand-kyochon']
];

test('Batch4 source는 Registry, collector, fixture, test, 부분 실행에 모두 연결된다', async () => {
  const registry = JSON.parse(await readFile(new URL('../data/data-source-registry.json', import.meta.url), 'utf8'));
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const [sourceId, scope] of targets) {
    const source = registry.sources.find(item => item.id === sourceId);
    const config = BATCH4_BRAND_SOURCES.find(item => item.id === sourceId);
    assert.ok(source, `${sourceId}: Registry 누락`);
    assert.ok(config, `${sourceId}: collector config 누락`);
    assert.equal(source.priority, 'A');
    assert.ok(['brand_newsroom', 'brand_official_site'].includes(source.sourceType));
    assert.equal(source.implementationStatus, 'active');
    assert.equal(source.currentCollector, `브랜드 공식 · ${config.name}`);
    assert.ok(existsSync(source.collectorFile), `${sourceId}: collector 파일 누락`);
    assert.ok(existsSync(source.testFile), `${sourceId}: parser test 누락`);
    assert.ok(existsSync(`tests/fixtures/food-popups/${sourceId}.json`), `${sourceId}: fixture 누락`);
    assert.ok(packageJson.scripts[`data:refresh-${scope}`], `${sourceId}: npm 부분 실행 누락`);
    assert.deepEqual(COLLECTOR_SCOPES[scope], [source.currentCollector]);
  }
  assert.ok(existsSync('scripts/parsers/brand-newsroom-parser.mjs'));
});

test('Batch4 fixture는 필수 상태와 parser 필드·food·popup 판별을 검증한다', async () => {
  for (const [sourceId] of targets) {
    const fixture = JSON.parse(await readFile(new URL(`./fixtures/food-popups/${sourceId}.json`, import.meta.url), 'utf8'));
    for (const state of ['valid', 'empty', 'expired', 'duplicate', 'structure_changed', 'non_food']) {
      assert.ok(state in fixture, `${sourceId}: ${state} fixture 누락`);
    }
    const parse = items => parseBrandNewsroomPayload({ ...fixture.source, items }, { today: '2026-08-05' });
    const valid = parse(fixture.valid.items);
    const row = valid.rows[0];
    assert.equal(valid.rows.length, 1, `${sourceId}: valid 승인 실패`);
    assert.equal(row.name, fixture.valid.items[0].title);
    assert.equal(row.brand, fixture.source.brand);
    assert.equal(row.venue, fixture.valid.items[0].venue);
    assert.equal(row.startDate, fixture.valid.items[0].startDate);
    assert.equal(row.endDate, fixture.valid.items[0].endDate);
    assert.equal(row.sourceUrl, fixture.valid.items[0].sourceUrl);
    assert.equal(row.imageUrl, fixture.valid.items[0].imageUrl);
    assert.equal(row.sourceItemId, fixture.valid.items[0].sourceItemId);
    assert.equal(row.category, 'food-popup');
    assert.equal(parse(fixture.empty.items).sourceHealth.status, 'success_empty');
    assert.equal(parse(fixture.expired.items).stats.rejectionReasons.expired, 1);
    assert.equal(parse(fixture.duplicate.items).stats.rejectionReasons.duplicate_source_item, 1);
    assert.equal(parse(fixture.non_food.items).stats.rejectionReasons.not_food, 1);
    const notPopup = {
      ...fixture.valid.items[0], sourceItemId: 'not-popup-validation',
      title: '브랜드 여름 신제품 행사', description: '베이커리와 커피 체험 행사'
    };
    assert.equal(parse([notPopup]).stats.rejectionReasons.not_popup, 1);
    assert.throws(
      () => parseBrandNewsroomPayload({ ...fixture.source, ...fixture.structure_changed }, { today: '2026-08-05' }),
      SourceStructureChangedError
    );
  }
});
