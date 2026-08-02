import { readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const roots = ['app.js', 'js', 'functions', 'scripts'];
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
const curatedPopups = JSON.parse(readFileSync('data/curated-popups.json', 'utf8'));
if (!Array.isArray(curatedPopups) || curatedPopups.some(row => !Array.isArray(row) || row.length !== 6)) {
  console.error('curated-popups.json 구조가 올바르지 않습니다.');
  process.exitCode = 1;
}
const lotteVenueCodes = new Map([
  ['롯데백화점 본점', '0001'], ['롯데백화점 노원점', '0022'],
  ['롯데백화점 센텀시티점', '0027'], ['롯데백화점 건대스타시티점', '0028'],
  ['롯데백화점 안산점', '0336'], ['롯데아울렛 청주점', '0342'],
  ['롯데백화점 인천점', '0344'], ['롯데백화점 동탄점', '0399']
]);
for (const popup of popupData.popups) {
  if (!popup.id || !popup.name || !/^\d{4}-\d{2}-\d{2}$/.test(popup.startDate) || (popup.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(popup.endDate))) {
    console.error(`팝업 필수값이 올바르지 않습니다: ${popup.id || popup.name || '알 수 없음'}`);
    process.exitCode = 1;
  }
  if (!popup.sourceUrl || !/^https:\/\//.test(popup.sourceUrl)) {
    console.error(`팝업 출처 URL이 올바르지 않습니다: ${popup.id}`);
    process.exitCode = 1;
  }
  if (!['official', 'official-search'].includes(popup.sourceGrade)) {
    console.error(`팝업은 공식 출처만 허용됩니다: ${popup.id}`);
    process.exitCode = 1;
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
