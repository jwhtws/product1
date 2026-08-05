import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BATCH4_BRAND_SOURCES, collectBrandNewsroom, collectGongchaEvents, collectOtokiNewsroom,
  discoverBrandDetailUrls
} from '../../scripts/collectors/batch4-brand-newsrooms.mjs';

test('Batch4 brand collector는 공식 도메인의 팝업 상세만 요청한다', async () => {
  const config = {
    id: 'fixture-brand', name: 'Fixture Brand', brand: 'Fixture',
    eventUrl: 'https://official.example/news/', marker: /Fixture News/u,
    detailPattern: /^\/news\/view\//u
  };
  const calls = [];
  const pages = new Map([
    [config.eventUrl, '<title>Fixture News</title><article><a href="/news/view/1">디저트 팝업</a></article><article><a href="https://evil.example/news/view/2">커피 팝업</a></article>'],
    ['https://official.example/news/view/1', '<meta property="og:title" content="Fixture 디저트 팝업"><p>베이커리와 커피</p><p>기간: 2026. 8. 1 ~ 2026. 8. 31 장소: 성수 테스트키친 주소: 서울특별시 성동구 연무장길 1</p>']
  ]);
  const result = await collectBrandNewsroom(config, {
    today: '2026-08-05',
    fetchHtml: async url => { calls.push(url); return pages.get(url); }
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].venue, '성수 테스트키친');
  assert.deepEqual(calls, [config.eventUrl, 'https://official.example/news/view/1']);
});

test('삼양식품 onclick 상세 ID는 공식 view URL로 변환한다', () => {
  const config = {
    eventUrl: 'https://www.samyangfoods.com/kor/publicity/press/list.do',
    detailPattern: /^\/kor\/publicity\/press\/view\.do/u,
    onclickView: true
  };
  const html = `<a href="#" onclick="javascript:fnView('./view.do', 1353); return false;">불닭 디저트 팝업</a>`;
  assert.deepEqual(discoverBrandDetailUrls(html, config), [
    'https://www.samyangfoods.com/kor/publicity/press/view.do?seq=1353'
  ]);
});

test('오뚜기 공개 JSON은 페이지를 제한 수집하고 기사 필드를 변환한다', async () => {
  const config = BATCH4_BRAND_SOURCES.find(source => source.id === 'ottogi-newsroom');
  const calls = [];
  const result = await collectOtokiNewsroom(config, {
    today: '2026-08-05',
    fetchJson: async url => {
      calls.push(url);
      return {
        code: 0, itemsCount: 1,
        data: [{
          idx: 101, regDate: '2026.08.01', boardTitle: '오뚜기 커피 팝업스토어 운영',
          boardContent: '오뚜기가 2026년 8월 1일부터 8월 31일까지 서울 성수 테스트키친에서 커피 팝업스토어를 운영한다.',
          listImagePath: '/upload/popup.jpg'
        }]
      };
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sourceItemId, '101');
  assert.equal(result.rows[0].venue, '서울 성수 테스트키친');
  assert.equal(result.rows[0].startDate, '2026-08-01');
});

test('공차 이벤트 목록은 상세 요청 없이 공식 목록 카드만 파싱한다', async () => {
  const config = BATCH4_BRAND_SOURCES.find(source => source.id === 'gongcha-news');
  const html = '<title>Event & Notice 이벤트</title><div class="event-list"><ul><li><img src="/uploads/popup.jpg"><p class="t1">공차 성수점 커피 팝업 OPEN</p><p class="t2">2026.08.01 ~ 2026.08.31</p></li></ul></div>';
  const result = await collectGongchaEvents(config, { today: '2026-08-05', fetchHtml: async () => html });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].venue, '성수점');
  assert.equal(result.stats.fetchedCount, 1);
});

test('동원F&B collector는 공식 검색 폼에 팝업 키워드만 POST한다', async () => {
  const config = BATCH4_BRAND_SOURCES.find(source => source.id === 'dongwon-fnb-news');
  const requests = [];
  const list = '<title>뉴스 & 공지사항</title><article><a href="/services/Customer/News/News_View?contentno=101">동원F&B 커피 팝업</a></article>';
  const detail = '<span class="boardTit">동원F&B 커피 팝업</span><span class="date">2026-08-01</span><p>오는 31일까지 서울 성동구에 위치한 성수 테스트키친에서 커피 팝업스토어를 운영한다.</p>';
  const result = await collectBrandNewsroom(config, {
    today: '2026-08-05',
    fetchHtml: async (url, options) => {
      requests.push([url, options]);
      return url === config.eventUrl ? list : detail;
    }
  });
  assert.equal(requests[0][1].method, 'POST');
  assert.match(requests[0][1].body, /keyword=%ED%8C%9D%EC%97%85/u);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].venue, '성수 테스트키친');
  assert.equal(result.rows[0].startDate, '2026-08-01');
  assert.equal(result.rows[0].endDate, '2026-08-31');
});

test('Batch4 collector config는 registry의 A등급 브랜드 source만 사용한다', async () => {
  const registry = JSON.parse(await readFile(new URL('../../data/data-source-registry.json', import.meta.url), 'utf8'));
  for (const config of BATCH4_BRAND_SOURCES) {
    const source = registry.sources.find(item => item.id === config.id);
    assert.ok(source, `${config.id} registry 누락`);
    assert.equal(source.priority, 'A');
    assert.ok(['brand_newsroom', 'brand_official_site'].includes(source.sourceType));
    assert.equal(source.implementationStatus, 'active');
    assert.equal(source.eventUrl, config.eventUrl);
  }
});
