import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLLECTION_METHODS, EXPECTED_VOLUMES, IMPLEMENTATION_STATUSES, LEVELS, PAGINATION_TYPES,
  PRIORITIES, ROBOTS_STATUSES, SOURCE_TYPES, UPDATE_FREQUENCIES, loadRegistry, priorityFor,
  validateRegistry
} from '../scripts/audit-data-sources.mjs';

const registry = await loadRegistry();
const sources = registry.sources;

test('등록부는 최소 100개의 고유한 source를 가진다', () => {
  assert.ok(sources.length >= 100);
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
});

test('필수 필드, enum, URL과 우선순위 계산이 유효하다', async () => {
  const result = await validateRegistry(registry);
  assert.deepEqual(result.errors, []);
  for (const source of sources) {
    assert.ok(SOURCE_TYPES.includes(source.sourceType));
    assert.ok(COLLECTION_METHODS.includes(source.collectionMethod));
    assert.ok(IMPLEMENTATION_STATUSES.includes(source.implementationStatus));
    assert.ok(PRIORITIES.includes(source.priority));
    assert.ok(EXPECTED_VOLUMES.includes(source.expectedVolume));
    assert.ok(UPDATE_FREQUENCIES.includes(source.updateFrequency));
    assert.ok(LEVELS.includes(source.stability));
    assert.ok(LEVELS.includes(source.maintenanceCost));
    assert.ok(LEVELS.includes(source.legalRisk));
    assert.ok(ROBOTS_STATUSES.includes(source.robotsStatus));
    assert.ok(PAGINATION_TYPES.includes(source.paginationType));
    assert.doesNotThrow(() => new URL(source.officialUrl));
    assert.doesNotThrow(() => new URL(source.eventUrl));
    assert.equal(source.priority, priorityFor(source.priorityScore));
  }
});

test('카테고리별 최소 목표를 충족한다', () => {
  const count = (...types) => sources.filter(source => types.includes(source.sourceType)).length;
  assert.ok(count('department_store','outlet') >= 20, '백화점·아울렛 20개 이상');
  assert.ok(count('shopping_mall') >= 25, '복합몰·쇼핑몰 25개 이상');
  assert.ok(count('popup_venue') >= 20, '팝업 전문 공간·핵심 장소 20개 이상');
  assert.ok(count('brand_newsroom','brand_official_site','official_blog','social_official') >= 25, '식품·음료 브랜드 공식 출처 25개 이상');
  assert.ok(count('festival','local_government','press_release') >= 10, '축제·지자체·공식 행사 10개 이상');
});

test('active collector 파일은 존재하고 현재 collector 전부가 매핑된다', async () => {
  const active = sources.filter(source => source.implementationStatus === 'active');
  assert.ok(active.every(source => source.collectorFile));
  const mapped = new Set(sources.map(source => source.currentCollector).filter(Boolean));
  for (const name of [
    '현대백화점·현대아울렛','신세계백화점','스타필드·스타필드시티','갤러리아','AK플라자','NC·뉴코아',
    '아이파크몰','이마트·트레이더스','롯데마트','홈플러스','타임스퀘어 공식 사이트맵','롯데 공식 블로그',
    '롯데백화점·롯데아울렛·롯데몰','신세계사이먼 프리미엄 아울렛','IFC몰','두타몰'
  ]) assert.ok(mapped.has(name), `${name} registry 연결 누락`);
});

test('위험 출처와 unverified 출처는 자동 active로 분류되지 않는다', () => {
  const automatic = new Set(['official_api','html','sitemap','rss','json_embedded']);
  for (const source of sources) {
    if (source.legalRisk === 'high' || source.robotsStatus === 'disallowed') assert.ok(!automatic.has(source.collectionMethod));
    if (source.collectionMethod === 'unverified') assert.notEqual(source.implementationStatus, 'active');
  }
});
