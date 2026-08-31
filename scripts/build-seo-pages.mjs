import fs from 'node:fs';
import path from 'node:path';

const origin = 'https://mukdang.com';
const popupData = JSON.parse(fs.readFileSync('data/popups.json', 'utf8'));
let popupReviewQueue = { reviewRequired: [], rejected: [] };
try { popupReviewQueue = JSON.parse(fs.readFileSync('data/popup-review-queue.json', 'utf8')); } catch {}
const publishedPopupIds = new Set(popupData.popups.map(popup => popup.id));
const detailPopups = [...new Map([
  ...popupData.popups, ...(popupReviewQueue.reviewRequired || [])
].map(popup => [popup.id, popup])).values()];
const restaurants = JSON.parse(fs.readFileSync('data/popular-restaurants.json', 'utf8'));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const hash = value => [...String(value)].reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0);
const slug = (label, id) => `${String(label).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70)}-${Math.abs(hash(id))}`;
const popupPath = popup => `/food-popups/${slug(`${popup.name}-${popup.venue}`, popup.id)}/`;
const restaurantPath = restaurant => `/restaurant-reviews/${slug(`${restaurant.name}-${restaurant.address}`, restaurant.id || `${restaurant.name}-${restaurant.address}`)}/`;

function layout({ title, description, canonical, body, schema, image }) {
  const imageTag = image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:site_name" content="먹당"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}">${imageTag}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script><style>:root{font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;color:#171714;background:#f7f5ef}*{box-sizing:border-box}body{margin:0}header,main,footer{width:min(760px,calc(100% - 32px));margin:auto}header{padding:24px 0}header a{color:#171714;font-size:24px;font-weight:900;text-decoration:none}header a span{color:#f05a2a}main{padding:28px;background:#fff;border:1px solid #e7e4dc;border-radius:22px;box-shadow:0 18px 50px rgba(35,31,20,.08)}.eyebrow{color:#247a52;font-size:12px;font-weight:900}h1{margin:10px 0 16px;font-size:clamp(28px,6vw,42px);line-height:1.16;letter-spacing:-.06em}.lead{color:#706f69;line-height:1.7}.facts{display:grid;gap:12px;margin:26px 0;padding:20px;border-radius:15px;background:#f7f5ef}.facts div{display:grid;gap:4px}.facts span{color:#706f69;font-size:11px;font-weight:800}.facts strong{font-size:16px;line-height:1.5}.menu{padding-left:20px;line-height:1.8}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:24px}.actions a{padding:11px 14px;border-radius:10px;background:#171714;color:#fff;font-size:13px;font-weight:800;text-decoration:none}.actions a.secondary{background:#edf7f1;color:#175b3c}footer{padding:28px 0;color:#706f69;font-size:11px}@media(max-width:560px){main{padding:22px 18px}}</style></head><body><header><a href="/"><span>먹</span>당</a></header><main>${body}</main><footer>공식 일정과 공공 인허가 정보를 바탕으로 제공하며 방문 전 공식 정보를 확인해 주세요.</footer></body></html>`;
}

const seoulToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const dateAfter = (date, days) => {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const weekEnd = dateAfter(seoulToday, 6);
const regionRoutes = new Map([
  ['서울특별시', ['seoul', '서울']], ['경기도', ['gyeonggi', '경기']],
  ['인천광역시', ['incheon', '인천']], ['부산광역시', ['busan', '부산']],
  ['대구광역시', ['daegu', '대구']], ['대전광역시', ['daejeon', '대전']],
  ['울산광역시', ['ulsan', '울산']], ['충청북도', ['chungbuk', '충북']]
]);
const retailerRoutes = [
  ['lotte', '롯데', popup => /롯데/u.test(popup.venue)],
  ['hyundai', '현대', popup => /현대/u.test(popup.venue)],
  ['shinsegae', '신세계', popup => /신세계/u.test(popup.venue)],
  ['galleria', '갤러리아', popup => /갤러리아/u.test(popup.venue)]
];

function writePage(route, html) {
  const directory = path.join('.', route);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
}

for (const root of ['food-popups', 'restaurant-reviews']) fs.rmSync(root, { recursive: true, force: true });

const popupLinks = [];
const popupDetailLinks = [];
const menuPriceLabel = item => item.priceText
  || (Number.isFinite(item.price) ? `${item.price.toLocaleString('ko-KR')}원` : item.price || '');
for (const popup of detailPopups) {
  const route = popupPath(popup);
  const canonical = `${origin}${route}`;
  const period = `${popup.startDate} ~ ${popup.endDate || '종료일 미정'}`;
  const description = `${popup.name} ${popup.venue} 푸드 팝업의 운영 기간, 위치${popup.menus?.length ? ', 메뉴와 가격' : ''}을 확인하세요.`;
  const menus = (popup.menus || popup.menuItems || []).map(item => typeof item === 'string' ? { name: item } : item);
  const schema = { '@context': 'https://schema.org', '@type': 'Event', name: popup.name, startDate: popup.startDate, ...(popup.endDate ? { endDate: popup.endDate } : {}), eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled', location: { '@type': 'Place', name: popup.venue, address: { '@type': 'PostalAddress', streetAddress: popup.address || popup.venue, addressRegion: popup.region || '', addressCountry: 'KR' } }, url: canonical, ...(popup.imageUrl ? { image: [popup.imageUrl] } : {}) };
  const menuHtml = menus.length ? `<h2>대표 메뉴</h2><ul class="menu">${menus.map(item => { const price = menuPriceLabel(item); return `<li>${escapeHtml(item.name || item)}${price ? ` · <strong>${escapeHtml(price)}</strong>` : ''}</li>`; }).join('')}</ul>` : '';
  const ended = popup.status === 'ended' || (popup.endDate && popup.endDate < seoulToday);
  const body = `<span class="eyebrow">${ended ? '종료됨 · ' : ''}${escapeHtml(popup.venueType || '쇼핑시설')} 푸드 팝업</span><h1>${escapeHtml(popup.name)}</h1><p class="lead"><strong>${escapeHtml(popup.venue)}</strong>에서 ${ended ? '진행됐던' : '진행되는'} 푸드 팝업입니다. ${ended ? '종료된 일정과 공식 정보를 기록으로 확인하세요.' : '일정과 위치를 확인하고 방문하세요.'}</p><section class="facts"><div><span>상태</span><strong>${ended ? '종료됨' : popup.status === 'upcoming' ? '오픈 예정' : '진행 중'}</strong></div><div><span>백화점·지점</span><strong>${escapeHtml(popup.venue)}</strong></div><div><span>주소</span><strong>${escapeHtml(popup.address || popup.venue)}</strong></div><div><span>운영 기간</span><strong>${escapeHtml(period)}</strong></div></section>${menuHtml}<div class="actions"><a href="${escapeHtml(popup.sourceUrl)}" rel="noopener noreferrer">공식 정보 확인</a><a class="secondary" href="/">다른 푸드 팝업 보기</a></div>`;
  writePage(route, layout({ title: `${popup.name} | ${popup.venue} 푸드 팝업 일정`, description, canonical, body, schema, image: popup.imageUrl }));
  const link = { route, title: `${popup.name} · ${popup.venue}`, lastmod: popup.lastVerifiedAt || popupData.updatedAt?.slice(0, 10), popup };
  popupDetailLinks.push(link);
  if (publishedPopupIds.has(popup.id)) popupLinks.push(link);
}

const restaurantLinks = [];
for (const restaurant of restaurants) {
  const route = restaurantPath(restaurant);
  const canonical = `${origin}${route}`;
  const description = `${restaurant.name}의 주소, 음식 종류와 방문자 리뷰 정보를 먹당에서 확인하세요.`;
  const schema = { '@context': 'https://schema.org', '@type': 'Restaurant', name: restaurant.name, servesCuisine: restaurant.category || '음식점', address: { '@type': 'PostalAddress', streetAddress: restaurant.address, addressCountry: 'KR' }, ...(restaurant.phone ? { telephone: restaurant.phone } : {}), url: canonical };
  const body = `<span class="eyebrow">${escapeHtml(restaurant.category || '식당')} 정보·리뷰</span><h1>${escapeHtml(restaurant.name)}</h1><p class="lead">${escapeHtml(restaurant.name)}의 위치와 기본 정보를 확인하고 직접 방문한 리뷰를 남겨보세요.</p><section class="facts"><div><span>주소</span><strong>${escapeHtml(restaurant.address)}</strong></div><div><span>음식 종류</span><strong>${escapeHtml(restaurant.category || '음식점')}</strong></div>${restaurant.phone ? `<div><span>전화번호</span><strong>${escapeHtml(restaurant.phone)}</strong></div>` : ''}</section><div class="actions"><a href="/?mode=restaurant&q=${encodeURIComponent(restaurant.name)}">먹당에서 리뷰 확인</a><a class="secondary" href="/">다른 식당 찾기</a></div>`;
  writePage(route, layout({ title: `${restaurant.name} 리뷰·주소 | 먹당`, description, canonical, body, schema }));
  restaurantLinks.push({ route, title: `${restaurant.name} · ${restaurant.address}` });
}

const listing = ({ title, description, links, route, intro = '', guide = '', backHref = '/food-popups/', backLabel = '전국 푸드 팝업 보기' }) => layout({
  title, description, canonical: `${origin}${route}`,
  schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: `${origin}${route}` },
  body: `<span class="eyebrow">먹당 검색 가이드</span><h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(description)}</p>${intro ? `<p class="lead">${escapeHtml(intro)}</p>` : ''}${guide}<h2>현재 확인 가능한 푸드팝업</h2><ul class="menu">${links.map(item => `<li><a href="${item.route}">${escapeHtml(item.title)}</a></li>`).join('')}</ul><div class="actions"><a class="secondary" href="${backHref}">${escapeHtml(backLabel)}</a></div>`
});
const popupGuide = `<section><h2>푸드팝업 일정 찾는 방법</h2><p class="lead">오늘이나 이번 주에 방문할 푸드팝업을 기간별로 확인하고, 서울·경기·부산·대구 등 지역 또는 백화점별 페이지에서 가까운 행사를 찾을 수 있습니다. 각 상세페이지에는 운영 기간, 장소, 주소, 대표 메뉴와 공식 출처를 함께 표시합니다.</p><div class="actions"><a href="/food-popups/this-week/">이번 주 푸드팝업</a><a class="secondary" href="/food-popups/seoul/">서울</a><a class="secondary" href="/food-popups/gyeonggi/">경기</a><a class="secondary" href="/food-popups/busan/">부산</a><a class="secondary" href="/food-popups/lotte/">롯데</a><a class="secondary" href="/food-popups/hyundai/">현대</a><a class="secondary" href="/food-popups/shinsegae/">신세계</a></div></section>`;
fs.writeFileSync('food-popups/index.html', listing({ title: '전국 푸드팝업 일정·위치·지도 | 먹당', description: '먹당에서 전국 백화점과 쇼핑몰의 푸드팝업·디저트 팝업스토어 일정, 운영 기간, 지점과 지도 위치를 확인하세요.', links: popupLinks, route: '/food-popups/', intro: '롯데·현대·신세계·갤러리아 등 주요 백화점과 쇼핑몰의 식품관 팝업 일정을 공식 출처 기준으로 매일 갱신합니다.', guide: popupGuide }));
fs.writeFileSync('restaurant-reviews/index.html', listing({ title: '전국 맛집 리뷰와 주소 | 먹당', description: '먹당에서 많이 찾는 전국 맛집의 위치와 방문자 리뷰 정보를 확인하세요.', links: restaurantLinks, route: '/restaurant-reviews/', backHref: '/', backLabel: '먹당에서 맛집 찾기' }));

const landingLinks = [];
const createLanding = (route, title, description, links, intro) => {
  if (!links.length) return;
  writePage(route, listing({ title, description, links, route: `/${route}/`, intro }));
  landingLinks.push({ route: `/${route}/`, lastmod: popupData.updatedAt?.slice(0, 10) });
};
const thisWeek = popupLinks.filter(({ popup }) => popup.startDate <= weekEnd && (!popup.endDate || popup.endDate >= seoulToday));
createLanding('food-popups/this-week', '이번 주 푸드 팝업 일정 | 먹당', `오늘부터 7일 안에 방문할 수 있는 전국 푸드 팝업 ${thisWeek.length}개의 장소와 기간을 확인하세요.`, thisWeek, `기준일은 ${seoulToday}이며 종료일과 공식 일정을 매일 갱신합니다.`);
for (const [region, [routeName, label]] of regionRoutes) {
  const links = popupLinks.filter(({ popup }) => popup.region === region && (!popup.endDate || popup.endDate >= seoulToday));
  createLanding(`food-popups/${routeName}`, `${label} 푸드 팝업 일정 | 먹당`, `${label} 백화점과 쇼핑몰에서 진행 중이거나 곧 열리는 푸드 팝업 ${links.length}개의 기간과 장소를 확인하세요.`, links, '공식 행사 정보를 기준으로 운영 기간, 지점과 대표 메뉴를 정리했습니다.');
}
for (const [routeName, label, matches] of retailerRoutes) {
  const links = popupLinks.filter(({ popup }) => matches(popup) && (!popup.endDate || popup.endDate >= seoulToday));
  createLanding(`food-popups/${routeName}`, `${label}백화점 푸드 팝업 일정 | 먹당`, `${label} 계열 백화점과 쇼핑몰에서 진행 중이거나 곧 열리는 푸드 팝업 ${links.length}개의 기간과 지점을 확인하세요.`, links, '각 행사 상세 페이지에서 주소, 운영 기간과 공식 출처를 확인할 수 있습니다.');
}

const urls = [{ route: '/', lastmod: popupData.updatedAt?.slice(0, 10) }, { route: '/food-popups/', lastmod: popupData.updatedAt?.slice(0, 10) }, { route: '/restaurant-reviews/' }, ...landingLinks, ...popupDetailLinks, ...restaurantLinks];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item => `  <url><loc>${new URL(item.route, origin).href}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync('sitemap.xml', sitemap);
console.log(`SEO 페이지 ${popupLinks.length}개 팝업, ${restaurantLinks.length}개 식당 생성`);
