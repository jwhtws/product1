import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { probeOfficialImage } from './lib/popup-content-quality.mjs';

const inputPath = process.argv.find(value => value.startsWith('--input='))?.slice(8) || 'data/popups.json';
const outputPath = process.argv.find(value => value.startsWith('--output='))?.slice(9) || 'data/food-popups/live-content-audit.json';
const liveOnly = process.argv.includes('--live-http');
const payload = JSON.parse(await readFile(inputPath, 'utf8'));
const sourceCache = new Map();

async function limitedBytes(response, limit = 262_144) {
  if (!response.body?.getReader) return Buffer.from(await response.arrayBuffer()).subarray(0, limit);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk.subarray(0, limit - total));
    total += Math.min(chunk.length, limit - total);
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

async function probePage(url) {
  if (!/^https:\/\//u.test(String(url || ''))) return { exists: false, httpStatus: 0, error: 'invalid_url' };
  if (!sourceCache.has(url)) sourceCache.set(url, (async () => {
    try {
      const response = await fetch(url, {
        redirect: 'follow', signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'mukdang-live-content-audit/1.0 (+https://mukdang.com)', 'Accept-Language': 'ko-KR,ko;q=0.9', Range: 'bytes=0-4095' }
      });
      const bytes = await limitedBytes(response, 4096);
      return {
        exists: response.ok, httpStatus: response.status, finalUrl: response.url,
        contentType: String(response.headers.get('content-type') || '').split(';')[0],
        responseSize: Number(response.headers.get('content-length')) || bytes.length
      };
    } catch (error) {
      return { exists: false, httpStatus: 0, error: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
    }
  })());
  return sourceCache.get(url);
}

async function localImageProbe(url, row) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'mukdang.com' || liveOnly) return null;
  const path = decodeURIComponent(parsed.pathname).replace(/^\//u, '');
  if (!path.startsWith('assets/popups/')) return null;
  try {
    const bytes = await readFile(path);
    const contentType = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' })[extname(path).toLowerCase()] || 'application/octet-stream';
    return {
      status: contentType.startsWith('image/') && bytes.length >= 1024 ? 'valid' : 'invalid',
      reason: bytes.length < 1024 ? 'below_minimum_size' : undefined,
      httpStatus: 200, contentType, responseSize: bytes.length,
      width: row.imageValidation?.width || null, height: row.imageValidation?.height || null,
      checkedVia: 'repository_static_asset'
    };
  } catch {
    return { status: 'invalid', reason: 'local_file_missing', httpStatus: 404, checkedVia: 'repository_static_asset' };
  }
}

async function networkImageProbe(url) {
  const validation = await probeOfficialImage(url, { timeoutMs: 20_000 });
  const page = await probePage(url);
  return { ...validation, httpStatus: page.httpStatus, responseSize: page.responseSize, contentType: validation.contentType || page.contentType, finalUrl: page.finalUrl, checkedVia: 'http' };
}

const items = new Array(payload.popups.length);
let cursor = 0;
async function worker() {
  while (cursor < payload.popups.length) {
    const index = cursor++;
    const row = payload.popups[index];
    const imageUrl = row.image || row.imageUrl || '';
    const image = imageUrl ? (await localImageProbe(imageUrl, row) || await networkImageProbe(imageUrl))
      : { status: 'invalid', reason: 'missing_image', httpStatus: 0 };
    const source = await probePage(row.officialUrl || row.sourceUrl);
    const menuItemsCount = Array.isArray(row.menuItems) ? row.menuItems.length : 0;
    const menusCount = Array.isArray(row.menus) ? row.menus.length : 0;
    const officialImageUrlsCount = Array.isArray(row.officialImageUrls) ? row.officialImageUrls.length : 0;
    const imageOkay = image.status === 'valid';
    const menuOkay = menusCount > 0 || menuItemsCount > 0;
    let classification = 'complete';
    if (!source.exists && source.error === 'invalid_url') classification = 'invalid_source_url';
    else if (row.parserFailureReason || row.contentSearch?.status === 'parse_failed') classification = 'parse_failed';
    else if (!imageOkay && !menuOkay) classification = 'missing_image_and_menu';
    else if (!imageUrl) classification = 'missing_image';
    else if (!imageOkay) classification = 'broken_image';
    else if (!menuOkay) classification = 'missing_menu';
    else if (!source.exists || row.contentSearch?.status === 'search_incomplete') classification = 'detail_not_checked';
    items[index] = {
      id: row.id, name: row.name || row.title, venue: row.venue, status: row.status,
      sourceName: row.sourceName, sourceUrl: row.officialUrl || row.sourceUrl,
      imageUrl: imageUrl || null, imageLoadSuccess: imageOkay,
      imageHttpStatus: image.httpStatus || 0, imageContentType: image.contentType || null,
      imageResponseSize: image.responseSize || 0, imageWidth: image.width || null, imageHeight: image.height || null,
      imageFailureReason: imageOkay ? null : image.reason || 'unknown', imageCheckedVia: image.checkedVia || null,
      menuItemsCount, menusCount, officialImageUrlsCount,
      officialDetailExists: source.exists, officialDetailHttpStatus: source.httpStatus,
      officialDetailContentType: source.contentType || null, officialDetailResponseSize: source.responseSize || 0,
      exposedOnSite: row.publishStatus === 'published', publishStatus: row.publishStatus || null,
      classification
    };
  }
}
await Promise.all(Array.from({ length: 4 }, () => worker()));

const activePublished = items.filter((item, index) =>
  ['ongoing', 'upcoming'].includes(item.status) && payload.popups[index].publishStatus === 'published');
const classifications = {};
for (const item of items) classifications[item.classification] = (classifications[item.classification] || 0) + 1;
const report = {
  generatedAt: new Date().toISOString(), inputPath, total: items.length,
  summary: {
    status: Object.fromEntries(['ongoing', 'upcoming', 'ended', 'review_required'].map(status => [status, items.filter(item => item.status === status).length])),
    classifications,
    publishedCount: items.filter(item => item.publishStatus === 'published').length,
    reviewRequiredCount: items.filter(item => item.publishStatus === 'review_required').length,
    activePublishedCount: activePublished.length,
    activePublishedImageSuccessCount: activePublished.filter(item => item.imageLoadSuccess).length,
    activePublishedImageLoadRate: activePublished.length ? activePublished.filter(item => item.imageLoadSuccess).length / activePublished.length : 1,
    activePublishedMenuCount: activePublished.filter(item => item.menusCount > 0 || item.menuItemsCount > 0).length,
    activePublishedMenuRate: activePublished.length ? activePublished.filter(item => item.menusCount > 0 || item.menuItemsCount > 0).length / activePublished.length : 1
  },
  items
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`운영 팝업 ${items.length}건 감사 · 공개 진행/예정 이미지 ${report.summary.activePublishedImageSuccessCount}/${activePublished.length} · 메뉴 ${report.summary.activePublishedMenuCount}/${activePublished.length}`);
if (report.summary.activePublishedImageLoadRate !== 1 || report.summary.activePublishedMenuRate !== 1) process.exitCode = 1;
