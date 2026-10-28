// 점수 계산, 월간 비교, 주간·월간 집계, 캘린더 집계.
// 순수 함수만 둔다(DB 접근 금지). 날짜 계산은 lib/date.js를 사용한다.
//
// 입력 기록 형식
//   workouts: [{ done_on: 'YYYY-MM-DD', type: 'cardio' | 'strength', minutes, intensity, sets, ... }]
//   photos:   [{ done_on: 'YYYY-MM-DD', created_at?, ... }]
// 어떤 기간의 점수를 구할 때는 연속 보너스 계산을 위해 기간 시작 2일 전부터의 기록을 함께 넘긴다.

const date = require('./date');

const MAX_EXERCISE = 20;
const MAX_STREAK_BONUS = 2;
const PHOTO_POINT = 1;
const MAX_DAILY = MAX_EXERCISE + MAX_STREAK_BONUS + PHOTO_POINT; // 23
const CARDIO_DIVISOR = 9;
const STREAK_GOALS = [3, 7, 10, 20, 30];
const LOOKBACK_DAYS = 2;

// 소수점 첫째 자리 반올림 (부동소수 오차 보정, 음수도 대칭으로 처리)
function round1(x) {
  return (Math.sign(x) * Math.round((Math.abs(x) + 1e-9) * 10)) / 10;
}

