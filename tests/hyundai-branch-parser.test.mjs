import assert from 'node:assert/strict';
import test from 'node:test';
import { hyundaiBranchApiUrl, hyundaiDirectBranches, parseHyundaiBranchItems } from '../scripts/lib/hyundai-branch-parser.mjs';

test('더현대 대구 공식 지점 API에서 지하 1층 푸드 팝업을 변환한다', () => {
  const branch = hyundaiDirectBranches[0];
  assert.equal(branch.branchCode, 'B00146000');
  assert.match(hyundaiBranchApiUrl(branch), /D4602608451930/u);
  const payload = { result: { items: [
    { evntCrdCd: 'E4602608497685', evntCrdNm: '[POP-UP STORE]\r\n밀크번', evntFlrCd: { value: 'MB01', label: '지하1층' }, evntPlceNm: '마켓 앞 행사장', expsEvntStartDt: '20260821000000', expsEvntEndDt: '20260830000000', imgPath2: 'evntCrdInf/imgPath2/milkbun.jpg' },
    { evntCrdCd: 'E4602608497913', evntCrdNm: '[POP-UP STORE] 위얼드월드', evntFlrCd: { value: 'MF03', label: '3층' }, expsEvntStartDt: '20260821000000', expsEvntEndDt: '20260827000000' }
  ] } };
  const rows = parseHyundaiBranchItems(payload, branch, { keepSince: '2026-08-25' });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: 'hyundai:E4602608497685', name: '밀크번', venue: '더현대 대구', venueType: '백화점',
    address: '대구광역시 중구 달구벌대로 2077', location: '지하1층 · 마켓 앞 행사장',
    startDate: '2026-08-21', endDate: '2026-08-30', imageUrl: 'https://imgprism.ehyundai.com/evntCrdInf/imgPath2/milkbun.jpg',
    sourceName: '현대백화점 공식 쇼핑뉴스',
    sourceUrl: 'https://www.ehyundai.com/newPortal/SN/SN_0201000.do?evntCrdCd=E4602608497685&branchCd=B00146000&category=event',
    sourceGrade: 'official'
  });
});
