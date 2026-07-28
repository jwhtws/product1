import fs from 'node:fs';
import path from 'node:path';

const root = 'data/restaurants';
const regionManifestPath = path.join(root, 'regions.json');
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
const errors = [];
const warnings = [];
const stats = { regions: 0, sourceRows: 0, searchableRows: 0, quarantinedRows: 0, searchRows: 0, duplicateIds: 0, duplicatePlaces: 0 };
const sourceSignatures = new Map();
const ids = new Map();
const places = new Map();
const signature = row => JSON.stringify([row.name || '', row.category || '', row.address || '', row.phone || '']);
const searchKey = value => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const badText = value => typeof value === 'string' && (value.includes('\uFFFD') || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(value));

function addCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${file}: JSON 파싱 실패 (${error.message})`);
    return null;
  }
}

const manifest = readJson(regionManifestPath);
if (!manifest?.regions?.length) errors.push('regions.json에 지역 목록이 없습니다.');

for (const region of manifest?.regions || []) {
  const file = path.join(root, region.file);
  const rows = readJson(file);
  if (!Array.isArray(rows)) continue;
  stats.regions += 1;
  stats.sourceRows += rows.length;
  if (rows.length !== region.count) errors.push(`${region.name}: manifest ${region.count}건, 실제 ${rows.length}건`);

  rows.forEach((row, index) => {
    const where = `${region.name} ${index + 1}번째`;
    if (!row?.name?.trim()) errors.push(`${where}: 식당명 없음`);
    if (!row?.address?.trim()) errors.push(`${where}: 주소 없음`);
    if (badText(row.name) || badText(row.address) || badText(row.category) || badText(row.phone)) errors.push(`${where}: 깨진 문자 포함`);
    if (row.address && !row.address.startsWith(region.name)) warnings.push(`${where}: 지역명과 주소 불일치 (${row.name})`);
    if (row.id) {
      if (ids.has(row.id) && ids.get(row.id) !== signature(row)) stats.duplicateIds += 1;
      else ids.set(row.id, signature(row));
    }
    addCount(places, `${row.name}\u0000${row.address}`);
    if (searchKey(row.name)) {
      stats.searchableRows += 1;
      addCount(sourceSignatures, signature(row));
    } else {
      stats.quarantinedRows += 1;
      warnings.push(`${where}: 검색 가능한 글자가 없는 식당명 격리 (${JSON.stringify(row.name)})`);
    }
  });
}

stats.duplicatePlaces = [...places.values()].filter(count => count > 1).length;
if (stats.duplicateIds) errors.push(`서로 다른 식당이 동일 ID를 사용: ${stats.duplicateIds}건`);
if (stats.duplicatePlaces) warnings.push(`이름과 주소가 완전히 같은 중복: ${stats.duplicatePlaces}곳`);
if (manifest?.total !== stats.sourceRows) errors.push(`전체 건수 불일치: manifest ${manifest?.total}, 실제 ${stats.sourceRows}`);

const searchDir = path.join(root, 'search-pages');
const searchCounts = new Map();
for (const file of fs.readdirSync(searchDir).filter(name => /^[0-9a-f]{2}-\d+\.json$/.test(name))) {
  const rows = readJson(path.join(searchDir, file));
  if (!Array.isArray(rows)) continue;
  stats.searchRows += rows.length;
  for (const row of rows) addCount(searchCounts, JSON.stringify(row));
}

for (const [key, count] of sourceSignatures) {
  const indexed = searchCounts.get(key) || 0;
  if (indexed !== count) errors.push(`검색 인덱스 누락/중복: ${key.slice(0, 160)} (원본 ${count}, 검색 ${indexed})`);
  searchCounts.delete(key);
}
for (const [key, count] of searchCounts) errors.push(`원본에 없는 검색 결과: ${key.slice(0, 160)} (${count}건)`);
if (stats.searchRows !== stats.searchableRows) errors.push(`검색 인덱스 총 건수 불일치: 검색 가능 원본 ${stats.searchableRows}, 검색 ${stats.searchRows}`);

const updatedAt = new Date(manifest?.updatedAt || 0);
const ageDays = Math.floor((Date.now() - updatedAt.getTime()) / 86400000);
if (!Number.isFinite(ageDays)) errors.push('데이터 갱신일이 올바르지 않습니다.');
else if (ageDays > 45) warnings.push(`공공데이터 스냅샷이 ${ageDays}일 전 자료입니다. 최신 원본 갱신이 필요합니다.`);

const result = {
  ok: errors.length === 0,
  checkedAt: new Date().toISOString(),
  sourceUpdatedAt: manifest?.updatedAt || null,
  stats,
  errors: errors.slice(0, 100),
  warnings: warnings.slice(0, 100)
};

const summary = [
  `식당 데이터 검증: ${result.ok ? '통과' : '실패'}`,
  `지역 ${stats.regions}개 / 원본 ${stats.sourceRows.toLocaleString('ko-KR')}건 / 검색 ${stats.searchRows.toLocaleString('ko-KR')}건 / 격리 ${stats.quarantinedRows.toLocaleString('ko-KR')}건`,
  `오류 ${errors.length}건 / 경고 ${warnings.length}건`,
  ...errors.slice(0, 20).map(item => `ERROR: ${item}`),
  ...warnings.slice(0, 20).map(item => `WARN: ${item}`)
].join('\n');

console.log(summary);
if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
}
if (!result.ok) process.exitCode = 1;
