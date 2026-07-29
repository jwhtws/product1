(async function () {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pageSize = 10;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const state = {
    preview: [], all: [], fullLoaded: false, loading: null, page: 1,
    filters: { query: '', region: '', category: '', price: '', sort: 'recommend' },
    current: null, progress: '', searchSession: null, serverUser: null, serverReviews: new Map(),
    serverSaved: [], serverLists: {}, serverProfile: {}
  };
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || '서버 요청에 실패했습니다.'), { status: response.status });
    return data;
  }
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(`meokdang-${key}`)) ?? fallback; } catch { return fallback; } },
    set(key, value) { localStorage.setItem(`meokdang-${key}`, JSON.stringify(value)); }
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
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
  function relevanceScore(query, restaurant) {
    const name = searchKey(restaurant.name);
    const address = searchKey(restaurant.address);
    const category = searchKey(restaurant.category);
    if (name === query) return 1000;
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
  const idOf = restaurant => `${restaurant.name}|${restaurant.address}`;
  const fileUrl = file => `data/restaurants/${file.replace(/%/g, '%25')}`;
  const searchManifestCache = new Map();
  const searchPageCache = new Map();
  const containsManifestCache = new Map();
  const placeDetailCache = new Map();
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
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function savedIds() { return state.serverUser ? state.serverSaved : store.get('saved', []); }
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
  function isSaved(r) { return savedIds().includes(idOf(r)); }
  function updateSavedCount() { $('#saved-count').textContent = savedIds().length; }
  function renderHomeRankings() {
    const searches = [
      ['한식', '든든한 한 끼'], ['카페', '커피와 디저트'], ['일식', '깔끔한 메뉴'],
      ['중식', '오늘의 별미'], ['분식', '가볍게 즐기기']
    ];
    const searchEl = $('#popular-searches');
    if (searchEl) searchEl.innerHTML = searches.map(([name, note], index) =>
      `<button type="button" data-ranking-category="${name}"><b>${index + 1}</b><strong>${name}</strong><span>${note}</span></button>`
    ).join('');

    const allReviews = [...state.serverReviews.values()].flat();
    const reviewRows = (rows, emptyText) => rows.length ? rows.slice(0, 5).map((review, index) =>
      `<div class="ranking-review"><b>${index + 1}</b><div><strong>${escapeHtml(review.restaurant)}</strong><p>${escapeHtml(review.text)}</p></div><span>★ ${review.rating}</span></div>`
    ).join('') : `<p class="ranking-empty">${emptyText}</p>`;
    const latestEl = $('#latest-reviews'), popularEl = $('#popular-reviews');
    if (latestEl) latestEl.innerHTML = reviewRows([...allReviews].sort((a, b) => b.createdAt - a.createdAt), '아직 등록된 리뷰가 없습니다.');
    if (popularEl) popularEl.innerHTML = reviewRows([...allReviews].sort((a, b) => (b.helpful || 0) - (a.helpful || 0) || b.rating - a.rating), '유용한 리뷰가 곧 표시됩니다.');
    $$('[data-ranking-category]').forEach(button => button.addEventListener('click', () => {
      const category = button.dataset.rankingCategory;
      const target = $$('[data-category]').find(item => item.dataset.category === category);
      target?.click();
    }));
  }
  async function toggleSaved(r) {
    const saved = savedIds(), id = idOf(r), exists = saved.includes(id);
    const next = exists ? saved.filter(x => x !== id) : [...saved, id];
    if (state.serverUser) state.serverSaved = next;
    await saveUserData('saved', next);
    api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'save', detail: `${exists ? '삭제' : '저장'}: ${r.name}` }) }).catch(() => {});
    updateSavedCount(); toast(exists ? '저장 목록에서 삭제했어요.' : '가고 싶은 곳에 저장했어요.'); render();
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
  function buildingSitePlanLegacy(r) {
    const area = Number(r.facilityAreaM2);
    const validArea = Number.isFinite(area) && area > 0;
    const width = validArea ? Math.sqrt(area * 1.45) : 10;
    const depth = validArea ? area / width : 8;
    const kitchenRatio = /카페|커피|다방|제과/.test(r.category || '') ? 0.24
      : /횟집|복어|중국|탕류|식육|숯불/.test(r.category || '') ? 0.36 : 0.31;
    const largestSide = Math.max(width, depth);
    const [canvasWidth, canvasHeight] = largestSide <= 10 ? [12, 9]
      : largestSide <= 20 ? [26, 20]
        : largestSide <= 35 ? [44, 32] : [76, 56];
    const planX = canvasWidth * .08, planY = canvasHeight * .08, diningWidth = width * (1 - kitchenRatio);
    const serviceWidth = width - diningWidth, rearDepth = depth * 0.28;
    const carX = canvasWidth * .08, carY = canvasHeight - .7;
    const personX = carX + 6.2, personY = canvasHeight - .5;
    const roomFont = canvasWidth * .045, smallFont = canvasWidth * .032, scaleFont = canvasWidth * .03;
    const tableCols = Math.max(2, Math.min(4, Math.floor(diningWidth / 2.7)));
    const tableRows = Math.max(2, Math.min(4, Math.floor(depth / 2.5)));
    const tableWidth = Math.max(.8, Math.min(1.4, diningWidth / (tableCols * 1.8)));
    const tableDepth = .7;
    const tables = Array.from({ length: tableCols * tableRows }, (_, index) => {
      const col = index % tableCols, row = Math.floor(index / tableCols);
      const x = planX + (col + .5) * diningWidth / tableCols - tableWidth / 2;
      const y = planY + (row + .65) * (depth - 1.3) / tableRows;
      return `<g class="plan-table"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${tableWidth.toFixed(2)}" height="${tableDepth}"/><path d="M${(x - .28).toFixed(2)} ${(y + .1).toFixed(2)}v.5m${(tableWidth + .56).toFixed(2)} 0v-.5"/></g>`;
    }).join('');
    return `<aside id="building-site-plan" class="title-site-plan premises-scale"><div class="plan-title"><strong>식당 평면도</strong><span>신고면적 기준</span></div>
      <div class="site-plan real-building">
        <svg class="building-shape restaurant-layout-svg" style="--room-font:${roomFont.toFixed(2)}px;--small-font:${smallFont.toFixed(2)}px;--scale-font:${scaleFont.toFixed(2)}px" viewBox="0 0 ${canvasWidth.toFixed(2)} ${canvasHeight.toFixed(2)}" role="img" aria-label="홀, 주방, 카운터, 창고, 화장실이 포함된 식당 평면도와 같은 축척의 자동차 및 사람">
          <rect class="plan-shell" x="${planX}" y="${planY}" width="${width.toFixed(2)}" height="${depth.toFixed(2)}"/>
          <rect class="plan-zone plan-dining" x="${planX}" y="${planY}" width="${diningWidth.toFixed(2)}" height="${depth.toFixed(2)}"/>
          <rect class="plan-zone plan-kitchen" x="${(planX + diningWidth).toFixed(2)}" y="${planY}" width="${serviceWidth.toFixed(2)}" height="${(depth - rearDepth).toFixed(2)}"/>
          <rect class="plan-zone plan-storage" x="${(planX + diningWidth).toFixed(2)}" y="${(planY + depth - rearDepth).toFixed(2)}" width="${(serviceWidth / 2).toFixed(2)}" height="${rearDepth.toFixed(2)}"/>
          <rect class="plan-zone plan-restroom" x="${(planX + diningWidth + serviceWidth / 2).toFixed(2)}" y="${(planY + depth - rearDepth).toFixed(2)}" width="${(serviceWidth / 2).toFixed(2)}" height="${rearDepth.toFixed(2)}"/>
          <rect class="plan-counter" x="${(planX + diningWidth - Math.min(2.4, diningWidth * .34)).toFixed(2)}" y="${(planY + depth - 1.1).toFixed(2)}" width="${Math.min(2.4, diningWidth * .34).toFixed(2)}" height=".65"/>
          ${tables}
          <path class="plan-door" d="M${(planX + .5).toFixed(2)} ${(planY + depth).toFixed(2)}h1.2a1.2 1.2 0 0 0-1.2-1.2"/>
          <text class="room-label" x="${(planX + diningWidth / 2).toFixed(2)}" y="${(planY + 1).toFixed(2)}">1</text>
          <text class="room-label" x="${(planX + diningWidth + serviceWidth / 2).toFixed(2)}" y="${(planY + (depth - rearDepth) / 2).toFixed(2)}">2</text>
          <text class="room-label small" x="${(planX + diningWidth + serviceWidth / 4).toFixed(2)}" y="${(planY + depth - rearDepth / 2).toFixed(2)}">3</text>
          <text class="room-label small" x="${(planX + diningWidth + serviceWidth * .75).toFixed(2)}" y="${(planY + depth - rearDepth / 2).toFixed(2)}">4</text>
          <text class="room-label small" x="${(planX + diningWidth - Math.min(2.4, diningWidth * .34) / 2).toFixed(2)}" y="${(planY + depth - 1.3).toFixed(2)}">5</text>
          <text class="room-label small" x="${(planX + 1.1).toFixed(2)}" y="${(planY + depth - .35).toFixed(2)}">↗</text>
          <g class="scale-car-real"><rect x="${carX}" y="${(carY - 1.8).toFixed(2)}" width="4.5" height="1.8" rx=".35"/><circle cx="${carX + 1}" cy="${carY}" r=".35"/><circle cx="${carX + 3.5}" cy="${carY}" r=".35"/></g>
          <g class="scale-person-real"><circle cx="${personX.toFixed(2)}" cy="${(personY - 1.42).toFixed(2)}" r=".28"/><path d="M${personX.toFixed(2)} ${(personY - 1.12).toFixed(2)}v.7m-.45-.3m.45.3l.45-.3m-.45 0l-.38.82m.38-.82l.38.82"/></g>
          <text class="scale-label" x="${(carX + 2.25).toFixed(2)}" y="${(carY - 2.15).toFixed(2)}">차량 4.5m</text>
          <text class="scale-label" x="${personX.toFixed(2)}" y="${(personY - 1.95).toFixed(2)}">사람 1.7m</text>
        </svg>
      </div>
      <div class="plan-legend"><span class="dining">1 홀</span><span class="kitchen">2 주방</span><span class="storage">3 창고</span><span class="restroom">4 화장실</span><span class="counter">5 카운터</span></div>
      <dl class="building-facts"><div><dt>식당 신고면적</dt><dd>${validArea ? `${area.toLocaleString('ko-KR')}㎡ · 약 ${(area / 3.305785).toFixed(1)}평` : '공개 정보 없음'}</dd></div><div><dt>크기·축척</dt><dd>약 ${width.toFixed(1)}×${depth.toFixed(1)}m · 화면 폭 ${canvasWidth}m</dd></div></dl>
      <div class="parking-assessment"><strong>주차 가능성 확인 중</strong><span>VWorld 대지·건축면적 조회 후 계산</span></div>
      <small>차량 4.5m·사람 1.7m를 평면도와 동일 축척으로 표시 · 내부 구획은 업종 기반 예시</small><div class="gis-building-status">VWorld 건물정보 조회 중</div></aside>`;
  }
  function buildingSitePlan(r) {
    const area = Number(r.facilityAreaM2);
    const validArea = Number.isFinite(area) && area > 0;
    const seed = Math.abs(hash(`${r.id || ''}|${r.name}|${r.address}|${r.category}`));
    const aspect = [.72, .88, 1.05, 1.28, 1.55, 1.85, 2.15][seed % 7];
    const width = validArea ? Math.sqrt(area * aspect) : 9;
    const depth = validArea ? area / width : 7;
    const category = String(r.category || '');
    const cafe = /카페|커피|다방|제과|디저트/.test(category);
    const heavyKitchen = /횟집|복어|중국|탕류|식육|숯불|구이/.test(category);
    const buffet = /뷔페|패밀리레스토랑/.test(category);
    const kitchenRatio = cafe ? .22 : heavyKitchen ? .38 : buffet ? .32 : .29 + (seed % 5) * .012;
    const layout = cafe || buffet ? 'rear' : ['right', 'left', 'rear'][seed % 3];
    const layoutLabel = { right: '측면 주방형', left: '역측면 주방형', rear: '후면 주방형' }[layout];
    const margin = Math.max(1.4, Math.min(3, Math.min(width, depth) * .15));
    const canvasWidth = Math.max(width + margin * 2, 11);
    const planX = (canvasWidth - width) / 2;
    const planY = margin;
    const canvasHeight = depth + margin * 2 + 4.2;
    const rooms = [];
    let hall;
    if (layout === 'rear') {
      const serviceDepth = depth * kitchenRatio;
      const kitchenWidth = width * (heavyKitchen ? .7 : .62);
      hall = { x: planX, y: planY, w: width, h: depth - serviceDepth };
      rooms.push(
        { cls: 'plan-kitchen', number: 2, x: planX, y: planY + hall.h, w: kitchenWidth, h: serviceDepth },
        { cls: 'plan-storage', number: 3, x: planX + kitchenWidth, y: planY + hall.h, w: width - kitchenWidth, h: serviceDepth / 2 },
        { cls: 'plan-restroom', number: 4, x: planX + kitchenWidth, y: planY + hall.h + serviceDepth / 2, w: width - kitchenWidth, h: serviceDepth / 2 }
      );
    } else {
      const serviceWidth = width * kitchenRatio;
      const serviceX = layout === 'right' ? planX + width - serviceWidth : planX;
      hall = { x: layout === 'right' ? planX : planX + serviceWidth, y: planY, w: width - serviceWidth, h: depth };
      rooms.push(
        { cls: 'plan-kitchen', number: 2, x: serviceX, y: planY, w: serviceWidth, h: depth * .68 },
        { cls: 'plan-storage', number: 3, x: serviceX, y: planY + depth * .68, w: serviceWidth / 2, h: depth * .32 },
        { cls: 'plan-restroom', number: 4, x: serviceX + serviceWidth / 2, y: planY + depth * .68, w: serviceWidth / 2, h: depth * .32 }
      );
    }
    rooms.unshift({ cls: 'plan-dining', number: 1, ...hall });
    const counterWidth = Math.max(.9, Math.min(2.4, hall.w * .25));
    const counter = {
      x: layout === 'left' ? hall.x + .35 : hall.x + hall.w - counterWidth - .35,
      y: layout === 'rear' ? hall.y + hall.h - .85 : hall.y + .35,
      w: counterWidth,
      h: .55
    };
    const tableCols = Math.max(1, Math.min(6, Math.floor(hall.w / (cafe ? 2.25 : 2.7))));
    const tableRows = Math.max(1, Math.min(6, Math.floor((hall.h - 1.2) / (cafe ? 2 : 2.4))));
    const roundTables = cafe || seed % 4 === 0;
    const tables = Array.from({ length: tableCols * tableRows }, (_, index) => {
      const col = index % tableCols;
      const row = Math.floor(index / tableCols);
      const x = hall.x + (col + .5) * hall.w / tableCols;
      const y = hall.y + .85 + (row + .5) * Math.max(.8, hall.h - 1.5) / tableRows;
      return roundTables
        ? `<g class="plan-table"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".48"/><path d="M${(x - .82).toFixed(2)} ${y.toFixed(2)}h.3m1.04 0h.3"/></g>`
        : `<g class="plan-table"><rect x="${(x - .62).toFixed(2)}" y="${(y - .36).toFixed(2)}" width="1.24" height=".72" rx=".08"/><path d="M${(x - .92).toFixed(2)} ${(y - .25).toFixed(2)}v.5m1.84 0v-.5"/></g>`;
    }).join('');
    const entranceTop = seed % 2 === 0;
    const doorX = planX + width * (.18 + (seed % 5) * .14);
    const doorY = entranceTop ? planY : planY + depth;
    const doorPath = entranceTop
      ? `M${doorX.toFixed(2)} ${doorY.toFixed(2)}h1.1a1.1 1.1 0 0 1-1.1 1.1`
      : `M${doorX.toFixed(2)} ${doorY.toFixed(2)}h1.1a1.1 1.1 0 0 0-1.1-1.1`;
    const scaleY = planY + depth + margin + .35;
    const carX = Math.max(.7, (canvasWidth - 7.2) / 2);
    const personX = carX + 5.8;
    const personBottom = scaleY + 1.8;
    const roomFont = Math.max(1.2, Math.min(2.2, canvasWidth * .045));
    const smallFont = Math.max(1, roomFont * .72);
    const scaleFont = Math.max(.8, Math.min(1.5, canvasWidth * .03));
    const roomSvg = rooms.map(room => `<rect class="plan-zone ${room.cls}" x="${room.x.toFixed(2)}" y="${room.y.toFixed(2)}" width="${room.w.toFixed(2)}" height="${room.h.toFixed(2)}"/><text class="room-label ${room.number > 2 ? 'small' : ''}" x="${(room.x + room.w / 2).toFixed(2)}" y="${(room.y + room.h / 2 + .35).toFixed(2)}">${room.number}</text>`).join('');
    return `<aside id="building-site-plan" class="title-site-plan premises-scale"><div class="plan-title"><strong>식당 평면도</strong><span>면적·업종 기반 추정</span></div>
      <div class="site-plan real-building"><svg class="building-shape restaurant-layout-svg" preserveAspectRatio="xMidYMid meet" style="--room-font:${roomFont.toFixed(2)}px;--small-font:${smallFont.toFixed(2)}px;--scale-font:${scaleFont.toFixed(2)}px" viewBox="0 0 ${canvasWidth.toFixed(2)} ${canvasHeight.toFixed(2)}" role="img" aria-label="면적과 업종에 따라 달라지는 추정 식당 평면도">
        <rect class="plan-shell" x="${planX.toFixed(2)}" y="${planY.toFixed(2)}" width="${width.toFixed(2)}" height="${depth.toFixed(2)}"/>
        ${roomSvg}<rect class="plan-counter" x="${counter.x.toFixed(2)}" y="${counter.y.toFixed(2)}" width="${counter.w.toFixed(2)}" height="${counter.h}"/>${tables}
        <path class="plan-door" d="${doorPath}"/><text class="room-label small" x="${(counter.x + counter.w / 2).toFixed(2)}" y="${(counter.y + .42).toFixed(2)}">5</text>
        <g class="scale-car-real" aria-label="길이 4.5미터, 폭 1.8미터 차량"><rect x="${carX.toFixed(2)}" y="${scaleY.toFixed(2)}" width="4.5" height="1.8" rx=".28"/><path class="car-window" d="M${(carX + 1.1).toFixed(2)} ${(scaleY + .28).toFixed(2)}h2.3v1.24h-2.3z"/></g>
        <g class="scale-person-silhouette" fill="#244a73" stroke="none" aria-label="키 1.7미터 사람"><circle cx="${personX.toFixed(2)}" cy="${(personBottom - 1.5).toFixed(2)}" r=".2"/><path d="M${personX.toFixed(2)} ${(personBottom - 1.3).toFixed(2)}l-.34.5.2.12.14-.2v.5l-.28.92h.22l.26-.62.26.62h.22l-.28-.92v-.5l.14.2.2-.12z"/></g>
      </svg></div><div class="plan-scale-key"><span>🚗 차량 4.5×1.8m</span><span>사람 키 1.7m</span></div>
      <div class="plan-legend"><span class="dining">1 홀</span><span class="kitchen">2 주방</span><span class="storage">3 창고</span><span class="restroom">4 화장실</span><span class="counter">5 카운터</span></div>
      <dl class="building-facts"><div><dt>식당 신고면적</dt><dd>${validArea ? `${area.toLocaleString('ko-KR')}㎡ · 약 ${(area / 3.305785).toFixed(1)}평` : '공개 정보 없음'}</dd></div><div><dt>추정 크기·구조</dt><dd>약 ${width.toFixed(1)}×${depth.toFixed(1)}m · ${layoutLabel}</dd></div></dl>
      <div class="parking-assessment"><strong>주차 가능성 확인 중</strong><span>VWorld 대지·건축면적 조회 후 계산</span></div>
      <small>차량 4.5×1.8m·사람 1.7m를 동일 축척으로 표시 · 내부 구획과 가로세로 비율은 추정 예시</small><div class="gis-building-status">VWorld 건물정보 조회 중</div></aside>`;
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
      const response = await fetch(`/api/building?address=${encodeURIComponent(naverMapAddress(address))}`);
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
      if (status) status.textContent = 'VWorld 일시 장애 · 평면도는 신고면적 기준으로 표시';
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
      if (f.sort === 'name') return left.name.localeCompare(right.name, 'ko');
      if (f.sort === 'rating') return right.rating - left.rating;
      return (Number(isSaved(right)) - Number(isSaved(left))) ||
        ((popularity[idOf(right)] || 0) - (popularity[idOf(left)] || 0)) ||
        right.rating - left.rating;
    });
    return rows.map(item => item.restaurant);
  }
  function card(r, index) {
    const permit = permitDateInfo(r.permitDate);
    return `<article class="restaurant-card" tabindex="0" data-index="${index}" data-place-key="${Math.abs(hash(idOf(r)))}">
      <div class="listing-photo neutral-photo" data-place-photo data-category-label="${escapeHtml(categoryLabel(r))}"><span data-photo-badge>${escapeHtml(categoryLabel(r))} · 사진 없음</span></div>
      <div class="card-body"><div class="card-top"><span class="category">${escapeHtml(r.category || '음식점')}</span><button class="save ${isSaved(r) ? 'active' : ''}" data-save="${index}" type="button" aria-label="저장">♡</button></div>
      <div class="card-identity"><h3>${escapeHtml(r.name)}</h3></div><p class="address">${escapeHtml(r.address)}</p>
      ${permit ? `<div class="tenure-badge"><span>영업 기간</span><strong>${escapeHtml(permit.duration)}</strong></div>` : ''}
      <div class="score"><strong>★ ${r.rating}</strong><span>${priceText(r.price)}</span></div>
      <div class="tags"><span>${permit ? '인허가일 확인됨' : '영업 정보 확인'}</span></div></div>
    </article>`;
  }
  function render() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize, shown = rows.slice(start, start + pageSize);
    $('#result-summary').textContent = `${rows.length.toLocaleString('ko-KR')}곳 · ${state.fullLoaded ? '전국 전체 데이터' : '빠른 미리보기'}`;
    $('#discover-title').textContent = state.filters.query ? '검색 결과' : '지금 많이 찾는 식당';
    $('#app-state').textContent = state.progress || (state.fullLoaded ? '카드를 눌러 상세 정보와 리뷰를 확인하세요.' : '검색하거나 필터를 적용하면 전국 전체 데이터를 불러옵니다.');
    $('#restaurant-grid').innerHTML = shown.map((r, i) => card(r, start + i)).join('') || '<div class="empty">조건에 맞는 식당이 없습니다.<br><button id="empty-reset" class="ghost">필터 초기화</button></div>';
    const mayHaveMore = state.searchSession && !state.searchSession.done;
    $('#pager').innerHTML = rows.length > pageSize || mayHaveMore ? `<button data-page="-1" ${state.page === 1 ? 'disabled' : ''}>이전</button><span>${state.page} / ${mayHaveMore ? '…' : pages}</span><button data-page="1" ${state.page === pages && !mayHaveMore ? 'disabled' : ''}>다음</button>` : '';
    $$('.restaurant-card').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.closest('[data-save]')) openDetail(rows[Number(el.dataset.index)]); });
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
      placeDetailCache.set(key, fetch(`/api/restaurant?name=${encodeURIComponent(r.name)}&address=${encodeURIComponent(naverMapAddress(r.address))}`)
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
    while ((filtered().length < targetCount || session.containsPages.length) && !session.done) {
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
    const containsPages = allChars.length >= 3
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
    await loadSearchResults(pageSize);
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
    state.filters.query = $('#search-input').value.trim(); state.page = 1; $('#suggestions').innerHTML = '';
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
    if (state.filters.query) await startSearch(state.filters.query);
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
    $('#search-input').value = ''; $$('#filters select').forEach(select => { select.selectedIndex = 0; });
    state.filters = { query: '', region: '', category: '', price: '', sort: 'recommend' };
    state.searchSession = null; state.all = state.preview; state.page = 1; render();
  }
  function renderSuggestions() {
    const q = searchKey($('#search-input').value);
    if (!q) { $('#suggestions').innerHTML = ''; return; }
    const matches = state.all.filter(r => searchKey(`${r.name} ${r.address}`).includes(q)).slice(0, 7);
    $('#suggestions').innerHTML = matches.map((r, i) => `<button data-suggestion="${i}" type="button"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.address)}</small></button>`).join('');
    $$('[data-suggestion]').forEach(el => el.addEventListener('click', () => { $('#search-input').value = matches[Number(el.dataset.suggestion)].name; applySearch(); }));
  }

  function reviewsFor(r) {
    return state.serverReviews.get(idOf(r)) || [];
  }
  async function loadReviews(r) {
    try {
      const data = await api(`/api/reviews?restaurant=${encodeURIComponent(idOf(r))}`);
      state.serverReviews.set(idOf(r), data.reviews);
      if (state.current === r) {
        const count = $('#review-count');
        if (count) count.textContent = data.reviews.length;
        renderReviews();
      }
      renderHomeRankings();
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
    const reviews = reviewsFor(r);
    const naverAddress = naverMapAddress(r.address);
    const naverQuery = encodeURIComponent(naverAddress);
    const fullQuery = encodeURIComponent(`${r.name} ${r.address || ''}`);
    const permit = permitDateInfo(r.permitDate);
    $('#modal-content').innerHTML = `<div id="place-cover" class="detail-cover neutral-photo" data-category-label="${escapeHtml(categoryLabel(r))}"><span>${escapeHtml(categoryLabel(r))} · 사진 없음</span></div><div class="detail-hero"><div class="detail-heading"><div><span class="category">${escapeHtml(r.category || '음식점')}</span><h2 id="detail-title">${escapeHtml(r.name)}</h2><p>${escapeHtml(r.address)}</p></div>${buildingSitePlan(r)}</div>
      <div class="detail-score"><strong>★ ${r.rating}</strong><span>${priceText(r.price)}</span></div>
      <div class="permit-highlight"><div><span>현재 영업 기간</span><b>${permit ? escapeHtml(permit.duration) : '확인 필요'}</b></div><div><span>영업 시작일</span><strong>${permit ? escapeHtml(permit.formatted) : '확인 필요'}</strong></div><small>행정안전부 식품위생 인허가일 기준 · 영업 기간은 매년 자동 갱신</small></div>
      <div class="detail-actions"><button id="detail-save" class="primary">${isSaved(r) ? '저장됨' : '♡ 저장'}</button><button id="add-list" class="ghost">리스트에 추가</button><button id="share" class="ghost">공유</button></div></div>
      <section id="place-extras" class="place-extras" aria-live="polite"><div class="place-loading">사진·가격·좌석 정보를 확인하는 중입니다.</div></section>
      <div class="detail-grid"><section><h3>식당 정보</h3><dl><dt>주소</dt><dd>${escapeHtml(r.address)}</dd><dt>전화번호</dt><dd id="place-phone">${escapeHtml(r.phone || '정보 없음')}</dd><dt>영업 시작일</dt><dd>${permit ? `${escapeHtml(permit.formatted)} <small>공공 인허가 기록 확인</small>` : '공공데이터 확인 필요'}</dd><dt>영업 기간</dt><dd>${permit ? escapeHtml(permit.duration) : '계산할 수 없음'}</dd><dt>영업시간</dt><dd id="place-hours">방문 전 지도 서비스에서 확인해 주세요.</dd></dl>
      <p class="data-source-note">영업 시작일은 ${escapeHtml(r.permitDateSource || '행정안전부 일반음식점 인허가 데이터')}의 식품위생 영업 인허가일 기준이며, 실제 첫 영업일과 다를 수 있습니다.</p>
      <div class="map-links"><a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${naverQuery}" title="${escapeHtml(naverAddress)} 주소로 검색">네이버 지도 · 주소검색</a><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${fullQuery}">Google 지도</a></div></section>
      <section class="review-section"><div class="review-head"><h3>사용자 리뷰 <small id="review-count">${reviews.length}</small></h3><select id="review-sort"><option value="latest">최신순</option><option value="rating">별점순</option><option value="helpful">유용한순</option></select></div>
      <div class="trust-note">✓ 리뷰는 Cloudflare 서버에 안전하게 저장되며 관리자 검토를 거칩니다.</div>
      <form id="review-form"><label>별점<select name="rating"><option value="5">5점</option><option value="4">4점</option><option value="3">3점</option><option value="2">2점</option><option value="1">1점</option></select></label><textarea name="text" required maxlength="500" placeholder="직접 경험한 맛과 분위기를 알려주세요."></textarea><label class="photo-label">사진 첨부<input name="photo" type="file" accept="image/*"></label><button class="primary" type="submit">리뷰 등록</button></form><div id="review-list"></div></section></div>`;
    $('#detail-modal').classList.add('open'); document.body.classList.add('locked');
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
      cover.style.backgroundImage = `url("${place.photoUrl.replace(/["\\]/g, '')}")`;
      cover.classList.add('loaded');
      cover.classList.remove('neutral-photo');
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
    $('#review-list').innerHTML = reviews.length ? reviews.map(r => `<article class="review"><div><strong>${escapeHtml(r.author)}</strong><span class="verified">솔직 리뷰</span><time>${new Date(r.createdAt).toLocaleDateString('ko-KR')}</time></div><b>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</b><p>${escapeHtml(r.text)}</p><button data-helpful="${r.id}" type="button">유용해요 ${r.helpful || 0}</button></article>`).join('') : '<p class="empty-reviews">첫 번째 솔직한 리뷰를 남겨주세요.</p>';
    $$('[data-helpful]').forEach(el => el.addEventListener('click', async () => {
      try {
        await api(`/api/reviews/${el.dataset.helpful}/helpful`, { method: 'POST' });
        await loadReviews(state.current);
      } catch (error) { toast(error.message); }
    }));
  }
  async function submitReview(event) {
    event.preventDefault();
    if (!state.serverUser) { toast('리뷰를 작성하려면 로그인해 주세요.'); return openPanel('auth'); }
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/reviews', { method: 'POST', body: JSON.stringify({
        restaurantId: idOf(state.current), restaurantName: state.current.name,
        rating: Number(data.get('rating')), text: data.get('text')
      }) });
      event.currentTarget.reset();
      await loadReviews(state.current);
      toast('리뷰를 서버에 등록했어요.');
    } catch (error) { toast(error.message); }
  }

  function closeModals() { $$('.modal-backdrop').forEach(x => x.classList.remove('open')); document.body.classList.remove('locked'); }
  function openPanel(type) {
    const content = $('#panel-content'); $('#panel-modal').classList.add('open'); document.body.classList.add('locked');
    if (type === 'saved') renderSavedPanel(content); else if (type === 'mypage') renderMyPage(content); else renderAuth(content);
  }
  function renderSavedPanel(content) {
    const saved = savedIds(), rows = state.all.filter(r => saved.includes(idOf(r)));
    const lists = state.serverUser ? state.serverLists : store.get('lists', { '가고 싶은 곳': saved });
    content.innerHTML = `<h2 id="panel-title">나의 맛집 리스트</h2><div class="list-tabs">${Object.keys(lists).map(name => `<button data-list="${escapeHtml(name)}">${escapeHtml(name)} <span>${lists[name].length}</span></button>`).join('')}<button id="new-list">＋ 새 리스트</button></div><div id="saved-grid" class="saved-grid">${rows.map((r, i) => `<button data-saved="${i}"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.address)}</small></button>`).join('') || '<p class="empty-reviews">저장한 식당이 없습니다.</p>'}</div><button id="share-list" class="ghost">현재 목록 공유</button>`;
    $$('[data-saved]').forEach(el => el.addEventListener('click', () => openDetail(rows[Number(el.dataset.saved)])));
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
        await api('/api/auth/logout', { method: 'POST' });
        state.serverUser = null; $('#auth-button').textContent = '로그인'; closeModals(); toast('로그아웃했습니다.');
      });
      return;
    }
    content.innerHTML = `<h2 id="panel-title">mukdang.com 계정</h2><p class="panel-lead">서버 계정으로 로그인하면 리뷰를 안전하게 저장할 수 있어요.</p><form id="email-login" class="profile-form"><label>이메일<input name="email" type="email" required autocomplete="email" placeholder="me@example.com"></label><label>비밀번호<input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="8자 이상"></label><label>이름 <small>신규 가입 시 필요</small><input name="name" autocomplete="name" placeholder="mukdang.com 사용자"></label><div class="row-actions"><button class="primary" name="action" value="login">로그인</button><button class="ghost" name="action" value="register">회원가입</button></div></form><p class="fine">비밀번호는 서버에서 단방향 암호화되어 저장됩니다.</p>`;
    $('#email-login').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const action = event.submitter?.value || 'login';
      try {
        const result = await api(`/api/auth/${action}`, { method: 'POST', body: JSON.stringify({
          email: data.get('email'), password: data.get('password'), name: data.get('name')
        }) });
        state.serverUser = result.user;
        await loadUserData();
        $('#auth-button').textContent = result.user.name;
        closeModals(); toast(action === 'register' ? '회원가입했습니다.' : '로그인했습니다.');
      } catch (error) { toast(error.message); }
    });
  }
  function renderMyPage(content) {
    const profile = state.serverUser || { name: '게스트', badge: '새싹 리뷰어' }, reviewCount = [...state.serverReviews.values()].flat().filter(review => review.author === profile.name).length;
    content.innerHTML = `<h2 id="panel-title">마이페이지</h2><div class="profile-card"><div class="avatar">${escapeHtml(profile.name[0])}</div><div><strong>${escapeHtml(profile.name)}</strong><span>${escapeHtml(profile.badge || '새싹 리뷰어')}</span></div></div><div class="my-stats"><div><strong>${reviewCount}</strong><span>리뷰</span></div><div><strong>${savedIds().length}</strong><span>저장</span></div></div><h3>프로필 설정</h3><form id="profile-form" class="profile-form"><label>닉네임<input name="name" value="${escapeHtml(profile.name)}"></label><label>소개<textarea name="bio" placeholder="나의 맛집 취향을 소개해 보세요.">${escapeHtml(profile.bio || '')}</textarea></label><label>선호 음식<select name="favorite"><option value="">선택 안 함</option>${['한식','일식','중식','양식','분식'].map(food => `<option ${profile.favorite === food ? 'selected' : ''}>${food}</option>`).join('')}</select></label><button class="primary">프로필 저장</button></form><h3>내 리뷰 관리</h3><p class="trust-note">작성한 리뷰 ${reviewCount}개 · 저장 데이터는 계정과 함께 서버에 보관됩니다.</p>`;
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

  $('#search-button').addEventListener('click', applySearch);
  $('#search-input').addEventListener('input', () => { renderSuggestions(); prefetchSearch($('#search-input').value).catch(() => {}); });
  $('#search-input').addEventListener('keydown', e => e.key === 'Enter' && applySearch());
  $$('#filters select').forEach(el => el.addEventListener('change', applyFilters));
  $('#filter-reset').addEventListener('click', resetFilters);
  $('#filter-toggle').addEventListener('click', () => $('#filters').classList.toggle('open'));
  $$('[data-category]').forEach(el => el.addEventListener('click', () => { $$('[data-category]').forEach(button => button.classList.toggle('active', button === el)); $('#category-filter').value = el.dataset.category; state.filters.category = el.dataset.category; state.searchSession = null; state.all = state.preview; render(); $('#discover').scrollIntoView(); }));
  $$('[data-open-panel]').forEach(el => el.addEventListener('click', () => openPanel(el.dataset.openPanel)));
  $('#auth-button').addEventListener('click', () => openPanel('auth'));
  $$('[data-close]').forEach(el => el.addEventListener('click', closeModals));
  $$('.modal-backdrop').forEach(el => el.addEventListener('click', e => e.target === el && closeModals()));
  document.addEventListener('keydown', e => e.key === 'Escape' && closeModals());
  $$('[data-home]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    window.location.assign(new URL('./', window.location.href));
  }));

  try {
    const [regionsResponse, previewsResponse] = await Promise.all([fetch('data/restaurants/regions.json?v=20260728-4'), fetch('data/restaurants/previews.json?v=20260728-4')]);
    if (!regionsResponse.ok || !previewsResponse.ok) throw Error('목록 로드 실패');
    const regionData = await regionsResponse.json(), previews = await previewsResponse.json();
    window.__MEOKDANG_REGIONS__ = regionData.regions; state.preview = enrich(mixPreviews(previews)); state.all = state.preview;
    regionData.regions.forEach(r => $('#region-filter').insertAdjacentHTML('beforeend', `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`));
    [...new Set(state.preview.map(r => r.category).filter(Boolean))].sort().forEach(c => $('#category-filter').insertAdjacentHTML('beforeend', `<option>${escapeHtml(c)}</option>`));
    try {
      const auth = await api('/api/auth/me');
      state.serverUser = auth.user;
      if (state.serverUser) { await loadUserData(); $('#auth-button').textContent = state.serverUser.name; }
      const latest = await api('/api/reviews');
      state.serverReviews.set('__latest__', latest.reviews);
    } catch {}
    updateSavedCount(); render();
    $('#search-button').disabled = false;
    $('#search-button').textContent = '검색';
    resolveReady();
  } catch (error) {
    console.error(error);
    $('#app-state').textContent = '식당 데이터를 불러오지 못했습니다. 새로고침해 주세요.';
    resolveReady();
  }
})();
