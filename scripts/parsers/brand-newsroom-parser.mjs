import { SourceStructureChangedError } from './food-popup-source-parser.mjs';

const DATE = /^20\d{2}-\d{2}-\d{2}$/u;
const FOOD = /(식품|푸드|F&B|먹거리|음식|요리|라면|스낵|과자|빵|베이커리|디저트|커피|카페|음료|우유|치즈|아이스크림|치킨|버거|맥주|와인)/iu;
const POPUP = /(팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?)/iu;
const NON_HUMAN_FOOD = /(반려|펫|강아지|고양이|사료)/u;

function reject(stats, reason) {
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;
  if (reason === 'duplicate_source_item') stats.duplicateSourceItemCount += 1;
}

export function parseBrandNewsroomPayload(payload, { today = new Intl.DateTimeFormat('en-CA', {
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
    if (item.brandVerified === false) {
      reject(stats, 'wrong_brand');
      continue;
    }
    const searchable = `${item.title} ${item.description || ''}`;
    if (!POPUP.test(searchable)) {
      reject(stats, 'not_popup');
      continue;
    }
    if (!FOOD.test(searchable) || NON_HUMAN_FOOD.test(searchable)) {
      reject(stats, 'not_food');
      continue;
    }
    if (!item.venue) {
      reject(stats, 'missing_venue');
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
      id: `brand:${sourceId}:${item.sourceItemId}`,
      sourceItemId: item.sourceItemId,
      name: item.title,
      brand: item.brand || payload.brand,
      venue: item.venue,
      venueType: '브랜드 팝업',
      address: item.address || item.venue,
      region: item.region || null,
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
