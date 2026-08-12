import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildPopupSiteFeed, buildSiteFeedPayload, SITE_FEED_FIELDS } from '../scripts/build-popup-site-feed.mjs';

const base = {
  id: 'brand:test:1', name: '테스트커피 팝업', brand: '(주) 테스트커피', venue: ' 성수  테스트키친 ',
  address: '서울특별시 성동구 연무장길 1', category: 'food_popup', startDate: '2026.8.1', endDate: '2026.8.7',
  imageUrl: 'https://official.example/popup.jpg', sourceUrl: 'https://official.example/news/1?keep=yes',
  sourceName: '테스트 공식 뉴스', sourceGrade: 'official', firstSeenAt: '2026-08-01', lastSeenAt: '2026-08-05',
  menus: [{ name: '공식 메뉴', price: null, priceText: '가격 미공개', sourceUrl: 'https://official.example/news/1', sourceName: '테스트 공식 뉴스', evidenceType: 'html' }],
  menuItems: ['공식 메뉴'], imageValidation: { status: 'valid', contentType: 'image/jpeg', width: 800, height: 600 },
  contentQuality: 'B', publishStatus: 'published', qualityReasons: [],
  contentSearch: { status: 'found' }
};

test('단일 Site Feed는 필수 필드, 중복, Status, D-Day, NEW, 종료 임박을 정규화한다', () => {
  const payload = {
    updatedAt: '2026-08-05T00:00:00.000Z', sources: [], stats: {},
    popups: [
      base,
      { ...base },
      { ...base, id: 'brand:other:duplicate', sourceGrade: 'official-search' },
      { ...base, id: 'brand:test:2', brand: '예정브랜드', venue: '예정 장소', sourceUrl: 'https://official.example/news/2', startDate: '2026/08/08', endDate: '2026/08/20', firstSeenAt: '2026-07-20' },
      { ...base, id: 'brand:test:3', brand: '종료브랜드', venue: '종료 장소', sourceUrl: 'https://official.example/news/3', startDate: '2026-07-01', endDate: '2026-08-04' },
      { ...base, id: 'brand:test:5', brand: '칠일브랜드', venue: '칠일 장소', sourceUrl: 'https://official.example/news/5', firstSeenAt: '2026-07-29' },
      { ...base, id: 'brand:test:4', brand: '누락브랜드', venue: '누락 장소', sourceUrl: '' },
      { ...base, id: 'brand:test:review', brand: '검토브랜드', venue: '검토 장소', publishStatus: 'review_required', contentQuality: 'C' }
    ]
  };
  const { feed, stats } = buildSiteFeedPayload(payload, { today: '2026-08-05', generatedAt: '2026-08-05T12:00:00.000Z' });
  assert.equal(feed.feedVersion, 1);
  assert.equal(stats.inputCount, 8);
  assert.equal(stats.outputCount, 4);
  assert.equal(stats.duplicateRemovedCount, 2);
  assert.deepEqual(stats.statusDistribution, { upcoming: 1, ongoing: 2, ended: 1 });
  assert.equal(stats.newCount, 3);
  assert.equal(stats.endingSoonCount, 2);
  assert.equal(stats.rejectionReasons.duplicate_id, 1);
  assert.equal(stats.rejectionReasons.duplicate_identity, 1);
  assert.equal(stats.rejectionReasons.missing_value_officialUrl, 1);
  assert.equal(stats.rejectionReasons.quality_review_required, 1);
  assert.equal(stats.qualityExcludedCount, 1);

  const ongoing = feed.popups.find(row => row.id === base.id);
  const upcoming = feed.popups.find(row => row.id === 'brand:test:2');
  const ended = feed.popups.find(row => row.id === 'brand:test:3');
  assert.ok(SITE_FEED_FIELDS.every(field => field in ongoing));
  assert.equal(ongoing.title, base.name);
  assert.equal(ongoing.name, base.name);
  assert.equal(ongoing.brand, '테스트커피');
  assert.equal(ongoing.venue, '성수 테스트키친');
  assert.equal(ongoing.branch, '성수 테스트키친');
  assert.equal(ongoing.category, 'food-popup');
  assert.equal(ongoing.status, 'ongoing');
  assert.equal(ongoing.dDay, 2);
  assert.equal(ongoing.isNew, true);
  assert.equal(ongoing.isEndingSoon, true);
  assert.equal(ongoing.image, base.imageUrl);
  assert.equal(ongoing.officialUrl, base.sourceUrl);
  assert.equal(ongoing.sourceUrl, base.sourceUrl);
  assert.equal(ongoing.sourceItemId, 'test:1');
  assert.equal(ongoing.latitude, null);
  assert.equal(ongoing.longitude, null);
  assert.equal(upcoming.status, 'upcoming');
  assert.equal(upcoming.dDay, 3);
  assert.equal(upcoming.isNew, false);
  assert.equal(upcoming.isEndingSoon, false);
  assert.equal(ended.status, 'ended');
  assert.equal(ended.dDay, -1);
  assert.equal(feed.popups.find(row => row.id === 'brand:test:5').isNew, true);
});

test('Feed 파일과 기존 run-report에 누락·중복 사유를 기록한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mukdang-site-feed-'));
  const feedPath = join(directory, 'popups.json');
  const reportPath = join(directory, 'run-report.json');
  await writeFile(feedPath, JSON.stringify({ sources: [], stats: {}, popups: [base, { ...base }, { ...base, id: 'invalid', sourceUrl: '' }] }));
  await writeFile(reportPath, JSON.stringify({ runId: 'fixture-run' }));
  await buildPopupSiteFeed({ inputPath: feedPath, outputPath: feedPath, reportPath, today: '2026-08-05', generatedAt: '2026-08-05T12:00:00.000Z' });
  const feed = JSON.parse(await readFile(feedPath, 'utf8'));
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(feed.popups.length, 1);
  assert.equal(report.runId, 'fixture-run');
  assert.equal(report.siteFeed.outputCount, 1);
  assert.equal(report.siteFeed.rejectionReasons.duplicate_id, 1);
  assert.equal(report.siteFeed.rejectionReasons.missing_value_officialUrl, 1);
});

test('수동 제외 팝업은 숨기고 같은 원본의 정상 큐레이션 항목은 유지한다', () => {
  const excluded = {
    ...base,
    id: 'lotte:discovered:0399:SNM00000000000549036',
    name: '컵빙수의 정석 Pop-Up'
  };
  const curated = {
    ...base,
    id: 'lotte:dongtan:yoajung',
    name: '요아정 컵빙수',
    brand: '요아정',
    venue: '롯데백화점 동탄점'
  };
  const { feed, stats } = buildSiteFeedPayload(
    { sources: [], stats: {}, popups: [excluded, curated] },
    { today: '2026-08-05', generatedAt: '2026-08-05T12:00:00.000Z' }
  );

  assert.deepEqual(feed.popups.map(row => row.id), ['lotte:dongtan:yoajung']);
  assert.equal(stats.rejectionReasons.manually_excluded, 1);
});
