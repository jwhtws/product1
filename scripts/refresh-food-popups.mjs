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

const starfieldVenues = [
  ['hanam', '스타필드 하남'], ['goyang', '스타필드 고양'],
  ['anseong', '스타필드 안성'], ['suwon', '스타필드 수원'],
  ['coexmall', '스타필드 코엑스몰'], ['wirye', '스타필드시티 위례'],
  ['bucheon', '스타필드시티 부천'], ['myeongji', '스타필드시티 명지']
];

async function collectStarfield() {
  const rows = [];
  await Promise.all(starfieldVenues.map(async ([slug, venue]) => {
    const firstUrl = `https://www.starfield.co.kr/api/${slug}/event/eventList.do?evt_gbn=event&lang=ko&pageIndex=1`;
    const first = await fetchJson(firstUrl);
    const pages = Math.max(1, Math.min(20, Number(first.paginationInfo?.totalPageCount || 1)));
    const payloads = [first];
    for (let page = 2; page <= pages; page += 1) {
      payloads.push(await fetchJson(`${firstUrl.replace(/pageIndex=1$/, `pageIndex=${page}`)}`));
    }
    for (const event of payloads.flatMap(payload => payload.data || [])) {
      const searchable = clean(`${event.evt_titl} ${event.evt_titl_en} ${event.evt_dtl_cntn || ''}`);
      if (!/(팝업|POP[\s-]*UP)/iu.test(searchable) || !foodWords.test(searchable) || nonHumanFood.test(searchable)) continue;
      const startDate = String(event.evt_strt_dt || '').slice(0, 10).replace(/\./g, '-');
      const endDate = String(event.evt_end_dt || '').slice(0, 10).replace(/\./g, '-');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) continue;
      if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      rows.push({
        id: `starfield:${slug}:${event.evt_seq}`,
        name: clean(event.evt_titl),
        venue,
        venueType: '쇼핑몰',
        address: venue,
        startDate,
        endDate,
        imageUrl: String(event.web_list_open_img_uri || event.tntLogoUri || ''),
        sourceName: '스타필드 공식 이벤트',
        sourceUrl: `https://www.starfield.co.kr/${slug}/eventBenefit/events/${encodeURIComponent(event.evt_seq)}`,
        sourceGrade: 'official',
        firstSeenAt: today,
        lastSeenAt: today
      });
    }
  }));
  return rows;
}

