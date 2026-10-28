// 기록 화면: 캘린더, 날짜 상세, 점수 추이. 숫자는 모두 서버(lib/score.js) 계산값을 표시한다.
(function () {
  const { api, toast } = window.UI;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (name, cls = '') => {
    const n = el('span', `icon ${cls}`.trim(), name);
    n.setAttribute('aria-hidden', 'true');
    return n;
  };
  const ACTIVITY_ICON = { 러닝: 'directions_run', 복싱: 'sports_mma', 축구: 'sports_soccer', 사이클: 'directions_bike', 수영: 'pool', 줄넘기: 'sports' };

  const state = { cal: null, selected: null, stats: null, mode: 'monthly', chart: null };

  // ---------- 캘린더 ----------
  async function loadMonth(ym) {
    const r = await api(`/api/calendar${ym ? `?month=${ym}` : ''}`);
    if (!r.ok) return toast(r.data.error || '캘린더를 불러오지 못했어요.');
    state.cal = r.data;
    state.selected = r.data.selected; // 이번 달이면 오늘, 지난달이면 선택 없음
    renderCalendar();
    renderDay();
  }

  function renderCalendar() {
    const c = state.cal;
    $('cal-title').textContent = c.title;
    $('prev-month').disabled = !c.canPrev;
    $('next-month').disabled = !c.canNext;
    $('dday').hidden = c.daysLeft == null; // 지난달을 보면 숨김
    $('dday-text').textContent = c.daysLeft == null ? '' : `D-${c.daysLeft} TO GO`;
    $('sum-total').textContent = fmt(c.summary.total);
    $('sum-worked').textContent = `${c.summary.workedDays}일`;
    $('sum-rest').textContent = `${c.summary.restDays}일`;
    $('sum-longest').textContent = `${c.summary.longestStreak}연속`;
    $('streak-headline').textContent = c.streak.headline;
    $('streak-next').textContent = c.streak.next;

    const grid = $('cal-grid');
    grid.replaceChildren();
    for (const cell of c.weeks.flat()) grid.append(dayCell(cell));
  }

  function dayCell(cell) {
    const node = el(cell.clickable ? 'button' : 'div', `cal-day cal-day--${cell.state}`);
    if (cell.state === 'worked') node.classList.add(`lv-${cell.level}`);
    if (cell.isToday) node.classList.add('is-today');
    if (cell.date === state.selected) node.classList.add('is-selected');
    const top = el('span', 'cal-day__top');
    top.append(el('span', 'cal-day__num', String(cell.day)));
    // 23점 만점이면 체크, 연속 3일째 이상이면 불꽃 (둘 다면 체크)
    if (cell.perfect) top.append(icon('check_circle', 'is-filled cal-day__badge'));
    else if (cell.fire) top.append(icon('local_fire_department', 'is-filled cal-day__badge'));
    node.append(top);
    if (cell.isToday) node.append(el('span', 'cal-day__tag', '오늘'));
    else if (cell.state === 'worked') node.append(el('span', 'cal-day__score', cell.scoreLabel));
    else if (cell.state === 'rest') node.append(el('span', 'cal-day__rest', '휴식'));
    if (cell.hasPhoto) node.append(el('span', 'cal-day__photo'));

    if (cell.clickable) {
      node.type = 'button';
      const desc = cell.state === 'worked' ? `${cell.total}점` : cell.state === 'rest' ? '휴식' : '오늘, 기록 없음';
      node.setAttribute('aria-label', `${cell.day}일 ${desc}${cell.hasPhoto ? ', 인증 사진' : ''}`);
      node.setAttribute('aria-pressed', String(cell.date === state.selected));
      node.addEventListener('click', () => {
        state.selected = cell.date;
        renderCalendar();
        renderDay();
      });
    } else {
      node.setAttribute('aria-hidden', 'true');
    }
    return node;
  }

  // ---------- 날짜 상세 ----------
  function renderDay() {
    const card = $('day-card');
    const d = state.selected && state.cal.details[state.selected];
    card.replaceChildren(el('div', 'day-card__glow'));
    if (!d) {
      card.classList.add('is-empty');
      card.append(el('p', 'day-card__empty', '날짜를 누르면 그날의 기록을 볼 수 있어요.'));
      return;
    }
    card.classList.remove('is-empty');

    const head = el('div', 'day-card__head');
    const title = el('div', 'day-card__title');
    title.append(el('span', 'day-card__dot'), el('h2', '', d.label));
    const badge = el('span', `day-badge${d.allClear ? ' is-clear' : ''}`);
    badge.append(el('strong', '', `${fmt(d.total)} / ${d.maxTotal}점`));
    if (d.allClear) badge.append(icon('verified', 'is-filled'), el('span', '', '올클리어'));
    head.append(title, badge);
    card.append(head);

    if (!d.worked) {
      const isToday = d.date === state.cal.today;
      card.append(el('p', 'day-card__rest', isToday ? '아직 오늘 운동 기록이 없어요.' : '이날은 쉬었어요'));
    }
    for (const w of d.workouts) {
      const row = el('div', 'day-log');
      const box = el('span', `day-log__icon${w.type === 'strength' ? ' is-strength' : ''}`);
      box.append(icon(w.type === 'cardio' ? ACTIVITY_ICON[w.activity] ?? 'sports' : 'fitness_center'));
      const text = el('span', 'day-log__text');
      text.append(el('span', 'day-log__title', w.title), el('span', 'day-log__sub', w.subtitle));
      const main = el('span', 'day-log__main');
      main.append(box, text);
      const pts = el('span', 'day-log__pts', `+${fmt(w.score)}`);
      pts.append(el('small', '', '점'));
      row.append(main, pts);
      card.append(row);
    }
    for (const p of d.photos) {
      const row = el('div', 'day-log');
      const thumb = el('span', 'day-log__thumb');
      const img = document.createElement('img');
      img.alt = '인증 사진';
      img.loading = 'lazy';
      img.src = p.imageUrl;
      img.addEventListener('error', () => thumb.classList.add('is-broken')); // 예시 데이터 등 열 수 없는 사진
      thumb.append(img, icon('photo_camera', 'day-log__cam'));
      const titleRow = el('span', 'day-log__title-row');
      titleRow.append(el('span', 'day-log__title', '오운완 포토 인증'), el('span', 'day-log__pill', '인증 완료'));
      const text = el('span', 'day-log__text');
      text.append(titleRow, el('span', 'day-log__sub', `${p.timeLabel} 업로드${!d.worked ? ' · 운동 기록이 없어 점수 미반영' : ''}`));
      const main = el('span', 'day-log__main');
      main.append(thumb, text);
      row.append(main);
      if (p.points != null) {
        const pts = el('span', 'day-log__pts', `+${p.points}`);
        pts.append(el('small', '', '점'));
        row.append(pts);
      }
      card.append(row);
    }
    // 항목별 합계: "운동 20 (상한 적용) · 연속 보너스 +2 · 인증 +1"
    card.append(el('p', 'day-card__sum', d.breakdownLabel));
  }

  // ---------- 점수 추이 ----------
  const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
  function periodText(p) {
    const end = p.inProgress ? state.stats.today : p.end;
    return `${md(p.start)}~${md(end)}${p.inProgress ? ' 진행 중' : ''}`;
  }
  function diffText(diff) {
    if (diff == null) return '직전 구간 기록 없음';
    if (diff > 0) return `직전 대비 ▲ ${diff.toFixed(1)}점`;
    if (diff < 0) return `직전 대비 ▼ ${Math.abs(diff).toFixed(1)}점`;
    return '직전 대비 변화 없음';
  }

  function renderTrend() {
    const weekly = state.mode === 'weekly';
    const t = weekly ? state.stats.weekly : state.stats.monthly;
    document.querySelectorAll('.seg-sm__btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
    $('trend-sub').textContent = weekly ? `최근 12주 주간 점수 (주 최대 ${state.stats.weekly.maxPerPeriod}점)` : '최근 6개월 월간 점수';

    const current = t.points.find((p) => p.inProgress);
    $('trend-peak').textContent = t.best && t.best.total > 0 ? `최고점 ${fmt(t.best.total)}p` : '최고점 -';
    $('trend-now').replaceChildren(el('span', 'trend-box__ping'), `${weekly ? '이번 주' : '이번 달'} ${fmt(current?.total ?? 0)}p (진행 중)`);

    const options = {
      points: t.points,
      value: (p) => p.total,
      label: (p) => p.label,
      peakText: (p) => `${fmt(p.total)}점`,
      tooltip: (p) => [`${weekly ? `${p.label}주` : p.label} (${periodText(p)})`, `총점 ${fmt(p.total)}점`, `운동한 날 ${p.workedDays}일`, diffText(p.diff)],
    };
    if (state.chart) state.chart.update(options);
    else state.chart = window.LineChart.render($('chart'), options);

    // 요약 3칸: 평균(진행 중 제외), 최고 구간, 지난 구간 대비(같은 기간 비교)
    $('avg-label').textContent = weekly ? '주 평균' : '월 평균';
    $('avg-value').textContent = t.average == null ? '-' : fmt(t.average);
    $('best-label').textContent = weekly ? '최고 주' : '최고 월';
    $('best-value').textContent = t.best && t.best.total > 0 ? fmt(t.best.total) : '-';
    $('best-sub').textContent = t.best && t.best.total > 0 ? (weekly ? `${t.best.label}주` : t.best.label) : '';
    $('change-label').textContent = weekly ? '지난주 대비' : '지난달 대비';
    const c = t.change;
    const box = $('change-value');
    box.replaceChildren();
    $('change-stat').dataset.tone = c ? c.direction : 'same';
    if (!c) {
      box.textContent = '-';
      $('change-sub').textContent = '';
      return;
    }
    if (c.direction !== 'same') box.append(icon(c.direction === 'up' ? 'arrow_drop_up' : 'arrow_drop_down'));
    box.append(el('span', '', c.direction === 'same' ? '0점' : `${Math.abs(c.diff).toFixed(1)}점`));
    $('change-sub').textContent = c.noPrevious ? c.rateLabel : c.direction === 'up' ? '상승세 유지' : c.direction === 'down' ? '하락세' : '변화 없음';
  }

  async function loadStats() {
    const r = await api('/api/stats');
    if (!r.ok) return toast(r.data.error || '점수 추이를 불러오지 못했어요.');
    state.stats = r.data;
    renderTrend();
  }

  // ---------- 이벤트 ----------
  const shiftMonth = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const i = y * 12 + (m - 1) + n;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  };
  $('prev-month').addEventListener('click', () => state.cal?.canPrev && loadMonth(shiftMonth(state.cal.ym, -1)));
  $('next-month').addEventListener('click', () => state.cal?.canNext && loadMonth(shiftMonth(state.cal.ym, 1)));
  document.querySelectorAll('.seg-sm__btn').forEach((b) =>
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      if (state.stats) renderTrend();
    }),
  );

  window.App.ready.then(async (me) => {
    if (!me) return;
    await Promise.all([loadMonth(), loadStats()]);
    $('page').removeAttribute('aria-busy');
  });
})();
