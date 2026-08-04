import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectLottePopups } from './lib/lotte-popup-collector.mjs';
import { safelyBuildAndWritePopupRunReport } from './lib/popup-run-report.mjs';

const runStartedAt = new Date().toISOString();
const runId = `food-popups-${runStartedAt.replace(/[-:.TZ]/gu, '')}-${process.pid}`;

const outputPath = process.argv.find(value => value.startsWith('--output='))?.slice(9) || 'data/popups.json';
const lotteOnly = process.argv.includes('--lotte-only');
const strictCollectors = process.argv.includes('--strict');
const retailerScope = process.argv.find(value => value.startsWith('--retailer='))?.slice(11)
  || (lotteOnly ? 'lotte' : '');
const execFileAsync = promisify(execFile);
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);
const currentYear = Number(today.slice(0, 4));
const keepSince = new Date(`${today}T00:00:00+09:00`);
keepSince.setFullYear(keepSince.getFullYear() - 2);

const foodWords = /(꽈배기|술빵|모찌|떡|절미|빵|베이커리|베이글|제과|페스츄리|디저트|케이크|쿠키|초콜릿|아이스크림|젤라또|도넛|마카롱|푸딩|타르트|약과|한과|오란다|구움과자|과일|복숭아|감자|요거트|미숫가루|카페|커피|로스터리|홍닝차|티룸|음료|주스|맥주|와인|막걸리|아페롤|포장마차|분식|김밥|라면|국수|냉면|만두|스시|초밥|야끼|타코|닭|치킨|고기|육회|곱창|족발|해산물|오징어|건어물|반찬|김치|식품|푸드|F&B|FNB|맛집|셰프|요리|농산|수산|축산|기장끝집|어릿물|프뤼떼마지|테쿠루|네이처스세븐)/iu;
const popupWords = /(팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?|카라반)/iu;
const nonHumanFood = /(반려|펫|강아지|고양이|사료)/u;
const stableHash = value => [...String(value)].reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);

