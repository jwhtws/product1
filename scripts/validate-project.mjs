import { readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { SITE_FEED_FIELDS } from './build-popup-site-feed.mjs';

const roots = ['app.js', 'js', 'functions', 'scripts', 'design-system', 'component-showcase'];
const javascript = [];

function collect(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) collect(join(path, entry));
  } else if (/\.[cm]?js$/.test(path)) {
    javascript.push(path);
  }
}

for (const root of roots) collect(root);
for (const file of javascript) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(`${file}\n${result.stderr}`);
    process.exitCode = 1;
  }
}

const html = readFileSync('index.html', 'utf8');
for (const required of ['type="module"', 'app.js?v=', 'styles.css?v=']) {
  if (!html.includes(required)) {
    console.error(`index.html 필수 항목 누락: ${required}`);
    process.exitCode = 1;
  }
}

for (const file of [
  'design-system/theme.css', 'design-system/components.css', 'design-system/components.js',
  'design-system/README.md', 'component-showcase/index.html', 'component-showcase/showcase.css',
  ...['color', 'spacing', 'radius', 'shadow', 'typography', 'animation', 'breakpoints', 'zindex'].map(name => `design-system/tokens/${name}.ts`)
]) {
  try { statSync(file); } catch { console.error(`디자인 시스템 필수 파일 누락: ${file}`); process.exitCode = 1; }
}
const showcase = readFileSync('component-showcase/index.html', 'utf8');
for (const required of ['design-system/theme.css', 'design-system/components.css', 'showcase.js', 'data-modal-open', 'aria-selected']) {
  if (!showcase.includes(required)) { console.error(`컴포넌트 쇼케이스 필수 항목 누락: ${required}`); process.exitCode = 1; }
}

const app = readFileSync('app.js', 'utf8');
for (const forbidden of ['r.trust', 'r.mood', 'mood-filter']) {
  if (app.includes(forbidden) || html.includes(forbidden)) {
    console.error(`제거된 데모 필드가 다시 추가됨: ${forbidden}`);
    process.exitCode = 1;
  }
}

const regions = JSON.parse(readFileSync('data/restaurants/regions.json', 'utf8'));
if (!Number.isFinite(regions.total) || !Array.isArray(regions.regions) || !regions.regions.length) {
  console.error('regions.json 구조가 올바르지 않습니다.');
  process.exitCode = 1;
}

const popupData = JSON.parse(readFileSync('data/popups.json', 'utf8'));
if (!Array.isArray(popupData.popups) || !Array.isArray(popupData.sources)) {
  console.error('popups.json 구조가 올바르지 않습니다.');
  process.exitCode = 1;
}
const seoulToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const expectedPopupStatus = popup => popup.endDate && popup.endDate < seoulToday
  ? 'ended'
  : popup.startDate > seoulToday ? 'upcoming' : 'ongoing';
