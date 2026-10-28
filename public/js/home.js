// 홈 화면. 숫자는 모두 /api/home (서버의 lib/score.js 계산값)을 그대로 표시한다.
(function () {
  const { api } = window.UI;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const pct = (v, max) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // 마지막 어절과 이모지를 붙여 이모지만 다음 줄로 떨어지지 않게 한다 ("이기는 중 🔥")
  function setHeadline(node, text) {
    const parts = text.split(' ');
    const tail = parts.length > 2 ? parts.splice(-2).join(' ') : parts.splice(-1).join(' ');
    node.replaceChildren(parts.length ? `${parts.join(' ')} ` : '', el('span', 'nowrap', tail));
  }

  function render(h) {
    $('date-label').textContent = h.dateLabel;
    $('username').textContent = h.username;

    // 이번 달 누적 점수와 지난달 같은 기간 비교
    const c = h.month.comparison;
    $('month-label').textContent = h.month.label;
    $('month-total').textContent = fmt(h.month.total);
    $('compare').dataset.tone = c.tone;
    $('compare-prev').textContent = c.previousLabel;
    $('compare-chip').textContent = c.chip;
    setHeadline($('compare-headline'), c.headline);

    // 연속 배너
    const b = h.streak.banner;
    $('streak-banner').dataset.level = b.level;
    $('streak-title').textContent = b.title;
    $('streak-sub').textContent = b.sub ?? '';
    $('streak-sub').hidden = !b.sub;

    // 요약 3칸 (숫자와 단위를 붙여 단어 단위로만 줄바꿈)
    const s = h.stats;
    $('stat-worked').replaceChildren('작심 ', el('span', 'nobreak', `${s.workedDays}일`));
    $('stat-ratio').textContent = `${s.ratio}% 완료`;
    $('stat-photo').replaceChildren('인증샷 ', el('span', 'nobreak', `${s.photoDays}일`));
    $('stat-photo-pt').textContent = `+${s.photoPoints}pt 획득`;
    $('stat-streak').replaceChildren(el('span', 'nobreak', `🔥 ${h.streak.current}일`), ' 연속');
    $('stat-streak-sub').textContent = h.streak.recordBreaking ? '기록 경신 중' : `최장 ${h.streak.longest}일`;

    // 이번 주 월~일
    $('week-range').textContent = h.week.label;
    const strip = $('week-strip');
    strip.replaceChildren();
    for (const d of h.week.days) {
      const li = el('li', `week-day week-day--${d.status}`);
      li.setAttribute('aria-label', `${d.weekday}요일 ${d.day}일 ${d.status === 'future' || d.status === 'before' ? '' : d.label}`.trim());
      const dot = el('span', 'week-day__dot');
      if (d.status === 'done') {
        const check = el('span', 'icon', 'check');
        check.setAttribute('aria-hidden', 'true');
        dot.append(check);
      } else {
        dot.textContent = String(d.day);
      }
      li.append(el('span', 'week-day__name', d.weekday), dot, el('span', 'week-day__label', d.label));
      strip.append(li);
    }

    // 오늘 점수: 운동 + 연속 보너스 + 인증샷
    const t = h.todayScore;
    $('today-total').textContent = fmt(t.total);
    const meter = (id, value, max, done) => {
      const small = el('small', '', ` / ${max} 점${done ? ' (완료)' : ''}`);
      $(id).replaceChildren(id === 'meter-exercise' ? fmt(value) : `+${value}`, small);
      $(`${id}-fill`).style.width = pct(value, max);
    };
    meter('meter-exercise', t.exercise, t.max.exercise, false);
    meter('meter-streak', t.streakBonus, t.max.streakBonus, t.streakBonus === t.max.streakBonus);
    meter('meter-photo', t.photo, t.max.photo, t.photo === t.max.photo);

    $('page').removeAttribute('aria-busy');
  }

  async function load() {
    const r = await api('/api/home');
    if (!r.ok) return window.UI.loadError(r.data.error || '홈 정보를 불러오지 못했어요.', load);
    render(r.data);
  }
  window.App.ready.then((me) => me && load());
})();
