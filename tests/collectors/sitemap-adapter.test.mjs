import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { collectTimesSquareSitemap, parseSitemapDocument } from '../../scripts/collectors/times-square-sitemap.mjs';
import { runBatch3VenueContract } from './batch3-venue-parser-contract.mjs';

runBatch3VenueContract('times-square', 'sitemap-adapter');
test('타임스퀘어: sitemap index와 일반 sitemap 구분 및 도메인 제한', async () => {
  const f = JSON.parse(await readFile(new URL('../fixtures/food-popups/sitemap-adapter.json', import.meta.url)));
  const index = parseSitemapDocument(f.validSitemapIndex, f.metadata.officialUrl);
  assert.equal(index.type, 'index');
  assert.equal(index.urls.length, 1);
  const urlset = parseSitemapDocument(f.validUrlset, f.metadata.officialUrl);
  assert.equal(urlset.type, 'urlset');
  assert.equal(urlset.urls.length, 2);
  assert.throws(() => parseSitemapDocument(f.structureChangedXml, f.metadata.officialUrl), /sitemapindex\/urlset/u);
});
test('타임스퀘어: 후보 상세만 제한 fetch하고 필드를 파싱한다', async () => {
  const f = JSON.parse(await readFile(new URL('../fixtures/food-popups/sitemap-adapter.json', import.meta.url)));
  const child='https://www.timessquare.co.kr/sitemap.xml?p_l_id=894&layoutUuid=event';
  const calls=[];
  const fetchText=async url=>{
    calls.push(url);
    if(url==='https://www.timessquare.co.kr/')return '<html><title>타임스퀘어 이벤트</title></html>';
    if(url==='https://www.timessquare.co.kr/robots.txt')return 'Sitemap: https://www.timessquare.co.kr/sitemap.xml';
    if(url===f.metadata.officialUrl)return f.validSitemapIndex;
    if(url===child)return f.validUrlset;
    if(url==='https://www.timessquare.co.kr/sitemap.xml?p_l_id=894&layoutUuid=event')return '<urlset></urlset>';
    if(url===f.expected.sourceUrl)return f.validDetail;
    throw new Error(`예상하지 않은 fetch: ${url}`);
  };
  const result=await collectTimesSquareSitemap({fetchText,today:'2026-08-05'});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].venue,'타임스퀘어');
  assert.ok(calls.length>=5);
  assert.ok(result.sourceHealth.discoveryAttempts.length>=5);
});
test('타임스퀘어: 정상 빈 urlset과 구조 변경을 구분한다', async () => {
  const empty=await collectTimesSquareSitemap({fetchText:async()=>'<urlset></urlset>',today:'2026-08-05'});
  assert.equal(empty.sourceHealth.finalStatus,'verified_empty');
  const changed=await collectTimesSquareSitemap({fetchText:async()=>'<html>changed</html>',today:'2026-08-05'});
  assert.equal(changed.sourceHealth.finalStatus,'unresolved');
});

test('타임스퀘어: 기본 sitemap 404 후 공식 Liferay sitemap fallback으로 복구한다', async () => {
  const f = JSON.parse(await readFile(new URL('../fixtures/food-popups/sitemap-adapter.json', import.meta.url)));
  const fallback='https://www.timessquare.co.kr/sitemap.xml?p_l_id=894&layoutUuid=event';
  const fetchText=async url=>{
    if(url==='https://www.timessquare.co.kr/')return '<html><title>타임스퀘어</title></html>';
    if(url==='https://www.timessquare.co.kr/robots.txt')return '';
    if(url==='https://www.timessquare.co.kr/sitemap.xml')throw Object.assign(new Error('404'),{httpStatus:404,errorType:'http_404'});
    if(url===fallback)return f.validUrlset;
    if(url===f.expected.sourceUrl)return f.validDetail;
    throw new Error(`unexpected ${url}`);
  };
  const result=await collectTimesSquareSitemap({fetchText,today:'2026-08-05'});
  assert.equal(result.rows.length,1);
  assert.equal(result.sourceHealth.finalStatus,'recovered');
  assert.equal(result.sourceHealth.recoveredPath,fallback);
});
