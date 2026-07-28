(async function () {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const pageSize = 18;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const state = {
    preview: [], all: [], fullLoaded: false, loading: null, page: 1,
    filters: { query: '', region: '', category: '', price: '', mood: '', sort: 'recommend' },
    current: null, progress: ''
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
  function relevance(query, restaurant) {
    if (!query) return 1;
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
  const hash = value => [...String(value)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const idOf = restaurant => `${restaurant.name}|${restaurant.address}`;
  const fileUrl = file => `data/restaurants/${file.replace(/%/g, '%25')}`;
  const searchShardCache = new Map();

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
  function enrich(list) {
    return list.filter(r => r.name).map(r => {
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
  function toggleSaved(r) {
    const saved = savedIds(), id = idOf(r), exists = saved.includes(id);
    store.set('saved', exists ? saved.filter(x => x !== id) : [...saved, id]);
    updateSavedCount(); toast(exists ? '저장 목록에서 삭제했어요.' : '가고 싶은 곳에 저장했어요.'); render();
  }
  function priceText(price) { return '₩'.repeat(Number(price)); }

  function filtered() {
    const f = state.filters, q = searchKey(f.query);
    let rows = state.all.map(r => ({ restaurant: r, relevance: relevance(q, r) })).filter(item =>
      item.relevance > 0 &&
      (!f.region || item.restaurant.address?.startsWith(f.region)) &&
      (!f.category || item.restaurant.category?.includes(f.category)) &&
      (!f.price || String(item.restaurant.price) === f.price) &&
      (!f.mood || item.restaurant.mood === f.mood)
    );
    rows.sort((a, b) => {
      if (q && b.relevance !== a.relevance) return b.relevance - a.relevance;
      const left = a.restaurant, right = b.restaurant;
      if (f.sort === 'name') return left.name.localeCompare(right.name, 'ko');
      if (f.sort === 'rating') return right.rating - left.rating;
      if (f.sort === 'trust') return right.trust - left.trust;
      return (Number(isSaved(right)) - Number(isSaved(left))) || right.trust - left.trust;
    });
    return rows.map(item => item.restaurant);
  }
  function card(r, index) {
    return `<article class="restaurant-card" tabindex="0" data-index="${index}">
      <div class="card-top"><span class="category">${escapeHtml(r.category || '음식점')}</span><button class="save ${isSaved(r) ? 'active' : ''}" data-save="${index}" type="button" aria-label="저장">♡</button></div>
      <h3>${escapeHtml(r.name)}</h3><p class="address">${escapeHtml(r.address)}</p>
      <div class="score"><strong>★ ${r.rating}</strong><span>신뢰도 ${r.trust}%</span><span>${priceText(r.price)}</span></div>
      <div class="tags"><span>${r.mood}</span><span>영업 정보 확인</span></div>
    </article>`;
  }
  function render() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize, shown = rows.slice(start, start + pageSize);
    $('#result-summary').textContent = `${rows.length.toLocaleString('ko-KR')}곳 · ${state.fullLoaded ? '전국 전체 데이터' : '빠른 미리보기'}`;
    $('#app-state').textContent = state.progress || (state.fullLoaded ? '카드를 눌러 상세 정보와 리뷰를 확인하세요.' : '검색하거나 필터를 적용하면 전국 전체 데이터를 불러옵니다.');
    $('#restaurant-grid').innerHTML = shown.map((r, i) => card(r, start + i)).join('') || '<div class="empty">조건에 맞는 식당이 없습니다.<br><button id="empty-reset" class="ghost">필터 초기화</button></div>';
    $('#pager').innerHTML = rows.length > pageSize ? `<button data-page="-1" ${state.page === 1 ? 'disabled' : ''}>이전</button><span>${state.page} / ${pages}</span><button data-page="1" ${state.page === pages ? 'disabled' : ''}>다음</button>` : '';
    $$('.restaurant-card').forEach(el => {
      el.addEventListener('click', e => { if (!e.target.closest('[data-save]')) openDetail(rows[Number(el.dataset.index)]); });
      el.addEventListener('keydown', e => e.key === 'Enter' && openDetail(rows[Number(el.dataset.index)]));
    });
    $$('[data-save]').forEach(el => el.addEventListener('click', () => toggleSaved(rows[Number(el.dataset.save)])));
    $$('[data-page]').forEach(el => el.addEventListener('click', () => { state.page += Number(el.dataset.page); render(); $('#discover').scrollIntoView(); }));
    $('#empty-reset')?.addEventListener('click', resetFilters);
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
          const response = await fetch(`${fileUrl(region.file)}?v=20260728-2`);
          if (!response.ok) throw Error(`${region.name} 데이터 응답 ${response.status}`);
          loaded = loaded.concat(enrich(await response.json()));
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
  async function loadSearchShard(query) {
    const first = [...searchKey(query)][0];
    if (!first) return state.preview;
    const bucket = first.codePointAt(0).toString(16);
    if (!searchShardCache.has(bucket)) {
      searchShardCache.set(bucket, fetch(`data/restaurants/search/${bucket}.json?v=1`).then(response => {
        if (response.status === 404) return [];
        if (!response.ok) throw Error(`검색 색인 응답 ${response.status}`);
        return response.json();
      }).then(rows => enrich(rows.map(([name, category, address, phone]) => ({ name, category, address, phone })))));
    }
    return searchShardCache.get(bucket);
  }
  async function applySearch() {
    state.filters.query = $('#search-input').value.trim(); state.page = 1; $('#suggestions').innerHTML = '';
    const button = $('#search-button');
    button.disabled = true;
    button.textContent = '찾는 중';
    state.progress = state.filters.query ? `‘${state.filters.query}’ 검색을 시작합니다…` : '전국 맛집을 불러오는 중…';
    render();
    $('#discover').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      await ready;
      if (!window.__MEOKDANG_REGIONS__?.length) throw Error('검색 데이터 초기화 실패');
      state.all = state.filters.query ? await loadSearchShard(state.filters.query) : state.preview;
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
    if (state.filters.query) state.all = await loadSearchShard(state.filters.query);
    else if (state.filters.region) {
      const region = window.__MEOKDANG_REGIONS__.find(item => item.name === state.filters.region);
      if (region) {
        state.progress = `${region.name} 식당을 불러오는 중…`;
        render();
        const response = await fetch(`${fileUrl(region.file)}?v=20260728-2`);
        state.all = enrich(await response.json());
        state.progress = '';
      }
    } else state.all = state.preview;
    render();
  }
  function resetFilters() {
    $('#search-input').value = ''; $$('#filters select').forEach(select => { select.selectedIndex = 0; });
    state.filters = { query: '', region: '', category: '', price: '', mood: '', sort: 'recommend' }; state.page = 1; render();
  }
  function renderSuggestions() {
    const q = searchKey($('#search-input').value);
    if (!q) { $('#suggestions').innerHTML = ''; return; }
    const matches = state.all.filter(r => searchKey(`${r.name} ${r.address}`).includes(q)).slice(0, 7);
    $('#suggestions').innerHTML = matches.map((r, i) => `<button data-suggestion="${i}" type="button"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.address)}</small></button>`).join('');
    $$('[data-suggestion]').forEach(el => el.addEventListener('click', () => { $('#search-input').value = matches[Number(el.dataset.suggestion)].name; applySearch(); }));
  }

  function reviewsFor(r) { return store.get('reviews', {})[idOf(r)] || []; }
  function openDetail(r) {
    state.current = r;
    const reviews = reviewsFor(r), query = encodeURIComponent(`${r.name} ${r.address || ''}`);
    $('#modal-content').innerHTML = `<div class="detail-hero"><span class="category">${escapeHtml(r.category || '음식점')}</span><h2 id="detail-title">${escapeHtml(r.name)}</h2><p>${escapeHtml(r.address)}</p>
      <div class="detail-score"><strong>★ ${r.rating}</strong><span>리뷰 신뢰도 ${r.trust}%</span><span>${priceText(r.price)} · ${r.mood}</span></div>
      <div class="detail-actions"><button id="detail-save" class="primary">${isSaved(r) ? '저장됨' : '♡ 저장'}</button><button id="add-list" class="ghost">리스트에 추가</button><button id="share" class="ghost">공유</button></div></div>
      <div class="detail-grid"><section><h3>식당 정보</h3><dl><dt>주소</dt><dd>${escapeHtml(r.address)}</dd><dt>전화번호</dt><dd>${escapeHtml(r.phone || '정보 없음')}</dd><dt>영업시간</dt><dd>방문 전 지도 서비스에서 확인해 주세요.</dd></dl>
      <div class="map-links"><a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${query}">네이버 지도</a><a target="_blank" rel="noopener" href="https://map.kakao.com/?q=${query}">카카오맵</a><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${query}">Google 지도</a></div></section>
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
  }
  function renderReviews() {
    const sort = $('#review-sort')?.value || 'latest';
    const reviews = [...reviewsFor(state.current)].sort((a, b) => sort === 'rating' ? b.rating - a.rating : sort === 'helpful' ? b.helpful - a.helpful : b.createdAt - a.createdAt);
    $('#review-list').innerHTML = reviews.length ? reviews.map(r => `<article class="review"><div><strong>${escapeHtml(r.author)}</strong><span class="verified">솔직 리뷰</span><time>${new Date(r.createdAt).toLocaleDateString('ko-KR')}</time></div><b>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</b><p>${escapeHtml(r.text)}</p><button data-helpful="${r.id}" type="button">유용해요 ${r.helpful || 0}</button></article>`).join('') : '<p class="empty-reviews">첫 번째 솔직한 리뷰를 남겨주세요.</p>';
    $$('[data-helpful]').forEach(el => el.addEventListener('click', () => {
      const all = store.get('reviews', {}), target = all[idOf(state.current)].find(x => x.id === Number(el.dataset.helpful)); target.helpful = (target.helpful || 0) + 1; store.set('reviews', all); renderReviews();
    }));
  }
  function submitReview(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget), all = store.get('reviews', {}), id = idOf(state.current);
    all[id] = all[id] || []; all[id].push({ id: Date.now(), author: store.get('profile', {}).name || '먹당 사용자', rating: Number(data.get('rating')), text: data.get('text'), helpful: 0, createdAt: Date.now() });
    store.set('reviews', all); event.currentTarget.reset(); renderReviews(); toast('리뷰를 등록했어요.');
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
    $('#share-list').addEventListener('click', () => shareText(`먹당 맛집 리스트: ${rows.map(r => r.name).join(', ') || '아직 비어 있어요'}`));
  }
  function openListPicker(r) {
    const lists = store.get('lists', { '데이트 맛집': [], '가족 외식': [], '회식 장소': [] });
    const name = prompt(`추가할 리스트 이름을 입력하세요.\n${Object.keys(lists).join(' / ')}`, Object.keys(lists)[0] || '가고 싶은 곳');
    if (!name?.trim()) return; lists[name.trim()] = lists[name.trim()] || []; if (!lists[name.trim()].includes(idOf(r))) lists[name.trim()].push(idOf(r)); store.set('lists', lists); toast(`‘${name.trim()}’ 리스트에 추가했어요.`);
  }
  function renderAuth(content) {
    content.innerHTML = `<h2 id="panel-title">먹당 시작하기</h2><p class="panel-lead">로그인하면 여러 기기에서 취향과 리스트를 이어갈 수 있어요.</p><button id="social-login" class="social">간편 로그인 데모</button><div class="divider">또는</div><form id="email-login" class="profile-form"><label>이메일<input type="email" required placeholder="me@example.com"></label><label>이름<input required placeholder="먹당 사용자"></label><button class="primary">이메일로 시작</button></form><p class="fine">현재는 프론트엔드 데모로, 계정 정보가 이 브라우저에만 저장됩니다.</p>`;
    $('#social-login').addEventListener('click', () => login('먹당 탐험가'));
    $('#email-login').addEventListener('submit', e => { e.preventDefault(); login(e.currentTarget.elements[1].value); });
  }
  function login(name) { store.set('profile', { name, loggedIn: true, badge: '새싹 리뷰어' }); $('#auth-button').textContent = name; closeModals(); toast('로그인했어요.'); }
  function renderMyPage(content) {
    const profile = store.get('profile', { name: '게스트', badge: '새싹 리뷰어' }), reviewCount = Object.values(store.get('reviews', {})).flat().length;
    content.innerHTML = `<h2 id="panel-title">마이페이지</h2><div class="profile-card"><div class="avatar">${escapeHtml(profile.name[0])}</div><div><strong>${escapeHtml(profile.name)}</strong><span>${profile.badge}</span></div></div><div class="my-stats"><div><strong>${savedIds().length}</strong><span>저장</span></div><div><strong>${reviewCount}</strong><span>리뷰</span></div><div><strong>0</strong><span>알림</span></div></div><form id="profile-form" class="profile-form"><label>표시 이름<input name="name" value="${escapeHtml(profile.name)}"></label><label class="check"><input type="checkbox" name="notify" ${profile.notify ? 'checked' : ''}> 리뷰 반응 알림 받기</label><button class="primary">프로필 저장</button></form><h3>내 리뷰</h3><p class="trust-note">작성한 리뷰 ${reviewCount}개 · 신뢰도 뱃지는 방문 인증 기능 연동 후 성장합니다.</p>`;
    $('#profile-form').addEventListener('submit', e => { e.preventDefault(); const data = new FormData(e.currentTarget); store.set('profile', { ...profile, name: data.get('name') || '먹당 사용자', notify: data.get('notify') === 'on' }); $('#auth-button').textContent = data.get('name'); toast('프로필을 저장했어요.'); });
  }
  async function shareText(text) {
    try { if (navigator.share) await navigator.share({ title: '먹당', text, url: location.href }); else { await navigator.clipboard.writeText(`${text}\n${location.href}`); toast('공유 내용을 복사했어요.'); } } catch {}
  }

  $('#search-button').addEventListener('click', applySearch);
  $('#search-input').addEventListener('input', renderSuggestions);
  $('#search-input').addEventListener('keydown', e => e.key === 'Enter' && applySearch());
  $$('#filters select').forEach(el => el.addEventListener('change', applyFilters));
  $('#filter-reset').addEventListener('click', resetFilters);
  $('#filter-toggle').addEventListener('click', () => $('#filters').classList.toggle('open'));
  $$('[data-category]').forEach(el => el.addEventListener('click', () => { $('#category-filter').value = el.dataset.category; state.filters.category = el.dataset.category; state.all = state.preview; render(); $('#discover').scrollIntoView(); }));
  $$('[data-open-panel]').forEach(el => el.addEventListener('click', () => openPanel(el.dataset.openPanel)));
  $('#auth-button').addEventListener('click', () => openPanel('auth'));
  $$('[data-close]').forEach(el => el.addEventListener('click', closeModals));
  $$('.modal-backdrop').forEach(el => el.addEventListener('click', e => e.target === el && closeModals()));
  document.addEventListener('keydown', e => e.key === 'Escape' && closeModals());

  try {
    const [regionsResponse, previewsResponse] = await Promise.all([fetch('data/restaurants/regions.json'), fetch('data/restaurants/previews.json')]);
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
