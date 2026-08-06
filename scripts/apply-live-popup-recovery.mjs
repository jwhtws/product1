import { readFile, writeFile } from 'node:fs/promises';

const path = process.argv.find(value => value.startsWith('--input='))?.slice(8) || 'data/popups.json';
const useOriginalImages = process.argv.includes('--audit-original-images');
const payload = JSON.parse(await readFile(path, 'utf8'));
const rows = new Map(payload.popups.map(row => [row.id, row]));

function update(id, values) {
  const row = rows.get(id);
  if (!row) throw new Error(`운영 팝업을 찾을 수 없습니다: ${id}`);
  rows.set(id, { ...row, ...values, lastVerifiedAt: '2026-08-06', lastSeenAt: '2026-08-06' });
}

const shinsegaeSource = 'https://www.shinsegae.com/shopping/view.do?mainCd=02&pageLink=%2Fcms12%2FSC00010%2Finfo%2Fshopping%2Fbrndsingle%2F8560469_4597.txt&contentDtlCd=01&contentId=8560469&storeCd=SC00010&brandCd=UB0004152';
const shinsegaeOriginal = 'https://www.shinsegae.com/cms12/SC00010/info/shopping/brndsingle/__icsFiles/afieldfile/2026/08/04/qM7bcQ5jRecG.jpg';
const shinsegaeLocal = 'https://mukdang.com/assets/popups/shinsegae/sc00010-8560469.jpg';
update('shinsegae-shopping:SC00010:8560469', {
  imageUrl: useOriginalImages ? shinsegaeOriginal : shinsegaeLocal,
  image: useOriginalImages ? shinsegaeOriginal : shinsegaeLocal,
  imageSource: 'official-detail-local-copy',
  imageOriginalUrl: shinsegaeOriginal,
  officialImageUrls: [shinsegaeLocal, shinsegaeOriginal],
  menus: [
    { name: '아그작케이크 애플망고', price: '13,500원', priceText: '13,500원', sourceUrl: shinsegaeSource, sourceName: '신세계백화점 공식 쇼핑뉴스', evidenceType: 'html' },
    { name: '아그작케이크 피스타치오', price: '15,500원', priceText: '15,500원', sourceUrl: shinsegaeSource, sourceName: '신세계백화점 공식 쇼핑뉴스', evidenceType: 'html' }
  ],
  menuItems: ['아그작케이크 애플망고', '아그작케이크 피스타치오'],
  menuSource: 'official-detail'
});

const honeySource = 'https://m.lotteshopping.com/shpgnews/shpgnewsDetail?shpgNewsNo=SNM00000000000546957';
const honeyOriginal = 'https://minfo.lotteshopping.com/content/news/202607/SNM00000000000546957/20260714212145994_1.jpeg';
const honeyLocal = 'https://mukdang.com/assets/popups/lotte/jamsil-honey.jpeg';
update('lotte:jamsil:honey', {
  imageUrl: useOriginalImages ? honeyOriginal : honeyLocal,
  image: useOriginalImages ? honeyOriginal : honeyLocal,
  imageSource: 'official-detail-local-copy',
  imageOriginalUrl: honeyOriginal,
  officialImageUrls: [honeyLocal, honeyOriginal],
  menus: [{ name: '위니 더 푸우 허니버터꿀', price: '', priceText: '가격 미공개', sourceUrl: honeySource, sourceName: '롯데쇼핑 공식 행사', evidenceType: 'official_image' }],
  menuItems: ['위니 더 푸우 허니버터꿀'],
  menuSource: 'official-image'
});

const ojisanSource = 'https://m.lotteshopping.com/search/searchResult?cstrCd=0342&searchTerm=%EC%98%A4%EC%A7%80%EC%83%81+%EC%B9%98%EC%A6%88%EC%BC%80%EC%9D%B4%ED%81%AC';
const ojisanOriginal = 'https://minfo.lotteshopping.com/content/news/202601/SNM00000000000509439/20260127090749624_7.jpeg';
const ojisanLocal = 'https://mukdang.com/assets/popups/lotte/cheongju-ojisan-cheesecake.jpeg';
update('lotte:cheongju:ojisan-cheesecake', {
  imageUrl: useOriginalImages ? ojisanOriginal : ojisanLocal,
  image: useOriginalImages ? ojisanOriginal : ojisanLocal,
  imageSource: 'official-detail-local-copy',
  imageOriginalUrl: ojisanOriginal,
  officialImageUrls: [ojisanLocal, ojisanOriginal],
  menus: [{ name: '치즈케이크', price: '', priceText: '가격 미공개', sourceUrl: ojisanSource, sourceName: '롯데쇼핑 공식 행사', evidenceType: 'official_image' }],
  menuItems: ['치즈케이크'],
  menuSource: 'official-image'
});

const seongbukdangSource = 'https://www.ehyundai.com/newPortal/SN/SN_0201000.do?evntCrdCd=E1102607494403&branchCd=B00141000&category=';
const seongbukdangMenus = ['불닭/갈릭', '오리지널 치즈', '팥', '옥수수 치즈'].map(name => ({
  name, price: '4,000원', priceText: '4,000원', sourceUrl: seongbukdangSource,
  sourceName: '현대백화점 공식 쇼핑뉴스', evidenceType: 'html'
}));
update('hyundai:E1102607494403', {
  menus: seongbukdangMenus, menuItems: seongbukdangMenus.map(menu => menu.name), menuSource: 'official-detail'
});

payload.updatedAt = new Date().toISOString();
payload.popups = [...rows.values()].sort((left, right) =>
  String(right.startDate || '').localeCompare(String(left.startDate || ''))
  || String(left.name || '').localeCompare(String(right.name || ''), 'ko')
);
await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
console.log('공식 근거 기반 운영 복구 4건 반영');
