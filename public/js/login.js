// 로그인 / 회원가입 화면
(function () {
  const { api, toast } = window.UI;
  const tabs = { login: document.getElementById('tab-login'), signup: document.getElementById('tab-signup') };
  const forms = { login: document.getElementById('form-login'), signup: document.getElementById('form-signup') };

  document.getElementById('year').textContent = String(new Date().getFullYear());

  // 이미 로그인되어 있으면 홈으로
  api('/api/me').then((r) => {
    if (r.ok) location.replace('/');
  });

  function switchTab(name) {
    for (const key of Object.keys(tabs)) {
      const active = key === name;
      tabs[key].setAttribute('aria-selected', String(active));
      forms[key].hidden = !active;
    }
    forms[name].querySelector('input').focus();
  }
  tabs.login.addEventListener('click', () => switchTab('login'));
  tabs.signup.addEventListener('click', () => switchTab('signup'));
  document.querySelector('[data-go-login]').addEventListener('click', () => switchTab('login'));
  if (location.hash === '#signup') switchTab('signup');
  if (new URLSearchParams(location.search).has('expired')) toast('로그인이 만료됐어요. 다시 로그인해 주세요.');

  // 비밀번호 보기 / 숨기기
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('.icon').textContent = show ? 'visibility_off' : 'visibility';
      btn.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
    });
  });

  // 아이디 찾기 · 비밀번호 재설정은 아직 없음
  document.querySelectorAll('[data-soon]').forEach((btn) => btn.addEventListener('click', () => toast('준비 중이에요')));

  // 오류 문구: API가 알려준 field의 입력칸 아래에 표시
  function clearErrors(form) {
    form.querySelectorAll('[data-error-for]').forEach((p) => {
      p.hidden = true;
      p.textContent = '';
    });
    form.querySelectorAll('.input').forEach((i) => i.removeAttribute('aria-invalid'));
  }
  function showError(form, field, message) {
    const p = form.querySelector(`[data-error-for="${field}"]`) || form.querySelector('[data-error-for="password"]');
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'error';
    const text = document.createElement('span');
    text.textContent = message;
    p.replaceChildren(icon, text);
    p.hidden = false;
    const input = p.closest('.field').querySelector('.input');
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  async function submit(form, path, body) {
    clearErrors(form);
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const r = await api(path, { method: 'POST', body });
    btn.disabled = false;
    if (r.ok) {
      location.replace('/');
      return;
    }
    showError(form, r.data.field || 'password', r.data.error || '잠시 후 다시 시도해 주세요.');
  }

  forms.login.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = forms.login.elements;
    submit(forms.login, '/api/login', {
      username: f.username.value.trim(),
      password: f.password.value,
      remember: f.remember.checked,
    });
  });

  forms.signup.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = forms.signup.elements;
    submit(forms.signup, '/api/signup', {
      username: f.username.value.trim(),
      password: f.password.value,
      passwordConfirm: f.passwordConfirm.value,
    });
  });
})();
