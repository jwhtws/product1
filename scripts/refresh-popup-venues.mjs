import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SOURCE_PAGE = 'https://file.localdata.go.kr/file/large_scale_retail_stores/info';
const SOURCE_URL = 'https://file.localdata.go.kr/file/download/large_scale_retail_stores/info';
const outputPath = process.argv.find(value => value.startsWith('--output='))?.slice(9)
  || 'data/popup-venues.json';
const localSource = process.argv.find(value => value.startsWith('--source='))?.slice(9);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function regionFrom(address) {
  return clean(address).split(' ')[0] || '지역 미상';
}

function venueKind(row) {
  const category = clean(row.업태구분명);
  const name = clean(row.사업장명);
  if (/백화점/u.test(category) || /백화점/u.test(name)) return '백화점';
  if (/대형마트/u.test(category) || /(이마트|롯데마트|홈플러스|코스트코|트레이더스)/u.test(name)) return '대형마트';
  if (/복합쇼핑몰/u.test(category)) return '복합쇼핑몰';
  if (/쇼핑센터/u.test(category)) return '쇼핑센터';
  if (/아울렛|아웃렛/u.test(name)) return '아울렛';
  if (/전문점/u.test(category)) return '전문점';
  return '기타 쇼핑시설';
}

function isPopupVenue(row) {
  if (clean(row.영업상태명) !== '영업/정상') return false;
  if (clean(row.점포구분명) === '준대규모점포') return false;
  const category = clean(row.업태구분명);
  const name = clean(row.사업장명);
  if (/(전통시장|상설시장|시장번영회|시장상인회)/u.test(`${category} ${name}`)) return false;
  return /(백화점|대형마트|쇼핑센터|복합쇼핑몰|전문점)/u.test(category)
    || /(몰\b|쇼핑몰|백화점|아울렛|아웃렛|스타필드|이마트|롯데마트|홈플러스|코스트코|트레이더스|메가마트|하나로마트)/u.test(name);
}

async function sourceBytes() {
  if (localSource) return readFile(localSource);
  const response = await fetch(SOURCE_URL, {
    headers: {
      accept: 'text/csv,*/*',
      referer: SOURCE_PAGE,
      'user-agent': 'Mozilla/5.0 mukdang-popup-indexer/1.0 (+https://mukdang.com)'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`전국 대규모점포 원본 응답 ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const bytes = await sourceBytes();
const text = new TextDecoder('euc-kr').decode(bytes).replace(/^\uFEFF/, '');
const parsed = parseCsv(text);
const headers = parsed.shift()?.map(clean) || [];
if (!headers.includes('관리번호') || !headers.includes('사업장명') || !headers.includes('영업상태명')) {
  throw new Error('전국 대규모점포 CSV 열 구성이 예상과 다릅니다.');
}

const allRows = parsed.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
const venues = allRows
  .filter(isPopupVenue)
  .map(row => {
    const roadAddress = clean(row.도로명주소);
    const lotAddress = clean(row.지번주소);
    return {
      id: `localdata:${clean(row.개방자치단체코드)}:${clean(row.관리번호)}`,
      name: clean(row.사업장명),
      kind: venueKind(row),
      region: regionFrom(roadAddress || lotAddress),
      address: roadAddress || lotAddress,
      phone: clean(row.전화번호),
      category: clean(row.업태구분명),
      permitDate: clean(row.인허가일자),
      updatedAt: clean(row.최종수정시점 || row.데이터갱신시점)
    };
  })
  .filter(venue => venue.name)
  .sort((left, right) => left.region.localeCompare(right.region, 'ko') || left.name.localeCompare(right.name, 'ko'));

const byKind = Object.fromEntries(
  [...new Set(venues.map(venue => venue.kind))]
    .sort((left, right) => left.localeCompare(right, 'ko'))
    .map(kind => [kind, venues.filter(venue => venue.kind === kind).length])
);
const byRegion = Object.fromEntries(
  [...new Set(venues.map(venue => venue.region))]
    .sort((left, right) => left.localeCompare(right, 'ko'))
    .map(region => [region, venues.filter(venue => venue.region === region).length])
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  source: {
    name: '행정안전부 생활_대규모점포',
    pageUrl: SOURCE_PAGE,
    downloadUrl: SOURCE_URL,
    sourceRows: allRows.length
  },
  policy: '전국 시설은 푸드팝업 탐색 대상 원장으로만 사용하며 시설 자체를 팝업으로 노출하지 않음',
  total: venues.length,
  byKind,
  byRegion,
  venues
}, null, 2)}\n`);

console.log(`전국 원본 ${allRows.length}행 · 영업 중 팝업 탐색 대상 시설 ${venues.length}곳`);
console.log(byKind);