// 화면 표기용: 정수면 "14", 아니면 "7.7"
function formatPoints(x) {
  const r = round1(x);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ---------- 기록 1건 / 하루 ----------

// 기록 1건의 원래 점수(상한 미적용)
function workoutScore(w) {
  if (w.type === 'cardio') return round1((w.minutes * w.intensity) / CARDIO_DIVISOR);
  if (w.type === 'strength') return w.sets;
  throw new TypeError(`알 수 없는 운동 종류: ${w.type}`);
}

// 하루 운동 점수: 모두 합산한 뒤 20점 상한, 반올림은 마지막에 한 번
function exerciseScore(workouts) {
  let cardio = 0;
  let sets = 0;
  for (const w of workouts) {
    if (w.type === 'cardio') cardio += w.minutes * w.intensity;
    else if (w.type === 'strength') sets += w.sets;
    else throw new TypeError(`알 수 없는 운동 종류: ${w.type}`);
  }
  const raw = cardio / CARDIO_DIVISOR + sets;
  return { score: round1(Math.min(MAX_EXERCISE, raw)), raw: round1(raw), capped: raw > MAX_EXERCISE };
}

// 날짜별로 기록을 묶는다: Map<'YYYY-MM-DD', { workouts, photos }>
function indexRecords(workouts = [], photos = []) {
  const index = new Map();
  const slot = (d) => {
    if (!index.has(d)) index.set(d, { workouts: [], photos: [] });
    return index.get(d);
  };
  for (const w of workouts) slot(w.done_on).workouts.push(w);
  for (const p of photos) slot(p.done_on).photos.push(p);
  return index;
}

const workedOn = (index, d) => (index.get(d)?.workouts.length ?? 0) > 0;

// d가 운동한 날일 때만: d-1 휴식 0, d-1 운동·d-2 휴식 1, d-1·d-2 모두 운동 2
function streakBonus(index, d) {
  if (!workedOn(index, d)) return 0;
  if (!workedOn(index, date.addDays(d, -1))) return 0;
  if (!workedOn(index, date.addDays(d, -2))) return 1;
  return MAX_STREAK_BONUS;
}

// 하루 점수. index는 indexRecords() 결과이며 d-2일 기록까지 들어 있어야 한다.
function dayScore(index, d) {
  const rec = index.get(d) ?? { workouts: [], photos: [] };
  const worked = rec.workouts.length > 0;
  const exercise = exerciseScore(rec.workouts);
  const bonus = streakBonus(index, d);
  const photo = worked && rec.photos.length > 0 ? PHOTO_POINT : 0; // 휴식일 사진은 점수 없음
  return {
    date: d,
    worked,
    exercise: exercise.score,
    exerciseRaw: exercise.raw,
    capped: exercise.capped,
    streakBonus: bonus,
    photo,
    hasPhoto: rec.photos.length > 0,
    total: round1(exercise.score + bonus + photo),
    workouts: rec.workouts.map((w) => ({ ...w, score: workoutScore(w) })),
    photos: rec.photos,
  };
}

// ---------- 기간 ----------

// start~end 각 날짜의 하루 점수 목록
function dailyScores(start, end, workouts, photos) {
  const index = indexRecords(workouts, photos);
  return date.eachDay(start, end).map((d) => dayScore(index, d));
}

function sumTotals(days) {
  return round1(days.reduce((sum, s) => sum + s.total, 0));
}

function summarize(days) {
  return {
    total: sumTotals(days),
    workedDays: days.filter((s) => s.worked).length,
    photoDays: days.filter((s) => s.photo > 0).length,
    photoPoints: days.reduce((sum, s) => sum + s.photo, 0),
  };
}

// 기간 점수. workouts/photos는 start 2일 전부터의 기록을 포함해야 한다.
function periodScore(start, end, workouts, photos) {
  const days = dailyScores(start, end, workouts, photos);
  return { start, end, ...summarize(days), days };
}

// 이 기간의 점수를 구하려면 언제부터 기록을 조회해야 하는지
function fetchStart(start) {
  return date.addDays(start, -LOOKBACK_DAYS);
}

// ---------- 연속 일수 ----------

function workedDates(workouts) {
  return [...new Set(workouts.map((w) => w.done_on))].sort();
}

// 현재 연속 일수. 오늘 아직 운동 전이면 어제까지 기준.
function currentStreak(workouts, todayYmd) {
  const set = new Set(workouts.map((w) => w.done_on));
  let d = set.has(todayYmd) ? todayYmd : date.addDays(todayYmd, -1);
  let n = 0;
  while (set.has(d)) {
    n += 1;
    d = date.addDays(d, -1);
  }
  return n;
}

// 최장 연속 일수. range({ start, end })를 주면 그 안의 날짜만 센다.
function longestStreak(workouts, range = {}) {
  const dates = workedDates(workouts).filter(
    (d) => (!range.start || d >= range.start) && (!range.end || d <= range.end),
  );
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    run = prev && date.diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// 현재 연속 일수보다 큰 다음 목표: 3, 7, 10, 20, 30, 이후 10단위
function nextStreakGoal(streak) {
  const goal = STREAK_GOALS.find((g) => g > streak) ?? (Math.floor(streak / 10) + 1) * 10;
  return { goal, remaining: goal - streak };
}

// 캘린더 아래 문구
function streakMessage(streak) {
  const { goal, remaining } = nextStreakGoal(streak);
  return {
    headline: streak > 0 ? `작심 연속 ${streak}일차 순항 중!` : '오늘 작심하면 1일차 시작!',
    next: `다음 작심 ${goal}일 달성까지 ${remaining}일`,
  };
}

// ---------- 비교 ----------

// 증감 점수와 증감률. 직전 값이 0이면 증감률 대신 "지난달 기록 없음"
function compareTotals(current, previous) {
  const diff = round1(current - previous);
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
  const diffLabel =
    direction === 'up' ? `▲ ${diff.toFixed(1)}점` : direction === 'down' ? `▼ ${Math.abs(diff).toFixed(1)}점` : '변화 없음';
  const noPrevious = previous === 0;
  const rate = noPrevious ? null : round1((diff / previous) * 100);
  const rateLabel = noPrevious ? '지난달 기록 없음' : `${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`;
  return { diff, direction, diffLabel, rate, rateLabel, noPrevious };
}

// 월간 비교(같은 기간 / 최종). 기록은 지난달 비교 기간 시작 2일 전부터 넘긴다.
function monthlyComparison(now, workouts, photos, { ym } = {}) {
  const periods = date.comparisonPeriods(now, ym);
  const cur = periodScore(periods.current.start, periods.current.end, workouts, photos);
  const prev = periodScore(periods.previous.start, periods.previous.end, workouts, photos);
  const pick = (p, s) => ({ ...p, total: s.total, workedDays: s.workedDays });
  return {
    final: periods.final,
    current: pick(periods.current, cur),
    previous: pick(periods.previous, prev),
    ...compareTotals(cur.total, prev.total),
  };
}

// ---------- 추이 그래프 ----------

function buildTrend(periods, now, workouts, photos, signupDate) {
  const todayYmd = date.today(now);
  const visible = signupDate ? periods.filter((p) => p.end >= signupDate) : periods; // 가입 전 구간 제외
  const points = [];
  for (const p of visible) {
    const end = p.end < todayYmd ? p.end : todayYmd;
    const s = summarize(dailyScores(p.start, end, workouts, photos));
    const prev = points[points.length - 1];
    points.push({
      ...p,
      total: s.total,
      workedDays: s.workedDays,
      diff: prev ? round1(s.total - prev.total) : null,
    });
  }
  const done = points.filter((p) => !p.inProgress);
  const average = done.length ? round1(done.reduce((sum, p) => sum + p.total, 0) / done.length) : null;
  const best = points.reduce((b, p) => (!b || p.total >= b.total ? p : b), null);
  return { points, average, best };
}

// 주차별: 최근 12주 주간 총점. 기록은 첫 주 월요일 2일 전부터 넘긴다.
// 요약의 "지난 구간 대비 증감" = 이번 주(진행 중) 총점 - 지난주 총점
function weeklyTrend(now, workouts, photos, { signupDate, count = 12 } = {}) {
  const trend = buildTrend(date.recentWeeks(now, count), now, workouts, photos, signupDate);
  const last = trend.points[trend.points.length - 1];
  return { ...trend, change: last && last.diff !== null ? last.diff : null };
}

// 월별: 최근 6개월 월 총점. 요약의 증감은 월간 비교 규칙(같은 기간 비교) 값.
function monthlyTrend(now, workouts, photos, { signupDate, count = 6 } = {}) {
  const trend = buildTrend(date.recentMonths(now, count), now, workouts, photos, signupDate);
  return { ...trend, change: trend.points.length ? monthlyComparison(now, workouts, photos) : null };
}

// ---------- 캘린더 ----------

// 운동한 날의 농도 4단계: ~5.9 / 6~11.9 / 12~17.9 / 18~23
function scoreLevel(total) {
  if (total < 6) return 1;
  if (total < 12) return 2;
  if (total < 18) return 3;
  return 4;
}

// 한 달 캘린더(월~일). 기록은 그 달 1일 2일 전부터 넘긴다.
// cell.state: worked | rest | today(아직 운동 전) | future | beforeSignup | outside(앞뒤 달)
function calendarMonth(ym, now, workouts, photos, { signupDate } = {}) {
  const todayYmd = date.today(now);
  const thisYm = date.monthOf(todayYmd);
  const { start, end } = date.monthRange(ym);
  const index = indexRecords(workouts, photos);

  const cells = date.eachDay(date.weekRange(start).start, date.weekRange(end).end).map((d) => {
    const base = { date: d, day: Number(d.slice(8, 10)), inMonth: date.monthOf(d) === ym, isToday: d === todayYmd };
    let blocked = null;
    if (!base.inMonth) blocked = 'outside';
    else if (d > todayYmd) blocked = 'future';
    else if (signupDate && d < signupDate) blocked = 'beforeSignup';
    if (blocked) return { ...base, state: blocked, clickable: false };

    const s = dayScore(index, d);
    return {
      ...base,
      state: s.worked ? 'worked' : base.isToday ? 'today' : 'rest',
      clickable: true,
      total: s.total,
      scoreLabel: s.worked ? `${formatPoints(s.total)}p` : null,
      level: s.worked ? scoreLevel(s.total) : 0,
      hasPhoto: s.hasPhoto,
      perfect: s.total === MAX_DAILY,
      fire: s.streakBonus === MAX_STREAK_BONUS, // 연속 3일째 이상
    };
  });

  const active = cells.filter((c) => c.clickable);
  const lastActive = active.length ? active[active.length - 1].date : null;
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return {
    ym,
    year,
    month,
    title: `${year}년 ${month}월`,
    weeks: Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7)),
    summary: {
      total: round1(active.reduce((sum, c) => sum + c.total, 0)),
      workedDays: active.filter((c) => c.state === 'worked').length,
      restDays: active.filter((c) => c.state === 'rest').length,
      longestStreak: lastActive ? longestStreak(workouts, { start, end: lastActive }) : 0,
    },
    daysLeft: ym === thisYm ? date.thisMonth(now).daysLeft : null,
    canPrev: signupDate ? ym > date.monthOf(signupDate) : true,
    canNext: ym < thisYm,
  };
}

