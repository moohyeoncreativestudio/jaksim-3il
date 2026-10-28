// 기록 화면(캘린더·날짜 상세·점수 추이) 데이터 조립. 순수 함수, DB 접근 없음. 점수는 score.js로 계산한다.
const score = require('./score');
const date = require('./date');
const workouts = require('./workouts');
const photos = require('./photos');

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const INTENSITY = { 1: '가볍게', 2: '보통', 3: '힘들게' };

// ---------- 캘린더 ----------

// 이 달을 볼 수 있는지: 가입한 달 ~ 이번 달
function monthAllowed(ym, now, signupDate) {
  if (!date.isValidMonth(ym)) return false;
  const thisYm = date.monthOf(date.today(now));
  return ym <= thisYm && (!signupDate || ym >= date.monthOf(signupDate));
}

// 캘린더에 필요한 기록 조회 범위: 그 달 1일 2일 전 ~ min(그 달 말일, 오늘)
function calendarRange(ym, now) {
  const { start, end } = date.monthRange(ym);
  const t = date.today(now);
  return { from: score.fetchStart(start), to: end < t ? end : t };
}

function dayLabel(d) {
  const [, m, dd] = d.split('-').map(Number);
  return `${m}월 ${dd}일 (${WEEKDAYS[date.weekday(d) - 1]})`;
}

// 기록별 부제: 유산소 "강도 3 힘들게 · 메모", 근력 "하체, 등 · 메모"
function subtitle(w) {
  const parts = [];
  if (w.type === 'cardio') parts.push(`강도 ${w.intensity} ${INTENSITY[w.intensity]}`);
  else if (w.body_parts) parts.push(w.body_parts.split(',').join(', '));
  if (w.memo) parts.push(w.memo);
  return parts.join(' · ') || '근력 운동';
}

// 날짜 상세 (score.dayDetail 기반). rows: 그 날 2일 전부터의 기록
function dayView(d, rows, photoRows) {
  const detail = score.dayDetail(d, rows, photoRows);
  const own = rows.filter((w) => w.done_on === d);
  return {
    date: d,
    label: dayLabel(d),
    worked: detail.worked,
    total: detail.total,
    maxTotal: detail.maxTotal,
    allClear: detail.allClear,
    workouts: own.map((w) => ({
      ...workouts.toItem(w),
      title: w.type === 'cardio' ? `${w.activity} ${w.minutes}분` : `근력 ${w.sets}세트`,
      subtitle: subtitle(w),
    })),
    // 인증샷 점수는 하루 1점: 운동한 날 첫 사진 줄에만 +1을 표시
    photos: photoRows.filter((p) => p.done_on === d).map((p, i) => ({ ...photos.toItem(p), points: i === 0 ? detail.photo : null })),
    breakdown: { exercise: detail.exercise, capped: detail.capped, streakBonus: detail.streakBonus, photo: detail.photo },
    breakdownLabel: detail.breakdownLabel,
  };
}

// allWorkedDates: 지금까지 운동한 날 전체 (현재 연속 일수용)
function buildCalendar({ now, ym, signupDate, workouts: rows, photos: photoRows, allWorkedDates }) {
  const t = date.today(now);
  const cal = score.calendarMonth(ym, now, rows, photoRows, { signupDate });
  const current = score.currentStreak(allWorkedDates.map((d) => ({ done_on: d })), t);
  const details = {};
  for (const cell of cal.weeks.flat()) {
    if (cell.clickable) details[cell.date] = dayView(cell.date, rows, photoRows);
  }
  return {
    ...cal,
    today: t,
    selected: cal.weeks.flat().some((c) => c.date === t && c.clickable) ? t : null,
    streak: { current, ...score.streakMessage(current) },
    details,
  };
}

// ---------- 점수 추이 ----------

// 추이 그래프에 필요한 조회 범위: (최근 12주 첫 월요일, 최근 6개월 첫날 중 이른 날) 2일 전 ~ 오늘
function statsRange(now) {
  const weekStart = date.recentWeeks(now, 12)[0].start;
  const monthStart = date.recentMonths(now, 6)[0].start;
  const first = weekStart < monthStart ? weekStart : monthStart;
  return { from: score.fetchStart(first), to: date.today(now) };
}

function buildStats({ now, signupDate, workouts: rows, photos: photoRows }) {
  return {
    today: date.today(now),
    weekly: { ...score.weeklyTrend(now, rows, photoRows, { signupDate }), maxPerPeriod: score.MAX_DAILY * 7 },
    monthly: score.monthlyTrend(now, rows, photoRows, { signupDate }),
  };
}

module.exports = { monthAllowed, calendarRange, buildCalendar, statsRange, buildStats, dayLabel, subtitle };
