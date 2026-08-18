import { api } from './js/api.js';
import { buildingSitePlan } from './js/site-plan.js?v=20260729-2';
import { popupMapLocations } from './js/popup-map-locations.js?v=20260817-1';

(async function () {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pageSize = 10;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const state = {
    preview: [], all: [], fullLoaded: false, loading: null, page: 1,
    filters: { query: '', region: '', category: '', price: '', sort: 'recommend' },
    current: null, currentPopup: null, progress: '', searchSession: null, searchMode: 'popup', serverUser: null, serverReviews: new Map(),
    serverSaved: [], serverLists: {}, serverProfile: {}, reviewSummaries: new Map(), popularRestaurantCount: 0, popularRestaurants: [],
    popups: [], popupUpdatedAt: null, popupSearchQuery: '', popupQuickFilter: '', popupHomeCategoryFilter: '', popupRetailerFilter: '',
    popupEndingOnly: false, popupNewOnly: false, popupNearbyOnly: false, nearbyRegion: '', nearbyEnabled: false, seoRestaurantIds: new Set()
  };
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(`meokdang-${key}`)) ?? fallback; } catch { return fallback; } },
    set(key, value) { localStorage.setItem(`meokdang-${key}`, JSON.stringify(value)); }
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const apiOrigin = location.hostname.endsWith('github.io') ? 'https://mukdang.com' : '';
  const publicApiUrl = path => `${apiOrigin}${path}`;
  const searchKey = value => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
  const initials = value => [...String(value ?? '')].map(char => {
    const code = char.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(code / 588)] : char;
  }).join('');
  const pairs = text => {
    const result = [];
    for (let index = 0; index < text.length - 1; index += 1) result.push(text.slice(index, index + 2));
    return result;
  };
  function similarity(left, right) {
    if (left.length < 3 || right.length < 3) return 0;
    const leftPairs = pairs(left), rightSet = new Set(pairs(right));
    const overlap = leftPairs.filter(pair => rightSet.has(pair)).length;
    return (2 * overlap) / (leftPairs.length + Math.max(1, right.length - 1));
  }
  const branchlessKey = value => String(value || '').replace(/(?:본점|직영점|본관|메인점)$/u, '');
  // Entity aliases are query intent signals, not plain substring synonyms.
  // Keep this map deliberately narrow; aliases may be expanded from verified
  // search analytics without changing the ranking algorithm.
  const entityAliases = new Map([
    ['미진', ['광화문미진']]
  ]);
  function relevanceScore(query, restaurant) {
    const name = searchKey(restaurant.name);
    const address = searchKey(restaurant.address);
    const category = searchKey(restaurant.category);
    if (name === query) return 1000;
    if (entityAliases.get(query)?.some(entity => name.startsWith(entity))) return 980;
    // A complete suffix is often the actual brand people remember
    // (e.g. "미진" -> "광화문미진"). Rank it above generic prefix matches.
    if (name.endsWith(query)) return 950;
    if (name.startsWith(query)) return 920;
    if (name.includes(query)) return 850;
    if (initials(name).startsWith(query)) return 800;
    if (address.includes(query)) return 700;
    if (category.includes(query)) return 650;
    const score = similarity(query, name);
    if (query.slice(0, 3) === name.slice(0, 3) && score >= .2) return 600 + Math.round(score * 100);
    if (score >= .52) return 500 + Math.round(score * 100);
    return 0;
  }
  function relevance(query, restaurant) {
    if (!query) return 1;
    const core = branchlessKey(query);
    return Math.max(relevanceScore(query, restaurant), core && core !== query ? relevanceScore(core, restaurant) : 0);
  }
  const hash = value => [...String(value)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const seoSlug = (label, id) => `${String(label).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70)}-${Math.abs(hash(id))}`;
  const popupSeoUrl = popup => `/food-popups/${seoSlug(`${popup.name}-${popup.venue}`, popup.id)}/`;
  const restaurantSeoUrl = restaurant => `/restaurant-reviews/${seoSlug(`${restaurant.name}-${restaurant.address}`, restaurant.id || `${restaurant.name}-${restaurant.address}`)}/`;
  const isPopupRecord = item => Boolean(item?.id && (item.category === 'food-popup' || item.startDate || item.endDate));
  const legacyIdOf = item => `${item.name}|${item.address}`;
  const idOf = item => legacyIdOf(item);
  const savedIdOf = item => isPopupRecord(item) ? `popup:${item.id}` : idOf(item);
  const roadAddressKey = value => searchKey(String(value || '').split(',')[0].replace(/\([^)]*\)/g, ' '));
  const samePlace = (left, right) => {
    if (searchKey(left.name) !== searchKey(right.name)) return false;
    const leftAddress = roadAddressKey(left.address), rightAddress = roadAddressKey(right.address);
    return leftAddress === rightAddress ||
      (leftAddress.length >= 10 && rightAddress.startsWith(leftAddress)) ||
      (rightAddress.length >= 10 && leftAddress.startsWith(rightAddress));
  };
  const fileUrl = file => `data/restaurants/${file.replace(/%/g, '%25')}`;
  const searchManifestCache = new Map();
  const searchPageCache = new Map();
  const containsManifestCache = new Map();
  const placeDetailCache = new Map();
  let foodSearchCache;
  async function loadRegion(region) {
    const files = region.files || [region.file];
    const responses = await Promise.all(files.map(file => fetch(`${fileUrl(file)}?v=20260728-4`)));
    const failed = responses.find(response => !response.ok);
    if (failed) throw Error(`${region.name} 데이터 응답 ${failed.status}`);
    return (await Promise.all(responses.map(response => response.json()))).flat();
  }

  function cleanName(value) {
    let name = String(value ?? '').trim();
    while (name.startsWith('(')) {
      let depth = 0, end = -1;
      for (let i = 0; i < name.length; i += 1) {
        if (name[i] === '(') depth += 1;
        if (name[i] === ')' && --depth === 0) { end = i; break; }
      }
      if (end < 0) break;
      name = name.slice(end + 1).trim();
    }
    return name.replace(/^[\s.,·•:;|_]+|[\s.,·•:;|_]+$/g, '').trim() || String(value ?? '').trim();
  }
  function isPublicFacingRestaurant(restaurant) {
    const name = String(restaurant?.name || '').replace(/\s+/g, ' ').trim();
    const privateFacility = /구내\s*식당|직원\s*식당|사원\s*식당|임직원\s*식당|노무자\s*급식소|기숙사\s*식당|현장\s*식당|함바(?:식당)?/i;
    const trainingFacility = /(?:수련원|연수원).*(?:구내)?식당|(?:구내)?식당.*(?:수련원|연수원)/;
    const corporateNumberedCafeteria = /^\s*\((?:주|사|유|재)\).+\s식당\s*\d+\s*$/;
    return !privateFacility.test(name) && !trainingFacility.test(name) && !corporateNumberedCafeteria.test(name);
  }
  function enrich(list) {
    return list.filter(r => r.name && searchKey(r.name) && isPublicFacingRestaurant(r)).map(r => {
      const name = cleanName(r.name);
      const seed = Math.abs(hash(`${name}${r.address}`));
      return { ...r, name, price: seed % 3 + 1, rating: (3.6 + (seed % 14) / 10).toFixed(1) };
    });
  }
  function mixPreviews(data) {
    const groups = Object.values(data), mixed = [];
    for (let i = 0; i < 20; i += 1) groups.forEach(group => group[i] && mixed.push(group[i]));
    return mixed;
  }
  async function loadPopularRestaurants() {
    let baseline = [];
    try {
      const baselineResponse = await fetch('data/popular-restaurants.json?v=20260730-1');
      if (baselineResponse.ok) baseline = enrich(await baselineResponse.json());
    } catch {}
    if (baseline.length) {
      state.popularRestaurantCount = baseline.length;
      state.seoRestaurantIds = new Set(baseline.map(restaurant => idOf(restaurant)));
      state.popularRestaurants = baseline;
      state.preview = baseline.concat(state.preview.filter(restaurant =>
        !baseline.some(candidate => samePlace(candidate, restaurant))
      ));
      state.all = state.preview;
    }
    try {
      const response = await fetch(publicApiUrl('/api/events?type=popular-searches'));
      if (!response.ok) return;
      const data = await response.json();
      const searches = Array.isArray(data.searches) ? data.searches.slice(0, 14) : [];
      if (!searches.length) return;
      const candidates = await Promise.all(searches.map(async search => {
        const query = searchKey(search.query);
        const local = state.preview.find(restaurant => relevance(query, restaurant) >= 850);
        if (local) return { ...local, searchCount: search.count };
        try {
          const placeResponse = await fetch(publicApiUrl(`/api/search?q=${encodeURIComponent(search.query)}`));
          if (!placeResponse.ok) return null;
          const placeData = await placeResponse.json();
          const match = (placeData.results || []).find(restaurant => relevance(query, restaurant) >= 850);
          return match ? { ...match, searchCount: search.count } : null;
        } catch {
          return null;
        }
      }));
      const popular = enrich(candidates.filter(Boolean)).filter((restaurant, index, rows) =>
        rows.findIndex(candidate => samePlace(candidate, restaurant)) === index
      );
      if (!popular.length) return;
      state.popularRestaurantCount = popular.length;
      state.popularRestaurants = popular;
      state.preview = popular.concat(state.preview.filter(restaurant =>
        !popular.some(candidate => samePlace(candidate, restaurant))
      ));
      state.all = state.preview;
    } catch {
      // 검색 통계를 사용할 수 없을 때는 검증된 공공데이터 미리보기를 유지한다.
    }
  }
  async function mergeFoodSearchResults(query) {
    if (!foodSearchCache) {
      foodSearchCache = fetch('data/food-search.json?v=20260730-1')
        .then(response => response.ok ? response.json() : {});
    }
    const index = await foodSearchCache;
    const queryKey = searchKey(query);
    const equivalentFoods = [
      ['돈가스', '돈까스'],
      ['초밥', '스시'],
      ['짜장면', '자장면']
    ];
    const queryFoods = new Set([queryKey]);
    equivalentFoods.forEach(group => {
      if (group.some(food => searchKey(food) === queryKey)) group.forEach(food => queryFoods.add(searchKey(food)));
    });
    const matchedFoods = Object.keys(index).filter(food => {
      const foodKey = searchKey(food);
      return [...queryFoods].some(candidate => candidate === foodKey || candidate.includes(foodKey) || foodKey.includes(candidate));
    });
    if (!matchedFoods.length) return;
    const foodRows = enrich(matchedFoods.flatMap(food => index[food] || []));
    const existing = new Set(state.all.map(idOf));
    state.all = foodRows.filter(row => !existing.has(idOf(row))).concat(state.all);
  }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function savedIds() {
    const raw = state.serverUser ? state.serverSaved : store.get('saved', []);
    return [...new Set(raw)];
  }
  async function saveUserData(key, value) {
    if (!state.serverUser) return store.set(key, value);
    await api(`/api/user-data/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
  }
  async function loadUserData() {
    if (!state.serverUser) return;
    const result = await api('/api/user-data');
    state.serverSaved = Array.isArray(result.data.saved) ? result.data.saved : [];
    state.serverLists = result.data.lists && typeof result.data.lists === 'object' ? result.data.lists : {};
    state.serverProfile = result.data.profile && typeof result.data.profile === 'object' ? result.data.profile : {};
    Object.assign(state.serverUser, state.serverProfile);
    updateSavedCount();
  }
  function isSaved(r) {
    const saved = savedIds();
    return saved.includes(savedIdOf(r)) || (isPopupRecord(r) && saved.includes(legacyIdOf(r)));
  }
  function updateSavedCount() { $('#saved-count').textContent = savedIds().length; }
  function syncSavedUi(item) {
    const saved = isSaved(item);
    if (isPopupRecord(item)) {
      $$('[data-home-save], [data-search-save]').filter(button =>
        button.dataset.homeSave === item.id || button.dataset.searchSave === item.id
      ).forEach(button => {
        button.classList.toggle('is-saved', saved);
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute('aria-label', `${item.title || item.name} ${saved ? '저장 취소' : '저장'}`);
        button.textContent = saved ? '♥' : '♡';
      });
      $$('[data-popup-save]').filter(button => button.dataset.popupSave === item.id).forEach(button => {
        button.classList.toggle('is-saved', saved);
        button.setAttribute('aria-pressed', String(saved));
        button.textContent = saved ? '저장됨' : '저장';
      });
    }
  }
  function renderHomeRankings() {
    const searches = state.popularRestaurants.slice(0, 5);
    const measuredSearches = state.popularRestaurants.filter(restaurant => Number(restaurant.searchCount) > 0).slice(0, 5);
    const quickSearchEl = $('#popular-quick-searches');
    if (quickSearchEl) quickSearchEl.innerHTML = measuredSearches.length
      ? `<span>인기 검색</span>${measuredSearches.map(restaurant =>
          `<button type="button" data-quick-restaurant="${escapeHtml(restaurant.name)}">${escapeHtml(restaurant.name)}</button>`
        ).join('')}`
      : '<span>인기 검색</span><small>검색 순위를 집계하고 있습니다.</small>';
    const searchEl = $('#popular-searches');
    if (searchEl) searchEl.innerHTML = searches.length ? searches.map((restaurant, index) =>
      `<button type="button" data-ranking-restaurant="${escapeHtml(restaurant.name)}"><b>${index + 1}</b><strong>${escapeHtml(restaurant.name)}</strong><span>${Number(restaurant.searchCount || 0).toLocaleString('ko-KR')}회 검색</span></button>`
    ).join('') : '<p class="ranking-empty">검색 순위를 집계하고 있습니다.</p>';

    const allReviews = [...state.serverReviews.values()].flat();
    const reviewRows = (rows, emptyText) => rows.length ? rows.slice(0, 5).map((review, index) =>
      `<div class="ranking-review"><b>${index + 1}</b><div><strong>${escapeHtml(review.restaurant)}</strong><p>${escapeHtml(review.text)}</p></div><span>★ ${review.rating}</span></div>`
    ).join('') : `<p class="ranking-empty">${emptyText}</p>`;
    const latestEl = $('#latest-reviews'), popularEl = $('#popular-reviews');
    if (latestEl) latestEl.innerHTML = reviewRows([...allReviews].sort((a, b) => b.createdAt - a.createdAt), '아직 등록된 리뷰가 없습니다.');
    if (popularEl) popularEl.innerHTML = reviewRows([...allReviews].sort((a, b) => (b.helpful || 0) - (a.helpful || 0) || b.rating - a.rating), '유용한 리뷰가 곧 표시됩니다.');
    $$('[data-ranking-restaurant]').forEach(button => button.addEventListener('click', () => {
      $('#search-input').value = button.dataset.rankingRestaurant;
      applySearch();
    }));
    $$('[data-quick-restaurant]').forEach(button => button.addEventListener('click', () => {
      $('#search-input').value = button.dataset.quickRestaurant;
      applySearch();
    }));
  }
  async function toggleSaved(r, { renderPage = true } = {}) {
    const saved = savedIds(), id = savedIdOf(r), exists = isSaved(r);
    const aliases = isPopupRecord(r) ? new Set([id, legacyIdOf(r)]) : new Set([id]);
    const next = exists ? saved.filter(x => !aliases.has(x)) : [...saved.filter(x => !aliases.has(x)), id];
    if (state.serverUser) state.serverSaved = next;
    await saveUserData('saved', next);
    api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'save', detail: `${exists ? '삭제' : '저장'}: ${r.name}` }) }).catch(() => {});
    updateSavedCount();
    syncSavedUi(r);
    toast(exists ? '저장 목록에서 삭제했어요.' : '가고 싶은 곳에 저장했어요.');
    if (renderPage) render();
  }
  function recordPopularity(restaurants) {
    const popularity = store.get('popularity', {});
    restaurants.forEach((restaurant, index) => {
      const id = idOf(restaurant);
      popularity[id] = (popularity[id] || 0) + Math.max(1, 10 - index);
    });
    store.set('popularity', popularity);
  }
  function priceText(price) { return '₩'.repeat(Number(price)); }
  function permitDateInfo(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const opened = new Date(`${value}T00:00:00`);
    if (Number.isNaN(opened.getTime()) || opened > new Date()) return null;
    const now = new Date();
    let years = now.getFullYear() - opened.getFullYear();
    let months = now.getMonth() - opened.getMonth();
    if (now.getDate() < opened.getDate()) months -= 1;
    if (months < 0) { years -= 1; months += 12; }
    const duration = years > 0 ? `${years}년 영업 중` : '1년 미만 영업 중';
    return {
      formatted: new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(opened),
      duration
    };
  }
  function polygonRings(geometry) {
    if (geometry?.type === 'Polygon') return geometry.coordinates || [];
    if (geometry?.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
    return [];
  }
  function buildingDrawing(geometry) {
    const rings = polygonRings(geometry);
    const points = rings.flat().filter(pair => Array.isArray(pair) && pair.length >= 2)
      .map(pair => [Number(pair[0]), Number(pair[1])]).filter(pair => pair.every(Number.isFinite));
    if (!points.length) return null;
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const centerLat = (minY + maxY) / 2;
    const metersX = Math.max((maxX - minX) * 111320 * Math.cos(centerLat * Math.PI / 180), 0.5);
    const metersY = Math.max((maxY - minY) * 110540, 0.5);
    const lonScale = metersX / Math.max(maxX - minX, 0.000000001);
    const latScale = metersY / Math.max(maxY - minY, 0.000000001);
    const margin = Math.max(6, Math.min(18, Math.max(metersX, metersY) * 0.22));
    const canvasWidth = metersX + margin * 2;
    const canvasHeight = metersY + margin * 2;
    const paths = rings.map(ring => ring.map((point, index) => {
      const x = margin + (Number(point[0]) - minX) * lonScale;
      const y = margin + metersY - (Number(point[1]) - minY) * latScale;
      return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ') + ' Z').join(' ');
    const carX = Math.max(1, margin - 5), carY = canvasHeight - Math.max(2.5, margin * 0.45);
    const personX = canvasWidth - Math.max(2.2, margin * 0.4), personY = canvasHeight - Math.max(3, margin * 0.45);
    return {
      widthM: metersX,
      depthM: metersY,
      svg: `<svg class="building-shape" viewBox="0 0 ${canvasWidth.toFixed(2)} ${canvasHeight.toFixed(2)}" role="img" aria-label="실제 건물 외곽과 같은 축척의 자동차 및 사람">
        <path class="actual-footprint" d="${paths}"/>
        <g class="scale-car-real" aria-label="길이 4.5미터 자동차"><rect x="${carX.toFixed(2)}" y="${(carY - 1.8).toFixed(2)}" width="4.5" height="1.8" rx=".35"/><circle cx="${(carX + 1).toFixed(2)}" cy="${carY.toFixed(2)}" r=".35"/><circle cx="${(carX + 3.5).toFixed(2)}" cy="${carY.toFixed(2)}" r=".35"/></g>
        <g class="scale-person-real" aria-label="키 1.7미터 사람"><circle cx="${personX.toFixed(2)}" cy="${(personY - 1.42).toFixed(2)}" r=".28"/><path d="M${personX.toFixed(2)} ${(personY - 1.12).toFixed(2)}v.7m-.45-.3m.45.3l.45-.3m-.45 0l-.38.82m.38-.82l.38.82"/></g>
        <text x="${(carX + 2.25).toFixed(2)}" y="${(carY - 2.35).toFixed(2)}">차량 4.5m</text><text x="${personX.toFixed(2)}" y="${(personY - 2.05).toFixed(2)}">사람 1.7m</text>
      </svg>`
    };
  }
  async function loadBuildingSite(address) {
    const target = $('#building-site-plan');
    if (!target) return;
    try {
      const response = await fetch(publicApiUrl(`/api/building?address=${encodeURIComponent(naverMapAddress(address))}`));
      if (!response.ok) throw Error(String(response.status));
      const data = await response.json();
      if (!data.found || !data.geometry) throw Error('not found');
      const info = data.building || {};
      const drawing = buildingDrawing(data.geometry);
      if (!drawing) throw Error('invalid geometry');
      const facts = [
        ['용도', info.use],
        ['건축면적', info.areaM2 ? `${Number(info.areaM2).toLocaleString('ko-KR')}㎡` : ''],
        ['연면적', info.totalAreaM2 ? `${Number(info.totalAreaM2).toLocaleString('ko-KR')}㎡` : ''],
        ['층수', [info.floorsAbove ? `지상 ${info.floorsAbove}층` : '', info.floorsBelow ? `지하 ${info.floorsBelow}층` : ''].filter(Boolean).join(' · ')],
        ['높이', info.heightM ? `${info.heightM}m` : ''],
        ['외곽 크기', `약 ${drawing.widthM.toFixed(1)} × ${drawing.depthM.toFixed(1)}m`]
      ].filter(([, value]) => value);
      const landArea = Number(info.landAreaM2);
      const buildingArea = Number(info.areaM2);
      const openArea = Number.isFinite(landArea) && Number.isFinite(buildingArea) ? Math.max(0, landArea - buildingArea) : null;
      const possibleSpaces = openArea !== null ? Math.floor(openArea / 25) : null;
      const parking = target.querySelector('.parking-assessment');
      if (parking) {
        const label = possibleSpaces === null ? '주차 가능 여부 확인 필요'
          : possibleSpaces >= 1 ? `외부 주차 여유 가능성 · 약 ${possibleSpaces}대 규모`
            : '대지 여유면적 기준 주차 가능성 낮음';
        const detail = openArea === null ? '공개 대지면적 또는 건축면적 없음'
          : `대지 여유면적 약 ${openArea.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}㎡ 기준`;
        parking.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)} · 출입구와 실제 주차구획은 지도 확인 필요</span>`;
        parking.classList.toggle('possible', possibleSpaces >= 1);
      }
      const status = target.querySelector('.gis-building-status');
      if (status) status.innerHTML = `<strong>VWorld 실제 건물정보</strong><dl class="building-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
      target.classList.add('loaded');
    } catch {
      const status = target.querySelector('.gis-building-status');
      if (status) status.textContent = 'VWorld 일시 장애 · 평면도는 공공 인허가 정보 기준 추정';
      const parking = target.querySelector('.parking-assessment');
      if (parking) parking.innerHTML = '<strong>주차 가능 여부 확인 필요</strong><span>VWorld 대지정보 장애로 현재 계산할 수 없음</span>';
    }
  }
  const categoryLabel = r => String(r.category || '음식점').replace(/\s+/g, ' ').trim();

  function filtered() {
    const f = state.filters, q = searchKey(f.query);
    let rows = state.all.map(r => ({ restaurant: r, relevance: relevance(q, r) })).filter(item =>
      item.relevance > 0 &&
      (!f.region || item.restaurant.address?.startsWith(f.region)) &&
      (!f.category || item.restaurant.category?.includes(f.category)) &&
      (!f.price || String(item.restaurant.price) === f.price)
    );
    const popularity = store.get('popularity', {});
    rows.sort((a, b) => {
      if (q && b.relevance !== a.relevance) return b.relevance - a.relevance;
      const left = a.restaurant, right = b.restaurant;
      if (q && (right.liveSearchRank || 0) !== (left.liveSearchRank || 0)) return (right.liveSearchRank || 0) - (left.liveSearchRank || 0);
      if (q && (right.foodSearchRank || 0) !== (left.foodSearchRank || 0)) return (right.foodSearchRank || 0) - (left.foodSearchRank || 0);
      if (f.sort === 'name') return left.name.localeCompare(right.name, 'ko');
      if (f.sort === 'rating') return right.rating - left.rating;
      if (f.sort === 'tenure') {
        const leftDate = Date.parse(left.permitDate || '');
        const rightDate = Date.parse(right.permitDate || '');
        if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) return leftDate - rightDate;
        if (Number.isFinite(leftDate)) return -1;
        if (Number.isFinite(rightDate)) return 1;
      }
      return (Number(isSaved(right)) - Number(isSaved(left))) ||
        ((right.searchCount || 0) - (left.searchCount || 0)) ||
        ((popularity[idOf(right)] || 0) - (popularity[idOf(left)] || 0)) ||
        right.rating - left.rating;
    });
    return rows.map(item => item.restaurant);
  }
  function card(r, index) {
    const permit = permitDateInfo(r.permitDate);
    const reviewSummary = state.reviewSummaries.get(idOf(r));
    const ratingText = reviewSummary?.count ? `★ ${reviewSummary.average.toFixed(1)}` : '리뷰 없음';
    const ratingDetail = reviewSummary?.count ? `리뷰 ${reviewSummary.count}개` : '첫 리뷰를 기다려요';
    return `<article class="restaurant-card" tabindex="0" data-index="${index}" data-place-key="${Math.abs(hash(idOf(r)))}">
      <div class="listing-photo neutral-photo" data-place-photo data-category-label="${escapeHtml(categoryLabel(r))}"><span data-photo-badge>${escapeHtml(categoryLabel(r))} · 사진 없음</span></div>
      <div class="card-body"><div class="card-top"><span class="category">${escapeHtml(r.category || '음식점')}</span><button class="save ${isSaved(r) ? 'active' : ''}" data-save="${index}" type="button" aria-label="저장">♡</button></div>
      <div class="card-identity"><h3>${state.seoRestaurantIds.has(idOf(r)) ? `<a class="seo-detail-link" href="${escapeHtml(restaurantSeoUrl(r))}">${escapeHtml(r.name)}</a>` : escapeHtml(r.name)}</h3></div><p class="address">${escapeHtml(r.address)}</p>
      <div class="tenure-badge"><span>영업 기간</span><strong>${permit ? escapeHtml(permit.duration) : '인허가일 확인 중'}</strong></div>
      <div class="score"><strong>${ratingText}</strong><span>${ratingDetail}</span><span>${priceText(r.price)}</span></div>
      <div class="tags"><span>${permit ? '인허가일 확인됨' : '영업 정보 확인'}</span></div></div>
    </article>`;
  }
  const koreaToday = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const popupStatusWarnings = new Set();
  const hiddenPopupIds = new Set(['lotte:discovered:0349:SNM00000000000549702']);
  const relatedPopupCache = new Map();
  let popupMapInstance = null;
  function popupStatus(popup) {
    const today = koreaToday();
    const dateStatus = popup.endDate && popup.endDate < today
      ? { key: 'ended', label: '종료' }
      : popup.startDate > today
        ? { key: 'upcoming', label: '오픈 예정' }
        : { key: 'active', label: '진행 중' };
    const feedStatus = { ongoing: 'active', active: 'active', upcoming: 'upcoming', ended: 'ended' }[popup.status];
    if (feedStatus && feedStatus !== dateStatus.key && !popupStatusWarnings.has(popup.id)) {
      popupStatusWarnings.add(popup.id);
      console.warn(`[popup-status] ${popup.id}: feed=${popup.status}, dates=${dateStatus.key}; 날짜 계산을 사용합니다.`);
    }
    return dateStatus;
  }
  function popupFoodType(popup) {
    const text = searchKey(`${popup.name} ${popup.brand || ''}`);
    if (/(베이커리|빵|베이글|케이크|쿠키|도넛|타르트|디저트|마카롱|아이스크림|젤라또|초콜릿)/u.test(text)) return 'bakery';
    if (/(카페|커피|음료|주스|차|티|라떼|와인|맥주)/u.test(text)) return 'drink';
    if (/(떡|약과|한과|모찌)/u.test(text)) return 'tteok';
    if (/(꽈배기|간식)/u.test(text)) return 'snack';
    if (/(분식|김밥|만두|닭강정|치킨|국수|라면|고기|족발|맛집|식사)/u.test(text)) return 'meal';
    return 'grocery';
  }
  function popupHomeCategory(popup) {
    const text = searchKey(`${popup.title} ${popup.brand || ''} ${popup.category || ''} ${(popup.tags || []).join(' ')}`);
    if (/(와인|맥주|막걸리|위스키|주류|하이볼)/u.test(text)) return 'alcohol';
    if (/(베이커리|빵|베이글|식빵|소금빵|도넛)/u.test(text)) return 'bakery';
    if (/(디저트|케이크|쿠키|타르트|마카롱|아이스크림|젤라또|초콜릿|떡|약과|한과|모찌)/u.test(text)) return 'dessert';
    if (/(카페|커피|라떼|음료|주스|차|티|에이드)/u.test(text)) return 'cafe';
    if (/(간식|꽈배기|과자|스낵)/u.test(text)) return 'snack';
    return 'meal';
  }
  const popupCategoryLabels = { dessert: '디저트', bakery: '베이커리', meal: '식사', cafe: '카페', alcohol: '주류', snack: '간식' };
  const popupRegionLabels = {
    '서울특별시': '서울', '경기도': '경기', '인천광역시': '인천', '부산광역시': '부산',
    '대구광역시': '대구', '울산광역시': '울산', '대전광역시': '대전', '광주광역시': '광주',
    '세종특별자치시': '세종', '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
    '전북특별자치도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주'
  };
  const popupRegionName = popup => {
    const addressRegion = String(popup.address || '').trim().split(/\s+/u)[0];
    const aliases = { 서울: '서울특별시', 경기: '경기도', 인천: '인천광역시', 부산: '부산광역시', 대구: '대구광역시', 울산: '울산광역시', 대전: '대전광역시', 광주: '광주광역시', 제주: '제주특별자치도' };
    return popupRegionLabels[addressRegion] ? addressRegion : aliases[addressRegion] || addressRegion;
  };
  function popupRetailer(popup) {
    const text = `${popup.sourceName || ''} ${popup.venue || ''}`;
    return [
      ['hyundai', /현대/u], ['lotte', /롯데/u], ['shinsegae', /신세계/u], ['starfield', /스타필드/u],
      ['galleria', /갤러리아/u], ['ak', /(?:AK|에이케이)/iu], ['ifc', /IFC/iu], ['coex', /코엑스|COEX/iu]
    ].find(([, pattern]) => pattern.test(text))?.[0] || '';
  }
  function popupBrandLabel(popup) {
    if (popup.brand) return popup.brand;
    return String(popup.name || '').replace(/\[[^\]]*\]|\bPOP[ -]?UP\b|팝업(?:스토어)?/giu, '').replace(/^\s*[-:·]\s*|\s*[-:·]\s*$/gu, '').trim();
  }
  function popupDayDiff(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(date || ''))) return null;
    const today = Date.parse(`${koreaToday()}T00:00:00Z`);
    return Math.round((Date.parse(`${date}T00:00:00Z`) - today) / 86400000);
  }
  function popupDday(popup) {
    const status = popupStatus(popup);
    if (status.key === 'ended') return '종료됨';
    if (status.key === 'upcoming') {
      const days = popupDayDiff(popup.startDate);
      return days === null ? '오픈 예정' : days === 0 ? '오늘 오픈' : `오픈 D-${days}`;
    }
    const days = popupDayDiff(popup.endDate);
    return days === null ? '상시' : days === 0 ? '오늘 종료' : `D-${days}`;
  }
  function isNewPopup(popup) {
    const registeredAt = popup.firstSeenAt || popup.registeredAt || popup.createdAt;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(registeredAt || ''))) return false;
    const age = -popupDayDiff(registeredAt);
    return age >= 0 && age <= 6;
  }
  function popupFallbackImage(popup) {
    const images = {
      bakery: 'assets/food/western-ai.png', drink: 'assets/food/cafe-ai.png',
      tteok: 'assets/food/japanese-ai.png', snack: 'assets/food/korean-ai.png',
      meal: 'assets/food/korean-ai.png', grocery: 'assets/food/korean-ai.png'
    };
    return images[popupFoodType(popup)];
  }
  function popupPeriodLabel(popup) {
    const format = value => {
      const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
      return match ? `${Number(match[1])}월 ${Number(match[2])}일` : value;
    };
    return `${format(popup.startDate)} ~ ${popup.endDate ? format(popup.endDate) : '종료일 미정'}`;
  }
  function popupMenus(popup) {
    if (Array.isArray(popup.menus)) return popup.menus;
    return Array.isArray(popup.menuItems) ? popup.menuItems.map(item => typeof item === 'string' ? { name: item } : item) : [];
  }
  function popupMenuPriceLabel(item) {
    if (item?.priceText) return item.priceText;
    if (Number.isFinite(item?.price)) return `${item.price.toLocaleString('ko-KR')}원`;
    return item?.price || '';
  }
  function popupLocationLabel(popup) {
    const region = popup.region || '';
    const address = String(popup.address || '');
    const district = address.match(/(?:특별시|광역시|특별자치시|특별자치도|도)\s+([가-힣]+(?:시|군|구))/u)?.[1] || '';
    return [region, district].filter((value, index, values) => value && values.indexOf(value) === index).join(' ')
      || region || '지역 확인 중';
  }
  function popupSearchText(popup) {
    return searchKey([
      popup.title, popup.brand, popup.venue, popup.branch, popupRegionName(popup),
      popup.category, ...(Array.isArray(popup.tags) ? popup.tags : [])
    ].filter(Boolean).join(' '));
  }
  function popupRecommendationScore(popup, query) {
    const status = popupStatus(popup).key;
    let score = status === 'active' ? 60 : status === 'upcoming' ? 40 : 0;
    if (popup.isNew === true || isNewPopup(popup)) score += 18;
    if (popup.isEndingSoon === true) score += 10;
    if (popup.image || popup.imageUrl) score += 5;
    if (query) {
      const title = searchKey(popup.title);
      const brand = searchKey(popup.brand);
      if (title === query || brand === query) score += 100;
      else if (title.startsWith(query) || brand.startsWith(query)) score += 70;
      else if (title.includes(query) || brand.includes(query)) score += 45;
    }
    return score;
  }
  function popupRows() {
    const query = searchKey(state.popupSearchQuery);
    const categoryFilter = $('#popup-food-filter')?.value || '';
    const regionFilter = searchKey($('#popup-region-filter')?.value || '');
    const statusFilter = $('#popup-status-filter')?.value || '';
    const venueFilter = $('#popup-venue-filter')?.value || '';
    const sort = $('#popup-sort-filter')?.value || 'recommend';
    const order = { active: 0, upcoming: 1, ended: 2 };
    return state.popups.filter(popup =>
      (!query || popupSearchText(popup).includes(query)) &&
      (!categoryFilter || popupHomeCategory(popup) === categoryFilter) &&
      (!regionFilter || searchKey(popupRegionName(popup)).includes(regionFilter)) &&
      (!statusFilter || popupStatus(popup).key === statusFilter) &&
      (!venueFilter || (popup.venueType || '') === venueFilter) &&
      (!state.popupHomeCategoryFilter || popupHomeCategory(popup) === state.popupHomeCategoryFilter) &&
      (!state.popupRetailerFilter || popupRetailer(popup) === state.popupRetailerFilter) &&
      (state.popupQuickFilter !== 'ending-today' || popup.endDate === koreaToday()) &&
      (state.popupQuickFilter !== 'nearby' || !state.nearbyRegion || popupRegionName(popup) === state.nearbyRegion) &&
      (!state.popupEndingOnly || popup.endDate === koreaToday()) &&
      (!state.popupNewOnly || popup.isNew === true || isNewPopup(popup)) &&
      (!state.popupNearbyOnly || !state.nearbyRegion || popupRegionName(popup) === state.nearbyRegion)
    ).sort((left, right) => {
      // Closed events always belong after active/upcoming events, regardless
      // of the user's secondary sort choice.
      const leftStatus = popupStatus(left).key;
      const rightStatus = popupStatus(right).key;
      const endedDiff = Number(leftStatus === 'ended') - Number(rightStatus === 'ended');
      if (endedDiff) return endedDiff;
      if (sort === 'recommend') return popupRecommendationScore(right, query) - popupRecommendationScore(left, query) || left.title.localeCompare(right.title, 'ko');
      if (sort === 'food') {
        const typeOrder = { dessert: 0, bakery: 1, meal: 2, cafe: 3, alcohol: 4, snack: 5 };
        return (typeOrder[popupHomeCategory(left)] - typeOrder[popupHomeCategory(right)]) || left.title.localeCompare(right.title, 'ko');
      }
      if (sort === 'ending') return (left.endDate || '9999-12-31').localeCompare(right.endDate || '9999-12-31');
      if (sort === 'newest') return String(right.lastUpdated || right.lastVerifiedAt || right.lastSeenAt || '').localeCompare(String(left.lastUpdated || left.lastVerifiedAt || left.lastSeenAt || '')) || right.startDate.localeCompare(left.startDate);
      if (sort === 'name') return left.title.localeCompare(right.title, 'ko');
      if (sort === 'start') return left.startDate.localeCompare(right.startDate);
      const statusDiff = order[leftStatus] - order[rightStatus];
      if (statusDiff) return statusDiff;
      return leftStatus === 'ended'
        ? (right.endDate || '').localeCompare(left.endDate || '')
        : left.startDate.localeCompare(right.startDate);
    });
  }
  const popupSuggestionLabels = { brand: '브랜드', venue: '장소', region: '지역', category: '카테고리' };
  function popupAutocomplete(query) {
    const key = searchKey(query);
    if (!key) return [];
    const candidates = [];
    const seen = new Set();
    const add = (type, value, force = false) => {
      const label = String(value || '').trim();
      const identity = `${type}:${searchKey(label)}`;
      if (!label || seen.has(identity) || (!force && !searchKey(label).includes(key))) return;
      seen.add(identity);
      candidates.push({ type, label, rank: searchKey(label).startsWith(key) ? 0 : 1 });
    };
    state.popups.forEach(popup => {
      add('brand', popup.brand);
      if (searchKey(popup.title).includes(key)) add('brand', popup.brand, true);
      add('venue', popup.venue);
      add('venue', popup.branch);
      add('region', popupRegionName(popup));
      add('category', popupCategoryLabels[popupHomeCategory(popup)]);
    });
    return candidates.sort((left, right) => left.rank - right.rank || left.label.length - right.label.length || left.label.localeCompare(right.label, 'ko')).slice(0, 8);
  }
  function popupRecentSearches() {
    return store.get('popup-recent-searches', []).map(item => typeof item === 'string'
      ? { query: item, type: 'query', updatedAt: '' }
      : item).filter(item => item?.query).slice(0, 10);
  }
  function recordPopupSearch(query, type = 'query') {
    const value = String(query || '').trim();
    if (!value) return;
    const next = [{ query: value, type, updatedAt: new Date().toISOString() }, ...popupRecentSearches().filter(item => searchKey(item.query) !== searchKey(value))].slice(0, 10);
    // Structured entries allow a signed-in account adapter to merge this list later.
    store.set('popup-recent-searches', next);
  }
  function popupPopularSearches() {
    const active = state.popups.filter(popup => popupStatus(popup).key !== 'ended');
    const counts = new Map();
    const add = (type, value, weight = 1) => {
      const label = String(value || '').trim();
      if (!label) return;
      const id = `${type}:${label}`;
      const current = counts.get(id) || { type, query: label, count: 0 };
      current.count += weight;
      counts.set(id, current);
    };
    active.forEach(popup => {
      add('brand', popup.brand, 3);
      add('region', popupRegionName(popup), 2);
      add('category', popupCategoryLabels[popupHomeCategory(popup)]);
    });
    return [...counts.values()].sort((left, right) => right.count - left.count || left.query.localeCompare(right.query, 'ko')).slice(0, 6);
  }
  function syncPopupSearchInputs(value = state.popupSearchQuery) {
    ['#search-input', '#popup-search-input'].forEach(selector => {
      const input = $(selector);
      if (input && input.value !== value) input.value = value;
    });
  }
  function applyPopupSearch(query, type = 'query', record = true) {
    state.popupSearchQuery = String(query || '').trim();
    state.filters.query = state.popupSearchQuery;
    state.popupQuickFilter = '';
    state.popupHomeCategoryFilter = '';
    state.popupRetailerFilter = '';
    state.page = 1;
    syncPopupSearchInputs();
    if (record) recordPopupSearch(state.popupSearchQuery, type);
    ['#suggestions', '#popup-search-suggestions'].forEach(selector => {
      const root = $(selector);
      if (root) root.innerHTML = '';
    });
    ['#search-input', '#popup-search-input'].forEach(selector => {
      const input = $(selector);
      if (!input) return;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    });
    render();
  }
  function renderPopupSearchMeta() {
    const recentRoot = $('#popup-recent-searches');
    const popularRoot = $('#popup-popular-searches');
    if (!recentRoot || !popularRoot) return;
    const button = (item, recent = false) => `<button type="button" class="md-chip" data-popup-query="${escapeHtml(item.query)}" data-popup-query-type="${escapeHtml(item.type || 'query')}">${recent ? '<span aria-hidden="true">↗</span>' : ''}${escapeHtml(item.query)}</button>`;
    const recent = popupRecentSearches();
    recentRoot.innerHTML = recent.length ? recent.map(item => button(item, true)).join('') : '<span class="popup-search-hint">아직 검색 기록이 없어요.</span>';
    popularRoot.innerHTML = popupPopularSearches().map(item => button(item)).join('');
    $$('[data-popup-query]').forEach(element => element.addEventListener('click', () => {
      applyPopupSearch(element.dataset.popupQuery, element.dataset.popupQueryType || 'query');
      $('#popup-search-input')?.focus();
    }));
  }
  function renderPopupSuggestions(input, root) {
    const matches = popupAutocomplete(input.value);
    root.innerHTML = matches.map((item, index) => `<button id="popup-suggestion-${root.id}-${index}" type="button" role="option" aria-selected="false" data-popup-autocomplete="${escapeHtml(item.label)}" data-popup-autocomplete-type="${item.type}"><span>${escapeHtml(item.label)}</span><small>${popupSuggestionLabels[item.type]}</small></button>`).join('');
    input.setAttribute('aria-expanded', String(matches.length > 0));
    input.removeAttribute('aria-activedescendant');
    [...root.querySelectorAll('[data-popup-autocomplete]')].forEach(button => button.addEventListener('click', () => {
      applyPopupSearch(button.dataset.popupAutocomplete, button.dataset.popupAutocompleteType);
      input.focus();
    }));
  }
  function handlePopupSuggestionKeydown(event, input, root) {
    const options = [...root.querySelectorAll('[role="option"]')];
    const active = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? (active + 1) % options.length : (active <= 0 ? options.length - 1 : active - 1);
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === next)));
      input.setAttribute('aria-activedescendant', options[next].id);
      options[next].scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (event.key === 'Escape') {
      root.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return true;
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      options[active].click();
      return true;
    }
    return false;
  }
  function popupThumbnailUrl(popup) {
    const officialImageMissing = popup.imageSource === 'official-image-unavailable';
    return popup.image || popup.imageUrl || (officialImageMissing ? '' : popupFallbackImage(popup));
  }
  function popupCard(popup) {
    const status = popupStatus(popup);
    const officialImageMissing = popup.imageSource === 'official-image-unavailable';
    const imageUrl = popupThumbnailUrl(popup);
    const image = imageUrl ? ` style="background-image:url('${escapeHtml(imageUrl).replace(/'/g, '&#39;')}')"` : '';
    const saved = isSaved(popup);
    return `<article class="restaurant-card popup-card popup-${status.key}" tabindex="0" data-popup-id="${escapeHtml(popup.id)}">
        <div class="listing-photo${officialImageMissing ? ' popup-photo-missing' : ''}"${image}><div class="popup-search-card-badges"><span class="popup-status">${status.label}</span>${popup.isNew ? '<span class="popup-search-new">NEW</span>' : ''}</div><button class="popup-save ${saved ? 'is-saved' : ''}" type="button" data-search-save="${escapeHtml(popup.id)}" aria-label="${escapeHtml(popup.title)} ${saved ? '저장 취소' : '저장'}" aria-pressed="${String(saved)}">${saved ? '♥' : '♡'}</button>${officialImageMissing ? '<small>공식 사진 미공개</small>' : ''}</div>
        <div class="card-body">
          <div class="card-top"><span class="category">${escapeHtml(popupCategoryLabels[popupHomeCategory(popup)])}</span><span class="popup-food-type">${escapeHtml(popupDday(popup))}</span></div>
          <p class="popup-card-brand">${escapeHtml(popup.brand)}</p>
          <div class="card-identity"><h3><a class="seo-detail-link" href="${escapeHtml(popupSeoUrl(popup))}">${escapeHtml(popup.title)}</a></h3></div>
          <div class="popup-region-badge">${escapeHtml(popupLocationLabel(popup))}</div>
          <p class="address popup-card-address"><strong>${escapeHtml(popup.venue)}</strong>${popup.branch && popup.branch !== popup.venue ? ` <span>· ${escapeHtml(popup.branch)}</span>` : ''}</p>
          <div class="popup-period">${escapeHtml(popupPeriodLabel(popup))}</div>
        </div>
    </article>`;
  }
  function popupDiscoveryCard(popup, priority = false) {
    const status = popupStatus(popup);
    const imageUrl = popupThumbnailUrl(popup);
    const saved = isSaved(popup);
    const dDay = popupDday(popup);
    const title = popup.title;
    return `<article class="md-card md-card--popup discovery-popup-card popup-${status.key}" tabindex="0" data-home-popup-id="${escapeHtml(popup.id)}" aria-label="${escapeHtml(`${popup.brand} ${title}, ${status.label}, ${dDay}`)}">
      <div class="discovery-popup-image${imageUrl ? '' : ' popup-photo-missing'}">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)} 대표 이미지" width="560" height="360" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : '<small>공식 사진 미제공</small>'}
        <div class="discovery-popup-badges"><span class="md-badge ${status.key === 'active' ? 'md-badge--success' : ''}">${escapeHtml(status.label)}</span>${popup.isNew ? '<span class="md-badge popup-new-badge">NEW</span>' : ''}</div>
        <button class="popup-save ${saved ? 'is-saved' : ''}" type="button" data-home-save="${escapeHtml(popup.id)}" aria-label="${escapeHtml(title)} ${saved ? '저장 취소' : '저장'}" aria-pressed="${String(saved)}">${saved ? '♥' : '♡'}</button>
      </div>
      <div class="discovery-popup-body">
        <div class="popup-card-meta"><span>${escapeHtml(popupCategoryLabels[popupHomeCategory(popup)])}</span><strong>${escapeHtml(dDay)}</strong></div>
        <p class="popup-card-brand">${escapeHtml(popup.brand)}</p>
        <h3>${escapeHtml(title)}</h3>
        <div class="popup-region-badge">${escapeHtml(popupLocationLabel(popup))}</div>
        <p class="popup-card-venue"><strong>${escapeHtml(popup.venue)}</strong>${popup.branch && popup.branch !== popup.venue ? ` <span>· ${escapeHtml(popup.branch)}</span>` : ''}</p>
        <p class="popup-card-period">${escapeHtml(popupPeriodLabel(popup))}</p>
      </div>
    </article>`;
  }
  function discoveryRail(id, title, description, rows, { prioritizeFirst = false, horizontal = false } = {}) {
    if (!rows.length) return '';
    return `<section class="popup-discovery-section" id="${id}">
      <div class="md-section-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><button class="section-more" type="button" data-section-more="${id}">전체 보기</button></div>
      <div class="popup-card-rail${horizontal ? ' popup-card-rail--horizontal' : ''}">${rows.slice(0, 8).map((popup, index) => popupDiscoveryCard(popup, prioritizeFirst && index === 0)).join('')}</div>
    </section>`;
  }
  function popupMapSection() {
    return `<section class="popup-discovery-section popup-map-section" id="popup-map-section"><div class="md-section-header"><div><h2>푸드팝업 지도</h2><p>실제 지도에서 진행 중인 팝업 위치를 확인하세요.</p></div><span id="popup-map-count">위치 확인 중</span></div><div id="popup-map" class="popup-map" role="application" aria-label="진행 중인 푸드팝업 위치 지도"><div class="popup-map-loading">지도와 팝업 위치를 불러오는 중…</div></div></section>`;
  }
  function loadPopupMapLibrary() {
    if (window.L) return Promise.resolve(window.L);
    if (window.popupMapLibraryPromise) return window.popupMapLibraryPromise;
    window.popupMapLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/leaflet/leaflet.js?v=1.9.4';
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('지도 라이브러리를 불러오지 못했습니다.'));
      document.head.append(script);
    });
    return window.popupMapLibraryPromise;
  }
  async function renderPopupMap(rows) {
    const root = $('#popup-map');
    if (!root) return;
    const mapVenueName = popup => popupMapLocations.get(popup.venue)?.name || popup.venue;
    const venues = [...rows.reduce((map, popup) => {
      const key = mapVenueName(popup) || popup.address;
      if (!key) return map;
      if (!map.has(key)) map.set(key, { popup, popups: [], venueName: key });
      map.get(key).popups.push(popup);
      return map;
    }, new Map()).values()];
    try {
      const L = await loadPopupMapLibrary();
      if (!root.isConnected) return;
      if (popupMapInstance) { try { popupMapInstance.remove(); } catch {} popupMapInstance = null; }
      root.innerHTML = '';
      popupMapInstance = L.map(root, { scrollWheelZoom: true, zoomControl: false }).setView([36.35, 127.85], 7);
      const transitTiles = L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors · ÖPNVKarte'
      }).addTo(popupMapInstance);
      const fallbackTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      });
      L.control.zoom({ position: 'bottomright' }).addTo(popupMapInstance);
      L.control.scale({ position: 'bottomleft', imperial: false }).addTo(popupMapInstance);
      let fallbackTilesAdded = false;
      transitTiles.on('tileerror', () => {
        if (fallbackTilesAdded) return;
        fallbackTilesAdded = true;
        transitTiles.remove();
        fallbackTiles.addTo(popupMapInstance);
      });
      const markers = [];
      for (let index = 0; index < venues.length; index += 4) {
        const batch = venues.slice(index, index + 4);
        const results = await Promise.all(batch.map(async group => {
          const { popup, popups, venueName } = group;
          const verifiedLocation = popupMapLocations.get(popup.venue);
          if (verifiedLocation) return { popup, popups, latitude: verifiedLocation.latitude, longitude: verifiedLocation.longitude };
          const hasCoordinates = popup.latitude !== null && popup.latitude !== undefined && popup.latitude !== '' && popup.longitude !== null && popup.longitude !== undefined && popup.longitude !== '' && Number.isFinite(Number(popup.latitude)) && Number.isFinite(Number(popup.longitude));
          if (hasCoordinates) return { popup, popups, latitude: Number(popup.latitude), longitude: Number(popup.longitude) };
          try {
            const response = await fetch(publicApiUrl(`/api/geocode?address=${encodeURIComponent(popup.address || venueName)}&name=${encodeURIComponent(venueName || popup.title)}`), { signal: AbortSignal.timeout(4000) });
            if (response.ok) {
              const point = await response.json();
              if (Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))) return { popup, popups, latitude: Number(point.latitude), longitude: Number(point.longitude) };
            }
          } catch (error) { console.warn('팝업 좌표 조회 실패', popup.id, error); }
          return null;
        }));
        for (const result of results.filter(Boolean)) {
          const popup = result.popup;
          const markerIcon = L.divIcon({ className: 'popup-location-marker', html: '<span aria-hidden="true"></span>', iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });
          const venueName = mapVenueName(popup);
          const marker = L.marker([result.latitude, result.longitude], { icon: markerIcon, title: venueName }).addTo(popupMapInstance);
          marker.bindPopup(`<strong>${escapeHtml(venueName)}</strong><div class="popup-map-popup-list">${result.popups.map(item => `<button type="button" data-leaflet-popup-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`).join('')}</div>`);
          marker.on('popupopen', event => event.popup.getElement()?.querySelectorAll('[data-leaflet-popup-id]').forEach(button => button.addEventListener('click', () => {
            const selected = result.popups.find(item => item.id === button.dataset.leafletPopupId);
            if (selected) openPopupDetail(selected, root);
          })));
          markers.push(marker);
        }
      }
      if (markers.length) popupMapInstance.fitBounds(L.featureGroup(markers).getBounds().pad(.12), { maxZoom: 13 });
      $('#popup-map-count').textContent = `${rows.length}개 팝업 · ${markers.length}곳`;
      if (!markers.length) root.insertAdjacentHTML('beforeend', '<div class="popup-map-empty">표시 가능한 위치가 없습니다.</div>');
    } catch (error) {
      root.innerHTML = `<div class="popup-map-error">지도를 불러오지 못했습니다.<button type="button" data-map-retry>다시 시도</button></div>`;
      root.querySelector('[data-map-retry]')?.addEventListener('click', () => renderPopupMap(rows));
      $('#popup-map-count').textContent = '불러오기 실패';
      console.warn(error);
    }
  }
  function renderPopupDiscovery() {
    const root = $('#popup-home-content');
    if (!root) return;
    if (!state.popups.length) {
      $('#active-popup-count').textContent = '진행 중인 공식 일정 0개';
      root.innerHTML = '<div class="home-premium-empty" role="status"><span aria-hidden="true">✦</span><strong>새로운 푸드팝업을 확인하고 있어요</strong><p>공식 일정이 확인되는 즉시 이곳에 가장 먼저 소개할게요.</p><button type="button" class="md-button md-button--secondary" data-feed-retry>다시 확인</button></div>';
      root.querySelector('[data-feed-retry]').addEventListener('click', () => location.reload());
      return;
    }
    const active = state.popups.filter(popup => popupStatus(popup).key === 'active');
    const today = koreaToday();
    const editorPickCutoff = new Date(`${today}T00:00:00+09:00`);
    editorPickCutoff.setDate(editorPickCutoff.getDate() - 6);
    const recentEditorPickStart = popup => popup.startDate >= editorPickCutoff.toISOString().slice(0, 10) && popup.startDate <= today;
    const rankedEditorPicks = [...active].sort((a, b) =>
      Number(recentEditorPickStart(b)) - Number(recentEditorPickStart(a))
      || (recentEditorPickStart(a) && recentEditorPickStart(b) ? b.startDate.localeCompare(a.startDate) : 0)
      || (Number(Boolean(b.isNew)) * 4 + Number(Boolean(b.image)) * 2 + Math.min((b.tags || []).length, 5))
      - (Number(Boolean(a.isNew)) * 4 + Number(Boolean(a.image)) * 2 + Math.min((a.tags || []).length, 5))
      || String(a.endDate || '9999-12-31').localeCompare(String(b.endDate || '9999-12-31'))
    );
    const editorPicks = [];
    const appendDiversified = rows => {
      const sources = new Set();
      for (const popup of rows) {
        const source = popup.sourceName || popupRetailer(popup) || popup.id.split(':')[0];
        if (sources.has(source)) continue;
        editorPicks.push(popup);
        sources.add(source);
      }
      for (const popup of rows) if (!editorPicks.includes(popup)) editorPicks.push(popup);
    };
    for (const startDate of [...new Set(rankedEditorPicks.filter(recentEditorPickStart).map(popup => popup.startDate))]) {
      appendDiversified(rankedEditorPicks.filter(popup => popup.startDate === startDate));
    }
    appendDiversified(rankedEditorPicks.filter(popup => !recentEditorPickStart(popup)));
    const endingToday = active.filter(popup => popup.endDate === today);
    const nearby = state.nearbyEnabled && state.nearbyRegion ? active.filter(popup => popupRegionName(popup) === state.nearbyRegion) : [];
    $('#active-popup-count').textContent = `${active.length.toLocaleString('ko-KR')}개 진행 중`;
    const nearbySection = !state.nearbyEnabled ? '' : nearby.length
      ? discoveryRail('nearby-popups', '내 주변 팝업', `${popupRegionLabels[state.nearbyRegion] || state.nearbyRegion}에서 지금 만날 수 있어요`, nearby)
      : `<section class="popup-discovery-section" id="nearby-popups"><div class="home-premium-empty home-premium-empty--compact" role="status"><span aria-hidden="true">⌖</span><strong>이 지역의 진행 중 팝업을 찾지 못했어요</strong><p>다른 지역을 선택하면 새로운 일정을 확인할 수 있어요.</p><button type="button" data-nearby-reselect class="md-button md-button--secondary">지역 다시 선택</button></div></section>`;
    root.innerHTML = [
      discoveryRail('today-discovery', "Editor's Pick", '최근 7일 안에 시작한 일정부터 골랐어요', editorPicks, { prioritizeFirst: true, horizontal: true }),
      discoveryRail('ending-today', '오늘 종료', '오늘이 마지막 영업일인 팝업이에요', endingToday, { horizontal: true }),
      nearbySection,
      popupMapSection()
    ].join('');
    bindPopupDiscovery();
    renderPopupMap(active);
    syncNearbyControls();
  }
  function bindPopupDiscovery() {
    const root = $('#popup-home-content');
    [...root.querySelectorAll('[data-home-popup-id]')].forEach(card => {
      const popup = state.popups.find(item => item.id === card.dataset.homePopupId);
      card.addEventListener('click', event => { if (!event.target.closest('[data-home-save]')) openPopupDetail(popup, card); });
      card.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target === card) { event.preventDefault(); openPopupDetail(popup, card); } });
    });
    [...root.querySelectorAll('[data-home-save]')].forEach(button => button.addEventListener('click', async event => {
      event.stopPropagation();
      const popup = state.popups.find(item => item.id === button.dataset.homeSave);
      await toggleSaved(popup);
    }));
    [...root.querySelectorAll('[data-popup-quick]')].forEach(button => button.addEventListener('click', () => handlePopupQuick(button.dataset.popupQuick)));
    [...root.querySelectorAll('[data-nearby-reselect]')].forEach(button => button.addEventListener('click', () => {
      const picker = $('#nearby-region-picker');
      picker.hidden = false;
      $('#nearby-region').focus();
      picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    [...root.querySelectorAll('[data-region-filter]')].forEach(button => button.addEventListener('click', () => showPopupResults({ region: button.dataset.regionFilter })));
    [...root.querySelectorAll('[data-category-filter]')].forEach(button => button.addEventListener('click', () => showPopupResults({ homeCategory: button.dataset.categoryFilter })));
    [...root.querySelectorAll('[data-section-more]')].forEach(button => button.addEventListener('click', () => {
      const filters = { 'ending-today': { quick: 'ending-today' }, 'nearby-popups': { quick: 'nearby' } };
      showPopupResults(filters[button.dataset.sectionMore] || {});
    }));
  }
  function updateNearbyUrl(region = '') {
    const url = new URL(location.href);
    if (region) url.searchParams.set('nearby', region);
    else url.searchParams.delete('nearby');
    history.replaceState({ ...history.state, nearbyRegion: region || null }, '', `${url.pathname}${url.search}${url.hash}`);
  }
  function syncNearbyControls() {
    const active = state.nearbyEnabled && Boolean(state.nearbyRegion);
    $$('[data-popup-quick="nearby"]').forEach(button => {
      button.classList.toggle('is-active', active);
      button.classList.toggle('md-button--primary', active);
      button.setAttribute('aria-pressed', String(active));
      const detail = button.querySelector('small');
      if (detail) detail.textContent = active ? `${state.nearbyRegion} · 해제하려면 다시 선택` : '지역으로 가까이';
    });
  }
  function showPopupResults({ quick = '', region = '', homeCategory = '', retailer = '', query = '', clearNearby = true } = {}) {
    state.popupQuickFilter = quick;
    state.popupHomeCategoryFilter = homeCategory;
    state.popupRetailerFilter = retailer;
    state.popupSearchQuery = query;
    state.filters.query = query;
    state.popupEndingOnly = false;
    state.popupNewOnly = false;
    state.popupNearbyOnly = false;
    state.page = 1;
    syncPopupSearchInputs(query);
    $('#popup-region-filter').value = region;
    $('#popup-food-filter').value = '';
    $('#popup-status-filter').value = '';
    $('#popup-venue-filter').value = '';
    if (quick === 'nearby') {
      state.nearbyRegion = region || state.nearbyRegion;
      state.nearbyEnabled = Boolean(state.nearbyRegion);
      if (state.nearbyRegion) {
        store.set('nearby-region', state.nearbyRegion);
        updateNearbyUrl(state.nearbyRegion);
      }
    } else if (clearNearby) {
      state.nearbyRegion = '';
      state.nearbyEnabled = false;
      $('#nearby-region').value = '';
      updateNearbyUrl('');
    }
    render();
    syncNearbyControls();
    $('#discover').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function handlePopupQuick(action) {
    if (action === 'nearby') {
      const picker = $('#nearby-region-picker');
      if (!picker.hidden) {
        picker.hidden = true;
        syncNearbyControls();
        return;
      }
      if (state.nearbyEnabled && state.nearbyRegion) {
        picker.hidden = true;
        state.popupQuickFilter = '';
        state.nearbyEnabled = false;
        state.nearbyRegion = '';
        updateNearbyUrl('');
        renderPopupDiscovery();
        syncNearbyControls();
        return;
      }
      const rememberedRegion = state.nearbyRegion || store.get('nearby-region', '');
      if (rememberedRegion && [...$('#nearby-region').options].some(option => option.value === rememberedRegion)) {
        $('#nearby-region').value = rememberedRegion;
        state.nearbyRegion = rememberedRegion;
        state.nearbyEnabled = true;
        store.set('nearby-region', rememberedRegion);
        updateNearbyUrl(rememberedRegion);
        renderPopupDiscovery();
        syncNearbyControls();
        $('#nearby-popups')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      picker.hidden = false;
      $('#nearby-region').focus();
      picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    showPopupResults({ quick: action === 'calendar' ? '' : action });
  }
  async function autoDetectNearbyRegion(availableRegions) {
    if (!navigator.permissions?.query || !navigator.geolocation) return;
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state !== 'granted') return;
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 3000, maximumAge: 900000
      }));
      const centers = [
        ['서울특별시', 37.5665, 126.978], ['경기도', 37.4138, 127.5183], ['인천광역시', 37.4563, 126.7052],
        ['부산광역시', 35.1796, 129.0756], ['대구광역시', 35.8714, 128.6014], ['대전광역시', 36.3504, 127.3845],
        ['광주광역시', 35.1595, 126.8526], ['제주특별자치도', 33.4996, 126.5312]
      ].filter(([region]) => availableRegions.includes(region));
      if (!centers.length) return;
      const latitude = position.coords.latitude, longitude = position.coords.longitude;
      const nearest = centers.map(([region, lat, lon]) => ({ region, distance: Math.hypot(latitude - lat, (longitude - lon) * Math.cos(latitude * Math.PI / 180)) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > 2) return;
      state.nearbyRegion = nearest.region;
      state.nearbyEnabled = true;
      $('#nearby-region').value = nearest.region;
      renderPopupDiscovery();
    } catch {
      // Permission denial and unavailable coordinates keep the explicit region CTA.
    }
  }
  function relatedPopups(popup) {
    const cacheKey = `${popup.id}:${state.popups.length}`;
    if (relatedPopupCache.has(cacheKey)) return relatedPopupCache.get(cacheKey);
    const brand = searchKey(popup.brand);
    const venue = searchKey(popup.venue);
    const region = searchKey(popupRegionName(popup));
    const category = popupHomeCategory(popup);
    const relationshipRank = candidate => {
      if (brand && searchKey(candidate.brand) === brand) return 0;
      if (venue && searchKey(candidate.venue) === venue) return 1;
      if (region && searchKey(popupRegionName(candidate)) === region) return 2;
      if (popupHomeCategory(candidate) === category) return 3;
      return 99;
    };
    const statusRank = candidate => ({ active: 0, upcoming: 1, ended: 2 })[popupStatus(candidate).key] ?? 3;
    const rows = state.popups.filter(candidate => candidate.id !== popup.id && relationshipRank(candidate) < 99)
      .sort((left, right) => statusRank(left) - statusRank(right)
        || relationshipRank(left) - relationshipRank(right)
        || String(left.startDate || '').localeCompare(String(right.startDate || '')))
      .slice(0, 6);
    relatedPopupCache.set(cacheKey, rows);
    return rows;
  }
  function renderPopupDetailHeader(popup) {
    const status = popupStatus(popup);
    const dDay = popupDday(popup);
    const hasAddress = Boolean(String(popup.address || '').trim());
    const mapQuery = encodeURIComponent(popup.address || popup.venue || popup.name);
    const officialImageMissing = popup.imageSource === 'official-image-unavailable';
    const imageUrl = popup.imageUrl || popup.image || (officialImageMissing ? '' : popupFallbackImage(popup));
    const imageMarkup = imageUrl
      ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(popup.name)} 대표 이미지" width="900" height="506" decoding="async">`
      : `<div class="popup-detail-image-empty"><span aria-hidden="true">◇</span><strong>공식 대표 이미지 미공개</strong></div>`;
    return `<div class="detail-cover popup-detail-cover${officialImageMissing ? ' popup-photo-missing' : ''}">${imageMarkup}</div>
      <header class="detail-hero popup-detail-hero">
        <span class="category">${escapeHtml(popup.venueType || '쇼핑시설')}</span>
        <h2 id="detail-title" tabindex="-1">${escapeHtml(popup.name)}</h2>
        ${popupBrandLabel(popup) ? `<p class="popup-detail-brand">${escapeHtml(popupBrandLabel(popup))}</p>` : ''}
        <div class="popup-detail-badges" aria-label="팝업 진행 상태">
          <span class="popup-detail-state popup-${status.key}">${escapeHtml(status.label)}</span>
          <strong>${escapeHtml(dDay)}</strong>
          ${popup.isNew === true ? '<span class="popup-detail-new">NEW</span>' : ''}
        </div>
        <div class="popup-detail-status popup-${status.key} sr-only"><strong>${escapeHtml(status.label)}</strong><span>${escapeHtml(popupPeriodLabel(popup))}</span></div>
        <dl class="popup-detail-summary">
          <div><dt>장소·지점</dt><dd>${escapeHtml(popup.venue || popup.branch || '장소 확인 중')}</dd></div>
          <div><dt>기간<span class="sr-only">·영업일자</span></dt><dd class="popup-detail-period">${escapeHtml(popupPeriodLabel(popup))}</dd></div>
          <div><dt>주소<span class="sr-only">·도로명주소</span></dt><dd>${escapeHtml(popup.address || '주소 정보 없음')}</dd></div>
        </dl>
        <div class="detail-actions popup-primary-actions" aria-label="주요 행동">
          ${hasAddress ? `<a class="popup-guide-action" href="https://map.naver.com/p/search/${mapQuery}" target="_blank" rel="noopener noreferrer">길찾기</a>` : '<button class="popup-guide-action" type="button" disabled>길찾기</button>'}
          ${popup.sourceUrl ? `<a class="primary popup-official-action" href="${escapeHtml(popup.sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 정보</a>` : ''}
          <button class="ghost ${isSaved(popup) ? 'is-saved' : ''}" type="button" data-popup-save="${escapeHtml(popup.id)}" aria-pressed="${String(isSaved(popup))}">${isSaved(popup) ? '저장됨' : '저장'}</button>
          <button id="popup-share" class="ghost" type="button" aria-label="${escapeHtml(popup.name)} 공유">공유</button>
        </div>
      </header>`;
  }
  function renderPopupDetailInfo(popup) {
    const hasAddress = Boolean(String(popup.address || '').trim());
    const mapQuery = encodeURIComponent(popup.address || popup.venue || popup.name);
    return hasAddress ? `<div class="map-links popup-map-links" aria-label="지도 서비스"><a target="_blank" rel="noopener noreferrer" href="https://map.naver.com/p/search/${mapQuery}">네이버 지도</a><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}">Google 지도</a></div>` : '';
  }
  function renderPopupMenuSection(popup) {
    const menus = popupMenus(popup);
    return `<section class="popup-menu-section popup-detail-section"><h3>메뉴·가격</h3>${menus.length
      ? `<ul class="popup-menu-list">${menus.map(item => { const price = popupMenuPriceLabel(item); return `<li><span>${escapeHtml(item.name || item)}</span>${price ? `<strong>${escapeHtml(price)}</strong>` : ''}</li>`; }).join('')}</ul><p class="data-source-note">${popup.menuSource === 'official-detail' ? '공식 상세 페이지에 공개된 대표 메뉴와 가격입니다.' : '공식 정보에 공개된 대표 품목입니다.'}</p>`
      : '<p class="popup-menu-empty">메뉴는 공식 공지에서 확인해 주세요.</p>'}</section>`;
  }
  function renderPopupOfficialPhotos(popup) {
    const photos = [...new Set([...(Array.isArray(popup.officialImageUrls) ? popup.officialImageUrls : []), popup.imageUrl].filter(Boolean))].slice(0, 12);
    if (!photos.length) return '';
    return `<section class="official-food-photos popup-detail-section"><div><h3>공식 음식 사진</h3><small>공식 상세 페이지 제공</small></div><div class="official-food-photo-grid">${photos.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(url)}" alt="${escapeHtml(popup.name)} 공식 음식 사진 ${index + 1}" width="480" height="360" loading="lazy" decoding="async"></a>`).join('')}</div></section>`;
  }
  function renderPopupOfficialSource(popup) {
    return `<section class="popup-official-source popup-detail-section"><h3>공식 출처</h3><p><strong>${escapeHtml(popup.sourceName || '공식 정보')}</strong>${popup.lastVerifiedAt ? `<span>마지막 확인 ${escapeHtml(popup.lastVerifiedAt)}</span>` : ''}</p>${popup.sourceUrl ? `<a class="ghost" href="${escapeHtml(popup.sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 정보 보기</a>` : '<small>공식 링크를 확인 중입니다.</small>'}</section>`;
  }
  function renderRelatedPopups(popup, rows) {
    if (!rows.length) return '';
    return `<section id="related-popups" class="popup-related popup-detail-section"><div class="popup-related-head"><h3>관련 팝업</h3><small>브랜드·장소·지역·카테고리 기준</small></div><div class="popup-related-grid">${rows.map(row => popupDiscoveryCard(row)).join('')}</div></section>`;
  }
  function renderPopupReviewSection(popup) {
    const reviews = reviewsFor(popup);
    return `<section class="review-section popup-review-section popup-detail-section"><div class="review-head"><h3>리뷰 <small id="review-count">${reviews.length}</small></h3><select id="review-sort" aria-label="리뷰 정렬"><option value="latest">최신순</option><option value="rating">별점순</option><option value="helpful">유용한순</option></select></div><div class="trust-note">✓ 직접 방문한 팝업 경험을 남겨주세요.</div><form id="review-form"><label>별점<select name="rating"><option value="5">5점</option><option value="4">4점</option><option value="3">3점</option><option value="2">2점</option><option value="1">1점</option></select></label><label class="photo-label">사진 첨부<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><textarea name="text" required maxlength="500" placeholder="메뉴, 맛, 대기시간을 알려주세요."></textarea><button class="primary" type="submit">리뷰 등록</button><p id="review-submit-status" class="review-submit-status" aria-live="polite"></p></form><div id="review-list"></div></section>`;
  }
  function renderEndedPopupActions(popup, related) {
    if (popupStatus(popup).key !== 'ended') return '';
    const activeRelated = related.some(candidate => popupStatus(candidate).key !== 'ended');
    return `<aside class="popup-ended-actions popup-detail-section"><strong>이 팝업은 ${escapeHtml(popup.endDate || '표시된 종료일')}에 종료됐어요.</strong><div>${activeRelated ? '<button class="primary" type="button" data-ended-related>현재 진행 중인 비슷한 팝업 보기</button>' : ''}<button class="ghost" type="button" data-all-popups>전체 푸드팝업으로 돌아가기</button></div></aside>`;
  }
  function renderPopupReportSection() {
    return `<section class="popup-report popup-detail-section"><h3>정보 오류 신고</h3><p>기간이나 장소가 실제 정보와 다른가요?</p><button class="ghost" type="button" data-popup-report>정보가 잘못됐나요?</button></section>`;
  }
  function renderPopupMobileCta(popup) {
    const hasAddress = Boolean(String(popup.address || '').trim());
    const mapQuery = encodeURIComponent(popup.address || popup.venue || popup.name);
    return `<nav class="popup-mobile-cta" aria-label="팝업 빠른 행동">${hasAddress ? `<a href="https://map.naver.com/p/search/${mapQuery}" target="_blank" rel="noopener noreferrer">길찾기</a>` : '<button type="button" disabled>길찾기</button>'}<button type="button" data-popup-save="${escapeHtml(popup.id)}" aria-pressed="${String(isSaved(popup))}">${isSaved(popup) ? '저장됨' : '저장'}</button>${popup.sourceUrl ? `<a href="${escapeHtml(popup.sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 정보</a>` : ''}</nav>`;
  }
  function bindPopupDetail(popup, related) {
    $$('[data-popup-save]').forEach(button => button.addEventListener('click', () => toggleSaved(popup, { renderPage: false })));
    $('#popup-share').addEventListener('click', () => shareText(`${popup.name} · ${popup.venue}${popup.address ? ` · ${popup.address}` : ''}`));
    $('#review-sort').addEventListener('change', renderReviews);
    $('#review-form').addEventListener('submit', submitReview);
    $('#modal-content').querySelectorAll('#related-popups .discovery-popup-card').forEach(card => {
      const candidate = related.find(item => item.id === card.dataset.homePopupId);
      card.addEventListener('click', event => {
        if (event.target.closest('[data-home-save]')) return;
        openPopupDetail(candidate);
      });
      card.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === card) openPopupDetail(candidate); });
    });
    $('#modal-content').querySelectorAll('#related-popups [data-home-save]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      const candidate = related.find(item => item.id === button.dataset.homeSave);
      toggleSaved(candidate, { renderPage: false });
    }));
    $('[data-ended-related]')?.addEventListener('click', () => $('#related-popups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $('[data-all-popups]')?.addEventListener('click', () => {
      closeModals();
      showPopupResults();
    });
    $('[data-popup-report]')?.addEventListener('click', () => openPanel('contact', { popup }));
    const reviewForm = $('#review-form');
    reviewForm.addEventListener('focusin', () => $('#detail-modal').classList.add('review-keyboard-active'));
    reviewForm.addEventListener('focusout', () => setTimeout(() => {
      if (!reviewForm.contains(document.activeElement)) $('#detail-modal').classList.remove('review-keyboard-active');
    }, 0));
  }
  function openPopupDetail(popup, origin = null) {
    if (!popup) return;
    state.current = popup;
    state.currentPopup = popup;
    const related = relatedPopups(popup);
    const content = $('#modal-content');
    content.className = 'popup-detail-content';
    content.innerHTML = `${renderPopupDetailHeader(popup)}<main class="popup-detail-sections popup-detail-right">${renderPopupDetailInfo(popup)}${renderPopupMenuSection(popup)}${renderPopupOfficialPhotos(popup)}${renderPopupOfficialSource(popup)}${renderEndedPopupActions(popup, related)}${renderRelatedPopups(popup, related)}${renderPopupReviewSection(popup)}${renderPopupReportSection()}</main>${renderPopupMobileCta(popup)}`;
    showDetailModal(origin);
    if (history.state?.mukdangLayer !== 'detail') {
      history.pushState({ ...history.state, mukdang: true, mukdangLayer: 'detail', detailType: 'popup', searchMode: state.searchMode }, '');
    }
    bindPopupDetail(popup, related);
    renderReviews();
    loadReviews(popup);
  }
  function syncPopupFilterControls() {
    const controls = [
      ['#popup-ending-filter', state.popupEndingOnly],
      ['#popup-new-filter', state.popupNewOnly],
      ['#popup-nearby-filter', state.popupNearbyOnly]
    ];
    controls.forEach(([selector, active]) => {
      const button = $(selector);
      if (!button) return;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function popupEmptyState(query) {
    const popular = popupPopularSearches().slice(0, 3);
    return `<div class="popup-search-empty">
      <span aria-hidden="true">⌕</span>
      <strong>${query ? `‘${escapeHtml(query)}’ 검색 결과가 없어요.` : '조건에 맞는 푸드 팝업이 없어요.'}</strong>
      <p>다른 인기 검색어를 고르거나 지역·카테고리 조건을 바꿔보세요.</p>
      <div class="popup-empty-actions">
        ${popular.map(item => `<button class="md-chip" type="button" data-popup-empty-query="${escapeHtml(item.query)}">${escapeHtml(item.query)}</button>`).join('')}
        <button class="md-chip" type="button" data-popup-empty-focus="region">지역 변경</button>
        <button class="md-chip" type="button" data-popup-empty-focus="category">카테고리 보기</button>
      </div>
      <button id="popup-empty-reset" class="md-button md-button--primary" type="button">전체 팝업 보기</button>
    </div>`;
  }
  function render() {
    const popupMode = state.searchMode === 'popup';
    const restaurantFilters = $('#filters');
    const popupFilters = $('#popup-filters');
    restaurantFilters.hidden = popupMode;
    popupFilters.hidden = !popupMode;
    // `display:grid` is defined by the global filter style, so also set the
    // inline display value to guarantee only the active mode's controls show.
    restaurantFilters.style.display = popupMode ? 'none' : '';
    popupFilters.style.display = popupMode ? '' : 'none';
    // Mobile uses one toggle for whichever filter group is currently active.
    // Desktop CSS keeps this control hidden.
    $('#filter-toggle').hidden = false;
    $('#popular-quick-searches').hidden = popupMode;
    $('#home-rankings').hidden = popupMode;
    $('.source-note').hidden = popupMode;
    $('#popup-search-v2').hidden = true;
    if (popupMode) {
      renderPopupDiscovery();
      const query = state.popupSearchQuery;
      syncPopupSearchInputs();
      renderPopupSearchMeta();
      syncPopupFilterControls();
      const rows = popupRows();
      const activeCount = rows.filter(popup => popupStatus(popup).key === 'active').length;
      const upcomingCount = rows.filter(popup => popupStatus(popup).key === 'upcoming').length;
      const endedCount = rows.filter(popup => popupStatus(popup).key === 'ended').length;
      const popupPages = Math.max(1, Math.ceil(rows.length / 24));
      state.page = Math.min(state.page, popupPages);
      const shown = rows.slice((state.page - 1) * 24, state.page * 24);
      const quickTitles = { 'ending-today': '오늘 종료하는 푸드 팝업', nearby: `${state.nearbyRegion || '선택 지역'} 푸드 팝업` };
      $('#discover-title').textContent = query ? `‘${query}’ 푸드 팝업` : state.popupHomeCategoryFilter ? `${popupCategoryLabels[state.popupHomeCategoryFilter]} 푸드 팝업` : state.popupRetailerFilter ? '선택한 쇼핑시설의 푸드 팝업' : quickTitles[state.popupQuickFilter] || '전체 푸드 팝업';
      $('#result-summary').textContent = `${rows.length.toLocaleString('ko-KR')}건 · 영업 중 ${activeCount.toLocaleString('ko-KR')} · 오픈 예정 ${upcomingCount.toLocaleString('ko-KR')} · 종료 ${endedCount.toLocaleString('ko-KR')}`;
      $('#app-state').textContent = state.popupUpdatedAt
        ? `공식 쇼핑시설 일정 기준 · ${new Date(state.popupUpdatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 갱신`
        : '공식 팝업 일정을 불러오는 중입니다.';
      $('#restaurant-grid').innerHTML = shown.map(popupCard).join('') || popupEmptyState(query);
      $('#pager').innerHTML = popupPages > 1 ? `<button data-popup-page="-1" ${state.page === 1 ? 'disabled' : ''}>이전</button><span>${state.page} / ${popupPages}</span><button data-popup-page="1" ${state.page === popupPages ? 'disabled' : ''}>다음</button>` : '';
      $$('[data-popup-page]').forEach(button => button.addEventListener('click', () => { state.page = Math.max(1, Math.min(popupPages, state.page + Number(button.dataset.popupPage))); render(); }));
      $$('.popup-card').forEach(el => {
        const popup = rows.find(item => item.id === el.dataset.popupId);
        el.addEventListener('click', event => {
          if (event.target.closest('[data-search-save]')) return;
          const link = event.target.closest('a');
          // Keep the crawlable URL for open-in-new-tab, but make an ordinary
          // name click behave exactly like a photo/card click.
          if (link && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
          if (link) event.preventDefault();
          openPopupDetail(popup, el);
        });
        el.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === el) openPopupDetail(popup, el); });
      });
      $$('[data-search-save]').forEach(button => button.addEventListener('click', async event => {
        event.stopPropagation();
        const popup = state.popups.find(item => item.id === button.dataset.searchSave);
        await toggleSaved(popup);
      }));
      $$('[data-popup-empty-query]').forEach(button => button.addEventListener('click', () => applyPopupSearch(button.dataset.popupEmptyQuery)));
      $$('[data-popup-empty-focus]').forEach(button => button.addEventListener('click', () => {
        const selector = button.dataset.popupEmptyFocus === 'region' ? '#popup-region-filter' : '#popup-food-filter';
        $(selector)?.focus();
        $('#popup-filters').classList.add('open');
      }));
      $('#popup-empty-reset')?.addEventListener('click', resetPopupSearchFilters);
      return;
    }
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize, shown = rows.slice(start, start + pageSize);
    $('#result-summary').textContent = `${rows.length.toLocaleString('ko-KR')}곳 · ${!state.filters.query && state.popularRestaurantCount ? '최근 30일 실제 검색량 순' : state.fullLoaded ? '전국 전체 데이터' : '빠른 미리보기'}`;
    $('#discover-title').textContent = state.filters.query ? '검색 결과' : '지금 많이 찾는 식당';
    $('#app-state').textContent = state.progress || (state.fullLoaded ? '카드를 눌러 상세 정보와 리뷰를 확인하세요.' : '검색하거나 필터를 적용하면 전국 전체 데이터를 불러옵니다.');
    $('#restaurant-grid').innerHTML = shown.map((r, i) => card(r, start + i)).join('') || '<div class="empty">조건에 맞는 식당이 없습니다.<br><button id="empty-reset" class="ghost">필터 초기화</button></div>';
    const mayHaveMore = state.searchSession && !state.searchSession.done;
    $('#pager').innerHTML = rows.length > pageSize || mayHaveMore ? `<button data-page="-1" ${state.page === 1 ? 'disabled' : ''}>이전</button><span>${state.page} / ${mayHaveMore ? '…' : pages}</span><button data-page="1" ${state.page === pages && !mayHaveMore ? 'disabled' : ''}>다음</button>` : '';
    $$('.restaurant-card').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.closest('[data-save], a')) openDetail(rows[Number(el.dataset.index)]); });
      el.addEventListener('keydown', e => e.key === 'Enter' && openDetail(rows[Number(el.dataset.index)]));
    });
    $$('[data-save]').forEach(el => el.addEventListener('click', () => toggleSaved(rows[Number(el.dataset.save)])));
    $$('[data-page]').forEach(el => el.addEventListener('click', async () => {
      const direction = Number(el.dataset.page);
      if (direction > 0 && state.page === pages && mayHaveMore) await loadSearchResults((state.page + 1) * pageSize);
      const availablePages = Math.max(1, Math.ceil(filtered().length / pageSize));
      state.page = Math.max(1, Math.min(state.page + direction, availablePages));
      render(); $('#discover').scrollIntoView();
    }));
    $('#empty-reset')?.addEventListener('click', resetFilters);
    renderHomeRankings();
    enrichVisibleCards(rows);
  }

  async function fetchPlaceDetails(r) {
    const key = idOf(r);
    if (!placeDetailCache.has(key)) {
      placeDetailCache.set(key, fetch(publicApiUrl(`/api/restaurant?name=${encodeURIComponent(r.name)}&address=${encodeURIComponent(naverMapAddress(r.address))}`))
        .then(async response => {
          if (!response.ok) throw Error(`장소 상세정보 ${response.status}`);
          return response.json();
        })
        .catch(() => null));
    }
    return placeDetailCache.get(key);
  }
  function applyRealPhoto(r, place) {
    if (!place?.photoUrl) return;
    $$(`[data-place-key="${Math.abs(hash(idOf(r)))}"]`).forEach(cardEl => {
      const photo = cardEl.querySelector('[data-place-photo]');
      if (!photo) return;
      photo.style.backgroundImage = `url("${place.photoUrl.replace(/["\\]/g, '')}")`;
      photo.classList.remove('neutral-photo');
      const badge = photo.querySelector('[data-photo-badge]');
      if (badge) badge.textContent = '실제 검색 이미지';
    });
  }
  function enrichVisibleCards(rows) {
    $$('.restaurant-card').forEach(cardEl => {
      const restaurant = rows[Number(cardEl.dataset.index)];
      if (!restaurant) return;
      fetchPlaceDetails(restaurant).then(place => applyRealPhoto(restaurant, place));
    });
  }

  async function ensureAll() {
    if (state.fullLoaded) return;
    if (!state.loading) {
      state.loading = (async () => {
        let loaded = [];
        const regions = state.filters.region
          ? window.__MEOKDANG_REGIONS__.filter(region => region.name === state.filters.region)
          : [...window.__MEOKDANG_REGIONS__].sort((left, right) => {
              const priority = ['경기도', '서울특별시', '부산광역시', '인천광역시'];
              const leftIndex = priority.indexOf(left.name), rightIndex = priority.indexOf(right.name);
              return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
            });
        for (let index = 0; index < regions.length; index += 1) {
          const region = regions[index];
          state.progress = `${region.name} 검색 중… (${index + 1}/${regions.length})`;
          loaded = loaded.concat(enrich(await loadRegion(region)));
          state.all = loaded;
          state.page = 1;
          render();
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        state.fullLoaded = !state.filters.region;
        state.loading = null;
        state.progress = '';
        render();
      })().catch(error => {
        state.loading = null;
        state.progress = '';
        throw error;
      });
    }
    await state.loading;
  }
  async function loadSearchResults(targetCount = pageSize) {
    const session = state.searchSession;
    if (!session || session.done) return;
    while (filtered().length < targetCount && !session.done) {
      let pageKey = '';
      if (!session.prefixLoaded && session.nextPage <= session.endPage) {
        pageKey = `${session.bucket}-${session.nextPage}`;
        session.nextPage += 1;
        session.prefixLoaded = true;
      } else if (session.containsPages.length) {
        pageKey = session.containsPages.shift();
      } else if (session.nextPage <= session.endPage) {
        pageKey = `${session.bucket}-${session.nextPage}`;
        session.nextPage += 1;
      }
      if (!pageKey) { session.done = true; break; }
      const path = `data/restaurants/search-pages/${pageKey}.json?v=3`;
      if (!searchPageCache.has(path)) searchPageCache.set(path, fetch(path).then(response => response.ok ? response.json() : []));
      const rows = await searchPageCache.get(path);
      const nextRows = enrich(rows.map(([name, category, address, phone, permitDate, permitDateSource, facilityAreaM2]) =>
        ({ name, category, address, phone, permitDate, permitDateSource, facilityAreaM2 })));
      const existing = new Set(state.all.map(idOf));
      state.all = state.all.concat(nextRows.filter(row => !existing.has(idOf(row))));
      session.done = session.nextPage > session.endPage && !session.containsPages.length;
    }
  }
  async function containsPagesFor(queryChars) {
    const bigrams = [];
    for (let index = 0; index < queryChars.length - 1; index += 1) {
      const pair = queryChars.slice(index, index + 2);
      const routeKey = pair.map(char => char.codePointAt(0).toString(16)).join('-');
      const shard = (pair.reduce((value, char) => ((value * 31) + char.codePointAt(0)) >>> 0, 0) % 256).toString(16).padStart(2, '0');
      if (!containsManifestCache.has(shard)) {
        containsManifestCache.set(shard, fetch(`data/restaurants/search-pages/contains-${shard}.json?v=1`)
          .then(response => response.ok ? response.json() : {}));
      }
      bigrams.push({ routeKey, shard });
    }
    const manifests = await Promise.all([...new Set(bigrams.map(item => item.shard))].map(shard => containsManifestCache.get(shard)));
    const byShard = new Map([...new Set(bigrams.map(item => item.shard))].map((shard, index) => [shard, manifests[index]]));
    const candidates = bigrams.map(item => byShard.get(item.shard)?.[item.routeKey] || []).filter(pages => pages.length);
    const pageScores = new Map();
    candidates.forEach(pages => pages.forEach(page => pageScores.set(page, (pageScores.get(page) || 0) + 1)));
    const maxScore = Math.max(0, ...pageScores.values());
    return [...pageScores].filter(([, score]) => score === maxScore).map(([page]) => page);
  }
  async function startSearch(query) {
    const normalizedQuery = searchKey(query);
    const allChars = [...(branchlessKey(normalizedQuery) || normalizedQuery)].slice(0, 30);
    const chars = allChars.slice(0, 3);
    if (!chars.length) { state.all = state.preview; state.searchSession = null; return; }
    const bucketChars = chars.slice(0, 2);
    const bucket = (bucketChars.reduce((value, char) => ((value * 31) + char.codePointAt(0)) >>> 0, 0) % 256).toString(16).padStart(2, '0');
    if (!searchManifestCache.has(bucket)) searchManifestCache.set(bucket, fetch(`data/restaurants/search-pages/manifest-${bucket}.json?v=5`).then(response => response.json()));
    const manifest = await searchManifestCache.get(bucket);
    const keyFor = length => chars.slice(0, length).map(char => char.codePointAt(0).toString(16)).join('-');
    const entry = manifest[keyFor(Math.min(3, chars.length))] || manifest[keyFor(Math.min(2, chars.length))];
    const prefixPages = new Set();
    if (entry) for (let page = entry.start; page <= entry.end; page += 1) prefixPages.add(`${bucket}-${page}`);
    // Two-syllable Korean restaurant names are common. The old three-character
    // minimum made valid middle-name matches unreachable at the index level.
    const containsPages = allChars.length >= 2
      ? (await containsPagesFor(allChars)).filter(page => !prefixPages.has(page))
      : [];
    state.all = [];
    state.searchSession = {
      bucket,
      nextPage: entry?.start ?? 1,
      endPage: entry?.end ?? 0,
      containsPages,
      prefixLoaded: false,
      done: !entry && !containsPages.length
    };
    await loadSearchResults(pageSize * 5);
  }
  async function mergeLiveSearchResults(query) {
    if (searchKey(query).length < 2) return;
    try {
      const response = await fetch(publicApiUrl(`/api/search?q=${encodeURIComponent(query)}`));
      if (!response.ok) return;
      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const liveRows = enrich(results.map((restaurant, index) => ({
        ...restaurant,
        liveSearchRank: results.length - index
      })));
      const uniqueLiveRows = liveRows.filter((row, index, rows) =>
        !state.all.some(existing => samePlace(existing, row)) &&
        rows.findIndex(candidate => samePlace(candidate, row)) === index);
      state.all = uniqueLiveRows.concat(state.all);
    } catch {
      // Static public-license search remains available when a place provider fails.
    }
  }
  async function prefetchSearch(query) {
    const chars = [...searchKey(query)].slice(0, 3);
    if (chars.length < 2) return;
    const bucketChars = chars.slice(0, 2);
    const bucket = (bucketChars.reduce((value, char) => ((value * 31) + char.codePointAt(0)) >>> 0, 0) % 256).toString(16).padStart(2, '0');
    if (!searchManifestCache.has(bucket)) searchManifestCache.set(bucket, fetch(`data/restaurants/search-pages/manifest-${bucket}.json?v=5`).then(response => response.json()));
    const manifest = await searchManifestCache.get(bucket);
    const keyFor = length => chars.slice(0, length).map(char => char.codePointAt(0).toString(16)).join('-');
    const entry = manifest[keyFor(Math.min(3, chars.length))] || manifest[keyFor(2)];
    if (!entry) return;
    const path = `data/restaurants/search-pages/${bucket}-${entry.start}.json?v=2`;
    if (!searchPageCache.has(path)) searchPageCache.set(path, fetch(path).then(response => response.ok ? response.json() : []));
  }
  async function applySearch() {
    state.filters.query = $('#search-input').value.trim(); state.page = 1; $('#suggestions').innerHTML = ''; $('#search-input').setAttribute('aria-expanded', 'false');
    if (state.searchMode === 'popup') {
      applyPopupSearch($('#search-input').value);
      $('#discover').scrollIntoView({ behavior: 'instant', block: 'start' });
      return;
    }
    const button = $('#search-button');
    button.disabled = true;
    button.textContent = '찾는 중';
    state.progress = state.filters.query ? `‘${state.filters.query}’ 검색을 시작합니다…` : '전국 맛집을 불러오는 중…';
    render();
    $('#discover').scrollIntoView({ behavior: 'instant', block: 'start' });
    try {
      await ready;
      if (!window.__MEOKDANG_REGIONS__?.length) throw Error('검색 데이터 초기화 실패');
      await startSearch(state.filters.query);
      await mergeFoodSearchResults(state.filters.query);
      await mergeLiveSearchResults(state.filters.query);
      recordPopularity(filtered().slice(0, 10));
      if (state.filters.query) api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'search', detail: state.filters.query }) }).catch(() => {});
      state.fullLoaded = false;
      state.progress = '';
      render();
    } catch (error) {
      console.error(error);
      $('#app-state').textContent = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    } finally {
      button.disabled = false;
      button.textContent = '검색';
    }
  }
  async function applyFilters() {
    ['region', 'category', 'price', 'sort'].forEach(key => { state.filters[key] = $(`#${key}-filter`).value; });
    state.page = 1;
    if (state.filters.query) {
      await startSearch(state.filters.query);
      await mergeLiveSearchResults(state.filters.query);
    }
    else if (state.filters.region) {
      const region = window.__MEOKDANG_REGIONS__.find(item => item.name === state.filters.region);
      if (region) {
        state.progress = `${region.name} 식당을 불러오는 중…`;
        render();
        state.all = enrich(await loadRegion(region));
        state.progress = '';
      }
    } else state.all = state.preview;
    render();
  }
  function resetFilters() {
    $('#search-input').value = ''; $$('#filters select, #popup-filters select').forEach(select => { select.selectedIndex = 0; });
    state.filters = { query: '', region: '', category: '', price: '', sort: 'recommend' };
    state.popupSearchQuery = ''; state.popupQuickFilter = ''; state.popupHomeCategoryFilter = ''; state.popupRetailerFilter = '';
    state.popupEndingOnly = false; state.popupNewOnly = false; state.popupNearbyOnly = false; state.nearbyRegion = ''; state.nearbyEnabled = false;
    updateNearbyUrl('');
    state.searchSession = null; state.all = state.preview; state.page = 1; render();
  }
  function resetPopupSearchFilters() {
    $$('#popup-filters select').forEach(select => { select.selectedIndex = 0; });
    state.popupSearchQuery = '';
    state.filters.query = '';
    state.popupQuickFilter = '';
    state.popupHomeCategoryFilter = '';
    state.popupRetailerFilter = '';
    state.popupEndingOnly = false;
    state.popupNewOnly = false;
    state.popupNearbyOnly = false;
    state.page = 1;
    syncPopupSearchInputs('');
    render();
  }
  function renderSuggestions() {
    const q = searchKey($('#search-input').value);
    if (!q) { $('#suggestions').innerHTML = ''; $('#search-input').setAttribute('aria-expanded', 'false'); return; }
    if (state.searchMode === 'popup') {
      renderPopupSuggestions($('#search-input'), $('#suggestions'));
      return;
    }
    const matches = state.all.filter(r => searchKey(`${r.name} ${r.address}`).includes(q)).slice(0, 7);
    $('#suggestions').innerHTML = matches.map((r, i) => `<button data-suggestion="${i}" type="button"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.address)}</small></button>`).join('');
    $('#search-input').setAttribute('aria-expanded', String(matches.length > 0));
    $$('[data-suggestion]').forEach(el => el.addEventListener('click', () => { $('#search-input').value = matches[Number(el.dataset.suggestion)].name; applySearch(); }));
  }

  function reviewsFor(r) {
    return state.serverReviews.get(idOf(r)) || [];
  }
  async function loadReviews(r) {
    try {
      const data = await api(`/api/reviews?restaurant=${encodeURIComponent(idOf(r))}`);
      state.serverReviews.set(idOf(r), data.reviews);
      if (data.summary) state.reviewSummaries.set(idOf(r), data.summary);
      if (state.current === r) {
        const count = $('#review-count');
        if (count) count.textContent = data.reviews.length;
        renderReviews();
      }
      if (!state.currentPopup) {
        renderHomeRankings();
        render();
      }
    } catch {
      if (state.current === r && $('#review-list')) $('#review-list').innerHTML = '<p class="empty-reviews">리뷰 서버에 연결할 수 없습니다.</p>';
    }
  }
  function naverMapAddress(value) {
    return String(value || '')
      .normalize('NFKC')
      .split(',')[0]
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function openDetail(r) {
    state.current = r;
    state.currentPopup = null;
    const reviews = reviewsFor(r);
    const naverAddress = naverMapAddress(r.address);
    const naverQuery = encodeURIComponent(naverAddress);
    const fullQuery = encodeURIComponent(`${r.name} ${r.address || ''}`);
    const permit = permitDateInfo(r.permitDate);
    $('#modal-content').className = '';
    $('#modal-content').innerHTML = `<div id="place-cover" class="detail-cover neutral-photo" data-category-label="${escapeHtml(categoryLabel(r))}"><span>${escapeHtml(categoryLabel(r))} · 사진 없음</span></div><div class="detail-hero"><div class="detail-heading"><div><span class="category">${escapeHtml(r.category || '음식점')}</span><h2 id="detail-title" tabindex="-1">${escapeHtml(r.name)}</h2><p>${escapeHtml(r.address)}</p></div></div>
      <div class="detail-visuals">${buildingSitePlan(r)}<figure id="restaurant-exterior" class="restaurant-exterior neutral-photo" data-category-label="${escapeHtml(r.name)}"><figcaption><strong>식당 외관·간판</strong><span>실제 사진 확인 중</span></figcaption></figure></div>
      <div class="detail-score"><strong>★ ${r.rating}</strong><span>${priceText(r.price)}</span></div>
      <div class="permit-highlight"><div><span>현재 영업 기간</span><b>${permit ? escapeHtml(permit.duration) : '인허가일 확인 중'}</b></div><div><span>영업 시작일</span><strong>${permit ? escapeHtml(permit.formatted) : '공공 원장에 없음'}</strong></div><small>${permit ? '행정안전부 식품위생 인허가일 기준 · 영업 기간은 날짜 기준으로 매일 자동 계산' : '장소 정보는 확인됐지만 영업 신고일은 공공 원장에서 확인되지 않았습니다 · 매일 재확인'}</small></div>
      <div class="detail-actions"><button id="detail-save" class="primary">${isSaved(r) ? '저장됨' : '♡ 저장'}</button><button id="add-list" class="ghost">리스트에 추가</button><button id="share" class="ghost">공유</button></div></div>
      <section id="place-extras" class="place-extras" aria-live="polite"><div class="place-loading">사진·가격·좌석 정보를 확인하는 중입니다.</div></section>
      <div class="detail-grid"><section><h3>식당 정보</h3><dl><dt>주소</dt><dd>${escapeHtml(r.address)}</dd><dt>전화번호</dt><dd id="place-phone">${escapeHtml(r.phone || '정보 없음')}</dd><dt>영업 시작일</dt><dd>${permit ? `${escapeHtml(permit.formatted)} <small>공공 인허가 기록 확인</small>` : '공공데이터 확인 필요'}</dd><dt>영업 기간</dt><dd>${permit ? escapeHtml(permit.duration) : '계산할 수 없음'}</dd><dt>영업시간</dt><dd id="place-hours">방문 전 지도 서비스에서 확인해 주세요.</dd></dl>
      <p class="data-source-note">${permit ? `영업 시작일은 ${escapeHtml(r.permitDateSource || '행정안전부 일반음식점 인허가 데이터')}의 식품위생 영업 인허가일 기준이며, 실제 첫 영업일과 다를 수 있습니다.` : '공공 인허가 원장에 날짜가 없어 임의로 영업 기간을 만들지 않습니다. 일일 갱신에서 계속 대조합니다.'}</p>
      <div class="map-links"><a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${naverQuery}" title="${escapeHtml(naverAddress)} 주소로 검색">네이버 지도 · 주소검색</a><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${fullQuery}">Google 지도</a></div></section>
      <section class="review-section"><div class="review-head"><h3>사용자 리뷰 <small id="review-count">${reviews.length}</small></h3><select id="review-sort"><option value="latest">최신순</option><option value="rating">별점순</option><option value="helpful">유용한순</option></select></div>
      <div class="trust-note">✓ 리뷰는 Cloudflare 서버에 안전하게 저장되며 관리자 검토를 거칩니다.</div>
      <form id="review-form"><label>별점<select name="rating"><option value="5">5점</option><option value="4">4점</option><option value="3">3점</option><option value="2">2점</option><option value="1">1점</option></select></label><textarea name="text" required maxlength="500" placeholder="직접 경험한 맛과 분위기를 알려주세요."></textarea><label class="photo-label">사진 첨부<input name="photo" type="file" accept="image/*"></label><button class="primary" type="submit">리뷰 등록</button><p id="review-submit-status" class="review-submit-status" aria-live="polite"></p></form><div id="review-list"></div></section></div>`;
    showDetailModal();
    if (history.state?.mukdangLayer !== 'detail') {
      history.pushState({ ...history.state, mukdang: true, mukdangLayer: 'detail', searchMode: state.searchMode }, '');
    }
    $('#detail-save').addEventListener('click', async () => { await toggleSaved(r); openDetail(r); });
    $('#add-list').addEventListener('click', () => openListPicker(r));
    $('#share').addEventListener('click', () => shareText(`${r.name} · ${r.address}`));
    $('#review-sort').addEventListener('change', renderReviews);
    $('#review-form').addEventListener('submit', submitReview);
    renderReviews();
    loadReviews(r);
    fetchPlaceDetails(r).then(place => renderPlaceDetails(r, place));
    loadBuildingSite(r.address);
  }
  function renderPlaceDetails(r, place) {
    if (state.current !== r || !$('#place-extras')) return;
    if (!place) {
      $('#place-extras').innerHTML = '<div class="place-loading">연동 준비 중 · 공식 API 키를 연결하면 실제 사진과 상세정보가 표시됩니다.</div>';
      return;
    }
    const cover = $('#place-cover');
    if (place.photoUrl) {
      const safePhotoUrl = place.photoUrl.replace(/["\\]/g, '');
      cover.style.backgroundImage = `url("${safePhotoUrl}")`;
      cover.classList.add('loaded');
      cover.classList.remove('neutral-photo');
      const exterior = $('#restaurant-exterior');
      if (exterior) {
        exterior.style.backgroundImage = `url("${safePhotoUrl}")`;
        exterior.classList.add('loaded');
        exterior.classList.remove('neutral-photo');
        const exteriorStatus = exterior.querySelector('figcaption span');
        if (exteriorStatus) exteriorStatus.textContent = '장소 검색 사진';
      }
      applyRealPhoto(r, place);
    }
    if (place.phone) $('#place-phone').textContent = place.phone;
    if (place.hours?.length) $('#place-hours').innerHTML = place.hours.map(escapeHtml).join('<br>');
    const seats = [
      ['매장 식사', place.dineIn], ['단체 이용', place.goodForGroups],
      ['야외 좌석', place.outdoorSeating], ['예약', place.reservable]
    ];
    const price = place.priceRange || place.priceLevel || '가격 정보 없음';
    const sourceLink = place.provider === 'naver'
      ? (place.naverPlaceUrl ? `<a href="${escapeHtml(place.naverPlaceUrl)}" target="_blank" rel="noopener">관련 페이지에서 메뉴 확인</a>` : '등록된 메뉴 정보가 없습니다.')
      : (place.websiteUri ? `<a href="${escapeHtml(place.websiteUri)}" target="_blank" rel="noopener">공식 메뉴 확인</a>` : '등록된 메뉴 정보가 없습니다.');
    $('#place-extras').innerHTML = `<article><span>메뉴·가격</span><strong>${escapeHtml(price)}</strong><small>${sourceLink}</small></article>
      <article><span>좌석·이용</span><div class="seat-features">${seats.map(([label, value]) => `<b class="${value === true ? 'yes' : value === false ? 'no' : ''}">${label}</b>`).join('')}</div><small>공개된 장소 편의정보 기준</small></article>
      <article><span>영업 상태</span><strong>${place.businessStatus === 'OPERATIONAL' ? '영업 중' : place.businessStatus === 'CLOSED_PERMANENTLY' ? '폐업' : '확인 필요'}</strong><small>${place.provider === 'naver' ? '네이버 지역·이미지 검색 결과' : 'Google Places 제공 정보'}${place.photoSource ? ` · <a href="${escapeHtml(place.photoSource)}" target="_blank" rel="noopener">사진 원문</a>` : ''}</small></article>`;
  }
  function renderReviews() {
    const sort = $('#review-sort')?.value || 'latest';
    const reviews = [...reviewsFor(state.current)].sort((a, b) => sort === 'rating' ? b.rating - a.rating : sort === 'helpful' ? b.helpful - a.helpful : b.createdAt - a.createdAt);
    $('#review-list').innerHTML = reviews.length ? reviews.map(r => `<article class="review"><div><strong>${escapeHtml(r.author)}</strong><span class="verified">솔직 리뷰</span><time>${new Date(r.createdAt).toLocaleDateString('ko-KR')}</time></div><b>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</b><p>${escapeHtml(r.text)}</p>${r.photoUrl ? `<a class="review-photo" href="${escapeHtml(r.photoUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(r.photoUrl)}" alt="${escapeHtml(r.author)}님의 리뷰 사진" loading="lazy"></a>` : ''}<div class="review-actions"><button data-helpful="${r.id}" type="button">유용해요 ${r.helpful || 0}</button>${r.canEdit ? `<button data-edit-review="${r.id}" type="button">수정</button><button class="review-delete" data-delete-review="${r.id}" type="button">삭제</button>` : ''}</div></article>`).join('') : '<p class="empty-reviews">첫 번째 솔직한 리뷰를 남겨주세요.</p>';
    $$('[data-helpful]').forEach(el => el.addEventListener('click', async () => {
      try {
        await api(`/api/reviews/${el.dataset.helpful}/helpful`, { method: 'POST' });
        await loadReviews(state.current);
      } catch (error) { toast(error.message); }
    }));
    $$('[data-edit-review]').forEach(el => el.addEventListener('click', async () => {
      const review = reviews.find(item => item.id === Number(el.dataset.editReview));
      if (!review) return;
      const text = prompt('리뷰 내용을 수정해 주세요.', review.text);
      if (text === null) return;
      const ratingInput = prompt('별점을 1~5 사이 숫자로 입력해 주세요.', String(review.rating));
      if (ratingInput === null) return;
      try {
        await api(`/api/reviews/${review.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ text, rating: Number(ratingInput) })
        });
        await loadReviews(state.current);
        render();
        toast('리뷰를 수정했습니다.');
      } catch (error) { toast(error.message); }
    }));
    $$('[data-delete-review]').forEach(el => el.addEventListener('click', async () => {
      if (!confirm('이 리뷰를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.')) return;
      try {
        await api(`/api/reviews/${el.dataset.deleteReview}`, { method: 'DELETE' });
        await loadReviews(state.current);
        render();
        toast('리뷰를 삭제했습니다.');
      } catch (error) { toast(error.message); }
    }));
  }
  async function submitReview(event) {
    event.preventDefault();
    if (!state.serverUser) { toast('리뷰를 작성하려면 로그인해 주세요.'); return openPanel('auth'); }
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = $('#review-submit-status');
    const restaurant = state.current;
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = '등록 중…';
    status.textContent = '';
    try {
      const photo = await prepareReviewPhoto(data.get('photo'));
      const result = await api('/api/reviews', { method: 'POST', body: JSON.stringify({
        restaurantId: idOf(restaurant), restaurantName: restaurant.name,
        rating: Number(data.get('rating')), text: data.get('text'), photo
      }) });
      const key = idOf(restaurant);
      const currentReviews = state.serverReviews.get(key) || [];
      state.serverReviews.set(key, [result.review, ...currentReviews.filter(review => review.id !== result.review.id)]);
      form.reset();
      if (state.current === restaurant) {
        $('#review-count').textContent = state.serverReviews.get(key).length;
        renderReviews();
      }
      renderHomeRankings();
      status.textContent = '✓ 등록 완료';
      toast('리뷰를 서버에 등록했어요.');
      loadReviews(restaurant).catch(() => {});
    } catch (error) {
      status.textContent = error.message;
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = '리뷰 등록';
    }
  }

  async function prepareReviewPhoto(file) {
    if (!(file instanceof File) || !file.size) return null;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진만 첨부할 수 있습니다.');
    if (file.size > 8 * 1024 * 1024) throw new Error('원본 사진은 8MB 이하만 첨부할 수 있습니다.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('사진을 2MB 이하로 줄여 다시 시도해 주세요.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
      reader.readAsDataURL(blob);
    });
    return { mime: 'image/jpeg', data: String(dataUrl).split(',')[1] };
  }

  let modalReturnFocus = null;
  function focusModalHeading(modal) {
    const target = modal.querySelector('#detail-title') || modal.querySelector('#panel-title') || modal.querySelector('.modal-close');
    target?.focus({ preventScroll: true });
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    setTimeout(() => { if (modal.classList.contains('open')) target?.focus({ preventScroll: true }); }, 50);
  }
  function showDetailModal(origin = null) {
    const backdrop = $('#detail-modal');
    if (!$$('.modal-backdrop.open').length && !modalReturnFocus) modalReturnFocus = origin || (document.activeElement !== document.body ? document.activeElement : null);
    backdrop.querySelector('.modal').scrollTop = 0;
    backdrop.classList.remove('review-keyboard-active');
    backdrop.classList.add('open');
    document.body.classList.add('locked');
    focusModalHeading(backdrop);
  }
  function closeModalsDirect({ restoreFocus = true } = {}) {
    $$('.modal-backdrop').forEach(x => x.classList.remove('open', 'review-keyboard-active'));
    document.body.classList.remove('locked');
    if (restoreFocus && modalReturnFocus?.isConnected) modalReturnFocus.focus();
    if (restoreFocus) modalReturnFocus = null;
  }
  function closeModals() {
    if (history.state?.mukdangLayer) history.back();
    else closeModalsDirect();
  }
  function openPanel(type, context = null) {
    if (!$$('.modal-backdrop.open').length && !modalReturnFocus) modalReturnFocus = document.activeElement !== document.body ? document.activeElement : null;
    const content = $('#panel-content'); $('#panel-modal').classList.add('open'); document.body.classList.add('locked');
    if (type === 'saved') renderSavedPanel(content);
    else if (type === 'mypage') renderMyPage(content);
    else if (type === 'contact') renderContactPanel(content, context);
    else renderAuth(content);
    if (history.state?.mukdangLayer !== 'panel') {
      history.pushState({ ...history.state, mukdang: true, mukdangLayer: 'panel', panelType: type, searchMode: state.searchMode }, '');
    }
    focusModalHeading($('#panel-modal'));
  }
  function renderContactPanel(content, context = null) {
    const email = state.serverUser?.email || '';
    const popup = context?.popup;
    content.innerHTML = `<h2 id="panel-title" tabindex="-1">${popup ? '팝업 정보 오류 신고' : '고객 문의'}</h2><p class="panel-lead">${popup ? `<strong>${escapeHtml(popup.name)}</strong>의 잘못된 정보를 알려주세요.` : '이용 중 불편한 점이나 식당 정보 수정 요청을 보내주세요.'}</p><form class="profile-form customer-contact" action="https://formspree.io/f/mojgyppj" method="POST"><input type="hidden" name="_subject" value="${popup ? '먹당 푸드 팝업 정보 오류 신고' : '먹당 고객 문의'}">${popup ? `<input type="hidden" name="팝업ID" value="${escapeHtml(popup.id)}"><input type="hidden" name="팝업명" value="${escapeHtml(popup.name)}"><input type="hidden" name="공식출처" value="${escapeHtml(popup.sourceUrl || '')}"><input type="hidden" name="문의유형" value="푸드 팝업 정보 수정"><label>신고 사유<select name="신고사유" required><option value="">선택해 주세요</option><option>기간이 다름</option><option>장소가 다름</option><option>이미 종료됨</option><option>푸드 팝업이 아님</option><option>기타</option></select></label>` : '<label>문의 유형<select name="문의유형" required><option value="">선택해 주세요</option><option>식당 정보 수정</option><option>리뷰 신고</option><option>회원·로그인</option><option>서비스 오류</option><option>기타</option></select></label>'}<label>답변받을 이메일<input type="email" name="email" required autocomplete="email" value="${escapeHtml(email)}" placeholder="me@example.com"></label><label>문의 내용<textarea name="문의내용" required rows="6" maxlength="2000" placeholder="${popup ? '어떤 정보가 어떻게 다른지 알려주세요.' : '문의 내용을 자세히 적어주세요.'}"></textarea></label><button class="primary" type="submit">${popup ? '오류 신고 보내기' : '문의 보내기'}</button></form><p class="fine">보내주신 내용은 문의 답변과 정보 확인 목적으로만 사용됩니다.</p>`;
  }
  function renderSavedPanel(content) {
    const saved = savedIds(), rows = [...state.all, ...state.popups].filter(isSaved);
    const lists = state.serverUser ? state.serverLists : store.get('lists', { '가고 싶은 곳': saved });
    content.innerHTML = `<h2 id="panel-title" tabindex="-1">저장 목록</h2><div class="list-tabs">${Object.keys(lists).map(name => `<button data-list="${escapeHtml(name)}">${escapeHtml(name)} <span>${lists[name].length}</span></button>`).join('')}<button id="new-list">＋ 새 리스트</button></div><div id="saved-grid" class="saved-grid">${rows.map((r, i) => `<button data-saved="${i}"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.address || r.venue)}</small></button>`).join('') || '<p class="empty-reviews">저장한 장소가 없습니다.</p>'}</div><button id="share-list" class="ghost">현재 목록 공유</button>`;
    $$('[data-saved]').forEach(el => el.addEventListener('click', () => {
      const row = rows[Number(el.dataset.saved)];
      if (isPopupRecord(row)) openPopupDetail(row);
      else openDetail(row);
    }));
    $('#new-list').addEventListener('click', async () => {
      const name = prompt('새 리스트 이름을 입력하세요.'); if (!name?.trim()) return;
      const next = state.serverUser ? { ...state.serverLists } : store.get('lists', {});
      next[name.trim()] = next[name.trim()] || [];
      if (state.serverUser) state.serverLists = next;
      await saveUserData('lists', next);
      api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'list', detail: `리스트 생성: ${name.trim()}` }) }).catch(() => {});
      renderSavedPanel(content);
    });
    $('#share-list').addEventListener('click', () => shareText(`mukdang.com 맛집 리스트: ${rows.map(r => r.name).join(', ') || '아직 비어 있어요'}`));
  }
  async function openListPicker(r) {
    const lists = state.serverUser ? { ...state.serverLists } : store.get('lists', { '가고 싶은 곳': [] });
    const name = prompt(`추가할 리스트 이름을 입력하세요.\n${Object.keys(lists).join(' / ')}`, Object.keys(lists)[0] || '가고 싶은 곳');
    if (!name?.trim()) return;
    lists[name.trim()] = lists[name.trim()] || [];
    if (!lists[name.trim()].includes(idOf(r))) lists[name.trim()].push(idOf(r));
    if (state.serverUser) state.serverLists = lists;
    await saveUserData('lists', lists);
    api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'list', detail: `${name.trim()}에 추가: ${r.name}` }) }).catch(() => {});
    toast(`‘${name.trim()}’ 리스트에 추가했어요.`);
  }
  function renderAuth(content) {
    if (state.serverUser) {
      content.innerHTML = `<h2 id="panel-title">로그인됨</h2><p class="panel-lead"><strong>${escapeHtml(state.serverUser.name)}</strong><br>${escapeHtml(state.serverUser.email)}</p><button id="server-logout" class="ghost">로그아웃</button>`;
      $('#server-logout').addEventListener('click', async () => {
        await logout();
      });
      return;
    }
    content.innerHTML = `<h2 id="panel-title">먹당 시작하기</h2><p class="panel-lead">솔직한 리뷰를 남기고 나만의 맛집을 저장하세요.</p><div class="auth-tabs" role="tablist"><button class="active" type="button" data-auth-tab="login">로그인</button><button type="button" data-auth-tab="register">회원가입</button></div><form id="email-login" class="profile-form auth-form" data-auth-form="login"><label>이메일<input name="email" type="email" required autocomplete="email" placeholder="me@example.com"></label><label>비밀번호<input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="8자 이상"></label><button class="primary" type="submit">로그인</button></form><form id="email-register" class="profile-form auth-form" data-auth-form="register" hidden><label><span>이메일</span><span class="email-code-row"><input name="email" type="email" required autocomplete="email" placeholder="me@example.com"><button id="request-email-code" class="ghost" type="button">인증번호 받기</button></span></label><p id="email-code-status" class="email-code-status" aria-live="polite"></p><label>인증번호<input name="code" inputmode="numeric" required minlength="4" maxlength="4" pattern="[0-9]{4}" autocomplete="one-time-code" placeholder="4자리 숫자"></label><label>닉네임 <small>문자, 숫자만 가능</small><input name="name" required maxlength="40" pattern="[\\p{L}\\p{N}]+" title="문자와 숫자만 입력해 주세요." autocomplete="nickname" placeholder="먹당에서 사용할 이름"></label><label>비밀번호<input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="8자 이상"></label><button class="primary" type="submit">인증하고 회원가입</button></form><p class="fine">인증번호는 10분 동안 유효합니다. 가입하면 이용약관 및 개인정보 처리방침에 동의하게 됩니다.</p>`;
    $$('[data-auth-tab]').forEach(tab => tab.addEventListener('click', () => {
      const mode = tab.dataset.authTab;
      $$('[data-auth-tab]').forEach(button => button.classList.toggle('active', button === tab));
      $$('[data-auth-form]').forEach(form => { form.hidden = form.dataset.authForm !== mode; });
      content.querySelector(`[data-auth-form="${mode}"] input`)?.focus();
    }));
    $('#request-email-code').addEventListener('click', async event => {
      const button = event.currentTarget;
      const emailInput = $('#email-register input[name="email"]');
      if (!emailInput.reportValidity()) return;
      button.disabled = true;
      button.textContent = '보내는 중';
      try {
        const result = await api('/api/auth/request-code', {
          method: 'POST',
          body: JSON.stringify({ email: emailInput.value })
        });
        $('#email-code-status').textContent = result.message;
        $('#email-register input[name="code"]').focus();
        let seconds = 60;
        const timer = setInterval(() => {
          seconds -= 1;
          button.textContent = seconds > 0 ? `${seconds}초 후 재전송` : '인증번호 다시 받기';
          if (seconds <= 0) {
            clearInterval(timer);
            button.disabled = false;
          }
        }, 1000);
      } catch (error) {
        button.disabled = false;
        button.textContent = '인증번호 받기';
        $('#email-code-status').textContent = error.message;
        toast(error.message);
      }
    });
    $$('.auth-form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const action = event.currentTarget.dataset.authForm;
      try {
        const result = await api(`/api/auth/${action}`, { method: 'POST', body: JSON.stringify({
          email: data.get('email'), password: data.get('password'), name: data.get('name'), code: data.get('code')
        }) });
        state.serverUser = result.user;
        await loadUserData();
        syncAuthMenu();
        closeModals(); toast(action === 'register' ? '회원가입했습니다.' : '로그인했습니다.');
      } catch (error) { toast(error.message); }
    }));
  }
  function renderMyPage(content) {
    const profile = state.serverUser || { name: '게스트', badge: '새싹 리뷰어' }, reviewCount = [...state.serverReviews.values()].flat().filter(review => review.author === profile.name).length;
    content.innerHTML = `<h2 id="panel-title">마이페이지</h2><div class="profile-card"><div class="avatar">${escapeHtml(profile.name[0])}</div><div><strong>${escapeHtml(profile.name)}</strong><span>${escapeHtml(profile.badge || '새싹 리뷰어')}</span></div></div><div class="my-stats"><div><strong>${reviewCount}</strong><span>리뷰</span></div><div><strong>${savedIds().length}</strong><span>저장</span></div></div><h3>프로필 설정</h3><form id="profile-form" class="profile-form"><label>닉네임 <small>문자, 숫자만 가능</small><input name="name" required maxlength="40" pattern="[\\p{L}\\p{N}]+" title="문자와 숫자만 입력해 주세요." value="${escapeHtml(profile.name)}"></label><label>소개<textarea name="bio" placeholder="나의 맛집 취향을 소개해 보세요.">${escapeHtml(profile.bio || '')}</textarea></label><label>선호 음식<select name="favorite"><option value="">선택 안 함</option>${['한식','일식','중식','양식','분식'].map(food => `<option ${profile.favorite === food ? 'selected' : ''}>${food}</option>`).join('')}</select></label><button class="primary">프로필 저장</button></form><h3>내 리뷰 관리</h3><p class="trust-note">작성한 리뷰 ${reviewCount}개 · 저장 데이터는 계정과 함께 서버에 보관됩니다.</p>`;
    $('#profile-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!state.serverUser) return toast('로그인이 필요합니다.');
      const data = new FormData(event.currentTarget);
      const value = { name: data.get('name') || state.serverUser.name, bio: data.get('bio') || '', favorite: data.get('favorite') || '', badge: state.serverUser.badge || '새싹 리뷰어' };
      state.serverProfile = value; Object.assign(state.serverUser, value);
      await saveUserData('profile', value);
      $('#auth-button').textContent = value.name;
      toast('프로필을 서버에 저장했습니다.');
    });
  }
  async function shareText(text) {
    try { if (navigator.share) await navigator.share({ title: 'mukdang.com', text, url: location.href }); else { await navigator.clipboard.writeText(`${text}\n${location.href}`); toast('공유 내용을 복사했어요.'); } } catch {}
  }

  function selectSearchMode(mode, pushHistory = true) {
    state.searchMode = mode;
    state.page = 1;
    // Restaurant and popup controls are independent. Keep each mode's
    // selection when switching tabs instead of resetting the other mode.
    $$('[data-search-mode]').forEach(item => {
      const active = item.dataset.searchMode === mode;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    $('#search-input').value = state.searchMode === 'popup' ? state.popupSearchQuery : state.filters.query;
    $('#search-input').placeholder = state.searchMode === 'popup'
      ? '브랜드, 장소, 지역 검색'
      : '식당명, 지역, 음식 종류 검색';
    $('#search-input').setAttribute('aria-label', state.searchMode === 'popup' ? '푸드 팝업 검색' : '맛집 검색');
    render();
    if (pushHistory && history.state?.searchMode !== mode) {
      history.pushState({ ...history.state, mukdang: true, mukdangLayer: null, searchMode: mode }, '');
    }
  }
  function armEntryHistory() {
    const entryState = {
      ...history.state,
      mukdang: true,
      mukdangLayer: null,
      searchMode: state.searchMode,
      entryGuard: true
    };
    history.replaceState(entryState, '');
    history.pushState({ ...entryState, entryGuard: false }, '');
  }
  $('#search-button').addEventListener('click', applySearch);
  $$('[data-search-mode]').forEach(button => button.addEventListener('click', () => selectSearchMode(button.dataset.searchMode)));
  $('#search-input').addEventListener('input', () => {
    renderSuggestions();
    if (state.searchMode !== 'popup') prefetchSearch($('#search-input').value).catch(() => {});
  });
  $('#search-input').addEventListener('keydown', event => {
    if (state.searchMode === 'popup' && handlePopupSuggestionKeydown(event, $('#search-input'), $('#suggestions'))) return;
    if (event.key === 'Enter') applySearch();
  });
  $('#popup-search-input').addEventListener('input', event => renderPopupSuggestions(event.currentTarget, $('#popup-search-suggestions')));
  $('#popup-search-input').addEventListener('keydown', event => {
    if (handlePopupSuggestionKeydown(event, $('#popup-search-input'), $('#popup-search-suggestions'))) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      applyPopupSearch($('#popup-search-input').value);
    }
  });
  $('#popup-search-submit').addEventListener('click', () => applyPopupSearch($('#popup-search-input').value));
  $$('#filters select').forEach(el => el.addEventListener('change', applyFilters));
  $$('#popup-filters select').forEach(el => el.addEventListener('change', () => {
    state.popupQuickFilter = '';
    state.popupHomeCategoryFilter = '';
    state.popupRetailerFilter = '';
    if (el.id === 'popup-region-filter' && state.popupNearbyOnly) {
      state.nearbyRegion = el.value;
      state.popupNearbyOnly = Boolean(el.value);
    }
    state.page = 1;
    render();
    syncNearbyControls();
  }));
  $('#popup-filter-reset').addEventListener('click', resetPopupSearchFilters);
  $('#popup-ending-filter').addEventListener('click', () => {
    state.popupEndingOnly = !state.popupEndingOnly;
    state.page = 1;
    render();
  });
  $('#popup-new-filter').addEventListener('click', () => {
    state.popupNewOnly = !state.popupNewOnly;
    state.page = 1;
    render();
  });
  $('#popup-nearby-filter').addEventListener('click', () => {
    if (state.popupNearbyOnly) {
      state.popupNearbyOnly = false;
      state.page = 1;
      render();
      return;
    }
    const region = $('#popup-region-filter').value || state.nearbyRegion || store.get('nearby-region', '');
    if (!region) {
      $('#popup-region-filter').focus();
      return toast('지역을 먼저 선택해 주세요.');
    }
    state.nearbyRegion = region;
    state.popupNearbyOnly = true;
    $('#popup-region-filter').value = region;
    store.set('nearby-region', region);
    state.page = 1;
    render();
  });
  $('#filter-reset').addEventListener('click', resetFilters);
  $$('.popup-quick-actions [data-popup-quick]').forEach(button => button.addEventListener('click', () => handlePopupQuick(button.dataset.popupQuick)));
  $('#nearby-apply').addEventListener('click', () => {
    const region = $('#nearby-region').value;
    if (!region) return toast('지역을 먼저 선택해 주세요.');
    state.nearbyRegion = region;
    state.nearbyEnabled = true;
    state.popupQuickFilter = '';
    store.set('nearby-region', region);
    updateNearbyUrl(region);
    $('#nearby-region-picker').hidden = true;
    renderPopupDiscovery();
    syncNearbyControls();
    $('#nearby-popups')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#header-search').addEventListener('click', () => {
    const input = $('#search-input');
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('#header-account').addEventListener('click', () => openPanel(state.serverUser ? 'mypage' : 'auth'));
  $$('[data-home-filter]').forEach(button => button.addEventListener('click', () => {
    const targets = { region: '#region-discovery', category: '#category-discovery', brand: '#search-input', calendar: '#discover' };
    $(targets[button.dataset.homeFilter] || '#popup-home')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('[data-bottom-action]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.bottomAction === 'search') return $('#header-search').click();
    if (button.dataset.bottomAction === 'saved') return openPanel('saved');
    openPanel(state.serverUser ? 'mypage' : 'auth');
  }));
  $('#filter-toggle').addEventListener('click', () => {
    const activeFilters = state.searchMode === 'popup' ? $('#popup-filters') : $('#filters');
    const open = activeFilters.classList.toggle('open');
    $('#filter-toggle').setAttribute('aria-expanded', String(open));
  });
  const menuToggle = $('#menu-toggle'), headerNav = $('#header-nav');
  function syncAuthMenu() {
    $('#auth-button').textContent = state.serverUser?.name || '로그인';
    $('#menu-logout').hidden = !state.serverUser;
    $('#menu-delete-account').hidden = !state.serverUser;
  }
  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      state.serverUser = null;
      state.serverSaved = [];
      state.serverLists = {};
      state.serverProfile = {};
      syncAuthMenu();
      updateSavedCount();
      closeModals();
      toast('로그아웃했습니다.');
    } catch (error) {
      toast(error.message);
    }
  }
  function closeHeaderMenu() {
    headerNav.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', '메뉴 열기');
  }
  menuToggle.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = headerNav.hidden;
    headerNav.hidden = !willOpen;
    menuToggle.setAttribute('aria-expanded', String(willOpen));
    menuToggle.setAttribute('aria-label', willOpen ? '메뉴 닫기' : '메뉴 열기');
  });
  headerNav.addEventListener('click', event => {
    if (event.target.closest('a, button')) closeHeaderMenu();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.header-menu')) closeHeaderMenu();
  });
  $$('[data-open-panel]').forEach(el => el.addEventListener('click', () => openPanel(el.dataset.openPanel)));
  $('#auth-button').addEventListener('click', () => openPanel('auth'));
  $('#menu-logout').addEventListener('click', logout);
  $('#menu-delete-account').addEventListener('click', async () => {
    if (!state.serverUser) return;
    const password = prompt('회원탈퇴를 확인하려면 현재 비밀번호를 입력해 주세요.');
    if (password === null) return;
    if (!password) return toast('비밀번호를 입력해 주세요.');
    if (!confirm('회원정보, 작성한 리뷰와 저장 목록이 삭제됩니다. 정말 탈퇴할까요?')) return;
    try {
      await api('/api/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      state.serverUser = null;
      state.serverSaved = [];
      state.serverLists = {};
      state.serverProfile = {};
      syncAuthMenu();
      updateSavedCount();
      closeModals();
      toast('회원탈퇴가 완료되었습니다.');
    } catch (error) {
      toast(error.message);
    }
  });
  $$('[data-close]').forEach(el => el.addEventListener('click', closeModals));
  $$('.modal-backdrop').forEach(el => el.addEventListener('click', e => e.target === el && closeModals()));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeHeaderMenu();
      closeModals();
      return;
    }
    if (e.key === 'Tab') {
      const openModal = $$('.modal-backdrop.open').at(-1);
      if (!openModal) return;
      const focusable = [...openModal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && (document.activeElement === first || !openModal.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !openModal.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  window.addEventListener('popstate', event => {
    const next = event.state;
    closeModalsDirect({ restoreFocus: !next?.mukdangLayer });
    closeHeaderMenu();
    if (!next?.mukdang) return;
    if (next.searchMode && next.searchMode !== state.searchMode) selectSearchMode(next.searchMode, false);
    if (next.entryGuard) {
      history.pushState({ ...next, entryGuard: false }, '');
      return;
    }
    if (next.mukdangLayer === 'detail' && next.detailType === 'popup' && state.currentPopup) {
      showDetailModal();
    } else if (next.mukdangLayer === 'detail' && state.current) {
      showDetailModal();
    } else if (next.mukdangLayer === 'panel') {
      $('#panel-modal').classList.add('open');
      document.body.classList.add('locked');
      focusModalHeading($('#panel-modal'));
    }
  });
  $$('[data-home]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    window.location.assign(new URL('./', window.location.href));
  }));

  try {
    // Home consumes the same-origin unified site feed exactly once. The cache
    // key exposes the newest collector build without reaching into raw data.
    const popupFeedUrl = new URL('data/popups.json', location.href);
    popupFeedUrl.searchParams.set('v', String(Date.now()));
    const [regionsResponse, previewsResponse, popupsResponse] = await Promise.all([
      fetch('data/restaurants/regions.json?v=20260728-4'),
      fetch('data/restaurants/previews.json?v=20260728-4'),
      fetch(popupFeedUrl, { cache: 'no-store' })
    ]);
    if (!regionsResponse.ok || !previewsResponse.ok) throw Error('목록 로드 실패');
    const regionData = await regionsResponse.json(), previews = await previewsResponse.json();
    if (popupsResponse.ok) {
      const popupData = await popupsResponse.json();
      state.popups = Array.isArray(popupData.popups)
        ? popupData.popups.filter(popup => (!popup.publishStatus || popup.publishStatus === 'published') && !hiddenPopupIds.has(popup.id))
        : [];
      state.popupUpdatedAt = popupData.updatedAt;
      const popupRegions = [...new Set(state.popups.map(popupRegionName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
      popupRegions.forEach(region => {
        const option = `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`;
        $('#popup-region-filter').insertAdjacentHTML('beforeend', option);
        $('#nearby-region').insertAdjacentHTML('beforeend', option);
      });
      const nearbyFromUrl = new URL(location.href).searchParams.get('nearby') || '';
      if (popupRegions.includes(nearbyFromUrl)) {
        state.nearbyRegion = nearbyFromUrl;
        state.nearbyEnabled = true;
        $('#nearby-region').value = nearbyFromUrl;
        store.set('nearby-region', nearbyFromUrl);
      } else if (nearbyFromUrl) {
        updateNearbyUrl('');
      }
      if (!nearbyFromUrl) autoDetectNearbyRegion(popupRegions);
    }
    window.__MEOKDANG_REGIONS__ = regionData.regions; state.preview = enrich(mixPreviews(previews)); state.all = state.preview;
    await loadPopularRestaurants();
    regionData.regions.forEach(r => $('#region-filter').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`));
    [...new Set(state.preview.map(r => r.category).filter(Boolean))].sort().forEach(c => $('#category-filter').insertAdjacentHTML('beforeend', `<option>${escapeHtml(c)}</option>`));
    try {
      const auth = await api('/api/auth/me');
      state.serverUser = auth.user;
      if (state.serverUser) await loadUserData();
      syncAuthMenu();
      const latest = await api('/api/reviews');
      state.serverReviews.set('__latest__', latest.reviews);
      state.reviewSummaries = new Map(Object.entries(latest.summaries || {}));
    } catch {}
    updateSavedCount(); render();
    armEntryHistory();
    $('#search-button').disabled = false;
    $('#search-button').textContent = '검색';
    resolveReady();
  } catch (error) {
    console.error(error);
    $('#app-state').textContent = '식당 데이터를 불러오지 못했습니다. 새로고침해 주세요.';
    resolveReady();
  }
})();
