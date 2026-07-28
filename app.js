(async function () {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pageSize = 10;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const state = {
    preview: [], all: [], fullLoaded: false, loading: null, page: 1,
    filters: { query: '', region: '', category: '', price: '', mood: '', sort: 'recommend' },
    current: null, progress: '', searchSession: null
  };
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
      return { ...r, name, price: seed % 3 + 1, mood: ['혼밥', '데이트', '가족 외식', '회식'][seed % 4], rating: (3.6 + (seed % 14) / 10).toFixed(1), trust: 78 + seed % 21 };
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
  function savedIds() { return store.get('saved', []); }
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

    const allReviews = Object.entries(store.get('reviews', {})).flatMap(([restaurantId, reviews]) =>
      reviews.map(review => ({ ...review, restaurant: restaurantId.split('|')[0] }))
    );
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
  function toggleSaved(r) {
    const saved = savedIds(), id = idOf(r), exists = saved.includes(id);
    store.set('saved', exists ? saved.filter(x => x !== id) : [...saved, id]);
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
  function premisesInfo(r) {
    const address = String(r.address || '');
    const floorMatches = [...address.matchAll(/(지하\s*\d+|B\s*\d+|\d+)\s*층/gi)].map(match => {
      const raw = match[1].replace(/\s+/g, '').toUpperCase();
      if (raw.startsWith('지하')) return `지하 ${raw.replace('지하', '')}층`;
      if (raw.startsWith('B')) return `지하 ${raw.slice(1)}층`;
      return `${raw}층`;
    });
    const floors = [...new Set(floorMatches)];
    const unit = address.match(/(?:^|[\s,(])([A-Za-z가-힣]?\d+(?:-\d+)?(?:A|B)?호)(?=$|[\s,)])/i)?.[1] || '';
    const areaM2 = Number(r.facilityAreaM2);
    const validArea = Number.isFinite(areaM2) && areaM2 > 0;
    const pyeong = validArea ? areaM2 / 3.305785 : null;
    const kitchenRatio = /카페|커피|다방|제과/.test(r.category || '') ? 0.24
      : /횟집|복어|중국|탕류|식육|숯불/.test(r.category || '') ? 0.36 : 0.31;
    const supportRatio = 0.14;
    const diningRatio = 1 - kitchenRatio - supportRatio;
    const seats = validArea ? {
      min: Math.max(2, Math.floor(areaM2 * diningRatio / 1.8)),
      max: Math.max(4, Math.floor(areaM2 * diningRatio / 1.35))
    } : null;
    return { floors, unit, location: [floors.join('·'), unit].filter(Boolean).join(' '), areaM2: validArea ? areaM2 : null, pyeong, kitchenRatio, supportRatio, diningRatio, seats };
  }
  function buildingSitePlan() {
    return `<aside class="title-site-plan"><div class="plan-title"><strong>건물·대지</strong><span>개념도</span></div>
      <div class="site-plan" role="img" aria-label="대지와 건물 배치 개념도, 자동차 한 대와 사람 한 명">
        <div class="site-road"><span class="scale-car" aria-label="자동차">🚗</span><span>도로</span></div>
        <div class="site-lot"><span>대지</span><div class="building-footprint"><b>건물</b><i>출입구</i></div><span class="scale-person" aria-label="사람">🚶</span></div>
      </div><small>실제 도면이 아닌 GIS 연결 전 개념 배치</small></aside>`;
  }
  const categoryLabel = r => String(r.category || '음식점').replace(/\s+/g, ' ').trim();

  function filtered() {
    const f = state.filters, q = searchKey(f.query);
    let rows = state.all.map(r => ({ restaurant: r, relevance: relevance(q, r) })).filter(item =>
      item.relevance > 0 &&
      (!f.region || item.restaurant.address?.startsWith(f.region)) &&
      (!f.category || item.restaurant.category?.includes(f.category)) &&
      (!f.price || String(item.restaurant.price) === f.price) &&
      (!f.mood || item.restaurant.mood === f.mood)
    );
    const popularity = store.get('popularity', {});
    rows.sort((a, b) => {
      if (q && b.relevance !== a.relevance) return b.relevance - a.relevance;
      const left = a.restaurant, right = b.restaurant;
      if (f.sort === 'name') return left.name.localeCompare(right.name, 'ko');
      if (f.sort === 'rating') return right.rating - left.rating;
      if (f.sort === 'trust') return right.trust - left.trust;
      return (Number(isSaved(right)) - Number(isSaved(left))) ||
        ((popularity[idOf(right)] || 0) - (popularity[idOf(left)] || 0)) ||
        right.trust - left.trust;
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
      <div class="score"><strong>★ ${r.rating}</strong><span>신뢰도 ${r.trust}%</span><span>${priceText(r.price)}</span></div>
      <div class="tags"><span>${r.mood}</span><span>${permit ? '인허가일 확인됨' : '영업 정보 확인'}</span></div></div>
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
    ['region', 'category', 'price', 'mood', 'sort'].forEach(key => { state.filters[key] = $(`#${key}-filter`).value; });
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
    state.filters = { query: '', region: '', category: '', price: '', mood: '', sort: 'recommend' };
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
    const hidden = new Set(store.get('hidden-reviews', []).map(String));
    return (store.get('reviews', {})[idOf(r)] || []).filter(review => !hidden.has(String(review.id)));
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
    $('#modal-content').innerHTML = `<div id="place-cover" class="detail-cover neutral-photo" data-category-label="${escapeHtml(categoryLabel(r))}"><span>${escapeHtml(categoryLabel(r))} · 사진 없음</span></div><div class="detail-hero"><div class="detail-heading"><div><span class="category">${escapeHtml(r.category || '음식점')}</span><h2 id="detail-title">${escapeHtml(r.name)}</h2><p>${escapeHtml(r.address)}</p></div>${buildingSitePlan()}</div>
      <div class="detail-score"><strong>★ ${r.rating}</strong><span>리뷰 신뢰도 ${r.trust}%</span><span>${priceText(r.price)} · ${r.mood}</span></div>
      <div class="permit-highlight"><div><span>현재 영업 기간</span><b>${permit ? escapeHtml(permit.duration) : '확인 필요'}</b></div><div><span>영업 시작일</span><strong>${permit ? escapeHtml(permit.formatted) : '확인 필요'}</strong></div><small>행정안전부 식품위생 인허가일 기준 · 영업 기간은 매년 자동 갱신</small></div>
      <div class="detail-actions"><button id="detail-save" class="primary">${isSaved(r) ? '저장됨' : '♡ 저장'}</button><button id="add-list" class="ghost">리스트에 추가</button><button id="share" class="ghost">공유</button></div></div>
      <section id="place-extras" class="place-extras" aria-live="polite"><div class="place-loading">사진·가격·좌석 정보를 확인하는 중입니다.</div></section>
      <div class="detail-grid"><section><h3>식당 정보</h3><dl><dt>주소</dt><dd>${escapeHtml(r.address)}</dd><dt>전화번호</dt><dd id="place-phone">${escapeHtml(r.phone || '정보 없음')}</dd><dt>영업 시작일</dt><dd>${permit ? `${escapeHtml(permit.formatted)} <small>공공 인허가 기록 확인</small>` : '공공데이터 확인 필요'}</dd><dt>영업 기간</dt><dd>${permit ? escapeHtml(permit.duration) : '계산할 수 없음'}</dd><dt>영업시간</dt><dd id="place-hours">방문 전 지도 서비스에서 확인해 주세요.</dd></dl>
      <p class="data-source-note">영업 시작일은 ${escapeHtml(r.permitDateSource || '행정안전부 일반음식점 인허가 데이터')}의 식품위생 영업 인허가일 기준이며, 실제 첫 영업일과 다를 수 있습니다.</p>
      <div class="map-links"><a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${naverQuery}" title="${escapeHtml(naverAddress)} 주소로 검색">네이버 지도 · 주소검색</a><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${fullQuery}">Google 지도</a></div></section>
      <section class="review-section"><div class="review-head"><h3>사용자 리뷰 <small>${reviews.length}</small></h3><select id="review-sort"><option value="latest">최신순</option><option value="rating">별점순</option><option value="helpful">유용한순</option></select></div>
      <div class="trust-note">✓ 작성 리뷰는 기기에 저장됩니다. 방문 인증과 광고성 리뷰 자동 검토는 서버 연동 후 제공됩니다.</div>
      <form id="review-form"><label>별점<select name="rating"><option value="5">5점</option><option value="4">4점</option><option value="3">3점</option><option value="2">2점</option><option value="1">1점</option></select></label><textarea name="text" required maxlength="500" placeholder="직접 경험한 맛과 분위기를 알려주세요."></textarea><label class="photo-label">사진 첨부<input name="photo" type="file" accept="image/*"></label><button class="primary" type="submit">리뷰 등록</button></form><div id="review-list"></div></section></div>`;
    $('#detail-modal').classList.add('open'); document.body.classList.add('locked');
    $('#detail-save').addEventListener('click', () => { toggleSaved(r); openDetail(r); });
    $('#add-list').addEventListener('click', () => openListPicker(r));
    $('#share').addEventListener('click', () => shareText(`${r.name} · ${r.address}`));
    $('#review-sort').addEventListener('change', renderReviews);
    $('#review-form').addEventListener('submit', submitReview);
    renderReviews();
    fetchPlaceDetails(r).then(place => renderPlaceDetails(r, place));
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
    $$('[data-helpful]').forEach(el => el.addEventListener('click', () => {
      const all = store.get('reviews', {}), target = all[idOf(state.current)].find(x => x.id === Number(el.dataset.helpful)); target.helpful = (target.helpful || 0) + 1; store.set('reviews', all); renderReviews(); renderHomeRankings();
    }));
  }
  function submitReview(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget), all = store.get('reviews', {}), id = idOf(state.current);
    all[id] = all[id] || []; all[id].push({ id: Date.now(), author: store.get('profile', {}).name || 'mukdang.com 사용자', rating: Number(data.get('rating')), text: data.get('text'), helpful: 0, createdAt: Date.now() });
    store.set('reviews', all); event.currentTarget.reset(); renderReviews(); renderHomeRankings(); toast('리뷰를 등록했어요.');
  }

  function closeModals() { $$('.modal-backdrop').forEach(x => x.classList.remove('open')); document.body.classList.remove('locked'); }
  function openPanel(type) {
    const content = $('#panel-content'); $('#panel-modal').classList.add('open'); document.body.classList.add('locked');
    if (type === 'saved') renderSavedPanel(content); else if (type === 'mypage') renderMyPage(content); else renderAuth(content);
  }
  function renderSavedPanel(content) {
    const saved = savedIds(), rows = state.all.filter(r => saved.includes(idOf(r))), lists = store.get('lists', { '가고 싶은 곳': saved });
    content.innerHTML = `<h2 id="panel-title">나의 맛집 리스트</h2><div class="list-tabs">${Object.keys(lists).map(name => `<button data-list="${escapeHtml(name)}">${escapeHtml(name)} <span>${lists[name].length}</span></button>`).join('')}<button id="new-list">＋ 새 리스트</button></div><div id="saved-grid" class="saved-grid">${rows.map((r, i) => `<button data-saved="${i}"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.address)}</small></button>`).join('') || '<p class="empty-reviews">저장한 식당이 없습니다.</p>'}</div><button id="share-list" class="ghost">현재 목록 공유</button>`;
    $$('[data-saved]').forEach(el => el.addEventListener('click', () => openDetail(rows[Number(el.dataset.saved)])));
    $('#new-list').addEventListener('click', () => { const name = prompt('새 리스트 이름을 입력하세요.'); if (!name?.trim()) return; const next = store.get('lists', {}); next[name.trim()] = next[name.trim()] || []; store.set('lists', next); renderSavedPanel(content); });
    $('#share-list').addEventListener('click', () => shareText(`mukdang.com 맛집 리스트: ${rows.map(r => r.name).join(', ') || '아직 비어 있어요'}`));
  }
  function openListPicker(r) {
    const lists = store.get('lists', { '데이트 맛집': [], '가족 외식': [], '회식 장소': [] });
    const name = prompt(`추가할 리스트 이름을 입력하세요.\n${Object.keys(lists).join(' / ')}`, Object.keys(lists)[0] || '가고 싶은 곳');
    if (!name?.trim()) return; lists[name.trim()] = lists[name.trim()] || []; if (!lists[name.trim()].includes(idOf(r))) lists[name.trim()].push(idOf(r)); store.set('lists', lists); toast(`‘${name.trim()}’ 리스트에 추가했어요.`);
  }
  function renderAuth(content) {
    content.innerHTML = `<h2 id="panel-title">mukdang.com 시작하기</h2><p class="panel-lead">로그인하면 여러 기기에서 취향과 리스트를 이어갈 수 있어요.</p><button id="social-login" class="social">간편 로그인 데모</button><div class="divider">또는</div><form id="email-login" class="profile-form"><label>이메일<input type="email" required placeholder="me@example.com"></label><label>이름<input required placeholder="mukdang.com 사용자"></label><button class="primary">이메일로 시작</button></form><p class="fine">현재는 프론트엔드 데모로, 계정 정보가 이 브라우저에만 저장됩니다.</p>`;
    $('#social-login').addEventListener('click', () => login('mukdang 탐험가'));
    $('#email-login').addEventListener('submit', e => { e.preventDefault(); login(e.currentTarget.elements[1].value); });
  }
  function login(name) { store.set('profile', { name, loggedIn: true, badge: '새싹 리뷰어' }); $('#auth-button').textContent = name; closeModals(); toast('로그인했어요.'); }
  function renderMyPage(content) {
    const profile = store.get('profile', { name: '게스트', badge: '새싹 리뷰어' }), reviewCount = Object.values(store.get('reviews', {})).flat().length;
    content.innerHTML = `<h2 id="panel-title">마이페이지</h2><div class="profile-card"><div class="avatar">${escapeHtml(profile.name[0])}</div><div><strong>${escapeHtml(profile.name)}</strong><span>${profile.badge}</span></div></div><div class="my-stats"><div><strong>${reviewCount}</strong><span>리뷰</span></div><div><strong>${savedIds().length}</strong><span>저장</span></div></div><h3>프로필 설정</h3><form id="profile-form" class="profile-form"><label>닉네임<input name="name" value="${escapeHtml(profile.name)}"></label><label>소개<textarea name="bio" placeholder="나의 맛집 취향을 소개해 보세요.">${escapeHtml(profile.bio || '')}</textarea></label><label>선호 음식<select name="favorite"><option value="">선택 안 함</option>${['한식','일식','중식','양식','분식'].map(food => `<option ${profile.favorite === food ? 'selected' : ''}>${food}</option>`).join('')}</select></label><button class="primary">프로필 저장</button></form><h3>내 리뷰 관리</h3><p class="trust-note">작성한 리뷰 ${reviewCount}개 · 신뢰도 뱃지는 방문 인증 기능 연동 후 성장합니다.</p>`;
    $('#profile-form').addEventListener('submit', e => { e.preventDefault(); const data = new FormData(e.currentTarget); const name = data.get('name') || 'mukdang.com 사용자'; store.set('profile', { name, loggedIn: Boolean(profile.loggedIn), badge: profile.badge || '새싹 리뷰어', bio: data.get('bio') || '', favorite: data.get('favorite') || '' }); $('#auth-button').textContent = name; toast('프로필을 저장했어요.'); });
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
    const profile = store.get('profile', {}); if (profile.loggedIn) $('#auth-button').textContent = profile.name;
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
