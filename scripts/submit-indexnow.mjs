import fs from 'node:fs';

const key = '771a8b4f28e65269baeea70b40c8b8b8';
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const urlList = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(match[1]).href);
if (!urlList.length) throw new Error('IndexNow에 제출할 URL이 없습니다.');

const response = await fetch('https://searchadvisor.naver.com/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: 'mukdang.com',
    key,
    keyLocation: `https://mukdang.com/${key}.txt`,
    urlList
  })
});

console.log(`네이버 IndexNow ${urlList.length}개 URL 제출: HTTP ${response.status}`);
if (![200, 202].includes(response.status)) {
  console.error(await response.text());
  process.exitCode = 1;
}
