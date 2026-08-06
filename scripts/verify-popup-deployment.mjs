import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const value = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const baseUrl = value('url', 'https://mukdang.com').replace(/\/$/u, '');
const attempts = Math.max(1, Number(value('attempts', '1')));
const intervalMs = Math.max(0, Number(value('interval-ms', '30000')));

function digest(rows) {
  return createHash('sha256').update(JSON.stringify(rows.map(row => ({
    id: row.id, status: row.status, startDate: row.startDate, endDate: row.endDate,
    image: row.image, menus: row.menus
  })).sort((left, right) => left.id.localeCompare(right.id)))).digest('hex');
}

function assetVersion(html, asset) {
  return html.match(new RegExp(`${asset.replace('.', '\\.')}\\?v=([^"'<]+)`, 'u'))?.[1] || '';
}

const localFeed = JSON.parse(await readFile('data/popups.json', 'utf8'));
const localIndex = await readFile('index.html', 'utf8');
const expected = {
  appVersion: assetVersion(localIndex, 'app.js'),
  stylesVersion: assetVersion(localIndex, 'styles.css'),
  updatedAt: localFeed.updatedAt,
  count: localFeed.popups.length,
  digest: digest(localFeed.popups)
};

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const cacheBust = `deploy-check=${Date.now()}`;
    const [indexResponse, feedResponse] = await Promise.all([
      fetch(`${baseUrl}/?${cacheBust}`, { headers: { 'cache-control': 'no-cache' } }),
      fetch(`${baseUrl}/data/popups.json?${cacheBust}`, { headers: { 'cache-control': 'no-cache' } })
    ]);
    if (!indexResponse.ok || !feedResponse.ok) throw new Error(`HTTP index=${indexResponse.status} feed=${feedResponse.status}`);
    const [index, feed] = await Promise.all([indexResponse.text(), feedResponse.json()]);
    const actual = {
      appVersion: assetVersion(index, 'app.js'),
      stylesVersion: assetVersion(index, 'styles.css'),
      updatedAt: feed.updatedAt,
      count: Array.isArray(feed.popups) ? feed.popups.length : -1,
      digest: Array.isArray(feed.popups) ? digest(feed.popups) : ''
    };
    const mismatches = Object.keys(expected).filter(key => actual[key] !== expected[key]);
    if (!mismatches.length) {
      console.log(`배포 검증 통과 ${baseUrl} · app.js?v=${actual.appVersion} · 팝업 ${actual.count}건 · updatedAt=${actual.updatedAt}`);
      process.exit(0);
    }
    lastError = new Error(`배포 불일치: ${mismatches.map(key => `${key} local=${expected[key]} live=${actual[key]}`).join(', ')}`);
  } catch (error) { lastError = error; }
  console.warn(`배포 검증 ${attempt}/${attempts} 실패: ${lastError.message}`);
  if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, intervalMs));
}
throw lastError || new Error('배포 검증 실패');
