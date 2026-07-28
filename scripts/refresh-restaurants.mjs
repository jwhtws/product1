import fs from 'node:fs';
import path from 'node:path';

const endpoint = 'https://apis.data.go.kr/1741000/general_restaurants/info';
const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
const outputDir = 'data/restaurants';
const pageSize = 1000;
const minimumActiveRows = 500000;
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const pick = (row, ...keys) => {
  for (const key of keys) if (row?.[key] != null && row[key] !== '') return row[key];
  return '';
};

if (!serviceKey) throw new Error('DATA_GO_KR_SERVICE_KEY가 없습니다. GitHub Actions 저장소 Secret에 Decoding 인증키를 등록하세요.');

function responseBody(payload) {
  return payload?.response?.body || payload?.body || payload;
}

function responseRows(payload) {
  const body = responseBody(payload);
  const items = body?.items?.item ?? body?.items ?? payload?.items ?? [];
  return Array.isArray(items) ? items : items ? [items] : [];
}

function normalize(row) {
  const statusName = clean(pick(row, 'trdStateNm', 'TRDSTATENM', '영업상태명', '영업상태'));
  const statusCode = clean(pick(row, 'trdStateGbn', 'TRDSTATEGBN', '영업상태구분코드'));
  if (statusName !== '영업/정상' && statusCode !== '01') return null;

  const name = clean(pick(row, 'bplcNm', 'BPLCNM', '사업장명', '업소명'));
  const address = clean(pick(row, 'rdnWhlAddr', 'RDNWHLADDR', '도로명전체주소', '도로명주소') ||
    pick(row, 'siteWhlAddr', 'SITEWHLADDR', '소재지전체주소', '소재지주소'));
  if (!name || !address) return null;

  return {
    id: clean(pick(row, 'mgtNo', 'MGTNO', '관리번호', '인허가번호')),
    name,
    category: clean(pick(row, 'uptaeNm', 'UPTAENM', '업태구분명', '업태명') || '음식점'),
    address,
    phone: clean(pick(row, 'siteTel', 'SITETEL', '소재지전화', '전화번호'))
  };
}

async function getPage(pageNo) {
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', serviceKey);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(pageSize));
  url.searchParams.set('type', 'json');
  url.searchParams.set('_type', 'json');
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`공공데이터 API ${response.status} (${pageNo}페이지)`);
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error(`공공데이터 API가 JSON이 아닌 응답을 반환했습니다: ${text.slice(0, 200)}`); }
  const body = responseBody(payload);
  const resultCode = payload?.response?.header?.resultCode ?? payload?.header?.resultCode;
  if (resultCode && !['00', '0'].includes(String(resultCode))) {
    throw new Error(`공공데이터 API 오류 ${resultCode}: ${payload?.response?.header?.resultMsg || payload?.header?.resultMsg || ''}`);
  }
  return { rows: responseRows(payload), total: Number(body?.totalCount ?? payload?.totalCount ?? 0) };
}

const first = await getPage(1);
if (!first.total || !first.rows.length) throw new Error('공공데이터 API의 전체 건수 또는 첫 페이지가 비어 있습니다.');

const all = [...first.rows];
const pages = Math.ceil(first.total / pageSize);
for (let start = 2; start <= pages; start += 5) {
  const pageNumbers = Array.from({ length: Math.min(5, pages - start + 1) }, (_, index) => start + index);
  const batch = await Promise.all(pageNumbers.map(getPage));
  batch.forEach(page => all.push(...page.rows));
  console.log(`원본 수집 ${Math.min(start + 4, pages)}/${pages}페이지`);
}

const restaurants = all.map(normalize).filter(Boolean);
if (restaurants.length < minimumActiveRows) {
  throw new Error(`안전 중단: 영업 중 식당이 ${restaurants.length.toLocaleString('ko-KR')}건뿐입니다. 기존 데이터는 변경하지 않습니다.`);
}

const groups = new Map();
for (const restaurant of restaurants) {
  const region = restaurant.address.split(' ')[0];
  if (!region) continue;
  if (!groups.has(region)) groups.set(region, []);
  groups.get(region).push(restaurant);
}
if (groups.size < 15) throw new Error(`안전 중단: 지역이 ${groups.size}개뿐입니다. 기존 데이터는 변경하지 않습니다.`);

const oldManifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'regions.json'), 'utf8'));
const oldIds = new Set();
for (const region of oldManifest.regions) {
  for (const row of JSON.parse(fs.readFileSync(path.join(outputDir, region.file), 'utf8'))) oldIds.add(row.id || `${row.name}|${row.address}`);
}
const newIds = new Set(restaurants.map(row => row.id || `${row.name}|${row.address}`));
const opened = [...newIds].filter(id => !oldIds.has(id)).length;
const closed = [...oldIds].filter(id => !newIds.has(id)).length;
const changeRatio = (opened + closed) / Math.max(1, oldIds.size);
if (changeRatio > 0.08) throw new Error(`안전 중단: 하루 변경률이 ${(changeRatio * 100).toFixed(2)}%입니다. 기존 데이터는 변경하지 않습니다.`);

const nextFiles = new Set();
const regions = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([name, rows]) => {
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const file = `${encodeURIComponent(name)}.json`;
  nextFiles.add(file);
  fs.writeFileSync(path.join(outputDir, file), JSON.stringify(rows));
  return { name, count: rows.length, file };
});
for (const region of oldManifest.regions) {
  if (!nextFiles.has(region.file)) fs.unlinkSync(path.join(outputDir, region.file));
}

fs.writeFileSync(path.join(outputDir, 'regions.json'), JSON.stringify({
  updatedAt: new Date().toISOString(),
  total: restaurants.length,
  regions
}));
fs.writeFileSync(path.join(outputDir, 'previews.json'), JSON.stringify(Object.fromEntries(
  [...groups].map(([name, rows]) => [name, rows.slice(0, 20)])
)));

console.log(`갱신 완료: 영업 중 ${restaurants.length.toLocaleString('ko-KR')}곳 / 개업 ${opened.toLocaleString('ko-KR')}곳 / 폐업·제외 ${closed.toLocaleString('ko-KR')}곳`);
