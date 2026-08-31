import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLotteShopNowResults } from '../scripts/lib/lotte-popup-collector.mjs';

const clean = value => String(value || '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const decodeHtml = value => String(value || '').replace(/&amp;/giu, '&');
const card = ({ id, title, info, date, image = 'https://minfo.lotteshopping.com/content/news/202608/test/a.jpg' }) => `
  <li class="content-item"><a onclick="goCntsLink('C00903', '${id}', 'N');">
  <img src="${image}"><div class="__title">${title}</div>
  <div class="__info"><span>${info}</span><span>B1 행사장</span></div><div class="__date">${date}</div></a></li>`;

test('롯데 Shop Now Food&Drinks 카드를 개별 팝업으로 추출하고 비음식 카드를 제외한다', () => {
  const html = `<div class="content-section"><h3 class="section-title">[Food&Drinks]<br>미식의 향연</h3><ul>
    ${card({ id: 'SNM00000000000553616', title: '[디저트] 동서양 디저트 컬렉션 Pop-Up', info: '백화점 잠실점', date: '8.21(금) ~ 9.3(목)' })}
    ${card({ id: 'SNM00000000000999999', title: '패션 캐릭터 Pop-Up', info: '백화점 잠실점', date: '8.21(금) ~ 9.3(목)' })}
  </ul></div>`;
  const rows = parseLotteShopNowResults(html, { storeCode: '0002', storeName: '잠실점', today: '2026-08-31', decodeHtml, clean, sourceUrl: 'https://www.lotteshopping.com/shopnow/cntsList?cstrCd=0002' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'lotte:discovered:0002:SNM00000000000553616');
  assert.equal(rows[0].venue, '롯데백화점 잠실점');
  assert.equal(rows[0].endDate, '2026-09-03');
  assert.equal(rows[0].officialListingVerified, true);
  assert.match(rows[0].sourceUrl, /shpgNewsNo=SNM00000000000553616/u);
});
