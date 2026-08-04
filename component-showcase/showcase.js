import { initializeDesignSystem, setLoading, showToast } from '../design-system/components.js';

initializeDesignSystem();
const root = document.documentElement;
document.querySelector('#theme-toggle').addEventListener('click', event => {
  const dark = root.dataset.theme !== 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';
  event.currentTarget.setAttribute('aria-pressed', String(dark));
  event.currentTarget.textContent = dark ? '라이트 모드' : '다크 모드';
});
document.querySelector('#toast-button').addEventListener('click', () => showToast('저장 목록에 추가했어요.'));
document.querySelector('#loading-button').addEventListener('click', event => {
  setLoading(event.currentTarget, true);
  setTimeout(() => setLoading(event.currentTarget, false), 1200);
});
document.querySelector('.md-search').addEventListener('submit', event => { event.preventDefault(); showToast('검색 예시를 실행했어요.'); });
