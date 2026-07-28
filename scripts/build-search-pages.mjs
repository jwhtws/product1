import fs from 'node:fs';
import path from 'node:path';

const sourceDir = 'data/restaurants';
const outputDir = path.join(sourceDir, 'search-pages');
const ignored = new Set(['regions.json', 'previews.json', 'validation-report.json', 'data-quality-quarantine.json']);
const pageSize = 500;
const key = value => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const buckets = new Map();
const containsRoutes = new Map();

for (const file of fs.readdirSync(sourceDir).filter(name => name.endsWith('.json') && !ignored.has(name))) {
  for (const row of JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'))) {
    const prefix = [...key(row.name)].slice(0, 2);
    if (!prefix.length) continue;
    const bucket = (prefix.reduce((value, char) => ((value * 31) + char.codePointAt(0)) >>> 0, 0) % 256).toString(16).padStart(2, '0');
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push([row.name, row.category || '', row.address || '', row.phone || '', row.permitDate || '', row.permitDateSource || '', row.facilityAreaM2 || null]);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
for (const file of fs.readdirSync(outputDir).filter(name => name.endsWith('.json'))) fs.unlinkSync(path.join(outputDir, file));
const bucketCount = {};
for (const [bucket, rows] of buckets) {
  rows.sort((left, right) => key(left[0]).localeCompare(key(right[0]), 'ko'));
  bucketCount[bucket] = Math.ceil(rows.length / pageSize);
  const lookup = {};
  rows.forEach((row, index) => {
    const chars = [...key(row[0])];
    const page = Math.floor(index / pageSize);
    for (const length of [2, 3]) {
      if (chars.length < length) continue;
      const prefixKey = chars.slice(0, length).map(char => char.codePointAt(0).toString(16)).join('-');
      const entry = lookup[prefixKey] || { start: page, end: page };
      entry.end = page;
      lookup[prefixKey] = entry;
    }
  });
  fs.writeFileSync(path.join(outputDir, `manifest-${bucket}.json`), JSON.stringify(lookup));
  for (let page = 0; page < bucketCount[bucket]; page += 1) {
    const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);
    fs.writeFileSync(path.join(outputDir, `${bucket}-${page}.json`), JSON.stringify(pageRows));
    for (const row of pageRows) {
      const chars = [...key(row[0])];
      const bigrams = new Set();
      for (let index = 0; index < chars.length - 1; index += 1) bigrams.add(chars.slice(index, index + 2).join(''));
      for (const bigram of bigrams) {
        const routeKey = [...bigram].map(char => char.codePointAt(0).toString(16)).join('-');
        if (!containsRoutes.has(routeKey)) containsRoutes.set(routeKey, new Set());
        containsRoutes.get(routeKey).add(`${bucket}-${page}`);
      }
    }
  }
}
const containsShards = new Map();
for (const [routeKey, pages] of containsRoutes) {
  const chars = routeKey.split('-').map(value => String.fromCodePoint(parseInt(value, 16)));
  const shard = (chars.reduce((value, char) => ((value * 31) + char.codePointAt(0)) >>> 0, 0) % 256).toString(16).padStart(2, '0');
  if (!containsShards.has(shard)) containsShards.set(shard, {});
  containsShards.get(shard)[routeKey] = [...pages];
}
for (const [shard, routes] of containsShards) {
  fs.writeFileSync(path.join(outputDir, `contains-${shard}.json`), JSON.stringify(routes));
}
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({ version: 4, pageSize, prefixLengths: [2, 3] }));
console.log(`${Object.keys(bucketCount).length}개 검색 조각 생성`);
