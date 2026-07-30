import fs from 'node:fs';
import path from 'node:path';

const sourceDir = 'data/restaurants';
const output = 'data/food-search.json';
const ignored = new Set(['regions.json', 'previews.json', 'validation-report.json', 'data-quality-quarantine.json']);
const foods = [
  '떡볶이', '냉면', '돈가스', '돈까스', '치킨', '햄버거', '피자', '초밥', '스시',
  '삼겹살', '갈비', '곱창', '족발', '보쌈', '국밥', '설렁탕', '순대', '김밥',
  '칼국수', '라멘', '우동', '짜장면', '자장면', '짬뽕', '마라탕', '쌀국수',
  '파스타', '샤브샤브', '장어', '게장', '커피', '베이글', '빵', '디저트'
];
const key = value => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const rows = [];

for (const file of fs.readdirSync(sourceDir).filter(name => name.endsWith('.json') && !ignored.has(name))) {
  const data = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
  if (Array.isArray(data)) rows.push(...data);
}

const result = {};
for (const food of foods) {
  const foodKey = key(food);
  const matching = rows.filter(row => key(row.name).includes(foodKey));
  const counts = new Map();
  matching.forEach(row => counts.set(row.name, (counts.get(row.name) || 0) + 1));
  const names = [...counts].sort((left, right) => right[1] - left[1] || left[0].length - right[0].length).slice(0, 20);
  result[food] = names.map(([name, frequency], index) => {
    const row = matching.find(candidate => candidate.name === name);
    return {
      id: row.id,
      name: row.name,
      category: row.category || '',
      address: row.address || '',
      phone: row.phone || '',
      permitDate: row.permitDate || '',
      permitDateSource: row.permitDateSource || '',
      facilityAreaM2: row.facilityAreaM2 || null,
      foodSearchRank: (20 - index) * 100 + frequency
    };
  });
}

fs.writeFileSync(output, JSON.stringify(result));
console.log(`${Object.keys(result).length}개 음식 검색 색인 생성`);
