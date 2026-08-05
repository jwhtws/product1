import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BATCH4_BRAND_SOURCES, collectBrandNewsroom, discoverBrandDetailUrls } from '../../scripts/collectors/batch4-brand-newsrooms.mjs';

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
