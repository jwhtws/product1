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
  malls: ['타임스퀘어 공식 사이트맵'],
  premiumoutlets: ['신세계사이먼 프리미엄 아울렛'],
  ifc: ['IFC몰'],
  doota: ['두타몰'],
  'brand-cj-cheiljedang': ['브랜드 공식 · CJ제일제당 뉴스룸'],
  'brand-samyang-foods': ['브랜드 공식 · 삼양식품 미디어'],
  'brand-orion': ['브랜드 공식 · 오리온 뉴스룸'],
  'brand-ediya': ['브랜드 공식 · 이디야커피 뉴스'],
  'brand-pulmuone': ['브랜드 공식 · 풀무원 뉴스룸'],
  'brand-kyochon': ['브랜드 공식 · 교촌치킨 소식'],
  batch3: [
    '팝업 전문 공간 · 문화역서울284',
    '팝업 전문 공간 · 문화비축기지',
    '팝업 전문 공간 · 노들섬',
    '팝업 전문 공간 · 피크닉',
    '팝업 전문 공간 · 아모레성수',
    '팝업 전문 공간 · KT&G 상상마당',
    '팝업 전문 공간 · 현대카드 STORAGE',
    '팝업 전문 공간 · 서울숲 커뮤니티센터'
  ]
});

export function selectCollectors(collectors, scope = '') {
  if (!scope) return [...collectors];
  const selected = COLLECTOR_SCOPES[scope];
  if (!selected) throw new Error(`지원하지 않는 --retailer 값: ${scope} (${Object.keys(COLLECTOR_SCOPES).join(', ')} 중 선택)`);
  const names = new Set(selected);
  return collectors.filter(([name]) => names.has(name));
}
