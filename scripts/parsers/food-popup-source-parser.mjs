const FOOD = /(빵|베이커리|디저트|커피|카페|음료|푸드|식품|떡|케이크|맥주|와인|치킨|라면)/iu;
const POPUP = /(팝업|POP[ -]?UP|카라반)/iu;
const DATE = /^20\d{2}-\d{2}-\d{2}$/u;

export class SourceStructureChangedError extends Error {
  constructor(sourceId, message) { super(`${sourceId}: ${message}`); this.name = 'SourceStructureChangedError'; }
}

export function parseFixturePayload(payload, { today = '2026-08-04' } = {}) {
  if (!payload || !Array.isArray(payload.items)) throw new SourceStructureChangedError(payload?.sourceId || 'unknown', '필수 items 배열이 없습니다');
  const rows = [];
  const seen = new Set();
  const rejectionReasons = {};
  const reject = reason => { rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1; };
  for (const item of payload.items) {
    if (!item.sourceItemId || !item.title) { reject('structure_changed'); continue; }
    if (seen.has(item.sourceItemId)) { reject('duplicate_source_item'); continue; }
    seen.add(item.sourceItemId);
    const searchable = `${item.title} ${item.brand || ''} ${item.description || ''}`;
    if (!POPUP.test(searchable)) { reject('not_popup'); continue; }
    if (!FOOD.test(searchable)) { reject('not_food'); continue; }
    if (!DATE.test(item.startDate || '') || !DATE.test(item.endDate || '') || item.endDate < item.startDate) { reject('invalid_date'); continue; }
    if (item.endDate < today) { reject('expired'); continue; }
    rows.push({
      id: `${payload.sourceId}:${item.sourceItemId}`, sourceItemId: item.sourceItemId,
      name: item.title, brand: item.brand || null, venue: item.venue,
      startDate: item.startDate, endDate: item.endDate, sourceUrl: item.sourceUrl,
      imageUrl: item.imageUrl || null, sourceName: payload.sourceName
    });
  }
  return {
    rows,
    stats: {
      discoveredCount: payload.items.length,
      fetchedCount: payload.items.length,
      rejectionReasons,
      duplicateSourceItemCount: rejectionReasons.duplicate_source_item || 0
    },
    sourceHealth: { status: rows.length ? 'success_with_items' : payload.verifiedEmptyEvidence ? 'verified_empty' : 'search_incomplete', message: rows.length ? `${rows.length}건 파싱` : payload.verifiedEmptyEvidence ? '공식 목록에 현재 행사 없음 확인' : '0건이지만 대체 공식 경로 확인 미완료', checkedAt: new Date().toISOString() }
  };
}
