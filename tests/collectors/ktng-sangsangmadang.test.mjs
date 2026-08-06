import assert from 'node:assert/strict';
import test from 'node:test';
import { BATCH3_POPUP_VENUES, collectPopupVenue } from '../../scripts/collectors/batch3-popup-venues.mjs';
import { runPopupVenueParserContract } from './popup-venue-parser-contract.mjs';
runPopupVenueParserContract('ktng-sangsangmadang');

test('상상마당: selector 대신 의미·날짜·푸드 신호로 상세 링크를 복구한다', async () => {
  const config=BATCH3_POPUP_VENUES.find(item=>item.id==='ktng-sangsangmadang');
  const detail='https://www.sangsangmadang.com/event/detail/4100';
  const pages=new Map([
    [config.eventUrl,`<html><article data-event-id="4100"><a href="${detail}">로컬 푸드 팝업 2026.08.01 ~ 2026.08.31</a></article></html>`],
    [config.fallbackUrls[0],'<html><title>프로그램</title></html>'],
    [config.fallbackUrls[1],'<html><title>검색</title></html>'],
    [config.seedUrls[0],'<html><h1>일반 전시</h1><p>2026.01.01 ~ 2026.01.31</p></html>'],
    [detail,'<html><head><meta property="og:title" content="로컬 푸드 팝업"><meta property="og:image" content="/upload/food.jpg"></head><body><p>2026.08.01 ~ 2026.08.31</p><table><tr class="product"><td>소금빵</td><td>3,500원</td></tr></table></body></html>']
  ]);
  const result=await collectPopupVenue(config,{today:'2026-08-05',fetchPage:async url=>({text:pages.get(url)||'',response:new Response(pages.get(url)||'',{status:200}),diagnostic:{finalUrl:url,httpStatus:200}})});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].name,'로컬 푸드 팝업');
  assert.equal(result.rows[0].menus[0].name,'소금빵');
  assert.equal(result.sourceHealth.finalStatus,'success_with_items');
});