const robots = readFileSync('robots.txt', 'utf8');
const sitemap = readFileSync('sitemap.xml', 'utf8');
if (!robots.includes('Sitemap: https://mukdang.com/sitemap.xml') || !sitemap.includes('<loc>https://mukdang.com/food-popups/')) {
  console.error('검색엔진 사이트맵 도메인 또는 푸드 팝업 URL이 올바르지 않습니다.');
  process.exitCode = 1;
}
const sitemapLocations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
if (!sitemapLocations.length || sitemapLocations.some(location => /[^\x00-\x7F]/u.test(location))) {
  console.error('사이트맵 URL은 네이버 호환 퍼센트 인코딩 형식이어야 합니다.');
  process.exitCode = 1;
}
if (!statSync('food-popups').isDirectory() || !statSync('restaurant-reviews').isDirectory()) {
  console.error('검색엔진 상세 페이지가 생성되지 않았습니다. npm run seo:build를 실행하세요.');
  process.exitCode = 1;
}
const curatedPopups = JSON.parse(readFileSync('data/curated-popups.json', 'utf8'));
if (!Array.isArray(curatedPopups) || curatedPopups.some(row => !Array.isArray(row) || row.length !== 6)) {
  console.error('curated-popups.json 구조가 올바르지 않습니다.');
  process.exitCode = 1;
}
const lotteVenueCodes = new Map([
  ['롯데백화점 본점', '0001'], ['롯데백화점 노원점', '0022'],
  ['롯데백화점 센텀시티점', '0027'], ['롯데백화점 건대스타시티점', '0028'],
  ['롯데백화점 광복점', '0333'],
  ['롯데백화점 안산점', '0336'], ['롯데아울렛 청주점', '0342'],
  ['롯데백화점 인천점', '0344'], ['롯데백화점 동탄점', '0399']
]);
for (const popup of popupData.popups) {
  const missingFeedField = SITE_FEED_FIELDS.find(field => !(field in popup));
  if (missingFeedField) {
    console.error(`사이트 Feed 필드가 누락됐습니다: ${popup.id || '알 수 없음'} (${missingFeedField})`);
    process.exitCode = 1;
  }
  if (!popup.id || !popup.name || !/^\d{4}-\d{2}-\d{2}$/.test(popup.startDate) || (popup.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(popup.endDate))) {
    console.error(`팝업 필수값이 올바르지 않습니다: ${popup.id || popup.name || '알 수 없음'}`);
    process.exitCode = 1;
  }
  if (!popup.sourceUrl || !/^https:\/\//.test(popup.sourceUrl)) {
    console.error(`팝업 출처 URL이 올바르지 않습니다: ${popup.id}`);
    process.exitCode = 1;
  }
  if (popup.status !== expectedPopupStatus(popup)) {
    console.error(`팝업 종료 상태가 날짜와 일치하지 않습니다: ${popup.id} (${popup.status} → ${expectedPopupStatus(popup)})`);
    process.exitCode = 1;
  }
  if (popup.title !== popup.name || popup.officialUrl !== popup.sourceUrl || !Array.isArray(popup.tags)
    || (popup.dDay !== null && !Number.isInteger(popup.dDay)) || typeof popup.isNew !== 'boolean' || typeof popup.isEndingSoon !== 'boolean') {
    console.error(`사이트 Feed 호환 필드가 올바르지 않습니다: ${popup.id}`);
    process.exitCode = 1;
  }
  if (!['official', 'official-search', 'verified-field'].includes(popup.sourceGrade)) {
    console.error(`팝업은 공식 또는 현장검증 출처만 허용됩니다: ${popup.id}`);
    process.exitCode = 1;
  }
  if (popup.imageUrl && !/^https:\/\//u.test(popup.imageUrl)) {
    console.error(`팝업 대표 사진 URL이 올바르지 않습니다: ${popup.id}`);
    process.exitCode = 1;
  }
  if (popup.officialImageUrls !== undefined) {
    const photos = popup.officialImageUrls;
    if (!Array.isArray(photos) || photos.length > 12 || photos.some(url => !/^https:\/\//u.test(url)) || new Set(photos).size !== photos.length) {
      console.error(`팝업 공식 사진 목록이 올바르지 않습니다: ${popup.id}`);
      process.exitCode = 1;
    }
    if (popup.imageUrl && !photos.includes(popup.imageUrl)) {
      console.error(`팝업 대표 사진이 공식 사진 목록에서 누락됐습니다: ${popup.id}`);
      process.exitCode = 1;
    }
  }
  if (popup.id.startsWith('lotte:') && /\/search\/searchResult/u.test(popup.sourceUrl) && lotteVenueCodes.has(popup.venue)) {
    const source = new URL(popup.sourceUrl);
    if (source.searchParams.get('cstrCd') !== lotteVenueCodes.get(popup.venue)) {
      console.error(`롯데 표시 지점과 공식 링크 지점 코드가 다릅니다: ${popup.id}`);
      process.exitCode = 1;
    }
    if (source.searchParams.get('searchTerm') !== popup.name) {
      console.error(`롯데 공식 링크가 해당 팝업명으로 검색되지 않습니다: ${popup.id}`);
      process.exitCode = 1;
    }
  }
  if (popup.id.startsWith('lotte:') && popup.imageSource === 'fallback-food-photo') {
    console.error(`롯데 AI 대체 이미지를 공식 사진으로 저장할 수 없습니다: ${popup.id}`);
    process.exitCode = 1;
  }
  if (popup.id.startsWith('lotte:') && !popup.id.startsWith('lotte:blog:') && popup.menuSource === 'official-event-text' && popup.menus?.length) {
    console.error(`롯데 행사명을 실제 메뉴로 저장할 수 없습니다: ${popup.id}`);
    process.exitCode = 1;
  }
}

if (popupData.contentPolicyVersion !== undefined) {
  let popupReviewQueue;
  let popupContentAudit;
  try {
    popupReviewQueue = JSON.parse(readFileSync('data/popup-review-queue.json', 'utf8'));
    popupContentAudit = JSON.parse(readFileSync('data/popup-content-audit.json', 'utf8'));
  } catch {
    console.error('엄격 콘텐츠 정책에는 검토 Queue와 품질 감사 보고서가 필요합니다.');
    process.exitCode = 1;
  }
  const publishedIds = new Set(popupData.popups.map(row => row.id));
  for (const popup of popupData.popups) {
    if (popup.publishStatus !== 'published' || !['A', 'B'].includes(popup.contentQuality)
      || popup.imageValidation?.status !== 'valid' || !popup.image || !popup.menus?.length) {
      console.error(`공개 팝업 콘텐츠 품질 계약 위반: ${popup.id}`);
      process.exitCode = 1;
    }
  }
  for (const popup of popupReviewQueue?.reviewRequired || []) {
    if (publishedIds.has(popup.id) || popup.publishStatus !== 'review_required' || popup.contentQuality !== 'C'
      || !Array.isArray(popup.qualityReasons) || !popup.contentSearch) {
      console.error(`팝업 검토 Queue 계약 위반: ${popup.id}`);
      process.exitCode = 1;
    }
  }
  const invariants = popupContentAudit?.invariants || {};
  if (invariants.publishedValidImageRate !== 1 || invariants.publishedMenuRate !== 1
    || invariants.publishedBrokenImageCount !== 0 || invariants.incompleteMisclassifiedMissingCount !== 0
    || invariants.parseFailedMisclassifiedMissingCount !== 0) {
    console.error('팝업 콘텐츠 품질 불변식이 충족되지 않았습니다.');
    process.exitCode = 1;
  }
}

const calculatedStatusStats = Object.fromEntries(['upcoming', 'ongoing', 'ended']
  .map(status => [status, popupData.popups.filter(row => expectedPopupStatus(row) === status).length]));
if (JSON.stringify(popupData.stats?.status) !== JSON.stringify(calculatedStatusStats)) {
  console.error('popups.json 상태 집계가 실제 시작일·종료일과 일치하지 않습니다.');
  process.exitCode = 1;
}
if (!app.includes("label: '종료'") || !app.includes('popup-${status.key}')) {
  console.error('종료된 팝업의 화면 표시가 누락됐습니다.');
  process.exitCode = 1;
}

const calculatedPhotoStats = {
  popupCount: popupData.popups.filter(row => row.officialImageUrls?.length).length,
  imageCount: popupData.popups.reduce((sum, row) => sum + (row.officialImageUrls?.length || 0), 0),
  missingCount: popupData.popups.filter(row => !row.officialImageUrls?.length).length
};
if (JSON.stringify(popupData.stats?.photos) !== JSON.stringify(calculatedPhotoStats)) {
  console.error('popups.json 공식 사진 집계가 실제 데이터와 일치하지 않습니다.');
  process.exitCode = 1;
}

const popupVenues = JSON.parse(readFileSync('data/popup-venues.json', 'utf8'));
if (!Number.isFinite(popupVenues.total) || popupVenues.total !== popupVenues.venues?.length || popupVenues.total < 100) {
  console.error('popup-venues.json 전국 시설 원장이 올바르지 않습니다.');
  process.exitCode = 1;
}
if (popupVenues.venues.some(venue => !venue.id || !venue.name || !venue.kind || !venue.region)) {
  console.error('popup-venues.json 시설 필수값이 누락됐습니다.');
  process.exitCode = 1;
}
const popupCoverage = JSON.parse(readFileSync('data/popup-coverage.json', 'utf8'));
if (popupCoverage.summary?.nationwideVenueTotal !== popupVenues.total || popupCoverage.venues?.length !== popupVenues.total) {
  console.error('popup-coverage.json이 전국 시설 원장과 일치하지 않습니다.');
  process.exitCode = 1;
}

if (!process.exitCode) console.log(`코드 ${javascript.length}개와 데이터 계약 검증 통과`);
