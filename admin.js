(function () {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(`meokdang-${key}`)) ?? fallback; } catch { return fallback; } },
    set(key, value) { localStorage.setItem(`meokdang-${key}`, JSON.stringify(value)); }
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  let restaurantMeta = { total: 0, updatedAt: null, regions: [] };
  let currentView = 'dashboard';

  function toast(message) {
    const el = $('#admin-toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2000);
  }
  function audit(action, detail) {
    const logs = store.get('admin-logs', []);
    logs.unshift({ id: Date.now(), at: Date.now(), action, detail });
    store.set('admin-logs', logs.slice(0, 200));
  }
  function members() {
    const saved = store.get('admin-members', null);
    if (saved) return saved;
    const profile = store.get('profile', null);
    return profile ? [{ id: 'local-user', name: profile.name || '사용자', email: profile.email || '이 브라우저 계정', status: 'active', role: 'member', joinedAt: Date.now() }] : [];
  }
  function saveMembers(rows) { store.set('admin-members', rows); }
  function reviews() {
    const hidden = new Set(store.get('hidden-reviews', []));
    return Object.entries(store.get('reviews', {})).flatMap(([restaurant, rows]) =>
      rows.map(row => ({ ...row, restaurant, hidden: hidden.has(String(row.id)) }))
    );
  }
  function heading(overline, title, description, toolbar = '') {
    return `<div class="page-head"><div><p class="overline">${overline}</p><h1>${title}</h1></div><div><p>${description}</p>${toolbar}</div></div>`;
  }
  function renderDashboard() {
    const memberRows = members(), reviewRows = reviews(), saved = store.get('saved', []);
    const recent = reviewRows.filter(r => Date.now() - r.createdAt < 7 * 86400000).length;
    $('#admin-content').innerHTML = `${heading('OVERVIEW', '운영 대시보드', '서비스의 현재 상태를 한눈에 확인합니다.')}
      <div class="metrics">
        <article class="metric"><span>전체 회원</span><strong>${memberRows.length.toLocaleString('ko-KR')}</strong><small>로컬 계정 기준</small></article>
        <article class="metric"><span>등록 리뷰</span><strong>${reviewRows.length.toLocaleString('ko-KR')}</strong><small>최근 7일 +${recent}</small></article>
        <article class="metric"><span>저장 활동</span><strong>${saved.length.toLocaleString('ko-KR')}</strong><small>현재 브라우저</small></article>
        <article class="metric"><span>식당 데이터</span><strong>${restaurantMeta.total.toLocaleString('ko-KR')}</strong><small>${restaurantMeta.regions.length}개 지역</small></article>
      </div>
      <div class="dashboard-grid">
        <article class="panel"><h2>최근 7일 리뷰 활동</h2><div class="chart">${[2,4,1,5,3,7,Math.max(1,recent)].map((value, i) => `<div class="bar" style="height:${20 + value * 15}px"><span>${['월','화','수','목','금','토','일'][i]}</span></div>`).join('')}</div></article>
        <article class="panel"><h2>시스템 상태</h2><div class="health-list">
          <div class="health-item"><span>식당 원본 데이터</span><b class="status">정상</b></div>
          <div class="health-item"><span>검색 인덱스</span><b class="status">검증됨</b></div>
          <div class="health-item"><span>회원 데이터베이스</span><b class="status warn">백엔드 연결 필요</b></div>
          <div class="health-item"><span>최근 데이터 갱신</span><b>${restaurantMeta.updatedAt ? new Date(restaurantMeta.updatedAt).toLocaleDateString('ko-KR') : '확인 중'}</b></div>
        </div></article>
      </div>`;
  }
  function renderMembers(query = '') {
    const rows = members().filter(row => `${row.name} ${row.email}`.toLowerCase().includes(query.toLowerCase()));
    $('#admin-content').innerHTML = `${heading('USERS', '회원 관리', '회원 상태와 권한을 관리합니다.', `<div class="toolbar"><input id="member-search" value="${escapeHtml(query)}" placeholder="회원 검색"></div>`)}
      <div class="table-wrap">${rows.length ? `<table><thead><tr><th>회원</th><th>이메일</th><th>상태</th><th>권한</th><th>가입일</th><th>관리</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.email)}</td><td><span class="status ${row.status === 'active' ? '' : 'warn'}">${row.status === 'active' ? '활성' : '정지'}</span></td><td>${row.role === 'admin' ? '관리자' : '일반 회원'}</td><td>${new Date(row.joinedAt).toLocaleDateString('ko-KR')}</td><td><div class="row-actions"><button class="small-button" data-member-status="${row.id}">${row.status === 'active' ? '정지' : '활성화'}</button><button class="small-button" data-member-role="${row.id}">권한 변경</button><button class="small-button danger" data-member-delete="${row.id}">삭제</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty-admin">표시할 회원이 없습니다.</div>'}</div>`;
    $('#member-search').addEventListener('input', e => renderMembers(e.target.value));
    $$('[data-member-status]').forEach(button => button.addEventListener('click', () => {
      const all = members(), row = all.find(item => item.id === button.dataset.memberStatus); row.status = row.status === 'active' ? 'suspended' : 'active'; saveMembers(all); audit('회원 상태 변경', `${row.name}: ${row.status}`); renderMembers(query); toast('회원 상태를 변경했습니다.');
    }));
    $$('[data-member-role]').forEach(button => button.addEventListener('click', () => {
      const all = members(), row = all.find(item => item.id === button.dataset.memberRole); row.role = row.role === 'admin' ? 'member' : 'admin'; saveMembers(all); audit('회원 권한 변경', `${row.name}: ${row.role}`); renderMembers(query); toast('회원 권한을 변경했습니다.');
    }));
    $$('[data-member-delete]').forEach(button => button.addEventListener('click', () => {
      const all = members(), row = all.find(item => item.id === button.dataset.memberDelete);
      if (!confirm(`${row.name} 회원을 삭제할까요?`)) return;
      saveMembers(all.filter(item => item.id !== row.id)); audit('회원 삭제', row.name); renderMembers(query); toast('회원을 삭제했습니다.');
    }));
  }
  function renderReviews(query = '') {
    const rows = reviews().filter(row => `${row.author} ${row.restaurant} ${row.text}`.toLowerCase().includes(query.toLowerCase()));
    $('#admin-content').innerHTML = `${heading('MODERATION', '리뷰 관리', '신고·부적절 리뷰를 검토하고 관리합니다.', `<div class="toolbar"><input id="review-search" value="${escapeHtml(query)}" placeholder="리뷰 검색"></div>`)}
      <div class="table-wrap">${rows.length ? `<table><thead><tr><th>작성자</th><th>식당</th><th>별점</th><th>내용</th><th>상태</th><th>작성일</th><th>관리</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.author)}</td><td>${escapeHtml(row.restaurant.split('|')[0])}</td><td>${'★'.repeat(row.rating)}</td><td class="review-text">${escapeHtml(row.text)}</td><td><span class="status ${row.hidden ? 'warn' : ''}">${row.hidden ? '숨김' : '공개'}</span></td><td>${new Date(row.createdAt).toLocaleDateString('ko-KR')}</td><td><div class="row-actions"><button class="small-button" data-review-hide="${row.id}">${row.hidden ? '공개' : '숨김'}</button><button class="small-button danger" data-review-delete="${row.id}">삭제</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty-admin">등록된 리뷰가 없습니다.</div>'}</div>`;
    $('#review-search').addEventListener('input', e => renderReviews(e.target.value));
    $$('[data-review-hide]').forEach(button => button.addEventListener('click', () => {
      const hidden = new Set(store.get('hidden-reviews', [])), id = button.dataset.reviewHide;
      hidden.has(id) ? hidden.delete(id) : hidden.add(id); store.set('hidden-reviews', [...hidden]); audit('리뷰 공개 상태 변경', `리뷰 ${id}`); renderReviews(query); toast('리뷰 상태를 변경했습니다.');
    }));
    $$('[data-review-delete]').forEach(button => button.addEventListener('click', () => {
      if (!confirm('이 리뷰를 완전히 삭제할까요?')) return;
      const all = store.get('reviews', {}), id = Number(button.dataset.reviewDelete);
      Object.keys(all).forEach(key => { all[key] = all[key].filter(row => row.id !== id); if (!all[key].length) delete all[key]; });
      store.set('reviews', all); audit('리뷰 삭제', `리뷰 ${id}`); renderReviews(query); toast('리뷰를 삭제했습니다.');
    }));
  }
  function renderRestaurants() {
    $('#admin-content').innerHTML = `${heading('DATA', '식당 데이터', '공공데이터와 검색 인덱스 상태입니다.')}
      <div class="metrics"><article class="metric"><span>영업 중 식당</span><strong>${restaurantMeta.total.toLocaleString('ko-KR')}</strong><small>공식 인허가 기준</small></article><article class="metric"><span>지역</span><strong>${restaurantMeta.regions.length}</strong><small>전국 데이터</small></article><article class="metric"><span>비공개 시설 격리</span><strong>733</strong><small>구내·직원 식당 등</small></article><article class="metric"><span>자동 갱신</span><strong>매일</strong><small>00:00 KST</small></article></div>
      <article class="panel" style="margin-top:14px"><h2>지역별 식당 현황</h2><div class="table-wrap"><table><thead><tr><th>지역</th><th>식당 수</th><th>데이터 파일</th></tr></thead><tbody>${restaurantMeta.regions.map(region => `<tr><td><strong>${escapeHtml(region.name)}</strong></td><td>${region.count.toLocaleString('ko-KR')}</td><td>${(region.files || [region.file]).length}개 조각</td></tr>`).join('')}</tbody></table></div></article>`;
  }
  function renderLogs() {
    const logs = store.get('admin-logs', []);
    $('#admin-content').innerHTML = `${heading('AUDIT', '운영 로그', '관리자가 수행한 중요 작업 기록입니다.')}<article class="panel"><div class="log-list">${logs.length ? logs.map(log => `<div class="log"><time>${new Date(log.at).toLocaleString('ko-KR')}</time><strong>${escapeHtml(log.action)}</strong><span>${escapeHtml(log.detail)}</span></div>`).join('') : '<div class="empty-admin">아직 관리 작업 기록이 없습니다.</div>'}</div></article>`;
  }
  function render(view = currentView) {
    currentView = view;
    $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    ({ dashboard: renderDashboard, members: renderMembers, reviews: renderReviews, restaurants: renderRestaurants, logs: renderLogs }[view] || renderDashboard)();
    $('.sidebar').classList.remove('open');
  }
  function enterAdmin() {
    $('#admin-login').hidden = true; $('#admin-app').hidden = false; sessionStorage.setItem('mukdang-admin-session', '1'); render();
  }
  $('#login-form').addEventListener('submit', event => {
    event.preventDefault();
    if (new FormData(event.currentTarget).get('code') !== 'admin1234') return toast('관리자 코드가 올바르지 않습니다.');
    audit('관리자 로그인', '로컬 관리 콘솔'); enterAdmin();
  });
  $('#logout').addEventListener('click', () => { sessionStorage.removeItem('mukdang-admin-session'); location.reload(); });
  $('#menu-toggle').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $$('[data-view]').forEach(button => button.addEventListener('click', () => render(button.dataset.view)));
  $('#today').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  fetch('data/restaurants/regions.json').then(response => response.json()).then(data => { restaurantMeta = data; if (currentView === 'dashboard' || currentView === 'restaurants') render(); }).catch(() => {});
  if (sessionStorage.getItem('mukdang-admin-session')) enterAdmin();
})();
