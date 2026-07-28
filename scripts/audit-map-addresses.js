const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data', 'restaurants');
const ignored = new Set(['regions.json', 'previews.json']);

function naverMapAddress(value) {
  return String(value || '')
    .normalize('NFKC')
    .split(',')[0]
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let total = 0;
let emptyOriginal = 0;
let emptyNormalized = 0;
let withExtraDetail = 0;
let changed = 0;
const invalid = [];

for (const file of fs.readdirSync(dataDir).filter(name => name.endsWith('.json') && !ignored.has(name))) {
  const rows = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  if (!Array.isArray(rows)) continue;
  for (const restaurant of rows) {
    total += 1;
    const original = String(restaurant.address || '').trim();
    const normalized = naverMapAddress(original);
    if (!original) emptyOriginal += 1;
    if (!normalized) {
      emptyNormalized += 1;
      if (invalid.length < 20) invalid.push({ file, name: restaurant.name, address: original });
    }
    if (original.includes(',') || /[()（）]/.test(original)) withExtraDetail += 1;
    if (original !== normalized) changed += 1;
  }
}

console.log(JSON.stringify({ total, emptyOriginal, emptyNormalized, withExtraDetail, changed, invalid }, null, 2));
if (emptyNormalized > 0) process.exitCode = 1;
