export function setLoading(button, loading = true) {
  button.classList.toggle('is-loading', loading);
  button.toggleAttribute('disabled', loading);
  button.setAttribute('aria-busy', String(loading));
}

export function showToast(message, { duration = 2400 } = {}) {
  let toast = document.querySelector('.md-toast');
  if (!toast) {
    toast = Object.assign(document.createElement('div'), { className: 'md-toast' });
    toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);
  }
  toast.textContent = message; toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), duration);
}

export function initializeDesignSystem(root = document) {
  root.querySelectorAll('.md-chip').forEach(chip => chip.addEventListener('click', () => {
    if (chip.hasAttribute('aria-pressed')) chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
  }));
  root.querySelectorAll('[data-md-tabs]').forEach(group => group.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]'); if (!tab) return;
    group.querySelectorAll('[role="tab"]').forEach(item => item.setAttribute('aria-selected', String(item === tab)));
  }));
  root.querySelectorAll('[data-modal-open]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.modalOpen)?.showModal()));
  root.querySelectorAll('[data-modal-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
}
