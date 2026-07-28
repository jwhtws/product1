import fs from 'node:fs';
import path from 'node:path';

const root = 'data/restaurants';
const rowsPerFile = 50000;
const manifestPath = path.join(root, 'regions.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const region of manifest.regions) {
  const previousFiles = region.files || [region.file];
  const rows = previousFiles.flatMap(file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
  const base = encodeURIComponent(region.name);
  const files = [];
  for (let start = 0; start < rows.length; start += rowsPerFile) {
    const file = `${base}-${Math.floor(start / rowsPerFile)}.json`;
    files.push(file);
    fs.writeFileSync(path.join(root, file), JSON.stringify(rows.slice(start, start + rowsPerFile)));
  }
  for (const file of previousFiles) if (!files.includes(file)) fs.unlinkSync(path.join(root, file));
  delete region.file;
  region.files = files;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`${manifest.regions.length}개 지역 데이터를 50,000건 이하 조각으로 분리했습니다.`);