function clean(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function eventDate(part, reference = new Date(`${today}T00:00:00+09:00`)) {
  const full = String(part || '').match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (full) return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`;
  const match = String(part || '').match(/(\d{1,2})\.(\d{1,2})/);
  if (!match) return '';
  const month = Number(match[1]), day = Number(match[2]);
  let year = reference.getFullYear();
  const referenceMonth = reference.getMonth() + 1;
  if (referenceMonth <= 2 && month >= 11) year -= 1;
  if (referenceMonth >= 11 && month <= 2) year += 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Retailers use several equivalent date formats (including a missing year on
// the end date). Keep this in one place so the HTML adapters do not silently
// drop otherwise valid event cards.
function dateRange(value) {
  const text = decodeHtml(value).replace(/\s+/g, ' ');
  const matches = [...text.matchAll(/(20\d{2})?[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})\s*(?:일)?\s*(?:~|∼|〜|–|—|-|부터|to)\s*(20\d{2})?[.\-/년]?\s*(\d{1,2})[.\-/월]\s*(\d{1,2})\s*(?:일)?/giu)];
  if (!matches.length) return null;
  const match = matches[0];
  const startYear = match[1] || String(currentYear);
  const endYear = match[4] || startYear;
  const startDate = `${startYear}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  const endDate = `${endYear}-${String(match[5]).padStart(2, '0')}-${String(match[6]).padStart(2, '0')}`;
  return { startDate, endDate };
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

async function fetchResilient(url, options = {}) {
  const { attempts = 3, timeoutMs = 25_000, curlMaxTime = 25, ...fetchOptions } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5',
          referer: new URL(url).origin + '/',
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 mukdang-popup-indexer/1.0',
          ...(fetchOptions.headers || {})
        },
        signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs)
      });
      if (response.ok || [401, 403, 404].includes(response.status)) return response;
      lastError = new Error(`${url} 응답 ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  // Some Korean retail hosts reject Node's TLS fingerprint while allowing a
  // normal browser-like curl request. Use curl only as a bounded fallback;
  // no proxy, login, captcha, or robots bypass is performed.
  try {
    const result = await execFileAsync('curl', ['-L', '--fail', '--silent', '--show-error', '--max-time', String(curlMaxTime), '-A', 'mukdang-popup-indexer/1.0 (+https://mukdang.com)', url], { maxBuffer: 8 * 1024 * 1024 });
    return new Response(result.stdout, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch (error) {
    throw lastError || error || new Error(`${url} 요청 실패`);
  }
}

function uniqueMenus(menus) {
  const seen = new Set();
  return menus.map(menu => ({ name: clean(menu?.name), price: clean(menu?.price) }))
    .filter(menu => menu.name && !seen.has(`${menu.name}|${menu.price}`) && seen.add(`${menu.name}|${menu.price}`))
    .slice(0, 30);
}

function parsePricedLines(value) {
  const menus = [];
  for (const line of String(value || '').replace(/<br\s*\/?\s*>/giu, '\n').split(/\r?\n/u)) {
    const text = decodeHtml(line).replace(/^[-–—•·*]\s*/u, '').trim();
    const match = text.match(/^(.+?)\s+([\d,]+\s*원)/u);
    if (match) menus.push({ name: clean(match[1]), price: clean(match[2]) });
  }
  return uniqueMenus(menus);
}

function parseHyundaiMenus(html) {
  const menus = [];
  for (const table of String(html || '').matchAll(/<table\b[^>]*class=["'][^"']*\bproduct\b[^"']*["'][^>]*>[\s\S]*?<\/table>/giu)) {
    const block = table[0];
    const name = decodeHtml(block.match(/<th\b[^>]*scope=["']row["'][^>]*>([\s\S]*?)<\/th>/iu)?.[1]
      || block.match(/<caption[^>]*>([\s\S]*?)<\/caption>/iu)?.[1]).replace(/제품목록\s*$/u, '');
    const price = decodeHtml(block.match(/<strong[^>]*>\s*([\d,]+\s*원)\s*<\/strong>/iu)?.[1]);
    if (name && price) menus.push({ name, price });
  }
  for (const figure of String(html || '').matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/giu)) {
    const block = figure[0];
    const name = decodeHtml(block.match(/<dd\b[^>]*class=["'][^"']*p_brandNm[^"']*["'][^>]*>([\s\S]*?)<\/dd>/iu)?.[1]
      || block.match(/<dd\b[^>]*class=["'][^"']*p_productNm[^"']*["'][^>]*>([\s\S]*?)<\/dd>/iu)?.[1]);
    const price = decodeHtml(block.match(/<dd\b[^>]*class=["'][^"']*p_productPrc[^"']*["'][^>]*>[\s\S]*?([\d,]+\s*원)[\s\S]*?<\/dd>/iu)?.[1]);
    if (name && price) menus.push({ name, price });
  }
  return uniqueMenus(menus);
}

function parseHyundaiImageUrls(html, sourceUrl) {
  const urls = [];
  for (const match of String(html || '').matchAll(/(?:src|data-src)=["']([^"']+)["']/giu)) {
    const raw = match[1].replace(/&amp;/giu, '&').trim();
    try {
      const url = new URL(raw, sourceUrl);
      if (!/^(?:imgprism|img)\.ehyundai\.com$/iu.test(url.hostname)) continue;
      if (!/(?:derivedImage\/fileValue|ItemNmPrcTypeInf\/imgPath)/iu.test(url.pathname)) continue;
      urls.push(url.href);
    } catch {}
  }
  return [...new Set(urls)].slice(0, 12);
}

async function collectHyundai() {
  const rows = [];
  const seen = new Set();
  const base = 'https://www.ehyundai.com/newPortal/search/result.do';
  for (const searchWord of ['pop up', '식품', '푸드', '베이커리', '디저트', '카페', '커피', '떡', '빵', '분식']) {
   for (let page = 1; page <= 50; page += 1) {
    const params = new URLSearchParams({
      searchWord, code: '', splitCode: '', convertCheck: 'false',
      salesPage: '1', storePage: '1', eventPage: String(page), culturePage: '1',
      menuPage: '1', faqPage: '1', eventSearchPage: '1', eventWinnerSearchPage: '1'
    });
    const data = await fetchJson(`${base}?${params}`);
    const events = Array.isArray(data.eventList) ? data.eventList : [];
    for (const event of events) {
      if (seen.has(event.EVNT_CRD_CD)) continue;
      seen.add(event.EVNT_CRD_CD);
      const searchable = clean(`${event.EVNT_CRD_NM} ${event.BRAND_NM} ${event.TITL}`);
      if (!popupWords.test(searchable) || !foodWords.test(searchable) || nonHumanFood.test(searchable)) continue;
      const startDate = eventDate(event.EVNT_STRT_DT);
      const endDate = eventDate(event.EVNT_END_DT);
      if (!startDate || !endDate || new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      const name = clean(event.EVNT_CRD_NM).replace(/^\[(?:POP[\s-]*UP STORE|팝업스토어)\]\s*/iu, '');
      const branchCode = `B001${event.STORE_CD}00`;
      const storeName = clean(event.STORE_NM);
      const venue = /(현대|더현대|커넥트)/u.test(storeName) ? storeName : `현대백화점 ${storeName}`;
      rows.push({
        id: `hyundai:${event.EVNT_CRD_CD}`,
        name,
        venue,
        venueType: /아울렛/u.test(event.STORE_NM) ? '쇼핑몰' : '백화점',
        address: venue,
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
  }
  const detailed = await Promise.all(rows.map(async row => {
    try {
      const response = await fetchResilient(row.sourceUrl);
      if (!response.ok) return row;
      const html = await response.text();
      const menus = parseHyundaiMenus(html);
      const officialImageUrls = parseHyundaiImageUrls(html, row.sourceUrl);
      return {
        ...row,
        ...(menus.length ? { menus, menuSource: 'official-detail' } : {}),
        ...(officialImageUrls.length ? { officialImageUrls } : {})
      };
    } catch { return row; }
  }));
  return detailed;
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
    try {
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
    } catch (error) {
      console.warn(`스타필드 ${venue} 수집 건너뜀: ${error.message}`);
    }
  }));
  // Starfield Suwon publishes its rotating food popups in the official floor
  // guide/Bites Place rather than the event API. Keep that official roster in
  // the same collector so an empty event API does not hide the whole venue.
  // The floor guide labels many tenants as "new", which is not enough to
  // classify them as popups. Only Intelligentsia is explicitly marked 팝업.
  const suwonFoodPopups = [
    ['intelligentsia', '인텔리젠시아 커피', '2026-06-11']
  ];
  const suwonSourceUrl = 'https://www.starfield.co.kr/suwon/tenant/floorInfo';
  for (const [key, name, startDate] of suwonFoodPopups) {
    rows.push({
      id: `starfield:suwon:bites-place:${key}`, name, venue: '스타필드 수원', venueType: '쇼핑몰',
      address: '경기도 수원시 장안구 수성로 175 · 스타필드 수원', startDate, endDate: '', imageUrl: '',
      sourceName: '스타필드 수원 공식 층별안내·바이츠 플레이스', sourceUrl: suwonSourceUrl,
      sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today
    });
  }
  return rows;
}

function decodeHtml(value) {
  return clean(String(value || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

const shinsegaeStores = [
  ['SC00002', '강남점', '서울특별시 서초구 신반포로 176'],
  ['SC00006', '광주신세계', '광주광역시 서구 무진대로 932'],
  ['SC00011', '김해점', '경상남도 김해시 김해대로 2232'],
  ['SC00013', '대구신세계', '대구광역시 동구 동부로 149'],
  ['SC00060', '대전신세계 Art & Science', '대전광역시 유성구 엑스포로 1'],
  ['SC00005', '마산점', '경상남도 창원시 마산합포구 합포로 251'],
  ['SC00001', '본점', '서울특별시 중구 소공로 63'],
  ['SC00008', '센텀시티점', '부산광역시 해운대구 센텀남대로 35'],
  ['SC00012', '스타필드 하남점', '경기도 하남시 미사대로 750'],
  ['SC00007', '사우스시티점', '경기도 용인시 수지구 포은대로 536'],
  ['SC00010', '의정부점', '경기도 의정부시 평화로 525'],
  ['SC00009', '천안아산점', '충청남도 천안시 동남구 만남로 43'],
  ['SC00003', '타임스퀘어점', '서울특별시 영등포구 영중로 9']
];

function shinsegaeDate(value) {
  return String(value || '').match(/^(20\d{2})-(\d{2})-(\d{2})/)?.[0] || '';
}

async function shinsegaeDetailMenus(pageLink) {
  const detailResponse = await fetchResilient(new URL(pageLink, 'https://www.shinsegae.com').href);
  if (!detailResponse.ok) return [];
  const detailText = (await detailResponse.text()).replace(/^\uFEFF/u, '');
  let menuText = '';
  try {
    const detail = JSON.parse(detailText);
    menuText = [detail.evt_sub_nm, detail.sub_img_1_ex, detail.sub_img_2_ex, detail.sub_img_3_ex].filter(Boolean).join('\n');
  } catch {
    // Some official Shinsegae `.txt` responses contain literal line breaks
    // inside a JSON string.
    menuText = [...detailText.matchAll(/"(?:evt_sub_nm|sub_img_\d+_ex)"\s*:\s*"([\s\S]*?)"\s*,\s*"[A-Za-z0-9_]+"\s*:/gu)]
      .map(match => match[1]).join('\n');
  }
  return parsePricedLines(menuText);
}

async function collectShinsegaeShoppingNews() {
  const rows = [];
  const results = await Promise.allSettled(shinsegaeStores.map(async ([storeCd, fallbackName, roadAddress]) => {
    const url = `https://www.shinsegae.com/shopping/ajaxList.do?mainCd=02&storeCd=${storeCd}`;
    const payload = await fetchJson(url);
    const cards = Array.isArray(payload.shoppingInfoList?.page) ? payload.shoppingInfoList.page : [];
    for (const card of cards) {
      const searchable = clean(`${card.title1} ${card.brandNm} ${card.badge1} ${card.genreNm} ${card.floorNm} ${card.content1}`);
      if (!popupWords.test(searchable) || !foodWords.test(searchable) || nonHumanFood.test(searchable)) continue;
      const startDate = shinsegaeDate(card.startDt);
      const endDate = shinsegaeDate(card.endDt);
      if (!card.id || !startDate || !endDate || new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      const venue = `\uc2e0\uc138\uacc4\ubc31\ud654\uc810 ${fallbackName}`;
      const pageLink = String(card.link || '');
      const sourceParams = new URLSearchParams({
        mainCd: String(card.mainCd || '02'), pageLink,
        contentDtlCd: String(card.contentDtlCd || ''), contentId: String(card.id),
        storeCd, brandCd: String(card.brandCd || '')
      });
      const imagePath = String(card.imgUrl2 || card.imgUrl1 || '');
      let menus = [];
      try {
        menus = await shinsegaeDetailMenus(pageLink);
      } catch {}
      rows.push({
        id: `shinsegae-shopping:${storeCd}:${card.id}`,
        name: clean(card.title1), venue, venueType: '백화점',
        address: clean(`${roadAddress} · ${venue} ${card.viewNm || ''} ${card.floorNm || ''}`),
        startDate, endDate,
        imageUrl: imagePath.startsWith('http') ? imagePath : `https://www.shinsegae.com${imagePath}`,
        sourceName: '신세계백화점 공식 쇼핑뉴스',
        sourceUrl: `https://www.shinsegae.com/shopping/view.do?${sourceParams}`,
        sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today,
        ...(menus.length ? { menus, menuSource: 'official-detail' } : {})
      });
    }
  }));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length === shinsegaeStores.length) throw failures[0].reason;
  if (failures.length) console.warn(`신세계 지점별 쇼핑뉴스 ${failures.length}곳 수집 실패`);
  // The detail host throttles bursts. Retry missing cards serially so one
  // temporary response does not turn a published menu back into a title-only
  // fallback.
  for (const row of rows.filter(item => !item.menus?.length)) {
    try {
      const pageLink = new URL(row.sourceUrl).searchParams.get('pageLink');
      const menus = await shinsegaeDetailMenus(pageLink);
      if (menus.length) Object.assign(row, { menus, menuSource: 'official-detail' });
    } catch {}
  }
  return rows.filter(row => {
    const detailedProducts = (row.menus || []).map(menu => menu.name).join(' ');
    return !detailedProducts || !/(샴푸|헤어오일|헤어|탈모|화장품|세럼|마스크팩|스킨케어|향수)/u.test(detailedProducts);
  });
}

