// 앱 공통 틀: 로그인 확인, 공통 헤더(로고·점수 규칙 모달·이니셜 드롭다운), 하단 탭 바
// 페이지는 <body data-auth="pending" data-tab="home|add|records|multi"> 와 <main class="page">만 두면 된다.
(function () {
  const { api, toast } = window.UI; // toast: 로그아웃 실패 안내

  const TABS = [
    { key: 'home', href: '/', icon: 'home', label: '홈' },
    { key: 'add', href: '/add.html', icon: 'add_circle', label: '운동 추가' },
    { key: 'records', href: '/records.html', icon: 'monitoring', label: '기록' },
    { key: 'multi', href: '/multi.html', icon: 'group', label: '멀티' },
  ];

  const RULES = [
    ['운동 점수', '유산소는 분 × 강도(1~3) ÷ 9, 근력은 세트 수 × 1점. 하루 기록을 모두 합산해요.'],
    ['하루 최대 20점', '운동 점수는 합산한 뒤 20점까지만 인정돼요.'],
    ['연속 보너스', '연속 2일째 +1점, 3일째부터 +2점. 하루라도 쉬면 다음 운동일이 다시 1일차예요.'],
    ['인증샷 +1점', '운동한 날 직접 찍은 사진을 1장 이상 올리면 +1점(여러 장이어도 1점).'],
  ];

  const h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  };
  const icon = (name, extra = '') => h('span', { class: `icon ${extra}`.trim(), 'aria-hidden': 'true', text: name });

  function buildHeader(me) {
    const avatar = h('button', {
      class: 'avatar',
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-label': `${me.username} 메뉴`,
      text: me.initials,
    });
    const logout = h('button', { class: 'menu__item', type: 'button', role: 'menuitem' }, icon('logout'), ' 로그아웃');
    const menu = h(
      'div',
      { class: 'menu', role: 'menu', hidden: '' },
      h('span', { class: 'menu__user', text: me.username }),
      h('div', { class: 'menu__divider' }),
      logout,
    );
    const settings = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '점수 규칙' }, icon('settings'));

    const header = h(
      'header',
      { class: 'app-header' },
      h('a', { class: 'brand', href: '/' }, icon('local_fire_department', 'is-filled'), h('span', { class: 'brand__name', text: '작심삼일' })),
      h('div', { class: 'app-header__actions' }, settings, h('div', { class: 'menu-wrap' }, avatar, menu)),
    );
    // 가운데 제목: <body data-title="멀티">처럼 지정한 화면에만 (Stitch 멀티 화면)
    if (document.body.dataset.title) {
      header.insertBefore(h('span', { class: 'app-header__title', text: document.body.dataset.title }), header.lastChild);
    }

    const setMenu = (open) => {
      menu.hidden = !open;
      avatar.setAttribute('aria-expanded', String(open));
    };
    avatar.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(menu.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setMenu(false);
    });
    logout.addEventListener('click', async () => {
      const r = await api('/api/logout', { method: 'POST' });
      if (r.ok) location.replace('/login.html');
      else toast('로그아웃하지 못했어요. 다시 시도해 주세요.');
    });
    settings.addEventListener('click', openRules);
    return header;
  }

  function openRules() {
    const close = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기' }, icon('close'));
    const list = h('ul', { class: 'rule-list' });
    for (const [name, desc] of RULES) {
      list.append(h('li', { class: 'rule' }, h('div', {}, h('p', { class: 'rule__name', text: name }), h('p', { class: 'rule__desc', text: desc }))));
    }
    list.append(
      h('li', { class: 'rule rule--total' },
        h('div', {}, h('p', { class: 'rule__name', text: '하루 최대 23점' }), h('p', { class: 'rule__desc', text: '운동 20 + 연속 보너스 2 + 인증샷 1' }))),
    );
    const panel = h(
      'div',
      { class: 'modal__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rules-title' },
      h('div', { class: 'modal__head' }, h('h2', { class: 'modal__title', id: 'rules-title' }, icon('bolt', 'is-filled'), '점수 규칙'), close),
      list,
    );
    const modal = h('div', { class: 'modal' }, panel);
    const prevFocus = document.activeElement;
    const done = () => {
      modal.remove();
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done();
    };
    modal.addEventListener('click', (e) => {
      if (e.target === modal) done();
    });
    close.addEventListener('click', done);
    document.addEventListener('keydown', onKey);
    document.body.append(modal);
    close.focus();
  }

  function buildTabbar(active) {
    const nav = h('nav', { class: 'tabbar', 'aria-label': '주요 메뉴' });
    for (const t of TABS) {
      const isActive = t.key === active;
      const a = h('a', { class: `tabbar__item${isActive ? ' is-active' : ''}`, href: t.href }, icon(t.icon), h('span', { class: 'tabbar__label', text: t.label }));
      if (isActive) a.setAttribute('aria-current', 'page');
      nav.append(a);
    }
    return nav;
  }

  // 로그인 확인 후 틀을 그린다. 다른 페이지 스크립트는 window.App.ready를 기다리면 된다.
  async function init() {
    const r = await api('/api/me');
    if (!r.ok) {
      if (r.status === 401) {
        location.replace('/login.html');
      } else {
        // 네트워크·서버 오류: 빈 화면으로 두지 않고 안내와 다시 시도 버튼을 보여 준다
        document.body.dataset.auth = 'ok';
        window.UI.loadError(r.data.error || '잠시 후 다시 시도해 주세요.', () => location.reload());
      }
      return null;
    }
    const shell = document.querySelector('.shell');
    shell.prepend(buildHeader(r.data));
    shell.append(buildTabbar(document.body.dataset.tab));
    document.body.dataset.auth = 'ok';
    return r.data;
  }

  window.App = { ready: init() };
})();
