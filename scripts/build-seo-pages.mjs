import fs from 'node:fs';
import path from 'node:path';

const origin = 'https://mukdang.com';
const popupData = JSON.parse(fs.readFileSync('data/popups.json', 'utf8'));
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

function writePage(route, html) {
  const directory = path.join('.', route);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
}

for (const root of ['food-popups', 'restaurant-reviews']) fs.rmSync(root, { recursive: true, force: true });

const popupLinks = [];
for (const popup of popupData.popups) {
  const route = popupPath(popup);
  const canonical = `${origin}${route}`;
  const period = `${popup.startDate} ~ ${popup.endDate || '종료일 미정'}`;
  const description = `${popup.name} ${popup.venue} 푸드 팝업의 운영 기간, 위치${popup.menus?.length ? ', 메뉴와 가격' : ''}을 확인하세요.`;
  const menus = (popup.menus || popup.menuItems || []).map(item => typeof item === 'string' ? { name: item } : item);
  const schema = { '@context': 'https://schema.org', '@type': 'Event', name: popup.name, startDate: popup.startDate, ...(popup.endDate ? { endDate: popup.endDate } : {}), eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled', location: { '@type': 'Place', name: popup.venue, address: { '@type': 'PostalAddress', streetAddress: popup.address || popup.venue, addressRegion: popup.region || '', addressCountry: 'KR' } }, url: canonical, ...(popup.imageUrl ? { image: [popup.imageUrl] } : {}) };
  const menuHtml = menus.length ? `<h2>대표 메뉴</h2><ul class="menu">${menus.map(item => `<li>${escapeHtml(item.name || item)}${item.price ? ` · <strong>${escapeHtml(item.price)}</strong>` : ''}</li>`).join('')}</ul>` : '';
  const body = `<span class="eyebrow">${escapeHtml(popup.venueType || '쇼핑시설')} 푸드 팝업</span><h1>${escapeHtml(popup.name)}</h1><p class="lead"><strong>${escapeHtml(popup.venue)}</strong>에서 진행되는 푸드 팝업입니다. 일정과 위치를 확인하고 방문하세요.</p><section class="facts"><div><span>백화점·지점</span><strong>${escapeHtml(popup.venue)}</strong></div><div><span>주소</span><strong>${escapeHtml(popup.address || popup.venue)}</strong></div><div><span>운영 기간</span><strong>${escapeHtml(period)}</strong></div></section>${menuHtml}<div class="actions"><a href="${escapeHtml(popup.sourceUrl)}" rel="noopener noreferrer">공식 정보 확인</a><a class="secondary" href="/">다른 푸드 팝업 보기</a></div>`;
  writePage(route, layout({ title: `${popup.name} | ${popup.venue} 푸드 팝업 일정`, description, canonical, body, schema, image: popup.imageUrl }));
  popupLinks.push({ route, title: `${popup.name} · ${popup.venue}`, lastmod: popup.lastVerifiedAt || popupData.updatedAt?.slice(0, 10) });
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

const listing = (title, description, links) => layout({ title, description, canonical: `${origin}/${links === popupLinks ? 'food-popups' : 'restaurant-reviews'}/`, schema: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: `${origin}/${links === popupLinks ? 'food-popups' : 'restaurant-reviews'}/` }, body: `<span class="eyebrow">먹당 검색 가이드</span><h1>${title}</h1><p class="lead">${description}</p><ul class="menu">${links.map(item => `<li><a href="${item.route}">${escapeHtml(item.title)}</a></li>`).join('')}</ul>` });
fs.writeFileSync('food-popups/index.html', listing('전국 푸드 팝업 일정', '백화점과 쇼핑몰에서 열리는 최신 푸드 팝업의 기간과 지점을 확인하세요.', popupLinks));
fs.writeFileSync('restaurant-reviews/index.html', listing('식당 리뷰와 주소', '먹당에서 많이 찾는 식당의 위치와 방문자 리뷰 정보를 확인하세요.', restaurantLinks));

const urls = [{ route: '/', lastmod: popupData.updatedAt?.slice(0, 10) }, { route: '/food-popups/', lastmod: popupData.updatedAt?.slice(0, 10) }, { route: '/restaurant-reviews/' }, ...popupLinks, ...restaurantLinks];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item => `  <url><loc>${origin}${item.route}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync('sitemap.xml', sitemap);
console.log(`SEO 페이지 ${popupLinks.length}개 팝업, ${restaurantLinks.length}개 식당 생성`);
