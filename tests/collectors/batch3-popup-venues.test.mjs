import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPopupVenue } from '../../scripts/collectors/batch3-popup-venues.mjs';

test('Batch3 collector는 공식 도메인의 상세 링크만 fetch한다', async () => {
  const config = {
    id: 'fixture-venue', name: 'Fixture Venue', venue: 'Fixture Venue', region: '서울특별시',
    eventUrl: 'https://official.example/events/', marker: /Fixture Venue/u,
    detailPattern: /\/events\/detail\//u, seedUrls: []
  };
  const calls = [];
  const pages = new Map([
    [config.eventUrl, '<title>Fixture Venue</title><a href="/events/detail/1">디저트 팝업</a><a href="https://evil.example/events/detail/2">외부 푸드 팝업</a>'],
    ['https://official.example/events/detail/1', '<meta property="og:title" content="디저트 팝업"><h1>디저트 팝업</h1><p>베이커리와 커피</p><p>2026. 8. 1 ~ 2026. 8. 31</p>']
  ]);
  const result = await collectPopupVenue(config, {
    today: '2026-08-05',
    fetchHtml: async url => { calls.push(url); return pages.get(url); }
  });
  assert.equal(result.rows.length, 1);
  assert.deepEqual(calls, [config.eventUrl, 'https://official.example/events/detail/1']);
});
