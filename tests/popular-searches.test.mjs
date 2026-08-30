import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet, onRequestOptions, onRequestPost } from '../functions/api/events.js';

test('인기 검색 API는 최근 실제 검색 횟수를 순위 데이터로 반환한다', async () => {
  const context = { request: new Request('https://mukdang.com/api/events?type=popular-searches'), env: {
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [
      { query: '더현대 대구', search_count: 17 }, { query: '건대 팝업', search_count: 9 }
    ] }) }) }) }
  } };
  const response = await onRequestGet(context);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).searches, [
    { query: '더현대 대구', count: 17 }, { query: '건대 팝업', count: 9 }
  ]);
});

test('product2 검색은 운영 검색 로그에 기록할 수 있고 CORS를 제한한다', async () => {
  let inserted;
  const request = new Request('https://mukdang.com/api/events', {
    method: 'POST', headers: { origin: 'https://product2-ezo.pages.dev', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'search', detail: '  더현대   대구  ' })
  });
  const context = { request, env: { DB: { prepare: () => ({ bind: (...values) => {
    inserted = values; return { run: async () => ({ success: true }) };
  } }) } } };
  const response = await onRequestPost(context);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://product2-ezo.pages.dev');
  assert.equal(inserted[2], '더현대 대구');

  const rejected = await onRequestOptions({ request: new Request('https://mukdang.com/api/events', { method: 'OPTIONS', headers: { origin: 'https://example.com' } }) });
  assert.equal(rejected.status, 403);
});

test('팝업 상세는 모바일 스와이프 갤러리와 장수 안내를 제공한다', async () => {
  const source = await (await import('node:fs/promises')).readFile('app.js', 'utf8');
  const css = await (await import('node:fs/promises')).readFile('styles.css', 'utf8');
  assert.match(source, /popup-detail-gallery[\s\S]*figcaption/u);
  assert.match(source, /좌우로 넘겨보세요/u);
  assert.match(css, /scroll-snap-type:x mandatory/u);
  assert.match(css, /official-food-photo-grid\{display:flex/u);
});
