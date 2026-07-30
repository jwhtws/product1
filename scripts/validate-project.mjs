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
for (const popup of popupData.popups) {
  if (!popup.id || !popup.name || !/^\d{4}-\d{2}-\d{2}$/.test(popup.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(popup.endDate)) {
    console.error(`팝업 필수값이 올바르지 않습니다: ${popup.id || popup.name || '알 수 없음'}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log(`코드 ${javascript.length}개와 데이터 계약 검증 통과`);
