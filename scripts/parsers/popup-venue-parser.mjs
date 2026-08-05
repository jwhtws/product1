import { SourceStructureChangedError } from './food-popup-source-parser.mjs';

const DATE = /^20\d{2}-\d{2}-\d{2}$/u;
const FOOD = /(푸드\s*트럭|먹거리|음식|식음|F&B|빵|베이커리|디저트|커피|카페|음료|식품|떡|케이크|맥주|와인|치킨|라면|버거|아이스크림|젤라또|도넛|마카롱)/iu;
const POPUP = /(팝업|POP[\s-]*UP|푸드\s*트럭|플리\s*마켓|먹거리\s*마켓)/iu;
const NON_HUMAN_FOOD = /(반려|펫|강아지|고양이|사료)/u;

function reject(stats, reason) {
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;
  if (reason === 'duplicate_source_item') stats.duplicateSourceItemCount += 1;
}

export function parsePopupVenuePayload(payload, { today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date()) } = {}) {
  const sourceId = payload?.sourceId || 'unknown';
  if (!payload || !Array.isArray(payload.items)) {
    throw new SourceStructureChangedError(sourceId, '필수 items 배열이 없습니다');
  }
  const stats = {
    discoveredCount: payload.items.length,
    fetchedCount: payload.items.length,
    rejectionReasons: {},
    duplicateSourceItemCount: 0
  };
  const rows = [];
  const seen = new Set();
  for (const item of payload.items) {
    if (!item?.sourceItemId || !item?.title || !item?.sourceUrl) {
      reject(stats, 'structure_changed');
      continue;
    }
    if (seen.has(item.sourceItemId)) {
      reject(stats, 'duplicate_source_item');
      continue;
    }
    seen.add(item.sourceItemId);
    const searchable = `${item.title} ${item.brand || ''} ${item.description || ''}`;
    if (!POPUP.test(searchable)) {
      reject(stats, 'not_popup');
      continue;
    }
    if (!FOOD.test(searchable) || NON_HUMAN_FOOD.test(searchable)) {
      reject(stats, 'not_food');
      continue;
    }
    if (!DATE.test(item.startDate || '') || !DATE.test(item.endDate || '') || item.endDate < item.startDate) {
      reject(stats, 'invalid_date');
      continue;
    }
    if (item.endDate < today) {
      reject(stats, 'expired');
      continue;
    }
    rows.push({
      id: `popup-venue:${sourceId}:${item.sourceItemId}`,
      sourceItemId: item.sourceItemId,
      name: item.title,
      brand: item.brand || null,
      venue: payload.venue,
      venueType: '팝업 전문 공간',
      address: payload.address || payload.venue,
      region: payload.region || null,
      startDate: item.startDate,
      endDate: item.endDate,
      imageUrl: item.imageUrl || null,
      sourceName: payload.sourceName,
      sourceUrl: item.sourceUrl,
      sourceGrade: 'official',
      category: 'food-popup',
      firstSeenAt: today,
      lastSeenAt: today
    });
  }
  return {
    rows,
    stats,
    sourceHealth: {
      status: rows.length ? 'success_with_items' : 'success_empty',
      message: rows.length ? `${rows.length}건 파싱` : '정상 응답, 승인 항목 없음',
      checkedAt: new Date().toISOString()
    }
  };
}

export { SourceStructureChangedError };
