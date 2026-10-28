// 홈 화면 데이터 조립 (순수 함수, DB 접근 없음). 점수는 모두 score.js로 계산한다.
const score = require('./score');
const date = require('./date');

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const fmt = (n) => score.formatPoints(n);

// 홈에 필요한 기록 조회 범위: 지난달 비교 기간 시작 2일 전 ~ 오늘 (이번 주·이번 달·오늘을 모두 포함)
function fetchRange(now) {
  const periods = date.comparisonPeriods(now);
  return { from: score.fetchStart(periods.previous.start), to: date.today(now) };
}

// 연속 배너 문구 (CLAUDE.md 홈 메모)
function streakBanner(current) {
  if (current >= 3) return { level: 'hot', title: `작심삼일 돌파! ${current}일째`, sub: '+2점 연속 보너스 유지 중' };
  if (current === 2) return { level: 'warm', title: '내일 넘기면 작심삼일 돌파!', sub: null };
  if (current === 1) return { level: 'warm', title: '작심 1일차, 내일도 오면 +1점', sub: null };
  return { level: 'cold', title: '오늘 작심하면 1일차 시작!', sub: null };
}

// 지난달 같은 기간 비교 문구
function comparisonView(c) {
  const prevMonth = Number(c.previous.ym.slice(5, 7));
  const prevEndDay = Number(c.previous.end.slice(8, 10));
  let tone;
  let headline;
  let chip;
  if (c.noPrevious) {
    tone = 'none';
    headline = '이번 달이 첫 기록이에요';
    chip = `${c.diffLabel} · 지난달 기록 없음`;
  } else if (c.direction === 'up') {
    tone = 'up';
    headline = '지난달의 나, 이기는 중 🔥';
    chip = `${c.diffLabel} · ${Math.abs(c.rate).toFixed(1)}% 상승`;
  } else if (c.direction === 'down') {
    tone = 'down';
    headline = '지난달의 나, 아직 앞서는 중';
    chip = `${c.diffLabel} · ${Math.abs(c.rate).toFixed(1)}% 하락`;
  } else {
    tone = 'same';
    headline = '지난달의 나와 나란히 가는 중';
    chip = '변화 없음';
  }
  return {
    final: c.final,
    tone,
    headline,
    chip,
    previousLabel: `${prevMonth}월 1~${prevEndDay}일 ${fmt(c.previous.total)}점`,
    current: c.current,
    previous: c.previous,
    diff: c.diff,
    rate: c.rate,
  };
}

// workouts·photos: fetchRange 범위의 기록 / allWorkedDates: 지금까지 운동한 날 전체 (연속 일수 계산용)
function buildHome({ now, username, signupDate, workouts, photos, allWorkedDates }) {
  const t = date.today(now);
  const month = date.thisMonth(now);
  const monthNum = Number(month.ym.slice(5, 7));
  const index = score.indexRecords(workouts, photos);

  // 이번 달 1일~오늘
  const monthScore = score.periodScore(month.start, t, workouts, photos);
  const comparison = score.monthlyComparison(now, workouts, photos);

  // 연속 일수 (실제 연속 운동 일수, 오늘 운동 전이면 어제까지)
  const dateRows = allWorkedDates.map((d) => ({ done_on: d }));
  const current = score.currentStreak(dateRows, t);
  const longest = score.longestStreak(dateRows);

  // 이번 주 월~일
  const week = date.thisWeek(now);
  const weekDays = date.eachDay(week.start, week.end).map((d, i) => {
    const base = { date: d, day: Number(d.slice(8, 10)), weekday: WEEKDAYS[i], isToday: d === t };
    if (d > t) return { ...base, status: 'future', label: '-' };
    if (signupDate && d < signupDate) return { ...base, status: 'before', label: '-' };
    const s = score.dayScore(index, d);
    if (d === t) return { ...base, status: s.worked ? 'today-done' : 'today', label: '오늘', total: s.total };
    return s.worked ? { ...base, status: 'done', label: '완료', total: s.total } : { ...base, status: 'rest', label: '휴식', total: 0 };
  });

  const today = score.dayScore(index, t);
  const [, mm, dd] = t.split('-').map(Number);
  return {
    today: t,
    dateLabel: `${mm}월 ${dd}일 ${WEEKDAYS[date.weekday(t) - 1]}요일`,
    username,
    month: {
      ym: month.ym,
      label: `${monthNum}월 누적 점수`,
      total: monthScore.total,
      comparison: comparisonView(comparison),
    },
    streak: {
      current,
      longest,
      recordBreaking: current >= 3 && current === longest,
      banner: streakBanner(current),
    },
    stats: {
      workedDays: monthScore.workedDays,
      elapsedDays: month.day,
      ratio: Math.round((monthScore.workedDays / month.day) * 100),
      photoDays: monthScore.photoDays,
      photoPoints: monthScore.photoPoints,
    },
    week: {
      start: week.start,
      end: week.end,
      label: `${Number(week.start.slice(5, 7))}.${Number(week.start.slice(8, 10))} ~ ${Number(week.end.slice(5, 7))}.${Number(week.end.slice(8, 10))}`,
      days: weekDays,
    },
    todayScore: {
      total: today.total,
      exercise: today.exercise,
      streakBonus: today.streakBonus,
      photo: today.photo,
      worked: today.worked,
      hasPhoto: today.hasPhoto,
      max: { total: score.MAX_DAILY, exercise: score.MAX_EXERCISE, streakBonus: score.MAX_STREAK_BONUS, photo: score.PHOTO_POINT },
    },
  };
}

module.exports = { fetchRange, buildHome, streakBanner, comparisonView };
