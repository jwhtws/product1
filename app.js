(async function () {
  const input = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const suggestions = document.getElementById('suggestions');
  const grid = document.getElementById('restaurant-grid');
  const state = document.getElementById('app-state');
  const summary = document.getElementById('result-summary');
  const pager = document.getElementById('pager');
  const modal = document.getElementById('detail-modal');
  const modalContent = document.getElementById('modal-content');
  // 초기 HTML 샘플(구 데이터)이 잠깐 노출되지 않도록 비웁니다.
  grid.innerHTML = '';
  const pageSize = 20;
  let restaurants = [];
  let allRestaurants = [];
  let page = 1;
  let fullLoaded = false;
  let fullLoadPromise = null;

  function mixPreviews(previewData) {
    const groups = Object.values(previewData);
    const mixed = [];
    for (let index = 0; index < 20; index += 1) {
      groups.forEach(group => { if (group[index]) mixed.push(group[index]); });
    }
    return mixed;
  }

  // 공공데이터의 법인 표기((주), (유), (재) 등)는 이용자 화면에서 숨깁니다.
  function cleanRestaurantName(value) {
    let name = String(value ?? '').trim();
    while (name.startsWith('(')) {
      let depth = 0;
      let end = -1;
      for (let index = 0; index < name.length; index += 1) {
        if (name[index] === '(') depth += 1;
        if (name[index] === ')' && --depth === 0) { end = index; break; }
      }
      if (end < 0) break;
      name = name.slice(end + 1).trim();
    }
    return name || String(value ?? '').trim();
  }

  const normalizeRestaurants = list => list
    .filter(restaurant => restaurant.name)
    .map(restaurant => ({ ...restaurant, name: cleanRestaurantName(restaurant.name) }));

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const fileUrl = file => `data/restaurants/${file.replace(/%/g, '%25')}`;

  function restaurantCard(restaurant, index) {
    const query = encodeURIComponent(`${restaurant.name} ${restaurant.address}`);
    return `<article class="restaurant-card" tabindex="0" data-index="${index}">
      <div class="card-kicker">영업 중 · ${escapeHtml(restaurant.category || '음식점')}</div>
      <h3>${escapeHtml(restaurant.name)}</h3>
      <p class="card-address">${escapeHtml(restaurant.address)}</p>
      <div class="rating-line"><span class="stars">☆☆☆☆☆</span><span>평점 API 연결 필요</span></div>
      <div class="card-links"><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${query}">Google 지도</a><a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${query}">네이버 지도</a><a target="_blank" rel="noopener" href="https://map.kakao.com/?q=${query}">카카오맵</a></div>
    </article>`;
  }

  function showDetail(restaurant) {
    const query = encodeURIComponent(`${restaurant.name} ${restaurant.address}`);
    modalContent.innerHTML = `<div class="card-kicker">영업 중 · ${escapeHtml(restaurant.category || '음식점')}</div>
      <h2 id="detail-title">${escapeHtml(restaurant.name)}</h2>
      <div class="detail-row"><strong>주소</strong><span>${escapeHtml(restaurant.address)}</span></div>
      <div class="detail-row"><strong>전화번호</strong><span>${restaurant.phone ? escapeHtml(restaurant.phone) : '등록된 전화번호가 없습니다.'}</span></div>
      <div class="detail-row"><strong>평점</strong><span>Google·네이버 공식 API 연결 후 제공 예정입니다.</span></div>
      <div class="map-links"><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${query}">Google 지도</a><a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${query}">네이버 지도</a></div>`;
    modal.classList.add('open');
  }

  function render() {
    const query = input.value.trim().toLowerCase();
    const matches = restaurants.filter(restaurant => !query || restaurant.name.toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    const start = (page - 1) * pageSize;
    const shown = matches.slice(start, start + pageSize);
    summary.textContent = `${matches.length.toLocaleString('ko-KR')}곳${query ? ' 검색됨' : ''}`;
    state.textContent = fullLoaded ? '식당을 눌러 상세정보를 확인하세요.' : '전국 16개 시·도 미리보기입니다. 검색하면 전국 전체 목록을 불러옵니다.';
    grid.innerHTML = shown.map((restaurant, index) => restaurantCard(restaurant, start + index)).join('') || '<p class="state">검색 결과가 없습니다.</p>';
    pager.innerHTML = matches.length ? `<button type="button" data-page="prev" ${page === 1 ? 'disabled' : ''}>이전</button><span>${page} / ${pages}</span><button type="button" data-page="next" ${page === pages ? 'disabled' : ''}>다음</button>` : '';
    grid.querySelectorAll('.restaurant-card').forEach(card => {
      const open = () => showDetail(matches[Number(card.dataset.index) - start]);
      card.addEventListener('click', event => { if (event.target.tagName !== 'A') open(); });
      card.addEventListener('keydown', event => { if (event.key === 'Enter') open(); });
    });
    pager.querySelector('[data-page="prev"]')?.addEventListener('click', () => { page -= 1; render(); });
    pager.querySelector('[data-page="next"]')?.addEventListener('click', () => { page += 1; render(); });
  }

  function renderSuggestions() {
    const query = input.value.trim().toLowerCase();
    if (!query) { suggestions.innerHTML = ''; return; }
    const matches = allRestaurants.filter(restaurant => restaurant.name.toLowerCase().includes(query)).slice(0, 8);
    suggestions.innerHTML = matches.map((restaurant, index) => `<button class="suggestion" type="button" data-suggestion="${index}">${escapeHtml(restaurant.name)}<small>${escapeHtml(restaurant.address)}</small></button>`).join('');
    suggestions.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => { input.value = matches[Number(button.dataset.suggestion)].name; suggestions.innerHTML = ''; search(); }));
  }

  async function loadAllRestaurants() {
    if (fullLoaded) return;
    if (!fullLoadPromise) {
      state.textContent = '전국 식당 데이터를 불러오는 중입니다...';
      fullLoadPromise = Promise.all(window.__MEOKDANG_REGIONS__.map(region => fetch(fileUrl(region.file)).then(response => { if (!response.ok) throw Error(`데이터 응답 ${response.status}`); return response.json(); }))).then(groups => {
        restaurants = normalizeRestaurants(groups.flat());
        allRestaurants = restaurants;
        fullLoaded = true;
        page = 1;
        render();
      });
    }
    return fullLoadPromise;
  }

  async function search() {
    suggestions.innerHTML = '';
    try { await loadAllRestaurants(); page = 1; render(); } catch (error) { console.error(error); state.textContent = '데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'; }
  }

  document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
  input.addEventListener('input', renderSuggestions);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') search(); });
  searchButton.addEventListener('click', search);

  try {
    const [regionsResponse, previewsResponse] = await Promise.all([fetch('data/restaurants/regions.json'), fetch('data/restaurants/previews.json')]);
    if (!regionsResponse.ok || !previewsResponse.ok) throw Error('데이터 목록을 불러오지 못했습니다.');
    const regionData = await regionsResponse.json();
    const previews = await previewsResponse.json();
    window.__MEOKDANG_REGIONS__ = regionData.regions;
    allRestaurants = normalizeRestaurants(mixPreviews(previews));
    restaurants = allRestaurants;
    render();
  } catch (error) {
    console.error(error);
    state.textContent = '식당 데이터를 불러오지 못했습니다. 새로고침해 주세요.';
  }
})();
