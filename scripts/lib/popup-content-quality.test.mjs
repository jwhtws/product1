import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePopupStatus, completeSearchEvidence, evaluatePopupContent, extractOfficialMenuCandidates,
  normalizeOfficialMenus, probeOfficialImage, REQUIRED_SEARCH_CHECKS, seoulDate
} from './popup-content-quality.mjs';

const fullSearch = status => ({
  ...Object.fromEntries(REQUIRED_SEARCH_CHECKS.map(field => [field, true])),
  checkedUrls: ['https://official.example/event/1'],
  checkedMethods: ['official_list_html', 'official_detail_html', 'embedded_json_scan', 'operator_internal_search', 'brand_official_site'],
  imageCandidatesFound: 0, menuCandidatesFound: 0, priceCandidatesFound: 0,
  descriptionCandidatesFound: 0, status, evidence: [], failureReasons: [],
  checkedAt: '2026-08-06T00:00:00.000Z'
});

const base = {
  id: 'official:popup:1', name: '검증 팝업', venue: '공식 장소', address: '서울특별시 성동구 공식로 1',
  startDate: '2026-08-01', endDate: '2026-08-06', sourceUrl: 'https://official.example/event/1',
  sourceName: '공식 행사', sourceGrade: 'official', imageUrl: 'https://official.example/event.jpg',
  officialImageUrls: ['https://official.example/event.jpg'], imageSource: 'official-detail',
  menus: [{ name: '검증 샌드위치', price: '12,000원', evidenceType: 'html' }], menuSource: 'official-detail',
  contentSearch: fullSearch('found')
};

test('한국시간 날짜와 종료일 경계에서 상태를 재계산한다', () => {
  assert.equal(seoulDate(new Date('2026-08-05T15:00:00.000Z')), '2026-08-06');
  assert.equal(calculatePopupStatus(base, '2026-07-31'), 'upcoming');
  assert.equal(calculatePopupStatus(base, '2026-08-06'), 'ongoing');
  assert.equal(calculatePopupStatus(base, '2026-08-07'), 'ended');
  assert.equal(calculatePopupStatus({ ...base, endDate: '' }, '2026-08-06'), 'review_required');
  assert.equal(calculatePopupStatus({ ...base, startDate: '2026-08-08', endDate: '2026-08-07' }, '2026-08-06'), 'review_required');
});

test('필수 탐색 증거는 여섯 단계가 모두 true일 때만 완료다', () => {
  assert.equal(completeSearchEvidence(fullSearch('found')), true);
  assert.equal(completeSearchEvidence({ ...fullSearch('found'), checkedBrandOfficialSources: false }), false);
});

test('공식 이미지 HTTP·content-type·최소 크기를 검증한다', async () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(800, 16); png.writeUInt32BE(600, 20);
  const valid = await probeOfficialImage('https://official.example/event.png', {
    fetchImpl: async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
  });
  assert.deepEqual({ status: valid.status, width: valid.width, height: valid.height }, { status: 'valid', width: 800, height: 600 });
  const broken = await probeOfficialImage('https://official.example/broken.jpg', {
    fetchImpl: async () => new Response('', { status: 404, headers: { 'content-type': 'text/html' } })
  });
  assert.equal(broken.reason, 'http_404');
  const placeholder = await probeOfficialImage('https://official.example/placeholder.png', {
    fetchImpl: async () => { throw new Error('호출되면 안 됨'); }
  });
  assert.equal(placeholder.reason, 'placeholder_or_logo');
});

test('팝업 제목 fallback은 메뉴로 인정하지 않고 공식 가격 근거 메뉴만 정규화한다', () => {
  assert.deepEqual(normalizeOfficialMenus({
    ...base, name: '검증 팝업', menuSource: 'official-event-text', menus: [{ name: '검증 팝업', price: '' }]
  }), []);
  const menus = normalizeOfficialMenus(base);
  assert.equal(menus[0].name, '검증 샌드위치');
  assert.equal(menus[0].price, 12000);
  assert.equal(menus[0].sourceUrl, base.sourceUrl);
});

test('공식 HTML과 embedded JSON-LD에서 메뉴·가격 후보를 추출한다', () => {
  const html = `
    <script type="application/ld+json">{"@type":"Event","offers":{"@type":"Offer","name":"딸기 타르트","price":"8500","priceCurrency":"KRW"}}</script>
    <ul><li class="menu-item"><strong>소금빵</strong><span>3,500원</span></li></ul>`;
  const menus = extractOfficialMenuCandidates(html, { sourceUrl: 'https://official.example/event/1', sourceName: '공식 행사' });
  assert.deepEqual(new Set(menus.map(menu => menu.name)), new Set(['딸기 타르트', '소금빵']));
  assert.ok(menus.some(menu => menu.evidenceType === 'embedded_json'));
  assert.ok(menus.some(menu => menu.evidenceType === 'html'));
});