function decodeHtml(value) {
  return clean(String(value || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

async function collectShinsegae() {
  const url = 'https://www.shinsegae.com/shopping/event/list.do';
  const response = await fetch(url, {
    headers: { 'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${url} 응답 ${response.status}`);
  const html = await response.text();
  const rows = [];
  for (const match of html.matchAll(/<li class="gu_link_hover[\s\S]*?<\/li>/g)) {
    const block = match[0];
    const seq = block.match(/eventSeq=(\d+)/)?.[1];
    const name = decodeHtml(block.match(/class="cnt_tit">([\s\S]*?)<\/div>/)?.[1]);
    const venue = decodeHtml(block.match(/class="cnt_type">([\s\S]*?)<\/div>/)?.[1]) || '신세계백화점';
    const dateText = decodeHtml(block.match(/class="cnt_date">([\s\S]*?)<\/div>/)?.[1]);
    const dates = [...dateText.matchAll(/(\d{4})\.(\d{2})\.(\d{2})/g)].map(parts => `${parts[1]}-${parts[2]}-${parts[3]}`);
    const imagePath = block.match(/background:\s*url\(['"]?([^'")]+)/)?.[1] || '';
    const searchable = `${name} ${venue}`;
    if (!seq || dates.length < 2 || !/(팝업|POP[\s-]*UP)/iu.test(searchable) || !foodWords.test(searchable)) continue;
    rows.push({
      id: `shinsegae:${seq}`,
      name,
      venue: venue === '전점' ? '신세계백화점 전점' : `신세계백화점 ${venue}`,
      venueType: '백화점',
      address: venue,
      startDate: dates[0],
      endDate: dates[1],
      imageUrl: imagePath.startsWith('http') ? imagePath : `https://www.shinsegae.com${imagePath}`,
      sourceName: '신세계백화점 공식 뉴스·이벤트',
      sourceUrl: `https://www.shinsegae.com/shopping/event/view.do?eventSeq=${seq}`,
      sourceGrade: 'official',
      firstSeenAt: today,
      lastSeenAt: today
    });
  }
  return rows;
}

const shoppingVenueWords = /(백화점|현대|롯데|신세계|AK\s*PLAZA|AK플라자|아울렛|아웃렛|쇼핑몰|월드몰|스타필드|코엑스|삼정타워|딜라이트\s*스퀘어|아이파크몰|NC|뉴코아|갤러리아|커넥트현대)/iu;

function popgaVenue(row) {
  const detail = clean(row.addressDetail);
  const candidates = [
    detail.match(/(신세계백화점\s*[^\s]+점)/u)?.[1],
    detail.match(/(롯데백화점\s*[^\s]+점)/u)?.[1],
    detail.match(/(롯데월드몰(?:\s*잠실점)?)/u)?.[1],
    detail.match(/(현대백화점\s*[^\s]+점)/u)?.[1],
    detail.match(/(더현대\s*(?:서울|대구))/u)?.[1],
    detail.match(/(커넥트현대\s*[^\s]+)/u)?.[1],
    detail.match(/(스타필드\s*[^\s]+(?:점)?)/u)?.[1],
    detail.match(/((?:용산\s*)?아이파크몰)/u)?.[1],
    detail.match(/((?:홍대\s*)?AK\s*PLAZA|AK\s*PLAZA\s*홍대|홍대\s*AK플라자)/iu)?.[1],
    detail.match(/(삼정타워|딜라이트\s*스퀘어|코엑스)/iu)?.[1]
  ].filter(Boolean);
  return clean(candidates[0] || detail.replace(/\s+(?:B?\d+F?|지하|[0-9]+층).*$/u, '') || row.address);
}

async function collectPopga() {
  const rows = [];
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      size: '100',
      page: String(page),
      'periodTypes[0]': 'IN_PROGRESS',
      'periodTypes[1]': 'READY',
      'sorts[0].order': 'activated_at'
    });
    const payload = await fetchJson(`https://popga.co.kr/api/spots/search?${params}`);
    const content = Array.isArray(payload.data?.content) ? payload.data.content : [];
    for (const event of content) {
      const categories = Array.isArray(event.categories) ? event.categories.map(category => clean(category.name)) : [];
      const searchableVenue = clean(`${event.addressDetail} ${event.title}`);
      if (!categories.includes('F&B') || !shoppingVenueWords.test(searchableVenue)) continue;
      const startDate = clean(event.openDate);
      const endDate = clean(event.closeDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) continue;
      if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      const venue = popgaVenue(event);
      rows.push({
        id: `popga:${event.id}`,
        name: clean(event.title),
        venue,
        venueType: /백화점/u.test(venue) ? '백화점' : '쇼핑몰',
        address: clean(`${event.address} ${event.addressDetail}`),
        startDate,
        endDate,
        imageUrl: String(event.file?.path || ''),
        sourceName: '팝가 공개 팝업 일정',
        sourceUrl: `https://popga.co.kr/popup/${encodeURIComponent(event.id)}`,
        sourceGrade: 'verified-directory',
        firstSeenAt: today,
        lastSeenAt: today
      });
    }
    const totalPages = Number(payload.data?.page?.totalPages || 1);
    if (!content.length || page + 1 >= totalPages) break;
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

async function popupVenueRegistry() {
  try {
    const data = JSON.parse(await readFile('data/popup-venues.json', 'utf8'));
    return Array.isArray(data.venues) ? data.venues : [];
  } catch {
    return [];
  }
}

async function collectCuratedOfficial() {
  const rows = JSON.parse(await readFile('data/curated-popups.json', 'utf8'));
  return rows.map(([id, name, venue, startDate, endDate, sourceUrl]) => ({
    id,
    name,
    venue,
    venueType: /아울렛|몰/u.test(venue) ? '쇼핑몰' : '백화점',
    address: venue,
    startDate,
    endDate,
    imageUrl: '',
    sourceName: '롯데쇼핑 공식 통합검색',
    sourceUrl,
    sourceGrade: 'official-search',
    firstSeenAt: today,
    lastSeenAt: today
  }));
}

const previous = await existingRows();
const venueRegistry = await popupVenueRegistry();
const collectors = [
  ['현대백화점·현대아울렛', collectHyundai],
  ['신세계백화점', collectShinsegae],
  ['스타필드·스타필드시티', collectStarfield],
  ['롯데백화점·롯데아울렛·롯데몰', collectCuratedOfficial],
  ['팝가 쇼핑시설 F&B 공개 일정', collectPopga]
];
const settled = await Promise.allSettled(collectors.map(([, collector]) => collector()));
const collected = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
const sources = collectors.map(([name], index) => ({
  name,
  status: settled[index].status === 'fulfilled' ? 'active' : 'error',
  count: settled[index].status === 'fulfilled' ? settled[index].value.length : 0,
  message: settled[index].status === 'rejected' ? String(settled[index].reason?.message || settled[index].reason) : undefined
}));
sources.push(
  { name: '갤러리아·AK플라자·NC·뉴코아', status: 'no-public-popup-feed', count: 0 },
  { name: '이마트·트레이더스·롯데마트·홈플러스', status: 'no-public-popup-feed', count: 0 }
);
const merged = new Map(previous.map(row => [row.id, row]));
for (const row of collected) {
  if (row.id.startsWith('popga:')) {
    const normalizedName = clean(row.name).replace(/\s|팝업|POP[\s-]*UP/giu, '');
    const duplicate = [...merged.values()].find(existing => {
      const existingName = clean(existing.name).replace(/\s|팝업|POP[\s-]*UP/giu, '');
      return normalizedName && existingName
        && (normalizedName.includes(existingName) || existingName.includes(normalizedName))
        && existing.startDate === row.startDate
        && existing.endDate === row.endDate;
    });
    if (duplicate) continue;
  }
  const old = merged.get(row.id);
  merged.set(row.id, { ...old, ...row, firstSeenAt: old?.firstSeenAt || row.firstSeenAt });
}
const popups = [...merged.values()]
  .filter(row => row.id && row.name && row.startDate && row.endDate)
  .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.name.localeCompare(right.name, 'ko'));

const collectorCoverageRules = [
  ['현대백화점·현대아울렛', /(현대백화점|현대아울렛|현대프리미엄아울렛|더현대)/u],
  ['신세계백화점', /신세계백화점/u],
  ['스타필드·스타필드시티', /스타필드/u],
  ['롯데백화점·롯데아울렛·롯데몰', /(롯데백화점|롯데아울렛|롯데프리미엄아울렛|롯데몰)/u]
];
const venueCoverage = venueRegistry.map(venue => {
  const collector = collectorCoverageRules.find(([, pattern]) => pattern.test(venue.name))?.[0] || '';
  const matchedPopups = popups.filter(popup => {
    const venueName = clean(popup.venue).replace(/\s+/g, '');
    const registryName = clean(venue.name).replace(/\s+/g, '');
    return venueName && registryName && (venueName.includes(registryName) || registryName.includes(venueName));
  }).length;
  return {
    venueId: venue.id,
    name: venue.name,
    region: venue.region,
    kind: venue.kind,
    collector: collector || null,
    status: matchedPopups ? 'verified-popup-found' : collector ? 'official-feed-monitored' : 'collector-needed',
    popupCount: matchedPopups
  };
});
const coverageSummary = {
  nationwideVenueTotal: venueCoverage.length,
  verifiedPopupVenueCount: venueCoverage.filter(item => item.popupCount > 0).length,
  officialFeedMonitoredCount: venueCoverage.filter(item => item.collector).length,
  collectorNeededCount: venueCoverage.filter(item => !item.collector).length,
  disclaimer: '시설 원장은 전국 탐색 범위이며, 화면에는 공식 출처에서 시작일과 종료일을 확인한 푸드팝업만 표시합니다.'
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  sources,
  coverage: coverageSummary,
  popups
}, null, 2)}\n`);
await writeFile('data/popup-coverage.json', `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  summary: coverageSummary,
  venues: venueCoverage
}, null, 2)}\n`);
console.log(`푸드 팝업 ${collected.length}건 확인 · 누적 ${popups.length}건 보존 · 기준일 ${today}`);
console.log(`전국 시설 ${venueCoverage.length}곳 · 공식 피드 감시 ${coverageSummary.officialFeedMonitoredCount}곳 · 수집기 추가 필요 ${coverageSummary.collectorNeededCount}곳`);
for (const source of sources) console.log(`- ${source.name}: ${source.status} (${source.count}건)`);
