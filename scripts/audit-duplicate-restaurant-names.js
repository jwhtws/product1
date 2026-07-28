const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data', 'restaurants');
const ignored = new Set(['regions.json', 'previews.json']);
const key = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const addressesByName = new Map();
let total = 0;

for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json') && !ignored.has(name))) {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (!Array.isArray(rows)) continue;
  for (const restaurant of rows) {
    total += 1;
    const nameKey = key(restaurant.name);
    if (!nameKey) continue;
    const addressKey = key(restaurant.address);
    const saved = addressesByName.get(nameKey);
    if (!saved) addressesByName.set(nameKey, addressKey);
    else if (typeof saved === 'string' && saved !== addressKey) addressesByName.set(nameKey, new Set([saved, addressKey]));
    else if (saved instanceof Set) saved.add(addressKey);
  }
}

const duplicateGroups = [...addressesByName.values()].filter(addresses => addresses instanceof Set && addresses.size > 1);
console.log(JSON.stringify({
  total,
  uniqueNames: addressesByName.size,
  duplicateNameGroups: duplicateGroups.length,
  restaurantsInDuplicateGroups: duplicateGroups.reduce((sum, addresses) => sum + addresses.size, 0),
  largestDuplicateGroup: Math.max(0, ...duplicateGroups.map(addresses => addresses.size))
}, null, 2));