test('유효 이미지와 메뉴 및 필수정보가 있으면 A/B와 published를 계산한다', () => {
  const result = evaluatePopupContent(base, {
    today: '2026-08-06', checkedAt: '2026-08-06T00:00:00.000Z',
    imageValidation: { status: 'valid', contentType: 'image/jpeg', width: 800, height: 600 }
  });
  assert.equal(result.contentQuality, 'A');
  assert.equal(result.publishStatus, 'published');
  assert.equal(result.status, 'ongoing');
  assert.equal(result.menus[0].price, 12000);
});

test('탐색 미완료와 파싱 실패는 missing으로 오판하지 않는다', () => {
  const incomplete = evaluatePopupContent({
    ...base, imageUrl: '', officialImageUrls: [], menus: [],
    contentSearch: { ...fullSearch('search_incomplete'), checkedBrandOfficialSources: false }
  }, { today: '2026-08-06', imageValidation: { status: 'invalid', reason: 'missing_image' } });
  assert.equal(incomplete.contentSearch.status, 'search_incomplete');
  assert.ok(incomplete.qualityReasons.includes('search_incomplete'));
  assert.ok(!incomplete.qualityReasons.includes('missing_valid_image'));
  assert.ok(!incomplete.qualityReasons.includes('missing_menu'));

  const failed = evaluatePopupContent({
    ...base, imageUrl: '', officialImageUrls: [], menus: [], parserFailureReason: 'embedded_json_parse_error',
    contentSearch: fullSearch('parse_failed')
  }, { today: '2026-08-06', imageValidation: { status: 'invalid', reason: 'missing_image' } });
  assert.equal(failed.contentSearch.status, 'parse_failed');
  assert.ok(failed.qualityReasons.includes('parse_failed'));
  assert.ok(!failed.qualityReasons.includes('missing_menu'));
});

test('모든 공식 탐색 완료 후 미공개일 때만 최종 missing 사유를 기록한다', () => {
  const result = evaluatePopupContent({
    ...base, imageUrl: '', officialImageUrls: [], menus: [], contentSearch: fullSearch('not_published_by_source')
  }, { today: '2026-08-06', imageValidation: { status: 'invalid', reason: 'missing_image' } });
  assert.equal(result.contentSearch.status, 'not_published_by_source');
  assert.ok(result.qualityReasons.includes('missing_valid_image'));
  assert.ok(result.qualityReasons.includes('missing_menu'));
  assert.equal(result.contentQuality, 'C');
  assert.equal(result.publishStatus, 'review_required');
});

test('OCR verified만 자동 공개 메뉴로 인정하고 저신뢰 단독 결과는 검토로 보낸다', () => {
  const low = evaluatePopupContent({
    ...base,
    menus: [{ name: '공식 포스터 메뉴', price: '9,000원', evidenceType: 'official_image', ocr: { status: 'low_confidence', confidence: 0.55, imageUrl: base.imageUrl } }]
  }, { today: '2026-08-06', imageValidation: { status: 'valid', contentType: 'image/jpeg', width: 800, height: 600 } });
  assert.equal(low.menus.length, 0);
  assert.equal(low.publishStatus, 'review_required');
  assert.ok(low.qualityReasons.includes('low_confidence_ocr'));

  const verified = evaluatePopupContent({
    ...base,
    menus: [{ name: '공식 포스터 메뉴', price: '9,000원', evidenceType: 'official_image', ocr: { status: 'verified', confidence: 0.96, imageUrl: base.imageUrl } }]
  }, { today: '2026-08-06', imageValidation: { status: 'valid', contentType: 'image/jpeg', width: 800, height: 600 } });
  assert.equal(verified.publishStatus, 'published');
  assert.equal(verified.ocrStatus, 'verified');
});

test('fixture와 비공식 출처는 운영 공개 후보에서 rejected 처리한다', () => {
  const result = evaluatePopupContent({ ...base, id: 'fixture-popup', sourceGrade: 'manual' }, {
    today: '2026-08-06', imageValidation: { status: 'valid', contentType: 'image/jpeg', width: 800, height: 600 }
  });
  assert.equal(result.publishStatus, 'rejected');
});
