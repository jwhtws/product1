import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { TextDecoder } from 'node:util';

const input = process.argv[2] || '식품_일반음식점.csv';
const outputDir = 'data/restaurants';
const decoder = new TextDecoder('euc-kr');
const groups = new Map();
const rowsPerFile = 50000;
let headers = null;
let row = [];
let value = '';
let quoted = false;
let activeCount = 0;

function clean(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function addRow(values) {
  if (!headers) {
    headers = values;
    return;
  }

  if (values[3] !== '영업/정상') return;

  const name = clean(values[8] || '');
  const address = clean(values[19] || values[36] || '');
  if (!name || !address) return;

  const region = address.split(' ')[0];
  const restaurant = {
    id: clean(values[1] || ''),
    name,
    category: clean(values[9] || values[30] || '음식점'),
    address,
    phone: clean(values[33] || ''),
    permitDate: clean(values[2] || ''),
    permitDateSource: '행정안전부 일반음식점 인허가 데이터'
  };

  if (!groups.has(region)) groups.set(region, []);
  groups.get(region).push(restaurant);
  activeCount += 1;
}

function processText(text, finished = false) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      value = '';
      addRow(row);
      row = [];
    } else {
      value += char;
    }
  }

  if (finished && (value || row.length)) {
    row.push(value);
    addRow(row);
  }
}

await new Promise((resolve, reject) => {
  const stream = createReadStream(input);
  stream.on('data', chunk => processText(decoder.decode(chunk, { stream: true })));
  stream.on('end', () => {
    processText(decoder.decode(), true);
    resolve();
  });
  stream.on('error', reject);
});

mkdirSync(outputDir, { recursive: true });
const regions = [...groups.entries()]
  .sort(([a], [b]) => a.localeCompare(b, 'ko'))
  .map(([name, restaurants]) => {
    restaurants.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const base = encodeURIComponent(name);
    const files = [];
    for (let start = 0; start < restaurants.length; start += rowsPerFile) {
      const file = `${base}-${Math.floor(start / rowsPerFile)}.json`;
      files.push(file);
      writeFileSync(`${outputDir}/${file}`, JSON.stringify(restaurants.slice(start, start + rowsPerFile)));
    }
    return { name, count: restaurants.length, files };
  });

writeFileSync(`${outputDir}/regions.json`, JSON.stringify({
  updatedAt: new Date().toISOString(),
  total: activeCount,
  regions
}));
writeFileSync(`${outputDir}/previews.json`, JSON.stringify(Object.fromEntries(
  [...groups].map(([name, restaurants]) => [name, restaurants.slice(0, 20)])
)));

console.log(`완료: 영업 중 식당 ${activeCount.toLocaleString('ko-KR')}건, ${regions.length}개 지역`);
