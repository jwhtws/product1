const popupPattern = /(팝업(?:\s*스토어)?|POP[\s-]*UP(?:\s*STORE)?)/iu;

export const hyundaiDirectBranches = [{
  branchCode: 'B00146000',
  cmsDomainCode: 'D4602608451930',
  storeCode: '460',
  venue: '더현대 대구',
  address: '대구광역시 중구 달구벌대로 2077'
}];

export function hyundaiBranchApiUrl(branch, page = 1, pageSize = 100) {
  const query = new URLSearchParams({
    apiID: 'ifAppHdcms012',
    param: `mblDmCd=${branch.cmsDomainCode}&evntCrdTypeCd=01&pageSize=${pageSize}&page=${page}`
  });
  return `https://www.ehyundai.com/newPortal/SN/GetCmsContentsAJX.do?${query}`;
}

const cmsDate = value => {
  const digits = String(value || '').match(/^(20\d{2})(\d{2})(\d{2})/u);
  return digits ? `${digits[1]}-${digits[2]}-${digits[3]}` : '';
};

export function parseHyundaiBranchItems(payload, branch, { keepSince = '0000-00-00', seen = new Set() } = {}) {
  const items = Array.isArray(payload?.result?.items) ? payload.result.items : [];
  const rows = [];
  for (const item of items) {
    const id = String(item?.evntCrdCd || '').trim();
    const rawName = String(item?.evntCrdNm || '').replace(/\s+/gu, ' ').trim();
    const floorCode = String(item?.evntFlrCd?.value || '');
    if (!id || seen.has(id) || !popupPattern.test(rawName) || floorCode !== 'MB01') continue;
    const startDate = cmsDate(item.expsEvntStartDt || item.evntStrtDt);
    const endDate = cmsDate(item.expsEvntEndDt || item.evntEndDt);
    if (!startDate || !endDate || endDate < keepSince) continue;
    seen.add(id);
    const name = rawName.replace(/^\[?\s*POP[\s-]*UP(?:\s*STORE)?\s*\]?\s*/iu, '').trim();
    const imagePath = String(item.imgPath2 || '').replace(/^\/+/, '');
    rows.push({
      id: `hyundai:${id}`,
      name,
      venue: branch.venue,
      venueType: '백화점',
      address: branch.address,
      location: [item.evntFlrCd?.label, item.evntPlceNm].filter(Boolean).join(' · '),
      startDate,
      endDate,
      imageUrl: imagePath ? `https://imgprism.ehyundai.com/${imagePath}` : '',
      sourceName: '현대백화점 공식 쇼핑뉴스',
      sourceUrl: `https://www.ehyundai.com/newPortal/SN/SN_0201000.do?evntCrdCd=${encodeURIComponent(id)}&branchCd=${branch.branchCode}&category=event`,
      sourceGrade: 'official'
    });
  }
  return rows;
}
