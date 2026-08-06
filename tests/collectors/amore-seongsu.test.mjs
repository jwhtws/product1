import assert from 'node:assert/strict';
import test from 'node:test';
import { BATCH3_POPUP_VENUES, collectPopupVenue } from '../../scripts/collectors/batch3-popup-venues.mjs';
import { runPopupVenueParserContract } from './popup-venue-parser-contract.mjs';
runPopupVenueParserContract('amore-seongsu');

test('아모레성수: 단일 식별 문구가 없어도 공식 스토어 fallback 상세를 따라간다', async () => {
  const config=BATCH3_POPUP_VENUES.find(item=>item.id==='amore-seongsu');
  const detail='https://www.amoremall.com/kr/ko/store/news/coffee-popup';
  const pages=new Map([
    [config.eventUrl,'<html><title>성수 공간</title></html>'],
    [config.fallbackUrls[0],`<html><a href="${detail}">커피 디저트 팝업</a></html>`],
    [detail,'<html><head><meta property="og:title" content="성수 커피 팝업"><meta property="og:image" content="/images/coffee.jpg"></head><body><h1>성수 커피 팝업</h1><p>2026.08.01 ~ 2026.08.31</p><li class="menu-item">성수 라떼 6,500원</li></body></html>']
  ]);
  const result=await collectPopupVenue(config,{today:'2026-08-05',fetchPage:async url=>({text:pages.get(url),response:new Response(pages.get(url),{status:200}),diagnostic:{finalUrl:url,httpStatus:200}})});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].imageUrl,'https://www.amoremall.com/images/coffee.jpg');
  assert.equal(result.rows[0].menus[0].name,'성수 라떼');
  assert.equal(result.sourceHealth.finalStatus,'recovered');
});

test('아모레성수: 목록 HTML이 비어도 탐지한 공식 JSON API의 상세 경로를 사용한다', async () => {
  const base=BATCH3_POPUP_VENUES.find(item=>item.id==='amore-seongsu');
  const config={...base,fallbackUrls:[],discoveryUrls:[]};
  const api='https://www.amore-seongsu.com/api/events';
  const detail='https://www.amore-seongsu.com/news/coffee-popup';
  const pages=new Map([
    [config.eventUrl,`<html><script>fetch('/api/events')</script></html>`],
    [api,JSON.stringify({events:[{title:'성수 커피 팝업',detailUrl:detail}]})],
    [detail,'<html><meta property="og:title" content="성수 커피 팝업"><p>2026.08.01 ~ 2026.08.31</p><li>성수 라떼 6,500원</li></html>']
  ]);
  const requested=[];
  const result=await collectPopupVenue(config,{today:'2026-08-05',fetchPage:async url=>{
    requested.push(url); const text=pages.get(url)||'';
    return {text,response:new Response(text,{status:200,headers:{'content-type':url===api?'application/json':'text/html'}}),diagnostic:{finalUrl:url,httpStatus:200}};
  }});
  assert.equal(result.rows.length,1);
  assert.ok(requested.includes(api));
  assert.ok(requested.includes(detail));
  assert.equal(result.rows[0].menus[0].name,'성수 라떼');
});
