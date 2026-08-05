import { SourceStructureChangedError } from './food-popup-source-parser.mjs';

const DATE = /^20\d{2}-\d{2}-\d{2}$/u;
const FOOD = /(꽈배기|떡|빵|베이커리|디저트|케이크|쿠키|초콜릿|아이스크림|젤라또|도넛|마카롱|카페|커피|음료|맥주|와인|분식|김밥|라면|만두|치킨|식품|푸드|F&B|먹거리)/iu;
const POPUP = /(팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?|마켓)/iu;
const NON_FOOD = /(반려|펫|강아지|고양이|사료)/u;

const decode = value => String(value || '').replace(/&amp;/giu, '&').replace(/&quot;|&#34;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&lt;/giu, '<').replace(/&gt;/giu, '>');
export const cleanVenueText = value => decode(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();

export function isoDate(value) {
  const match = String(value || '').match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/u);
  if (!match) return '';
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

export function detailFields(html, sourceUrl) {
  const text = cleanVenueText(html);
  const title = cleanVenueText(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/iu)?.[1]
    || html.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/iu)?.[1]);
  const dates = [...text.matchAll(/20\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/gu)].map(match => isoDate(match[0])).filter(Boolean);
  const rawImage = decode(html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/iu)?.[1]
    || html.match(/<img\b[^>]*(?:src|data-preload)=["'](?:\{\s*["']?_src["']?\s*:\s*["'])?([^"'}]+)/iu)?.[1]);
  let imageUrl = '';
  try { imageUrl = rawImage ? new URL(rawImage.replace(/\\\//gu, '/'), sourceUrl).href : ''; } catch {}
  return { title, description: text, startDate: dates[0] || '', endDate: dates[1] || dates[0] || '', imageUrl };
}

function reject(stats, reason) {
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;
  if (reason === 'duplicate_source_item') stats.duplicateSourceItemCount += 1;
}

function brandFromTitle(title) {
  const bracketed = String(title || '').match(/^\s*[\[【]([^\]】]+)[\]】]/u)?.[1];
  if (bracketed) return cleanVenueText(bracketed);
  const prefix = cleanVenueText(title).split(/\s+(?:팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?)/iu)[0];
  return prefix && prefix !== cleanVenueText(title) ? prefix : null;
}

export function parseBatch3VenuePayload(payload, { today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) } = {}) {
  if (!payload || !Array.isArray(payload.items)) throw new SourceStructureChangedError(payload?.sourceId || 'unknown', '필수 items 배열이 없습니다');
  const stats = { discoveredCount: payload.items.length, fetchedCount: Number(payload.fetchedCount ?? payload.items.length), rejectionReasons: {}, duplicateSourceItemCount: 0 };
  const rows = [];
  const seen = new Set();
  for (const item of payload.items) {
    if (!item?.sourceItemId || !item?.title || !item?.sourceUrl) { reject(stats, 'structure_changed'); continue; }
    if (seen.has(item.sourceItemId)) { reject(stats, 'duplicate_source_item'); continue; }
    seen.add(item.sourceItemId);
    const searchable = `${item.title} ${item.brand || ''} ${item.description || ''}`;
    if (!POPUP.test(searchable)) { reject(stats, 'not_popup'); continue; }
    if (!FOOD.test(searchable) || NON_FOOD.test(searchable)) { reject(stats, 'not_food'); continue; }
    if (!DATE.test(item.startDate || '') || !DATE.test(item.endDate || '') || item.endDate < item.startDate) { reject(stats, 'invalid_date'); continue; }
    if (item.endDate < today) { reject(stats, 'expired'); continue; }
    rows.push({
      id: `${payload.sourceId}:${item.sourceItemId}`, sourceItemId: item.sourceItemId, name: item.title,
      brand: item.brand || brandFromTitle(item.title), venue: item.venue || payload.venue, branch: item.branch || item.venue || payload.venue,
      venueType: payload.venueType || '쇼핑몰', address: item.address || payload.address || item.venue || payload.venue,
      startDate: item.startDate, endDate: item.endDate, imageUrl: item.imageUrl || '', sourceUrl: item.sourceUrl,
      sourceName: payload.sourceName, sourceGrade: 'official', firstSeenAt: today, lastSeenAt: today
    });
  }
  return { rows, stats, sourceHealth: { status: rows.length ? 'success_with_items' : 'success_empty', message: rows.length ? `${rows.length}건 파싱` : '정상 응답, 승인 항목 없음', checkedAt: new Date().toISOString() } };
}

export function parseIfcList(payload) {
  if (!payload || !Array.isArray(payload.nowList)) throw new SourceStructureChangedError('ifc-mall', 'nowList 배열이 없습니다');
  return payload.nowList.map(item => ({
    sourceItemId: String(item.nowSn || ''), title: item.sj || '', startDate: isoDate(item.eventBgndeDe), endDate: isoDate(item.eventEnddeDe),
    imageUrl: item.physiclFlpth ? new URL(`/public${item.physiclFlpth}`, 'https://www.ifcmallseoul.com').href : '',
    sourceUrl: `https://www.ifcmallseoul.com/kr/now/view/${item.nowSn}`, venue: 'IFC몰', branch: 'IFC몰', address: '서울특별시 영등포구 국제금융로 10'
  }));
}

export function parseDootaList(payload) {
  if (!payload || payload.status !== 'ok' || !Array.isArray(payload.list)) throw new SourceStructureChangedError('doota-mall', 'status=ok list 배열이 없습니다');
  return payload.list.filter(item => item.webViewYn === 'Y').map(item => ({
    sourceItemId: String(item.idx || ''), title: item.title || '', startDate: isoDate(item.startDt), endDate: isoDate(item.endDt),
    imageUrl: item.newImgNm ? `https://www.doota-mall.com/files/upload/event/${item.newImgNm}` : '',
    sourceUrl: `https://www.doota-mall.com/event/event_view.do?idx=${item.idx}`, venue: '두타몰', branch: '두타몰', address: '서울특별시 중구 장충단로 275'
  }));
}

export function parsePremiumList(html, { branchCode, venue, address }) {
  if (!/<(?:html|a)\b/iu.test(String(html))) throw new SourceStructureChangedError('shinsegae-simon-premium-outlets', '이벤트 HTML 구조가 없습니다');
  const items = [];
  const pattern = /<a\b[^>]*href=["']([^"']*\/rpage\/shopping-info\/(?:event\/offline-detail\/\d+\/[0-9]+|news\/special-detail\/[0-9]+\/\d+))[^>]*>[\s\S]*?<\/a>/giu;
  for (const match of String(html).matchAll(pattern)) {
    const sourceUrl = new URL(decode(match[1]), 'https://www.premiumoutlets.co.kr').href;
    const ids = sourceUrl.match(/\/(\d+)\/([0-9]+)(?:\?|$)/u);
    const block = match[0];
    const title = cleanVenueText(block.match(/data-name=["']([^"']+)/iu)?.[1] || block.match(/alt=["']([^"']+)/iu)?.[1] || block);
    const dates = [...cleanVenueText(block).matchAll(/20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}/gu)].map(value => isoDate(value[0]));
    items.push({ sourceItemId: `${branchCode}-${ids?.[1] || ''}`, title, venue, branch: venue, address, startDate: dates[0] || '', endDate: dates[1] || dates[0] || '', sourceUrl, imageUrl: '' });
  }
  return items;
}

export { SourceStructureChangedError };
