import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIparkDiscoveryCandidates, parseIparkPopupDetail } from '../scripts/lib/ipark-discovery-parser.mjs';

test('아이파크몰 발견 목록에서 푸드 후보만 고른다', () => {
  const html = String.raw`href\":\"/popup/4439\",\"aria-label\":\"오롱마차 제주말차 상세 보기\" href\":\"/popup/4003\",\"aria-label\":\"글입다 상세 보기\"`;
  assert.deepEqual(parseIparkDiscoveryCandidates(html), [{ id: '4439', name: '오롱마차 제주말차' }]);
});

test('아이파크몰 푸드 상세에서 기간과 원문을 파싱한다', () => {
  const html = String.raw`\"popup\":{\"name\":\"오롱마차 제주말차\",\"description\":\"제주말차 한정 판매 팝업\",\"address\":\"서울 용산역 아이파크몰 3층\",\"category\":\"FOOD\",\"openDate\":\"2026-08-14\",\"closeDate\":\"2026-09-15\",\"imageUrl\":\"https://example.com/a.jpg\",\"sourceUrl\":\"https://blog.naver.com/source\",\"latitude\":\"37.5288\",\"longitude\":\"126.9645\"},\"nearby\":[]`;
  assert.deepEqual(parseIparkPopupDetail(html, 'https://popspot.co.kr/popup/4439'), { sourceItemId: '4439', name: '오롱마차 제주말차', description: '제주말차 한정 판매 팝업', address: '서울 용산역 아이파크몰 3층', startDate: '2026-08-14', endDate: '2026-09-15', sourceUrl: 'https://blog.naver.com/source', imageUrl: 'https://example.com/a.jpg', latitude: 37.5288, longitude: 126.9645 });
});
