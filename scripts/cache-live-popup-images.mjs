import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { probeOfficialImage } from './lib/popup-content-quality.mjs';

const inputPath = process.argv.find(value => value.startsWith('--input='))?.slice(8) || 'data/popups.json';
const sourcePrefix = process.argv.find(value => value.startsWith('--source-prefix='))?.slice(16) || 'shinsegae-shopping:';
const sourceFolder = process.argv.find(value => value.startsWith('--source-folder='))?.slice(16) || 'shinsegae';
const assetDir = `assets/popups/${sourceFolder}`;
const publicRoot = `https://mukdang.com/${assetDir}`;
const payload = JSON.parse(await readFile(inputPath, 'utf8'));
await mkdir(assetDir, { recursive: true });

const existingByHash = new Map();
for (const name of await readdir(assetDir)) {
  try {
    const bytes = await readFile(join(assetDir, name));
    existingByHash.set(createHash('sha256').update(bytes).digest('hex'), name);
  } catch {}
}

async function download(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow', signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'mukdang-popup-image-cache/1.0 (+https://mukdang.com)', Accept: 'image/avif,image/webp,image/png,image/jpeg' }
      });
      const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!response.ok || !contentType.startsWith('image/')) throw new Error(`HTTP ${response.status} ${contentType || 'unknown'}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) throw new Error(`image too large: ${bytes.length}`);
      if (bytes.length < 1024) throw new Error(`image too small: ${bytes.length}`);
      return { bytes, contentType };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw lastError;
}

let cached = 0;
const failures = [];
for (const row of payload.popups) {
  if (!row.id?.startsWith(sourcePrefix) || !['active', 'ongoing', 'upcoming'].includes(row.status)) continue;
  const originalUrl = row.imageOriginalUrl || row.imageUrl || row.image;
  if (!/^https:\/\//u.test(originalUrl) || new URL(originalUrl).hostname === 'mukdang.com') continue;
  try {
    const validation = await probeOfficialImage(originalUrl, { timeoutMs: 20_000 });
    if (validation.status !== 'valid') throw new Error(validation.reason || validation.status);
    const { bytes, contentType } = await download(originalUrl);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[contentType]
      || extname(new URL(originalUrl).pathname).toLowerCase() || '.img';
    let filename = existingByHash.get(hash);
    if (!filename) {
      filename = `${hash.slice(0, 20)}${extension}`;
      await writeFile(join(assetDir, filename), bytes);
      existingByHash.set(hash, filename);
    }
    const localUrl = `${publicRoot}/${filename}`;
    Object.assign(row, {
      imageUrl: localUrl, image: localUrl, imageOriginalUrl: originalUrl,
      imageSource: 'official-detail-local-copy', imageHash: hash,
      officialImageUrls: [...new Set([localUrl, originalUrl, ...(row.officialImageUrls || [])])].slice(0, 12),
      imageValidation: { ...validation, checkedAt: new Date().toISOString() },
      contentQuality: 'A', publishStatus: 'published', qualityReasons: [],
      contentSearch: { ...(row.contentSearch || {}), status: 'found', imageCandidatesFound: Math.max(1, row.contentSearch?.imageCandidatesFound || 0) }
    });
    cached += 1;
  } catch (error) {
    failures.push({ id: row.id, url: originalUrl, error: String(error?.message || error) });
  }
}

payload.updatedAt = new Date().toISOString();
await writeFile(inputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`공식 이미지 로컬 캐시 ${cached}건 · 실패 ${failures.length}건`);
for (const failure of failures) console.warn(`${failure.id}: ${failure.error}`);
if (failures.length) process.exitCode = 1;
