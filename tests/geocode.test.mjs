import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAddress, selectNaverItem } from '../functions/api/geocode.js';

test('지도 검색 주소에서 층·지점 설명을 제거한다', () => {
  assert.equal(cleanAddress('부산광역시 해운대구 센텀남대로 59 (우동) · 롯데백화점 센텀시티점'), '부산광역시 해운대구 센텀남대로 59');
  assert.equal(cleanAddress('경기도 안양시 동안구 시민대로 180 (호계동, G.SQURE) · 롯데백화점 평촌점'), '경기도 안양시 동안구 시민대로 180');
});

test('네이버 첫 결과가 다른 지역이면 지점과 주소가 맞는 후보를 선택한다', () => {
  const wrong = { title: '롯데백화점 미아점', roadAddress: '서울특별시 중구 남대문로 81', mapx: '1269818233', mapy: '375647459' };
  const correct = { title: '<b>롯데백화점 미아점</b>', roadAddress: '서울특별시 강북구 도봉로 62', mapx: '1270301000', mapy: '376145000' };
  assert.equal(selectNaverItem([wrong, correct], '롯데백화점 미아점', '서울특별시 강북구 도봉로 62'), correct);
  assert.equal(selectNaverItem([wrong], '롯데백화점 센텀시티점', '부산광역시 해운대구 센텀남대로 59'), null);
});

test('군산점의 공식 롯데몰 명칭을 좌표 검색에 사용한다', () => {
  const mall = { title: '롯데몰 군산점', roadAddress: '전북특별자치도 군산시 조촌로 130', mapx: '1260000000', mapy: '359000000' };
  assert.equal(selectNaverItem([mall], '롯데백화점 군산점', '롯데백화점 군산점'), mall);
});

test('쇼핑몰과 아울렛을 백화점으로 잘못 수집한 지점명을 교정한다', () => {
  const fixtures = [
    ['롯데백화점 은평점', '롯데몰 은평점'],
    ['롯데백화점 수지점', '롯데몰 수지점'],
    ['롯데백화점 광교점', '롯데아울렛 광교점']
  ];
  for (const [collected, official] of fixtures) {
    const item = { title: official, roadAddress: '경기도 테스트시 테스트로 1', mapx: '1270000000', mapy: '370000000' };
    assert.equal(selectNaverItem([item], collected, collected), item);
  }
});
