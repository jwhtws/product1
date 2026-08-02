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
console.log(JSON.stringify({ status: response.status, finalUrl: response.url, length: html.length, scripts, apiPaths: apiPaths.slice(0, 100), images: images.slice(0, 100), newsIds, sample: html.slice(0, 2000) }, null, 2));
