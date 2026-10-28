// 화면 공통 도우미: API 호출, 토스트
(function () {
  // API 호출. 응답 본문(JSON)과 상태를 함께 돌려준다. 네트워크 오류도 같은 모양으로 돌려준다.
  async function api(path, { method = 'GET', body } = {}) {
    try {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: '네트워크 연결을 확인해 주세요.' } };
    }
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2200);
  }

  // 확인 창. 확인하면 true, 취소·바깥 클릭·Esc면 false
  function confirmDialog({ title, message, confirmText = '확인', cancelText = '취소', danger = false }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      const panel = document.createElement('div');
      panel.className = 'modal__panel';
      panel.setAttribute('role', 'alertdialog');
      panel.setAttribute('aria-modal', 'true');
      const h = document.createElement('h2');
      h.className = 'modal__title';
      h.textContent = title;
      h.id = 'confirm-title';
      panel.setAttribute('aria-labelledby', h.id);
      const p = document.createElement('p');
      p.className = 'modal__message';
      p.textContent = message;
      const actions = document.createElement('div');
      actions.className = 'modal__actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn--secondary';
      cancel.textContent = cancelText;
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
      ok.textContent = confirmText;
      actions.append(cancel, ok);
      panel.append(h, p, actions);
      modal.append(panel);
      const prev = document.activeElement;
      const done = (result) => {
        modal.remove();
        document.removeEventListener('keydown', onKey);
        prev?.focus();
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') done(false);
      };
      cancel.addEventListener('click', () => done(false));
      ok.addEventListener('click', () => done(true));
      modal.addEventListener('click', (e) => {
        if (e.target === modal) done(false);
      });
      document.addEventListener('keydown', onKey);
      document.body.append(modal);
      cancel.focus();
    });
  }

  window.UI = { api, toast, confirm: confirmDialog };
})();
