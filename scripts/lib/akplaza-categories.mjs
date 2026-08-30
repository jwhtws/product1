const FALLBACK_CATEGORIES = [
  { code: '11', label: '식품관', isFood: true },
  { code: '12', label: '식품', isFood: true },
  { code: '22', label: '팝토피아', isFood: false }
];

export function parseAkPlazaPopupCategories(html = '') {
  const categories = new Map(FALLBACK_CATEGORIES.map(category => [category.code, category]));
  const categoryPattern = /clickCategory\(\s*['"]([^'"]+)['"]\s*\)[^>]*value=["']([^"']+)["']/giu;
  for (const match of String(html).matchAll(categoryPattern)) {
    const code = match[1].trim();
    const label = match[2].replace(/&amp;/giu, '&').replace(/<[^>]+>/gu, '').trim();
    if (!code || code === 'ALL' || !/식품|푸드|팝/iu.test(label)) continue;
    categories.set(code, { code, label, isFood: /식품|푸드/iu.test(label) });
  }
  return [...categories.values()];
}
