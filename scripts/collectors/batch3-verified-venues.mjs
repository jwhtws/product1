import { detailFields, parseBatch3VenuePayload, parseDootaList, parseIfcList, parsePremiumList, SourceStructureChangedError } from '../parsers/batch3-venue-parser.mjs';

export const BATCH3_VERIFIED_VENUES = Object.freeze([
  { id: 'shinsegae-simon-premium-outlets', sourceName: '신세계사이먼 프리미엄 아울렛', collectorName: '신세계사이먼 프리미엄 아울렛' },
  { id: 'ifc-mall', sourceName: 'IFC몰', collectorName: 'IFC몰' },
  { id: 'doota-mall', sourceName: '두타몰', collectorName: '두타몰' }
]);

const DISCOVERY = /(팝업|POP[\s-]*UP|마켓|푸드|식품|빵|베이커리|디저트|카페|커피|음료|맥주|와인|치킨|라면|만두)/iu;

async function enrich(items, fetchText, limit = 30) {
  const output = [];
  let fetchedCount = 0;
  for (const item of items) {
    if (!DISCOVERY.test(item.title || '')) { output.push(item); continue; }
    if (fetchedCount >= limit) { output.push(item); continue; }
    try {
      const html = await fetchText(item.sourceUrl);
      fetchedCount += 1;
      const detail = detailFields(html, item.sourceUrl);
      output.push({ ...item, title: detail.title || item.title, description: detail.description, startDate: detail.startDate || item.startDate, endDate: detail.endDate || item.endDate, imageUrl: detail.imageUrl || item.imageUrl });
    } catch { output.push(item); }
  }
  return { items: output, fetchedCount };
}

const PREMIUM_BRANCHES = [
  ['01', '여주 프리미엄 아울렛', '경기도 여주시 명품로 360'],
  ['02', '파주 프리미엄 아울렛', '경기도 파주시 탄현면 필승로 200'],
  ['03', '부산 프리미엄 아울렛', '부산광역시 기장군 장안읍 정관로 1133'],
  ['05', '시흥 프리미엄 아울렛', '경기도 시흥시 서해안로 699'],
  ['06', '제주 프리미엄 전문점', '제주특별자치도 제주시 연동7길 31']
];

export async function collectPremiumOutlets({ fetchText, today }) {
  const discovered = [];
  let listResponses = 0;
  for (const [branchCode, venue, address] of PREMIUM_BRANCHES) {
    const html = await fetchText(`https://www.premiumoutlets.co.kr/rpage/main/index/${branchCode}`);
    listResponses += 1;
    discovered.push(...parsePremiumList(html, { branchCode, venue, address }));
  }
  if (!listResponses) throw new SourceStructureChangedError('shinsegae-simon-premium-outlets', '공식 지점 목록 응답이 없습니다');
  if (!discovered.length) throw new SourceStructureChangedError('shinsegae-simon-premium-outlets', '공식 지점 페이지에서 이벤트 상세 링크를 찾지 못했습니다');
  const unique = [...new Map(discovered.map(item => [item.sourceItemId, item])).values()];
  const enriched = await enrich(unique, fetchText, 40);
  return parseBatch3VenuePayload({ sourceId: 'shinsegae-simon-premium-outlets', sourceName: '신세계사이먼 프리미엄 아울렛', venueType: '아울렛', venue: '신세계사이먼 프리미엄 아울렛', items: enriched.items, fetchedCount: unique.length + enriched.fetchedCount }, { today });
}

export async function collectIfcMall({ fetchJson, fetchText, today }) {
  const payload = await fetchJson('https://www.ifcmallseoul.com/kr/now/search/list1NowByNowId?pageIndex=1&nowId=event&searchKeyword=');
  const items = parseIfcList(payload);
  const enriched = await enrich(items, fetchText, 24);
  return parseBatch3VenuePayload({ sourceId: 'ifc-mall', sourceName: 'IFC몰', venue: 'IFC몰', venueType: '쇼핑몰', items: enriched.items, fetchedCount: items.length + enriched.fetchedCount }, { today });
}

export async function collectDootaMall({ fetchJson, fetchText, today }) {
  const payload = await fetchJson('https://www.doota-mall.com/event/event_list.json?statType=OPEN&pageNo=1&device=web');
  const items = parseDootaList(payload);
  const enriched = await enrich(items, fetchText, 24);
  return parseBatch3VenuePayload({ sourceId: 'doota-mall', sourceName: '두타몰', venue: '두타몰', venueType: '쇼핑몰', items: enriched.items, fetchedCount: items.length + enriched.fetchedCount }, { today });
}

export function createVerifiedVenueCollectors(options) {
  return [
    ['신세계사이먼 프리미엄 아울렛', () => collectPremiumOutlets(options)],
    ['IFC몰', () => collectIfcMall(options)],
    ['두타몰', () => collectDootaMall(options)]
  ];
}