async function collectShinsegae() {
  const url = 'https://www.shinsegae.com/shopping/event/list.do';
  const response = await fetchResilient(url);
  if (!response.ok) throw new Error(`${url} 응답 ${response.status}`);
  const html = await response.text();
  const rows = [];
  let parseFailures = 0;
  for (const match of html.matchAll(/<li[^>]*class=["'][^"']*gu_link_hover[^"']*["'][\s\S]*?<\/li>/gi)) {
    const block = match[0];
    const seq = block.match(/(?:eventSeq|eventSEQ)=(\d+)/i)?.[1];
    const name = decodeHtml(block.match(/class=["'][^"']*cnt_tit[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const venue = decodeHtml(block.match(/class=["'][^"']*cnt_type[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]) || '전점';
    const dateText = decodeHtml(block.match(/class="cnt_date">([\s\S]*?)<\/div>/)?.[1]);
    const dates = [...dateText.matchAll(/(\d{4})\.(\d{2})\.(\d{2})/g)].map(parts => `${parts[1]}-${parts[2]}-${parts[3]}`);
    const imagePath = block.match(/background:\s*url\(['"]?([^'")]+)/)?.[1] || '';
    const searchable = decodeHtml(block);
    if (!seq || !name || dates.length < 2 || !foodWords.test(searchable) || nonHumanFood.test(searchable)) {
      parseFailures += 1;
      continue;
    }
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
      sourceUrl: new URL(`./view.do?eventSeq=${seq}`, url).href,
      sourceGrade: 'official',
      firstSeenAt: today,
      lastSeenAt: today
    });
  }
  // The list markup has changed a few times. When the legacy class is absent
  // (or no longer exposes the date/title classes), inspect event links and
  // their nearby card text instead of returning an unexplained empty feed.
  if (!rows.length) {
    const seen = new Set();
    for (const link of html.matchAll(/<a\b[^>]+href=["']([^"']*(?:event|shopping)[^"']*)["'][^>]*>/giu)) {
      const block = html.slice(Math.max(0, link.index - 1800), Math.min(html.length, link.index + 4500));
      const seq = block.match(/(?:eventSeq|eventSEQ)[=:/](\d+)/i)?.[1] || link[1].match(/(?:eventSeq|eventSEQ)[=:/](\d+)/i)?.[1];
      const range = dateRange(block);
      const searchable = decodeHtml(block);
      const title = decodeHtml(block.match(/<(?:h[1-6]|strong|a)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|a)>/i)?.[1]);
      if (!seq || seen.has(seq) || !title || !range || !foodWords.test(searchable) || nonHumanFood.test(searchable)) continue;
      seen.add(seq);
      rows.push({
        id: `shinsegae:${seq}`, name: title, venue: '신세계백화점 전점', venueType: '백화점', address: '신세계백화점 전점',
        startDate: range.startDate, endDate: range.endDate, imageUrl: '', sourceName: '신세계백화점 공식 뉴스·이벤트',
        sourceUrl: new URL(link[1], url).href, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today
      });
    }
  }
  const shoppingNewsRows = await collectShinsegaeShoppingNews();
  console.log(`신세계 전점 이벤트 ${rows.length}건 · 지점별 쇼핑뉴스 ${shoppingNewsRows.length}건 · 파싱 실패/비식품 ${parseFailures}건`);
  return [...rows, ...shoppingNewsRows];
}

async function collectElandRetail() {
  const indexUrl = 'https://www.elandretail.com/store01.do';
  const indexResponse = await fetch(indexUrl, { headers: { 'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)' }, signal: AbortSignal.timeout(20_000) });
  if (!indexResponse.ok) throw new Error(`이랜드 지점 목록 응답 ${indexResponse.status}`);
  const indexHtml = await indexResponse.text();
  const branches = [...new Map([...indexHtml.matchAll(/href="\/store01\.do\?branchID=(\d+)[^\"]*"[^>]*>([^<]{2,40})<\/a>/gi)].map(match => [match[1], decodeHtml(match[2])])).entries()];
  const rows = [];
  const results = await Promise.allSettled(branches.map(async ([branchId, venue]) => {
    const url = `https://www.elandretail.com/news/smart_shopping_01.do?branchID=${branchId}&lang=000600KO`;
    const response = await fetch(url, { headers: { 'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return;
    const html = await response.text();
    for (const blockMatch of html.matchAll(/<li[^>]*>[\s\S]*?evtID=([^&"]+)[\s\S]*?<\/li>/gi)) {
      const block = blockMatch[0];
      const text = decodeHtml(block);
      // 이랜드 지점 페이지는 카테고리를 별도로 표시하지 않고 제목/기간만
      // 제공하는 경우가 있어, 식품 키워드가 명확한 공식 행사도 수집한다.
      if (!popupWords.test(text) || !foodWords.test(text) || nonHumanFood.test(text)) continue;
      const dates = [...text.matchAll(/(20\d{2})\.(\d{2})\.(\d{2})\s*~?\s*(20\d{2})?\.?\s*(\d{2})\.(\d{2})/g)];
      if (!dates.length) continue;
      const date = dates[0];
      const startDate = `${date[1]}-${date[2]}-${date[3]}`;
      const endDate = `${date[4] || date[1]}-${date[5]}-${date[6]}`;
      if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      const eventId = blockMatch[1];
      const title = decodeHtml(block.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1]) || '이랜드 공식 행사';
      const imageUrl = block.match(/<img[^>]+src="([^"]+)/i)?.[1] || '';
      rows.push({ id: `eland:${branchId}:${eventId}`, name: title, venue, venueType: /아울렛|몰|NC|뉴코아/iu.test(venue) ? '쇼핑몰' : '백화점', address: venue, startDate, endDate, imageUrl: imageUrl.startsWith('http') ? imageUrl : `https://www.elandretail.com${imageUrl}`, sourceName: '이랜드리테일 공식 쇼핑뉴스', sourceUrl: `https://www.elandretail.com/news/smart_shopping_02.do?evtID=${encodeURIComponent(eventId)}&branchID=${branchId}&lang=000600KO`, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today });
    }
  }));
  const failed = results.filter(result => result.status === 'rejected').length;
  if (failed) console.warn(`이랜드리테일 지점 ${failed}곳 수집 실패`);
  return rows;
}

// Some retailers do not expose a stable JSON API. Their official event pages
// are still crawlable, so keep a conservative HTML adapter that only emits
// rows when the page itself contains a popup/food keyword and an explicit date range.
async function collectOfficialHtmlFeeds(sourceName, venueType, feeds) {
  const rows = [];
  for (const feed of feeds) {
    try {
      const response = await fetchResilient(feed.url);
      if (!response.ok) continue;
      const html = await response.text();
      const blocks = [...html.matchAll(/<(?:article|li|tr)[^>]*>[\s\S]*?<\/(?:article|li|tr)>/gi)].map(match => match[0]);
      // A lot of current sites render cards with nested divs. The old
      // div-based expression stopped at the first closing child div and
      // therefore never saw the title and date together. Fall back to a
      // bounded neighbourhood around each event link in that case.
      for (const linkMatch of html.matchAll(/<a\b[^>]+href=["']([^"']*(?:event|news|popup|promotion)[^"']*)["'][^>]*>/giu)) {
        const start = Math.max(0, linkMatch.index - 1800);
        const end = Math.min(html.length, linkMatch.index + 4500);
        blocks.push(html.slice(start, end));
      }
      for (const block of blocks) {
        const text = decodeHtml(block);
        // Official boards often call these "식품행사" or "시식" rather than
        // "팝업". Keep the source restriction, but accept an explicit food
        // event keyword so those branch-level notices are not discarded.
        if (!popupWords.test(text) || !foodWords.test(text) || nonHumanFood.test(text)) continue;
        const range = dateRange(text);
        if (!range) continue;
        const { startDate, endDate } = range;
        if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
        const link = block.match(/href=["']([^"']+)["']/i)?.[1] || feed.url;
        const title = decodeHtml(block.match(/<(?:h[1-6]|strong|a)[^>]*>([\s\S]*?)<\/(?:h[1-6]|strong|a)>/i)?.[1]) || text.slice(0, 100);
        if (title.length < 2) continue;
        const sourceUrl = link.startsWith('http') ? link : new URL(link, feed.url).href;
        rows.push({ id: `${feed.id}:${stableHash(`${sourceUrl}|${startDate}|${title}`)}`, name: title, venue: feed.venue, venueType, address: feed.venue, startDate, endDate, imageUrl: block.match(/<img[^>]+src=["']([^"']+)/i)?.[1] || '', sourceName, sourceUrl, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today });
      }
    } catch (error) { console.warn(`${sourceName} ${feed.venue} 건너뜀: ${error.message}`); }
  }
  return rows;
}

async function collectFromOfficialSitemaps(sourceName, venueType, domains) {
  const rows = [];
  const seen = new Set();
  const candidateUrls = new Set();
  for (const domain of domains) {
    try {
      const robots = await fetchResilient(`https://${domain}/robots.txt`);
      const robotText = robots.ok ? await robots.text() : '';
      const maps = [...robotText.matchAll(/Sitemap:\s*(https?:\/\/[^\s]+)/ig)].map(match => match[1]);
      if (!maps.length) maps.push(`https://${domain}/sitemap.xml`, `https://${domain}/sitemap_index.xml`);
      const queue = maps.slice(0, 4);
      while (queue.length && seen.size < 40) {
        const sitemapUrl = queue.shift(); if (seen.has(sitemapUrl)) continue; seen.add(sitemapUrl);
        const response = await fetchResilient(sitemapUrl);
        if (!response.ok) continue;
        const xml = await response.text();
        for (const match of xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
          const url = decodeHtml(match[1]);
          if (/sitemap/i.test(url) && queue.length < 40) queue.push(url);
          else if (/(event|news|popup|promotion|shopping|store|branch|campaign)/iu.test(url)) candidateUrls.add(url);
        }
      }
    } catch (error) { console.warn(`${sourceName} 사이트맵 건너뜀: ${error.message}`); }
  }
  for (const url of [...candidateUrls].slice(0, 180)) {
    try {
      const response = await fetchResilient(url);
      if (!response.ok) continue;
      const html = await response.text();
      const text = decodeHtml(html);
      const title = decodeHtml(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
      if (!title || !popupWords.test(title) || !foodWords.test(text) || nonHumanFood.test(text)) continue;
      const dates = [...text.matchAll(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})[^\d]{0,20}(?:~|∼|-|–|부터)[^\d]{0,12}(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/g)];
      if (!dates.length) continue;
      const date = dates[0];
      const startDate = `${date[1]}-${String(date[2]).padStart(2, '0')}-${String(date[3]).padStart(2, '0')}`;
      const endDate = `${date[4] || date[1]}-${String(date[5]).padStart(2, '0')}-${String(date[6]).padStart(2, '0')}`;
      if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      const venue = decodeHtml(html.match(/(갤러리아|신세계백화점|타임스퀘어|아이파크몰|이마트|트레이더스|롯데마트|홈플러스|NC|뉴코아)[^<]{0,30}(점|몰|백화점)?/iu)?.[0] || new URL(url).hostname);
      rows.push({ id: `sitemap:${stableHash(`${url}|${startDate}`)}`, name: title, venue, venueType, address: venue, startDate, endDate, imageUrl: html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || '', sourceName, sourceUrl: url, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today });
    } catch (error) { /* individual official pages may block crawlers */ }
  }
  return rows;
}

const collectSitemapChains = () => collectFromOfficialSitemaps('공식 쇼핑몰·마트 사이트맵', '쇼핑몰', [
  'www.hdc-iparkmall.com', 'store.emart.com', 'company.lottemart.com', 'corporate.homeplus.co.kr', 'www.akplaza.com',
  'www.timessquare.co.kr', 'www.shinsegae.com'
]);

const ncFeeds = [
  ['nc:eland', 'NC·뉴코아 공식 이벤트', 'https://www.elandretail.com/event', 'NC백화점 전점'],
  ['nc:newcore', 'NC·뉴코아 공식 이벤트', 'https://www.elandretail.com/store/event', '뉴코아 전점']
];
const iparkFeeds = [['ipark:event', '아이파크몰 공식 이벤트', 'https://www.hdc-iparkmall.com/event', '아이파크몰 용산점']];
const emartFeeds = [
  ['emart:event', '이마트·트레이더스 공식 이벤트', 'https://store.emart.com/event/event.do', '이마트 전점'],
  ['traders:event', '이마트·트레이더스 공식 이벤트', 'https://store.emart.com/event/traders.do', '트레이더스 전점'],
  ['emart:notice', '이마트 공식 공지사항', 'https://store.emart.com/news/notice_list.do', '이마트 전점']
];
const lotteMartFeeds = [['lottemart:event', '롯데마트 공식 행사', 'https://company.lottemart.com/en/event_list.asp', '롯데마트 전점']];
const homeplusFeeds = [['homeplus:notice', '홈플러스 공식 공지사항', 'https://corporate.homeplus.co.kr/Business/Hyper_Notice.aspx', '홈플러스 전점']];

const collectNc = collectElandRetail;
const collectIpark = () => collectOfficialHtmlFeeds('아이파크몰 공식 이벤트', '쇼핑몰', iparkFeeds.map(([id, sourceName, url, venue]) => ({ id, sourceName, url, venue })));
const collectEmart = () => collectOfficialHtmlFeeds('이마트·트레이더스 공식 이벤트', '대형마트', emartFeeds.map(([id, sourceName, url, venue]) => ({ id, sourceName, url, venue })));
const collectLotteMart = () => collectOfficialHtmlFeeds('롯데마트 공식 행사', '대형마트', lotteMartFeeds.map(([id, sourceName, url, venue]) => ({ id, sourceName, url, venue })));
const collectHomeplus = () => collectOfficialHtmlFeeds('홈플러스 공식 행사', '대형마트', homeplusFeeds.map(([id, sourceName, url, venue]) => ({ id, sourceName, url, venue })));

async function existingRows() {
  try {
    const data = JSON.parse(await readFile(outputPath, 'utf8'));
    return Array.isArray(data.popups) ? data.popups : [];
  } catch {
    return [];
  }
}

async function existingSources() {
  try {
    const data = JSON.parse(await readFile(outputPath, 'utf8'));
    return Array.isArray(data.sources) ? data.sources : [];
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

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
  return decodeHtml(match?.[1] || '');
}

const akStores = [
  ['01', '수원'], ['02', '분당'], ['03', '평택'], ['04', '원주'],
  ['12', '금정'], ['13', '홍대'], ['14', '기흥'], ['15', '광명'], ['16', '금정'], ['17', '세종']
];

const galleriaStores = [
  ['luxuryhall', '갤러리아 명품관'], ['timeworld', '갤러리아 타임월드'],
  ['gwanggyo', '갤러리아 광교'], ['centercity', '갤러리아 센터시티'], ['jinju', '갤러리아 진주']
];

async function collectGalleria() {
  const rows = [];
  // G.LAB is a popup venue, not a food brand. Emit only the named brands
  // published inside an official G.LAB schedule.
  const timeworldDessertSource = 'https://dept.galleria.co.kr/store-info/timeworld/promotion/shopping-news/c85834?qCategory=NEWOPENING_POPUP';
  const timeworldDessertImages = {
    dessertPlanet: 'https://product1-84t.pages.dev/assets/popups/galleria/timeworld-dessert-planet.jpg',
    beatzel: 'https://product1-84t.pages.dev/assets/popups/galleria/timeworld-beatzel.jpg'
  };
  rows.push(
    {
      id: 'galleria:timeworld:c85834:dessert-planet', name: '디저트플래닛', venue: '갤러리아 타임월드',
      venueType: '백화점', address: '갤러리아 타임월드 B2F G-LAB', startDate: '2026-07-24', endDate: '2026-08-06',
      imageUrl: timeworldDessertImages.dessertPlanet, officialImageUrls: [timeworldDessertImages.dessertPlanet],
      menus: [
        { name: '마블 글레이즈 크로넛', price: '4,000원' }, { name: '우유생크림 크로넛', price: '5,500원' },
        { name: '오레오 크로넛', price: '6,000원' }, { name: '두바이 크로플', price: '7,500원' }
      ], menuSource: 'official-detail', sourceName: '갤러리아 공식 쇼핑뉴스', sourceUrl: timeworldDessertSource,
      sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today
    },
    {
      id: 'galleria:timeworld:c85834:beatzel', name: '바잇첼', venue: '갤러리아 타임월드',
      venueType: '백화점', address: '갤러리아 타임월드 B2F', startDate: '2026-07-24', endDate: '2026-08-06',
      imageUrl: timeworldDessertImages.beatzel, officialImageUrls: [timeworldDessertImages.beatzel],
      menus: [
        { name: '솔트 프레즐', price: '4,700원' }, { name: '크림치즈 프레즐', price: '5,800원' },
        { name: '시그니처 토마콘 프레즐', price: '6,300원' }
      ], menuSource: 'official-detail', sourceName: '갤러리아 공식 쇼핑뉴스', sourceUrl: timeworldDessertSource,
      sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today
    }
  );
  const gwanggyoSchedules = [
    ['c85958:yoodongbu', '유동부치아바타', '2026-07-31', '2026-08-13', 'c85958', 'gwanggyo-yoodongbu.jpg'],
    ['c85958:longmadame', '롱마담 에그타르트', '2026-07-31', '2026-08-13', 'c85958', 'gwanggyo-longmadame.jpg'],
    ['c85958:kickstaco', '킥스타코', '2026-07-31', '2026-08-06', 'c85958', 'gwanggyo-kickstaco.jpg'],
    ['c85958:takonottaco', '타코낫타코', '2026-07-31', '2026-08-13', 'c85958', 'gwanggyo-takonottaco.jpg'],
    ['c85957:ageujak', '떼구르르 베이커리(아그작케이크)', '2026-07-31', '2026-08-20', 'c85957', 'gwanggyo-ageujak.jpg'],
    ['c85957:tdbd', '더데일리브레드(TDBD)', '2026-07-31', '2026-10-31', 'c85957', 'gwanggyo-tdbd.jpg'],
    ['c85957:oneulmojji', '오늘모찌', '2026-07-17', '2026-10-31', 'c85957', 'gwanggyo-oneulmojji.jpg'],
    ['c85957:hanwoomyeongga', '한우명가', '2026-07-10', '2026-08-06', 'c85957', 'gwanggyo-hanwoomyeongga.jpg']
  ];
  for (const [key, name, startDate, endDate, cardId, imageName] of gwanggyoSchedules) {
    const sourceUrl = `https://dept.galleria.co.kr/store-info/gwanggyo/promotion/shopping-news/${cardId}?qCategory=PRODUCT_EVENT`;
    const imageUrl = `https://product1-84t.pages.dev/assets/popups/galleria/${imageName}`;
    rows.push({
      id: `galleria:gwanggyo:${key}`, name, venue: '갤러리아 광교', venueType: '백화점',
      address: '경기도 수원시 영통구 광교중앙로 124 · 갤러리아 광교 B1F GOURMET494',
      startDate, endDate, imageUrl, officialImageUrls: [imageUrl], sourceName: '갤러리아 공식 쇼핑뉴스',
      sourceUrl, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today
    });
  }
  for (const [slug, venue] of galleriaStores) {
    try {
      const listUrl = `https://dept.galleria.co.kr/store-info/${slug}/promotion/shopping-news?qCategory=NEWOPENING_POPUP`;
      const listResponse = await fetchResilient(listUrl);
      if (!listResponse.ok) { console.warn(`갤러리아 ${venue} 응답 ${listResponse.status}`); continue; }
      const listHtml = await listResponse.text();
      const links = [...new Set([...listHtml.matchAll(new RegExp(`href="(/store-info/${slug}/promotion/shopping-news/c\\d+)(?:\\?[^\"]*)?"`, 'gi'))].map(match => match[1]))].slice(0, 80);
      for (const path of links) {
        const response = await fetchResilient(`https://dept.galleria.co.kr${path}?qCategory=NEWOPENING_POPUP`);
        if (!response.ok) continue;
        const html = await response.text();
        const title = decodeHtml(html.match(/<article[\s\S]*?<h1 class="page-title">([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]);
        const text = decodeHtml(`${html} ${html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1] || ''}`);
        const isPopup = /뉴오프닝|팝업|POP[\s-]*UP/iu.test(text);
        if (!title || !isPopup || (!foodWords.test(`${title} ${text}`) && !/GOURMET|델리|푸드코트/iu.test(`${title} ${text}`))) continue;
        const fullDates = [...text.matchAll(/(\d{4})\.(\d{2})\.(\d{2})[^\d]{0,12}(?:~|∼|-|–)[^\d]{0,4}(\d{4})\.(\d{2})\.(\d{2})/g)];
        const shortDates = [...text.matchAll(/(\d{1,2})\.(\d{1,2})\s*[-~]\s*(?:(\d{1,2})\.)?(\d{1,2})/g)];
        let startDate = '', endDate = '';
        if (fullDates.length) {
          const date = fullDates[0];
          startDate = `${date[1]}-${date[2]}-${date[3]}`; endDate = `${date[4]}-${date[5]}-${date[6]}`;
        } else if (shortDates.length) {
          const date = shortDates[0];
          startDate = eventDate(`${date[1]}.${date[2]}`); endDate = eventDate(`${date[3] || date[1]}.${date[4]}`);
        }
        if (!startDate) continue;
        if (endDate && new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
        const imageUrl = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/<div class="article-detail">[\s\S]*?<img src="([^"]+)/i)?.[1] || '';
        rows.push({ id: `galleria:${slug}:${path.split('/').pop()}`, name: title, venue, venueType: '백화점', address: venue, startDate, endDate, imageUrl, sourceName: '갤러리아 공식 쇼핑뉴스', sourceUrl: `https://dept.galleria.co.kr${path}`, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today });
      }
    } catch (error) { console.warn(`갤러리아 ${venue} 수집 건너뜀: ${error.message}`); }
  }
  return rows;
}

async function collectAkPlaza() {
  const rows = [];
  for (const [storeCode, storeName] of akStores) {
    const response = await fetch(`https://www.akplaza.com/board/event/list?store=${storeCode}`, {
      headers: { 'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)' },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`AK플라자 ${storeName} 응답 ${response.status}`);
    const html = await response.text();
    for (const match of html.matchAll(/<div class="posts-item"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi)) {
      const block = match[0];
      const title = decodeHtml(block.match(/class="posts-name"[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
      const summary = decodeHtml(block.match(/class="posts-summary"[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
      const imageUrl = block.match(/class="posts-thumbnail"[^>]*>[\s\S]*?src="([^"]+)/i)?.[1] || '';
      const sequence = block.match(/view\((\d+)\)/i)?.[1];
      const dates = [...block.matchAll(/(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/g)];
      const searchable = `${title} ${summary}`;
      if (!title || !dates.length || !/팝업|POP[\s-]*UP/iu.test(searchable) || !foodWords.test(searchable)) continue;
      const date = dates[0];
      const startDate = `${date[1]}-${date[2]}-${date[3]}`;
      const endDate = `${date[4]}-${date[5]}-${date[6]}`;
      if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      rows.push({
        id: `ak:${storeCode}:${sequence || stableHash(title)}`,
        name: title,
        venue: `AK플라자 ${storeName}점`,
        venueType: '백화점',
        address: `AK플라자 ${storeName}점`,
        startDate,
        endDate,
        imageUrl,
        sourceName: 'AK플라자 공식 이벤트',
        sourceUrl: `https://www.akplaza.com/board/event/list?store=${storeCode}`,
        sourceGrade: 'official',
        firstSeenAt: today,
        lastSeenAt: today
      });
    }
  }
  return rows;
}

async function collectLotteOfficialBlog() {
  const response = await fetch('https://blog.lotte.co.kr/feed/', {
    headers: { 'user-agent': 'mukdang-popup-indexer/1.0 (+https://mukdang.com)' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`롯데 공식 블로그 응답 ${response.status}`);
  const xml = await response.text();
  const rows = [];
  for (const block of xml.matchAll(/<item>[\s\S]*?<\/item>/gi)) {
    const item = block[0];
    const title = clean(xmlText(item, 'title'));
    const link = clean(xmlText(item, 'link'));
    const text = `${title} ${clean(xmlText(item, 'description'))}`;
    if (!/팝업|POP[\s-]*UP/iu.test(text) || !foodWords.test(text)) continue;
    const dates = [...text.matchAll(/(\d{1,2})월\s*(\d{1,2})일[^\d]{0,12}(?:~|∼|-|–)[^\d]{0,4}(?:(\d{1,2})월\s*)?(\d{1,2})일/g)];
    const venues = [...text.matchAll(/(롯데(?:프리미엄)?아울렛\s*[가-힣]+점|롯데백화점\s*[가-힣]+점|롯데월드몰|롯데몰\s*[가-힣]+점)/g)].map(match => match[1]);
    if (!dates.length || !venues.length) continue;
    const published = new Date(xmlText(item, 'pubDate'));
    const year = Number.isFinite(published.getTime()) ? published.getFullYear() : currentYear;
    for (const match of dates) {
      const startMonth = Number(match[1]), startDay = Number(match[2]);
      const endMonth = Number(match[3] || match[1]), endDay = Number(match[4]);
      const startDate = `${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDate = `${endMonth < startMonth ? year + 1 : year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      if (new Date(`${endDate}T23:59:59+09:00`) < keepSince) continue;
      for (const venue of [...new Set(venues)]) rows.push({
        id: `lotte-blog:${stableHash(`${link}|${venue}|${startDate}`)}`,
        name: title,
        venue,
        venueType: /아울렛|몰/u.test(venue) ? '쇼핑몰' : '백화점',
        address: venue,
        startDate,
        endDate,
        imageUrl: '',
        sourceName: '롯데 공식 블로그',
        sourceUrl: link,
        sourceGrade: 'official',
        firstSeenAt: today,
        lastSeenAt: today
      });
    }
  }
  return rows;
}

async function collectCuratedOfficial() {
  const rows = JSON.parse(await readFile('data/curated-popups.json', 'utf8'));
  return collectLottePopups({ rows, previous, today, fetchResilient, clean, decodeHtml, uniqueMenus, normalizedText, fast: retailerScope === 'lotte' });
}

const previous = await existingRows();
const previousSources = await existingSources();
const venueRegistry = await popupVenueRegistry();
const allCollectors = [
  ['현대백화점·현대아울렛', collectHyundai],
  ['신세계백화점', collectShinsegae],
  ['스타필드·스타필드시티', collectStarfield],
  ['갤러리아', collectGalleria],
  ['AK플라자', collectAkPlaza],
  ['NC·뉴코아', collectNc],
  ['아이파크몰', collectIpark],
  ['이마트·트레이더스', collectEmart],
  ['롯데마트', collectLotteMart],
  ['홈플러스', collectHomeplus],
  ['공식 쇼핑몰·마트 사이트맵', collectSitemapChains],
  ['롯데 공식 블로그', collectLotteOfficialBlog],
  ['롯데백화점·롯데아울렛·롯데몰', collectCuratedOfficial]
];
// Incident repair path: refresh one retailer without waiting for every
// national adapter. Existing rows from collectors outside the scope remain.
const retailerCollectorNames = new Map([
  ['hyundai', new Set(['현대백화점·현대아울렛'])],
  ['shinsegae', new Set(['신세계백화점'])],
  ['lotte', new Set(['롯데 공식 블로그', '롯데백화점·롯데아울렛·롯데몰'])],
  ['starfield', new Set(['스타필드·스타필드시티'])],
  ['galleria', new Set(['갤러리아'])],
  ['akplaza', new Set(['AK플라자'])],
  ['eland', new Set(['NC·뉴코아'])],
  ['ipark', new Set(['아이파크몰'])],
  ['emart', new Set(['이마트·트레이더스'])],
  ['lottemart', new Set(['롯데마트'])],
  ['homeplus', new Set(['홈플러스'])],
  ['malls', new Set(['공식 쇼핑몰·마트 사이트맵'])]
]);
if (retailerScope && !retailerCollectorNames.has(retailerScope)) {
  throw new Error(`지원하지 않는 --retailer 값: ${retailerScope} (${[...retailerCollectorNames.keys()].join(', ')} 중 선택)`);
}
const scopedCollectorNames = retailerCollectorNames.get(retailerScope);
const collectors = scopedCollectorNames
  ? allCollectors.filter(([name]) => scopedCollectorNames.has(name))
  : allCollectors;
const sourceRuns = await Promise.all(collectors.map(async ([source, collector]) => {
  const startedAt = new Date().toISOString();
  try {
    const rows = await collector();
    return { source, rows, startedAt, finishedAt: new Date().toISOString() };
  } catch (error) {
    return { source, rows: [], error, startedAt, finishedAt: new Date().toISOString() };
  }
}));
const settled = sourceRuns.map(run => run.error
  ? { status: 'rejected', reason: run.error }
  : { status: 'fulfilled', value: run.rows });
const collected = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
const rawCollectedCount = collected.length;
const sources = collectors.map(([name], index) => ({
  name,
  // `active` means the collector ran, not that it found a card. Distinguish
  // an empty parse from a transport failure so coverage does not look healthy
  // while silently returning zero rows.
  status: settled[index].status === 'rejected' ? 'error' : settled[index].value.length ? 'active' : 'no-results',
  count: settled[index].status === 'fulfilled' ? settled[index].value.length : 0,
  message: settled[index].status === 'rejected' ? String(settled[index].reason?.message || settled[index].reason) : undefined
}));
const outputSources = retailerScope
  ? [...new Map([...previousSources, ...sources].map(source => [source.name, source])).values()]
  : sources;
const collectorErrors = sources.filter(source => source.status === 'error');
if (collectorErrors.length) console.warn(`공식 수집기 ${collectorErrors.length}개 실패: ${collectorErrors.map(source => source.name).join(', ')} · 기존 데이터 보존`);
if (strictCollectors && collectorErrors.length) {
  const finishedAt = new Date().toISOString();
  await safelyBuildAndWritePopupRunReport({
    runId, scope: retailerScope || 'all', startedAt: runStartedAt, finishedAt,
    sourceRuns, normalize: row => row, identity: row => String(row?.id || ''), finalRows: collected
  });
  throw new Error(`공식 수집기 실패로 일일 반영 중단: ${collectorErrors.map(source => source.name).join(', ')}`);
}

function normalizedUrl(value) {
  try {
    const url = new URL(String(value || ''));
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref|source)/iu.test(key)) url.searchParams.delete(key);
    url.hash = '';
    return url.toString();
  } catch { return String(value || ''); }
}
function normalizedText(value) { return clean(value).replace(/(?:\[?POP[\s-]*UP(?: STORE)?\]?|팝업스토어?)/giu, '').replace(/\s+/g, '').toLowerCase(); }
function derivedStatus(row) {
  if (row.endDate && row.endDate < today) return 'ended';
  if (row.startDate > today) return 'upcoming';
  return 'active';
}
function officialMenuItems(row) {
  if (Array.isArray(row.menuItems) && row.menuItems.length) return row.menuItems.map(clean).filter(Boolean);
  let title = clean(row.name)
    .replace(/^\[(?:POP[\s-]*UP(?: STORE)?|팝업스토어?|디저트 카라반|푸드파크)\]\s*/iu, '')
    .replace(/\s*(?:팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?|신규\s*오픈|NEW\s*OPEN|NOW\s*OPEN|OPEN)\s*$/iu, '')
    .replace(/^\[([^\]]+)\]$/u, '$1');
  const exactOfficialMenus = new Map([
    ['lotte:blog:breath-bread:dongbusan', ['세븐셀렉트 숨결통식빵']]
  ]);
  if (exactOfficialMenus.has(row.id)) return exactOfficialMenus.get(row.id);
  if (/^lotte:/u.test(row.id)) return [];
  if (/^(?:위클리\s*)?팝업\s*뉴스$/u.test(title)) return [];
  return [...new Set(title.split(/\s*(?:&|\/|\+|·)\s*/u).map(item => clean(item).replace(/^\[|\]$/g, '')).filter(item => item.length >= 2))].slice(0, 8);
}
function popupRegion(row) {
  if (row.region) return clean(row.region);
  const text = `${row.address || ''} ${row.venue || ''}`;
  const rules = [
    ['서울특별시', /서울|압구정|천호|미아|건대|본점|신촌|노원|잠실|월드몰/u],
    ['경기도', /경기|광교|킨텍스|중동|김포|안산|동탄|수원/u],
    ['인천광역시', /인천|송도/u],
    ['부산광역시', /부산|동부산|센텀/u],
    ['대구광역시', /대구/u],
    ['울산광역시', /울산/u],
    ['충청북도', /청주|충청/u],
    ['대전광역시', /대전/u],
    ['광주광역시', /광주/u],
    ['강원특별자치도', /강원|원주|춘천/u],
    ['제주특별자치도', /제주/u]
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || null;
}
function venueIdentity(value) {
  return clean(value).replace(/\(주\)|㈜|주식회사|\s|[·.,()]/gu, '').toLowerCase();
}
function registeredVenueAddress(row) {
  const current = clean(row.address);
  if (/(특별시|광역시|특별자치도|특별자치시|경기도|강원도|충청|전라|경상|제주)\s/u.test(current)) return current;
  const knownAddresses = new Map([
    ['현대프리미엄아울렛 송도점', '인천광역시 연수구 송도국제대로 123'],
    ['더현대 대구', '대구광역시 중구 달구벌대로 2077'],
    ['현대백화점 압구정본점', '서울특별시 강남구 압구정로 165'],
    ['롯데백화점 안산점', '경기도 안산시 단원구 고잔1길 12'],
    ['롯데백화점 인천점', '인천광역시 미추홀구 연남로 35'],
    ['롯데아울렛 청주점', '충청북도 청주시 흥덕구 2순환로 1004']
  ]);
  if (knownAddresses.has(row.venue)) return `${knownAddresses.get(row.venue)} · ${row.venue}`;
  const key = venueIdentity(row.venue);
  if (!key) return current || null;
  const candidates = venueRegistry.filter(venue => {
    const registryKey = venueIdentity(venue.name);
    return registryKey === key || registryKey.includes(key) || key.includes(registryKey);
  });
  const match = candidates.sort((left, right) => venueIdentity(right.name).length - venueIdentity(left.name).length)[0];
  return match?.address ? clean(`${match.address} · ${row.venue}`) : current || null;
}
function normalizePopup(row) {
  const address = registeredVenueAddress(row);
  const fallbackItems = officialMenuItems(row);
  const menus = uniqueMenus(Array.isArray(row.menus) && row.menus.length
    ? row.menus
    : fallbackItems.map(name => ({ name, price: '' })));
  // Every retailer's official representative image belongs in the same
  // gallery contract. Retailer adapters may add more detail-page images, but
  // no official source should be excluded merely because it is not Lotte.
  let normalizedImageUrl = '';
  try {
    const rawImageUrl = String(row.imageUrl || '').trim();
    const resolved = rawImageUrl ? new URL(rawImageUrl, row.sourceUrl).href : '';
    if (/^https:\/\//iu.test(resolved)) normalizedImageUrl = resolved;
  } catch {}
  const officialImageUrls = [...new Set([
    ...(Array.isArray(row.officialImageUrls) ? row.officialImageUrls : []),
    normalizedImageUrl
  ].map(value => String(value || '').trim()).filter(value => /^https:\/\//iu.test(value)))].slice(0, 12);
  const normalized = {
    ...row,
    name: clean(row.name),
    brand: row.brand ? clean(row.brand) : null,
    venue: clean(row.venue),
    address,
    region: popupRegion({ ...row, address }),
    category: row.category || 'food-popup',
    menus,
    menuItems: menus.map(menu => menu.name),
    menuSource: row.menuSource || 'official-event-text',
    sourceUrl: normalizedUrl(row.sourceUrl),
    imageUrl: normalizedImageUrl || null,
    ...(officialImageUrls.length ? { officialImageUrls } : {}),
    lastVerifiedAt: today,
    lastSeenAt: today
  };
  normalized.status = derivedStatus(normalized);
  return normalized;
}
const collectedIds = new Set(collected.map(row => row.id));
const refreshedIdRules = [
  ['현대백화점·현대아울렛', /^hyundai:/u],
  ['신세계백화점', /^shinsegae(?:-shopping)?:/u],
  ['스타필드·스타필드시티', /^starfield:/u],
  ['갤러리아', /^galleria:/u],
  ['AK플라자', /^ak:/u],
  ['NC·뉴코아', /^eland:/u],
  ['아이파크몰', /^ipark:/u],
  ['이마트·트레이더스', /^(?:emart|traders):/u],
  ['롯데마트', /^lottemart:/u],
  ['홈플러스', /^homeplus:/u],
  ['공식 쇼핑몰·마트 사이트맵', /^sitemap:/u]
];
// A scoped repair returning zero rows is more likely a temporary parser/feed
// issue than proof that every event disappeared. Preserve the last known rows
// in that case; the full scheduled audit can retire genuinely removed cards.
const fulfilledCollectorNames = new Set(collectors
  .filter((_collector, index) => settled[index].status === 'fulfilled' && settled[index].value.length)
  .map(([name]) => name));
const retainedPrevious = previous.filter(row => !refreshedIdRules.some(([collectorName, pattern]) =>
  fulfilledCollectorNames.has(collectorName) && pattern.test(row.id) && !collectedIds.has(row.id)
));
const merged = new Map(retainedPrevious
  .filter(row => ['official', 'official-search'].includes(row.sourceGrade))
  .map(row => [row.id, normalizePopup(row)]));
for (const row of collected) {
  const normalized = normalizePopup(row);
  const old = merged.get(normalized.id);
  merged.set(normalized.id, { ...old, ...normalized, firstSeenAt: old?.firstSeenAt || normalized.firstSeenAt });
}
const beforeDedupCount = merged.size;
const deduped = new Map();
for (const row of merged.values()) {
  const identity = `${normalizedText(row.brand || row.name)}|${normalizedText(row.venue)}|${row.startDate}|${row.endDate}`;
  const old = deduped.get(identity);
  if (!old || (row.sourceGrade === 'official' && old.sourceGrade !== 'official')) deduped.set(identity, row);
}
const duplicateRemovedCount = beforeDedupCount - deduped.size;
const popups = [...deduped.values()]
  .filter(row => row.id && row.name && row.startDate)
  .filter(row => !row.endDate || row.endDate >= row.startDate)
  .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.name.localeCompare(right.name, 'ko'));

const retainedOfficialCount = retainedPrevious.filter(row => ['official', 'official-search'].includes(row.sourceGrade)).length;
if (retainedOfficialCount >= 10 && popups.length < retainedOfficialCount * 0.8) {
  throw new Error(`공식 수집 결과 급감 보호: 정책상 유지 대상 ${retainedOfficialCount}건 → ${popups.length}건 (20% 이상 감소), 파일 반영 중단`);
}

const collectorCoverageRules = [
  ['현대백화점·현대아울렛', /(현대백화점|현대아울렛|현대프리미엄아울렛|더현대)/u],
  ['신세계백화점', /신세계백화점/u],
  ['스타필드·스타필드시티', /스타필드/u],
  ['롯데백화점·롯데아울렛·롯데몰', /(롯데백화점|롯데아울렛|롯데프리미엄아울렛|롯데몰)/u],
  ['갤러리아', /갤러리아/u],
  ['AK플라자', /AK플라자|에이케이플라자/iu],
  ['NC·뉴코아', /NC|뉴코아/iu],
  ['아이파크몰', /아이파크몰/u],
  ['이마트·트레이더스', /이마트|트레이더스/u],
  ['롯데마트', /롯데마트/u],
  ['홈플러스', /홈플러스/u],
  ['타임스퀘어', /타임스퀘어/u]
];
const activeCollectorNames = new Set(outputSources.filter(source => source.status === 'active').map(source => source.name));
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
    status: matchedPopups ? 'verified-popup-found' : activeCollectorNames.has(collector) ? 'official-feed-monitored' : collector ? 'adapter-needed' : 'collector-needed',
    popupCount: matchedPopups
  };
});
const coverageSummary = {
  nationwideVenueTotal: venueCoverage.length,
  verifiedPopupVenueCount: venueCoverage.filter(item => item.popupCount > 0).length,
  officialFeedMonitoredCount: venueCoverage.filter(item => item.collector && activeCollectorNames.has(item.collector)).length,
  collectorNeededCount: venueCoverage.filter(item => !item.collector || !activeCollectorNames.has(item.collector)).length,
  disclaimer: '시설 원장은 전국 탐색 범위이며, 화면에는 공식 출처에서 시작일과 종료일을 확인한 푸드팝업만 표시합니다.'
};
const statusCounts = Object.fromEntries(['active', 'upcoming', 'ended'].map(status => [status, popups.filter(row => row.status === status).length]));
const collectionStats = {
  rawCollected: rawCollectedCount,
  parsed: collected.length,
  beforeDedup: beforeDedupCount,
  duplicateRemoved: duplicateRemovedCount,
  final: popups.length,
  status: statusCounts,
  photos: {
    popupCount: popups.filter(row => row.officialImageUrls?.length).length,
    imageCount: popups.reduce((sum, row) => sum + (row.officialImageUrls?.length || 0), 0),
    missingCount: popups.filter(row => !row.officialImageUrls?.length).length
  },
  failedSources: collectorErrors.map(source => source.name),
  emptySources: outputSources.filter(source => source.status === 'no-results').map(source => source.name)
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  updatedAt: new Date().toISOString(),
  sources: outputSources,
  stats: collectionStats,
  coverage: coverageSummary,
  popups
}, null, 2)}\n`);
if (!retailerScope) {
  await writeFile('data/popup-coverage.json', `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    summary: coverageSummary,
    venues: venueCoverage
  }, null, 2)}\n`);
}
const runFinishedAt = new Date().toISOString();
await safelyBuildAndWritePopupRunReport({
  runId,
  scope: retailerScope || 'all',
  startedAt: runStartedAt,
  finishedAt: runFinishedAt,
  sourceRuns,
  normalize: normalizePopup,
  identity: row => `${normalizedText(row.brand || row.name)}|${normalizedText(row.venue)}|${row.startDate}|${row.endDate}`,
  finalRows: popups
});
console.log(`원본 수집 ${rawCollectedCount}건 · 파싱 성공 ${collected.length}건 · ID 병합 ${beforeDedupCount}건 · 중복 제거 ${duplicateRemovedCount}건 · 최종 ${popups.length}건`);
console.log(`상태 집계 active=${statusCounts.active} upcoming=${statusCounts.upcoming} ended=${statusCounts.ended}`);
console.log(`공식 사진 팝업 ${collectionStats.photos.popupCount}/${popups.length}건 · 사진 ${collectionStats.photos.imageCount}장 · 미확보 ${collectionStats.photos.missingCount}건`);
console.log(`전국 시설 ${venueCoverage.length}곳 · 공식 피드 감시 ${coverageSummary.officialFeedMonitoredCount}곳 · 수집기 추가 필요 ${coverageSummary.collectorNeededCount}곳`);
for (const source of sources) console.log(`- ${source.name}: ${source.status} (${source.count}건)`);
