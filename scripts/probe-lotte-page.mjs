const url = process.argv[2] || 'https://m.lotteshopping.com/search/searchResult?cstrCd=0028&searchTerm=%EB%84%88%EA%B5%AC%EB%A6%AC%EB%B2%A0%EC%9D%B4%EA%B8%80';
const response = await fetch(url, {
  headers: {
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'ko-KR,ko;q=0.9',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
  },
  signal: AbortSignal.timeout(60_000)
});
const html = await response.text();
const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/giu)].map(match => new URL(match[1], url).href);
const apiPaths = [...new Set([...html.matchAll(/["']([^"']*(?:api|search|shpgnews)[^"']*)["']/giu)].map(match => match[1]).filter(value => value.length < 500))];
const images = [...new Set([...html.matchAll(/(?:src|data-src|imageUrl|imgUrl|imgPath)["']?\s*(?:=|:)\s*["']([^"']+)/giu)].map(match => match[1]))];
const newsIds = [...new Set([...html.matchAll(/SNM\d{10,}/gu)].map(match => match[0]))];
const contexts = newsIds.map(id => {
  const index = html.indexOf(id);
  return { id, context: html.slice(Math.max(0, index - 1500), index + 1800) };
});
const details = [];
for (const id of newsIds) {
  const detailUrl = `https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=${id}`;
  const detailResponse = await fetch(detailUrl, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/126 Safari/537.36' }, signal: AbortSignal.timeout(30_000) });
  const detailHtml = await detailResponse.text();
  details.push({ id, status: detailResponse.status, length: detailHtml.length, images: [...new Set([...detailHtml.matchAll(/(?:src|data-src)=["']([^"']+)/giu)].map(match => match[1]))].slice(0, 30), text: detailHtml.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').slice(0, 3000) });
}
console.log(JSON.stringify({ status: response.status, finalUrl: response.url, length: html.length, scripts, apiPaths: apiPaths.slice(0, 100), images: images.slice(0, 100), newsIds, contexts, details }, null, 2));
