import fs from 'node:fs';
import path from 'node:path';

const sourceDir = 'data/restaurants';
const outputDir = path.join(sourceDir, 'search');
const ignored = new Set(['regions.json', 'previews.json']);
const key = value => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const buckets = new Map();

for (const file of fs.readdirSync(sourceDir).filter(name => name.endsWith('.json') && !ignored.has(name))) {
  const rows = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
  for (const row of rows) {
    const first = [...key(row.name)][0];
    if (!first) continue;
    const bucket = first.codePointAt(0).toString(16);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push([row.name, row.category || '', row.address || '', row.phone || '', row.permitDate || '', row.permitDateSource || '']);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
for (const file of fs.readdirSync(outputDir).filter(name => name.endsWith('.json'))) fs.unlinkSync(path.join(outputDir, file));
for (const [bucket, rows] of buckets) fs.writeFileSync(path.join(outputDir, `${bucket}.json`), JSON.stringify(rows));
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify({ version: 1, buckets: [...buckets.keys()] }));
console.log(`${buckets.size}개 검색 조각, ${[...buckets.values()].reduce((sum, rows) => sum + rows.length, 0)}개 식당 생성`);
