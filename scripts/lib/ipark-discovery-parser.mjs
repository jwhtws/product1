const decodeFlight = html => String(html || '').replace(/\\"/gu, '"').replace(/\\u0026/gu, '&');

export function parseIparkDiscoveryCandidates(html) {
  const decoded = decodeFlight(html);
  const candidates = new Map();
  for (const match of decoded.matchAll(/href":"\/popup\/(\d+)"[^\n]{0,500}?aria-label":"([^"]+) 상세 보기"/gu)) {
    const name = match[2].trim();
    if (/(?:말차|베이커리|디저트|카페|커피|빵|케이크|쿠키|도넛|건어|마켓|푸드|식품|떡|음료|아이스크림|젤라또)/iu.test(name)) candidates.set(match[1], { id: match[1], name });
  }
  return [...candidates.values()];
}

const field = (text, name) => text.match(new RegExp(`"${name}":"([^"]*)"`, 'u'))?.[1]?.trim() || '';

export function parseIparkPopupDetail(html, detailUrl) {
  const decoded = decodeFlight(html);
  const categoryIndex = decoded.indexOf('"category":"FOOD"');
  if (categoryIndex < 0) return null;
  const block = decoded.slice(Math.max(0, categoryIndex - 2000), categoryIndex + 4000);
  const category = field(block, 'category');
  const name = field(block, 'name');
  const startDate = field(block, 'openDate');
  const endDate = field(block, 'closeDate');
  if (category !== 'FOOD' || !name || !/^20\d{2}-\d{2}-\d{2}$/u.test(startDate) || !/^20\d{2}-\d{2}-\d{2}$/u.test(endDate)) return null;
  return { sourceItemId: detailUrl.match(/\/popup\/(\d+)/u)?.[1] || detailUrl, name, description: field(block, 'description'), address: field(block, 'address'), startDate, endDate, sourceUrl: field(block, 'sourceUrl') || detailUrl, imageUrl: field(block, 'photoOrigin') === 'PLACEHOLDER' ? '' : field(block, 'imageUrl'), latitude: Number(field(block, 'latitude')), longitude: Number(field(block, 'longitude')) };
}
