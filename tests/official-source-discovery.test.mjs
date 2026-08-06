import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISCOVERY_STATUSES, discoveryAttempt, inspectOfficialDocument, officialUrl, recoveryMetadata
} from '../scripts/lib/official-source-discovery.mjs';

test('API·embedded JSON·JSON-LD·Next/Nuxt·initial state와 sitemap 후보를 탐지한다', () => {
  const html = `
    <link rel="canonical" href="/events">
    <script type="application/json">{"events":[{"title":"커피 팝업"}]}</script>
    <script type="application/ld+json">{"@type":"Product","name":"성수 라떼","offers":{"price":"6500","priceCurrency":"KRW"}}</script>
    <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"items":[{"title":"디저트 팝업"}]}}}</script>
    <script>window.__NUXT__={}; window.__INITIAL_STATE__={}; fetch('/api/events?page=1')</script>
    <a href="/events/coffee-popup">커피 팝업 상세</a>
    <img data-original="/images/coffee-popup.jpg">
    <li class="menu-item">성수 라떼 <strong>6,500원</strong></li>`;
  const result = inspectOfficialDocument(html, 'https://official.example/events', { allowedHosts: ['official.example'] });
  assert.deepEqual(new Set(result.structuredData.map(item => item.method)), new Set(['embedded_json', 'json_ld', 'next_data', 'nuxt_state']));
  assert.equal(result.apiCandidates[0].url, 'https://official.example/api/events?page=1');
  assert.equal(result.detailUrls[0], 'https://official.example/events/coffee-popup');
  assert.equal(result.imageCandidates[0], 'https://official.example/images/coffee-popup.jpg');
  assert.equal(result.menuCandidates[0].name, '성수 라떼');
  const falsePositive = inspectOfficialDocument('<script>const currentURL="/web/home"</script>', 'https://official.example/events', { allowedHosts: ['official.example'] });
  assert.equal(falsePositive.apiCandidates.length, 0);
});

test('공식 도메인과 하위 도메인만 대체 API URL로 인정한다', () => {
  assert.equal(officialUrl('/api/events', 'https://www.official.example', ['official.example']), 'https://www.official.example/api/events');
  assert.equal(officialUrl('https://api.official.example/events', 'https://www.official.example', ['official.example']), 'https://api.official.example/events');
  assert.equal(officialUrl('https://tracker.example/events', 'https://www.official.example', ['official.example']), '');
});

test('verified_empty·recovered·parse_failed·unresolved 상태를 구분한다', () => {
  assert.ok(DISCOVERY_STATUSES.includes('verified_empty'));
  const emptyAttempt = discoveryAttempt({ method: 'official_api', url: 'https://official.example/api', status: 'empty' });
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: emptyAttempt.url, attempts: [emptyAttempt] }).finalStatus, 'search_incomplete');
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: emptyAttempt.url, attempts: [emptyAttempt], verifiedEmptyEvidence: true }).finalStatus, 'verified_empty');
  const failed = discoveryAttempt({ method: 'official_api', url: 'https://official.example/api', status: 'failed', errorType: 'timeout' });
  const fallback = discoveryAttempt({ method: 'embedded_json', url: 'https://official.example/events', status: 'success', itemsFound: 1 });
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: failed.url, fallbackPaths: [fallback.url], attempts: [failed, fallback], rows: [{}] }).finalStatus, 'recovered');
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: failed.url, attempts: [failed] }).finalStatus, 'request_failed');
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: failed.url, attempts: [failed, emptyAttempt] }).finalStatus, 'unresolved');
  const parse = discoveryAttempt({ method: 'official_detail_html', url: fallback.url, status: 'parse_failed' });
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: parse.url, attempts: [parse] }).finalStatus, 'parse_failed');
  const blocked = discoveryAttempt({ method: 'official_list_html', url: fallback.url, status: 'blocked', errorType: 'http_403' });
  assert.equal(recoveryMetadata({ sourceId: 'source', primaryPath: blocked.url, attempts: [blocked] }).finalStatus, 'blocked');
});
