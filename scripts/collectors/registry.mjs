export const COLLECTOR_SCOPES = Object.freeze({
  hyundai: ['현대백화점·현대아울렛'],
  lotte: ['롯데 공식 블로그', '롯데백화점·롯데아울렛·롯데몰'],
  shinsegae: ['신세계백화점'],
  starfield: ['스타필드·스타필드시티'],
  galleria: ['갤러리아'],
  akplaza: ['AK플라자'],
  eland: ['NC·뉴코아'],
  ipark: ['아이파크몰'],
  emart: ['이마트·트레이더스'],
  lottemart: ['롯데마트'],
  homeplus: ['홈플러스'],
  malls: ['공식 쇼핑몰·마트 사이트맵']
});

export function selectCollectors(collectors, scope = '') {
  if (!scope) return [...collectors];
  const selected = COLLECTOR_SCOPES[scope];
  if (!selected) throw new Error(`지원하지 않는 --retailer 값: ${scope} (${Object.keys(COLLECTOR_SCOPES).join(', ')} 중 선택)`);
  const names = new Set(selected);
  return collectors.filter(([name]) => names.has(name));
}