// 날짜 상세. 기록은 그 날 2일 전부터 넘긴다.
function dayDetail(d, workouts, photos) {
  const s = dayScore(indexRecords(workouts, photos), d);
  const parts = [
    `운동 ${formatPoints(s.exercise)}${s.capped ? ' (상한 적용)' : ''}`,
    `연속 보너스 +${s.streakBonus}`,
    `인증 +${s.photo}`,
  ];
  return {
    ...s,
    maxTotal: MAX_DAILY,
    allClear: s.total === MAX_DAILY,
    photos: s.photos.map((p) => ({ ...p, uploadedAt: p.created_at ? date.toSeoulTime(p.created_at) : null })),
    breakdownLabel: parts.join(' · '),
  };
}

module.exports = {
  MAX_EXERCISE,
  MAX_STREAK_BONUS,
  PHOTO_POINT,
  MAX_DAILY,
  LOOKBACK_DAYS,
  round1,
  formatPoints,
  workoutScore,
  exerciseScore,
  indexRecords,
  streakBonus,
  dayScore,
  dailyScores,
  periodScore,
  fetchStart,
  workedDates,
  currentStreak,
  longestStreak,
  nextStreakGoal,
  streakMessage,
  compareTotals,
  monthlyComparison,
  weeklyTrend,
  monthlyTrend,
  scoreLevel,
  calendarMonth,
  dayDetail,
};
