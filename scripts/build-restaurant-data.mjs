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
const quarantined = [];

function clean(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function hasBrokenText(value) {
  return value.includes('\uFFFD') || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(value);
}

function normalizeDate(value) {
  const raw = clean(value);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  const normalized = compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : raw;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? new Date(`${normalized}T00:00:00Z`) : null;
  return date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : '';
}

function normalizeArea(value) {
  const area = Number.parseFloat(clean(value));
  return Number.isFinite(area) && area > 0 && area < 100000 ? Math.round(area * 100) / 100 : null;
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
  const permitDateRaw = clean(values[2] || '');
  const permitDate = normalizeDate(permitDateRaw);
  if (hasBrokenText(name) || hasBrokenText(address)) {
    quarantined.push({
      type: 'broken-text',
      id: clean(values[1] || ''), name, address, permitDate: permitDateRaw
    });
    return;
  }
  if (!permitDate) {
    quarantined.push({
      type: 'invalid-permit-date',
      id: clean(values[1] || ''), name, address, permitDate: permitDateRaw
    });
  }

  const region = address.split(' ')[0];
  const restaurant = {
    id: clean(values[1] || ''),
    name,
    category: clean(values[9] || values[30] || '음식점'),
    address,
    phone: clean(values[33] || ''),
    facilityAreaM2: normalizeArea(values[25] || values[5] || ''),
    permitDate,
    permitDateSource: permitDate ? '행정안전부 일반음식점 인허가 데이터' : ''
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
writeFileSync(`${outputDir}/data-quality-quarantine.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: '행정안전부 일반음식점 인허가 데이터',
  total: quarantined.length,
  rows: quarantined
}));

console.log(`완료: 영업 중 식당 ${activeCount.toLocaleString('ko-KR')}건, ${regions.length}개 지역`);
