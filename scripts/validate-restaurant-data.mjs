import fs from 'node:fs';
import path from 'node:path';

const root = 'data/restaurants';
const regionManifestPath = path.join(root, 'regions.json');
const reportPath = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
const errors = [];
const warnings = [];
const stats = {
  regions: 0, sourceRows: 0, searchableRows: 0, quarantinedRows: 0, privateFacilityRows: 0,
  searchRows: 0, duplicateIds: 0, duplicatePlaces: 0, permitDateRows: 0,
  verifiedPermitDateRows: 0, missingPermitDateRows: 0, invalidPermitDateRows: 0,
  futurePermitDateRows: 0, idYearMismatchRows: 0, containsPairs: 0, containsMissingRoutes: 0
};
const permitDateIssues = [];
const sourceSignatures = new Map();
const ids = new Map();
const places = new Map();
const signature = row => JSON.stringify([row.name || '', row.category || '', row.address || '', row.phone || '', row.permitDate || '', row.permitDateSource || '', row.facilityAreaM2 || null]);
const searchKey = value => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const isPrivateFacility = name => {
  const normalized = String(name || '').replace(/\s+/g, ' ').trim();
  return /구내\s*식당|직원\s*식당|사원\s*식당|임직원\s*식당|노무자\s*급식소|기숙사\s*식당|현장\s*식당|함바(?:식당)?/i.test(normalized) ||
    /(?:수련원|연수원).*(?:구내)?식당|(?:구내)?식당.*(?:수련원|연수원)/.test(normalized) ||
    /^\s*\((?:주|사|유|재)\).+\s식당\s*\d+\s*$/.test(normalized);
};
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

