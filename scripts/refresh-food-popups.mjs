import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const outputPath = process.argv.find(value => value.startsWith('--output='))?.slice(9) || 'data/popups.json';
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);
const currentYear = Number(today.slice(0, 4));
const keepSince = new Date(`${today}T00:00:00+09:00`);
keepSince.setFullYear(keepSince.getFullYear() - 2);

const foodWords = /(꽈배기|술빵|모찌|떡|빵|베이커리|디저트|케이크|쿠키|초콜릿|아이스크림|젤라또|도넛|마카롱|푸딩|타르트|약과|한과|카페|커피|차\b|티\b|음료|주스|맥주|와인|막걸리|포장마차|분식|김밥|라면|국수|냉면|만두|닭|치킨|고기|육회|곱창|족발|해산물|오징어|건어물|반찬|김치|식품|푸드|F&B|FNB|맛집|셰프|요리|농산|수산|축산)/iu;
const nonHumanFood = /(반려|펫|강아지|고양이|사료)/u;

function clean(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function eventDate(part, reference = new Date(`${today}T00:00:00+09:00`)) {
  const match = String(part || '').match(/(\d{1,2})\.(\d{1,2})/);
  if (!match) return '';
  const month = Number(match[1]), day = Number(match[2]);
  let year = reference.getFullYear();
  const referenceMonth = reference.getMonth() + 1;
  if (referenceMonth <= 2 && month >= 11) year -= 1;
  if (referenceMonth >= 11 && month <= 2) year += 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${url} 응답 ${response.status}`);
  const payload = await response.json();
  return typeof payload === 'string' ? JSON.parse(payload) : payload;
}

async function collectHyundai() {
  const rows = [];
  const base = 'https://www.ehyundai.com/newPortal/search/result.do';
  for (let page = 1; page <= 50; page += 1) {
    const params = new URLSearchParams({
      searchWord: 'pop up', code: '', splitCode: '', convertCheck: 'false',
      salesPage: '1', storePage: '1', eventPage: String(page), culturePage: '1',
      menuPage: '1', faqPage: '1', eventSearchPage: '1', eventWinnerSearchPage: '1'
    });
    const data = await fetchJson(`${base}?${params}`);
    const events = Array.isArray(data.eventList) ? data.eventList : [];
    for (const event of events) {
      const searchable = clean(`${event.EVNT_CRD_NM} ${event.BRAND_NM} ${event.TITL}`);
      if (!foodWords.test(searchable) || nonHumanFood.test(searchable)) continue;
      const startDate = eventDate(event.EVNT_STRT_DT);
      const endDate = eventDate(event.EVNT_END_DT);
      if (!startDate || !endDate || new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      const name = clean(event.EVNT_CRD_NM).replace(/^\[(?:POP[\s-]*UP STORE|팝업스토어)\]\s*/iu, '');
      const branchCode = `B001${event.STORE_CD}00`;
      rows.push({
        id: `hyundai:${event.EVNT_CRD_CD}`,
        name,
        venue: clean(event.STORE_NM),
        venueType: /아울렛/u.test(event.STORE_NM) ? '쇼핑몰' : '백화점',
        address: clean(event.STORE_NM),
        startDate,
        endDate,
        imageUrl: String(event.EVNT_IMG || ''),
        sourceName: '현대백화점 공식 쇼핑뉴스',
        sourceUrl: `https://www.ehyundai.com/newPortal/SN/SN_0201000.do?evntCrdCd=${encodeURIComponent(event.EVNT_CRD_CD)}&branchCd=${branchCode}&category=`,
        sourceGrade: 'official',
        firstSeenAt: today,
        lastSeenAt: today
      });
    }
    if (!events.length || page * 4 >= Number(data.eventCount || 0)) break;
  }
  return rows;
}

async function existingRows() {
  try {
    const data = JSON.parse(await readFile(outputPath, 'utf8'));
    return Array.isArray(data.popups) ? data.popups : [];
  } catch {
    return [];
  }
}

const previous = await existingRows();
const collected = await collectHyundai();
const merged = new Map(previous.map(row => [row.id, row]));
for (const row of collected) {
  const old = merged.get(row.id);
  merged.set(row.id, { ...old, ...row, firstSeenAt: old?.firstSeenAt || row.firstSeenAt });
}
const popups = [...merged.values()]
  .filter(row => row.id && row.name && row.startDate && row.endDate)
  .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.name.localeCompare(right.name, 'ko'));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  sources: [{ name: '현대백화점 공식 쇼핑뉴스', status: 'active' }],
  popups
}, null, 2)}\n`);
console.log(`푸드 팝업 ${collected.length}건 확인 · 누적 ${popups.length}건 보존 · 기준일 ${today}`);
