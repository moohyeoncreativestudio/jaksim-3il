// 화면 공통 도우미: API 호출, 토스트
(function () {
  // 사용 중 로그인이 만료되면(쿠키 만료·조작) 로그인 화면으로 보낸다.
  // 로그인·회원가입의 401(틀린 비밀번호)과 첫 진입 확인(/api/me, shell.js가 처리)은 제외한다.
  const AUTH_PATHS = ['/api/login', '/api/signup', '/api/me'];
  // 서버 오류(5xx)는 어떤 화면이든 같은 문구로 안내한다
  const SERVER_ERROR = '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
  function loginExpired(path) {
    if (AUTH_PATHS.includes(path) || location.pathname === '/login.html') return;
    location.replace('/login.html?expired=1');
  }

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
      if (res.status === 401) loginExpired(path);
      if (res.status >= 500) data.error = SERVER_ERROR;
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

  // 파일 업로드 (진행률 콜백). fetch는 업로드 진행률을 알 수 없어 XMLHttpRequest를 쓴다.
  function upload(path, body, contentType, onProgress) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', path);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status === 401) loginExpired(path);
        if (xhr.status >= 500) data.error = SERVER_ERROR;
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
      };
      xhr.onerror = () => resolve({ ok: false, status: 0, data: { error: '네트워크 연결을 확인해 주세요.' } });
      xhr.send(body);
    });
  }

  // 화면 첫 데이터를 못 불러왔을 때: 0 같은 자리표시 숫자를 실제 값으로 오해하지 않게 페이지 위에 안내와 다시 시도 버튼을 띄운다
  function loadError(message, onRetry) {
    document.querySelector('.load-error')?.remove();
    const box = document.createElement('div');
    box.className = 'load-error';
    box.setAttribute('role', 'alert');
    const text = document.createElement('p');
    text.textContent = message || '정보를 불러오지 못했어요.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'load-error__retry';
    retry.textContent = '다시 시도';
    retry.addEventListener('click', () => {
      box.remove();
      onRetry();
    });
    box.append(text, retry);
    const main = document.querySelector('main');
    main.prepend(box);
    main.removeAttribute('aria-busy');
  }

  window.UI = { api, toast, confirm: confirmDialog, upload, loadError };
})();