function validatePermitDate(row, where) {
  const value = String(row.permitDate || '').trim();
  if (!value) {
    stats.missingPermitDateRows += 1;
    permitDateIssues.push({ type: 'missing', id: row.id || '', name: row.name || '', address: row.address || '', permitDate: '' });
    return;
  }
  stats.permitDateRows += 1;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${value}T00:00:00Z`) : null;
  const valid = Boolean(match && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value);
  if (!valid) {
    stats.invalidPermitDateRows += 1;
    permitDateIssues.push({ type: 'invalid', id: row.id || '', name: row.name || '', address: row.address || '', permitDate: value });
    errors.push(`${where}: 올바르지 않은 인허가일 (${value})`);
    return;
  }
  if (date.getTime() > Date.now()) {
    stats.futurePermitDateRows += 1;
    permitDateIssues.push({ type: 'future', id: row.id || '', name: row.name || '', address: row.address || '', permitDate: value });
    errors.push(`${where}: 미래 인허가일 (${value})`);
    return;
  }
  const idYear = String(row.id || '').match(/-101-(\d{4})-/)?.[1];
  if (idYear && idYear !== match[1]) {
    stats.idYearMismatchRows += 1;
    permitDateIssues.push({ type: 'id-year-mismatch', id: row.id || '', name: row.name || '', address: row.address || '', permitDate: value });
  }
  stats.verifiedPermitDateRows += 1;
}

const manifest = readJson(regionManifestPath);
const quarantine = readJson(path.join(root, 'data-quality-quarantine.json')) || { total: 0, rows: [] };
stats.sourceQuarantinedRows = Number(quarantine.total || 0);
if (!manifest?.regions?.length) errors.push('regions.json에 지역 목록이 없습니다.');

for (const region of manifest?.regions || []) {
  const files = region.files || [region.file];
  const rows = files.flatMap(name => {
    const data = readJson(path.join(root, name));
    return Array.isArray(data) ? data : [];
  });
  if (!Array.isArray(rows)) continue;
  stats.regions += 1;
  stats.sourceRows += rows.length;
  if (rows.length !== region.count) errors.push(`${region.name}: manifest ${region.count}건, 실제 ${rows.length}건`);

  rows.forEach((row, index) => {
    const where = `${region.name} ${index + 1}번째`;
    if (!row?.name?.trim()) errors.push(`${where}: 식당명 없음`);
    if (!row?.address?.trim()) errors.push(`${where}: 주소 없음`);
    if (badText(row.name) || badText(row.address) || badText(row.category) || badText(row.phone)) errors.push(`${where}: 깨진 문자 포함`);
    validatePermitDate(row, where);
    if (row.address && !row.address.startsWith(region.name)) warnings.push(`${where}: 지역명과 주소 불일치 (${row.name})`);
    if (row.id) {
      if (ids.has(row.id) && ids.get(row.id) !== signature(row)) stats.duplicateIds += 1;
      else ids.set(row.id, signature(row));
    }
    addCount(places, `${row.name}\u0000${row.address}`);
    if (searchKey(row.name)) {
      stats.searchableRows += 1;
      addCount(sourceSignatures, signature(row));
      if (isPrivateFacility(row.name)) stats.privateFacilityRows += 1;
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
const routingManifests = new Map();
const containsManifests = new Map();
for (const file of fs.readdirSync(searchDir).filter(name => /^contains-[0-9a-f]{2}\.json$/.test(name))) {
  containsManifests.set(file.slice(9, 11), readJson(path.join(searchDir, file)) || {});
}
for (const file of fs.readdirSync(searchDir).filter(name => /^[0-9a-f]{2}-\d+\.json$/.test(name))) {
  const rows = readJson(path.join(searchDir, file));
  if (!Array.isArray(rows)) continue;
  const [, bucket, pageText] = file.match(/^([0-9a-f]{2})-(\d+)\.json$/);
  const page = Number(pageText);
  if (!routingManifests.has(bucket)) routingManifests.set(bucket, readJson(path.join(searchDir, `manifest-${bucket}.json`)) || {});
  const routing = routingManifests.get(bucket);
  stats.searchRows += rows.length;
  for (const row of rows) {
    addCount(searchCounts, JSON.stringify(row));
    const chars = [...searchKey(row[0])];
    const bigrams = new Set();
    for (let index = 0; index < chars.length - 1; index += 1) bigrams.add(chars.slice(index, index + 2));
    for (const pair of bigrams) {
      stats.containsPairs += 1;
      const routeKey = pair.map(char => char.codePointAt(0).toString(16)).join('-');
      const shard = (pair.reduce((value, char) => ((value * 31) + char.codePointAt(0)) >>> 0, 0) % 256).toString(16).padStart(2, '0');
      if (!containsManifests.get(shard)?.[routeKey]?.includes(`${bucket}-${page}`)) {
        stats.containsMissingRoutes += 1;
        if (stats.containsMissingRoutes <= 100) errors.push(`부분 이름 검색 라우팅 누락: ${row[0]} / ${file} / ${pair.join('')}`);
      }
    }
    for (const length of [2, 3]) {
      if (chars.length < length) continue;
      const prefix = chars.slice(0, length).map(char => char.codePointAt(0).toString(16)).join('-');
      const entry = routing[prefix];
      if (!entry || page < entry.start || page > entry.end) {
        errors.push(`검색 라우팅 누락: ${row[0]} / ${file} / ${length}글자`);
      }
    }
  }
}

for (const [key, count] of sourceSignatures) {
  const indexed = searchCounts.get(key) || 0;
  if (indexed !== count) errors.push(`검색 인덱스 누락/중복: ${key.slice(0, 160)} (원본 ${count}, 검색 ${indexed})`);
  searchCounts.delete(key);
}
for (const [key, count] of searchCounts) errors.push(`원본에 없는 검색 결과: ${key.slice(0, 160)} (${count}건)`);
if (stats.searchRows !== stats.searchableRows) errors.push(`검색 인덱스 총 건수 불일치: 검색 가능 원본 ${stats.searchableRows}, 검색 ${stats.searchRows}`);
if (stats.containsMissingRoutes) errors.push(`부분 이름 검색 라우팅 누락 합계: ${stats.containsMissingRoutes.toLocaleString('ko-KR')}건`);

const updatedAt = new Date(manifest?.updatedAt || 0);
const ageDays = Math.floor((Date.now() - updatedAt.getTime()) / 86400000);
if (!Number.isFinite(ageDays)) errors.push('데이터 갱신일이 올바르지 않습니다.');
else if (ageDays > 45) warnings.push(`공공데이터 스냅샷이 ${ageDays}일 전 자료입니다. 최신 원본 갱신이 필요합니다.`);

const result = {
  ok: errors.length === 0,
  checkedAt: new Date().toISOString(),
  sourceUpdatedAt: manifest?.updatedAt || null,
  stats,
  permitDate: {
    source: '행정안전부 일반음식점 인허가 데이터',
    meaning: '식품위생 영업 인허가일이며 실제 최초 영업 개시일과 다를 수 있음',
    issues: [
      ...(quarantine.rows || []).map(row => ({ ...row, type: row.type === 'invalid-permit-date' ? 'invalid' : row.type })),
      ...permitDateIssues
    ].slice(0, 500)
  },
  errors: errors.slice(0, 100),
  warnings: warnings.slice(0, 100)
};

const summary = [
  `식당 데이터 검증: ${result.ok ? '통과' : '실패'}`,
  `지역 ${stats.regions}개 / 원본 ${stats.sourceRows.toLocaleString('ko-KR')}건 / 검색 ${stats.searchRows.toLocaleString('ko-KR')}건 / 인허가일 검증 ${stats.verifiedPermitDateRows.toLocaleString('ko-KR')}건 / 누락 ${stats.missingPermitDateRows.toLocaleString('ko-KR')}건`,
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
