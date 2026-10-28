const test = require('node:test');
const assert = require('node:assert/strict');
const score = require('../lib/score');

const kst = (s) => new Date(`${s}+09:00`);
const cardio = (done_on, minutes, intensity, activity = '러닝') => ({ done_on, type: 'cardio', activity, minutes, intensity });
const strength = (done_on, sets) => ({ done_on, type: 'strength', sets });
const photo = (done_on, created_at = `${done_on}T09:42:00Z`) => ({ done_on, created_at });

// CLAUDE.md 검증용 예시 (전제: 9/29 휴식, 9/30 근력 10세트)
const WORKOUTS = [
  strength('2026-09-30', 10),
  cardio('2026-10-01', 30, 3, '러닝'),
  strength('2026-10-02', 25),
  strength('2026-10-03', 10),
  cardio('2026-10-03', 60, 3, '복싱'),
  cardio('2026-10-05', 60, 1, '걷기'),
  cardio('2026-10-06', 40, 2, '러닝'),
  strength('2026-10-06', 5),
  cardio('2026-10-07', 90, 2, '축구'),
];
const PHOTOS = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07'].map((d) => photo(d));

test('기록 1건 점수는 상한 없는 원래 점수', () => {
  assert.equal(score.workoutScore(cardio('2026-10-01', 30, 3)), 10);
  assert.equal(score.workoutScore(cardio('2026-10-03', 60, 3)), 20);
  assert.equal(score.workoutScore(cardio('2026-10-01', 40, 2)), 8.9);
  assert.equal(score.workoutScore(cardio('2026-10-01', 120, 3)), 40);
  assert.equal(score.workoutScore(strength('2026-10-01', 25)), 25);
});

test('운동 점수는 합산 후 20점 상한, 반올림은 한 번만', () => {
  assert.deepEqual(score.exerciseScore([cardio('d', 40, 2), strength('d', 5)]), { score: 13.9, raw: 13.9, capped: false });
  assert.deepEqual(score.exerciseScore([strength('d', 10), cardio('d', 60, 3)]), { score: 20, raw: 30, capped: true });
  // 10분·강도1 두 번: 각각 반올림(1.1+1.1=2.2)이 아니라 합산 후 반올림(20/9=2.2)
  assert.equal(score.exerciseScore([cardio('d', 10, 1), cardio('d', 10, 1), cardio('d', 10, 1)]).score, 3.3);
  assert.equal(score.exerciseScore([]).score, 0);
});

test('검증 예시: 10/1~10/7 하루 점수와 합계 102.6', () => {
  const p = score.periodScore('2026-10-01', '2026-10-07', WORKOUTS, PHOTOS);
  const rows = p.days.map((d) => [d.date.slice(5), d.exercise, d.streakBonus, d.photo, d.total]);
  assert.deepEqual(rows, [
    ['10-01', 10, 1, 1, 12],
    ['10-02', 20, 2, 0, 22],
    ['10-03', 20, 2, 1, 23],
    ['10-04', 0, 0, 0, 0],
    ['10-05', 6.7, 0, 1, 7.7],
    ['10-06', 13.9, 1, 0, 14.9],
    ['10-07', 20, 2, 1, 23],
  ]);
  assert.equal(p.days[2].capped, true);
  assert.equal(p.total, 102.6);
  assert.equal(p.workedDays, 6);
  assert.equal(p.photoDays, 4); // 10/4 사진은 휴식일이라 점수 없음
  assert.equal(p.photoPoints, 4);
});

test('기간 시작 2일 전 기록으로 연속 보너스를 계산한다', () => {
  assert.equal(score.fetchStart('2026-10-01'), '2026-09-29');
  // 9/30 기록을 빼고 넘기면 10/1 보너스가 사라진다 → 기록을 함께 넘겨야 한다
  const without = score.periodScore('2026-10-01', '2026-10-01', WORKOUTS.slice(1), PHOTOS);
  assert.equal(without.days[0].streakBonus, 0);
  const withPrev = score.periodScore('2026-10-01', '2026-10-01', WORKOUTS, PHOTOS);
  assert.equal(withPrev.days[0].streakBonus, 1);
});

test('연속 보너스는 월이 바뀌어도 이어진다 (10/31·11/1·11/2)', () => {
  const w = [strength('2026-10-31', 3), strength('2026-11-01', 3), strength('2026-11-02', 3)];
  const days = score.dailyScores('2026-11-01', '2026-11-02', w, []);
  assert.equal(days[0].streakBonus, 1);
  assert.equal(days[1].streakBonus, 2);
});

test('휴식일은 사진이 있어도 인증·연속 점수가 없다', () => {
  const [d] = score.dailyScores('2026-10-04', '2026-10-04', WORKOUTS, PHOTOS);
  assert.equal(d.worked, false);
  assert.equal(d.hasPhoto, true);
  assert.equal(d.total, 0);
});

test('인증샷은 여러 장이어도 1점', () => {
  const [d] = score.dailyScores('2026-10-10', '2026-10-10', [strength('2026-10-10', 3)], [photo('2026-10-10'), photo('2026-10-10')]);
  assert.equal(d.photo, 1);
  assert.equal(d.total, 4);
});

test('현재·최장 연속 일수', () => {
  // 오늘(10/7) 운동함 → 10/5~10/7 = 3일
  assert.equal(score.currentStreak(WORKOUTS, '2026-10-07'), 3);
  // 10/8 아직 운동 전 → 어제까지 기준 3일
  assert.equal(score.currentStreak(WORKOUTS, '2026-10-08'), 3);
  // 10/9: 어제(10/8) 쉬었으므로 0일
  assert.equal(score.currentStreak(WORKOUTS, '2026-10-09'), 0);
  assert.equal(score.longestStreak(WORKOUTS), 4); // 9/30~10/3
  assert.equal(score.longestStreak(WORKOUTS, { start: '2026-10-01', end: '2026-10-31' }), 3);
});

test('다음 연속 목표: 연속 7일 → "다음 작심 10일 달성까지 3일"', () => {
  assert.deepEqual(score.nextStreakGoal(7), { goal: 10, remaining: 3 });
  assert.equal(score.streakMessage(7).next, '다음 작심 10일 달성까지 3일');
  assert.equal(score.streakMessage(7).headline, '작심 연속 7일차 순항 중!');
  assert.equal(score.streakMessage(0).headline, '오늘 작심하면 1일차 시작!');
  assert.deepEqual(score.nextStreakGoal(0), { goal: 3, remaining: 3 });
  assert.deepEqual(score.nextStreakGoal(3), { goal: 7, remaining: 4 });
  assert.deepEqual(score.nextStreakGoal(20), { goal: 30, remaining: 10 });
  assert.deepEqual(score.nextStreakGoal(30), { goal: 40, remaining: 10 });
  assert.deepEqual(score.nextStreakGoal(35), { goal: 40, remaining: 5 });
});

test('월간 비교: 지난달 점수 0이면 증감률 대신 "지난달 기록 없음"', () => {
  const c = score.monthlyComparison(kst('2026-10-07T20:00:00'), WORKOUTS, PHOTOS);
  assert.equal(c.final, false);
  assert.equal(c.current.total, 102.6);
  assert.equal(c.previous.total, 0); // 9/1~9/7
  assert.equal(c.noPrevious, true);
  assert.equal(c.rate, null);
  assert.equal(c.rateLabel, '지난달 기록 없음');
  assert.equal(c.diffLabel, '▲ 102.6점');
});

test('월간 비교: 같은 기간 증감 점수와 증감률', () => {
  const w = [strength('2026-09-05', 20), strength('2026-09-25', 20), strength('2026-10-03', 10)];
  const c = score.monthlyComparison(kst('2026-10-20T12:00:00'), w, []);
  assert.equal(c.previous.end, '2026-09-20'); // 9/25 기록은 비교 기간 밖
  assert.equal(c.previous.total, 20);
  assert.equal(c.current.total, 10);
  assert.equal(c.diffLabel, '▼ 10.0점');
  assert.equal(c.rate, -50);
  assert.equal(c.rateLabel, '-50.0%');

  const final = score.monthlyComparison(kst('2026-10-31T12:00:00'), w, []);
  assert.equal(final.final, true);
  assert.equal(final.previous.total, 40);

  assert.equal(score.compareTotals(10, 10).diffLabel, '변화 없음');
  assert.equal(score.compareTotals(124.8, 100).diffLabel, '▲ 24.8점');
  assert.equal(score.compareTotals(124.8, 100).rateLabel, '+24.8%');
});

test('주간 집계: 9/28~10/4 주 67점, 10/5~10/11 주 45.6점', () => {
  const t = score.weeklyTrend(kst('2026-10-07T20:00:00'), WORKOUTS, PHOTOS, { signupDate: '2026-09-20' });
  // 가입 전 구간(9/14 주 이전)은 그리지 않는다
  assert.deepEqual(t.points.map((p) => p.label), ['9/14', '9/21', '9/28', '10/5']);
  const [, , w1, w2] = t.points;
  assert.equal(w1.total, 67); // 9/30은 9/29 휴식이라 보너스 0 → 10점
  assert.equal(w1.workedDays, 4);
  assert.equal(w2.total, 45.6);
  assert.equal(w2.inProgress, true);
  assert.equal(w2.diff, -21.4);
  assert.equal(t.change, -21.4);
  assert.equal(t.best.label, '9/28');
  assert.equal(t.average, 22.3); // 진행 중인 10/5 주 제외: (0 + 0 + 67) / 3
});

test('월별 집계: 홈·캘린더와 같은 값, 요약 증감은 같은 기간 비교', () => {
  const now = kst('2026-10-07T20:00:00');
  const t = score.monthlyTrend(now, WORKOUTS, PHOTOS, { signupDate: '2026-09-20' });
  assert.deepEqual(t.points.map((p) => p.label), ['9월', '10월']);
  assert.equal(t.points[0].total, 10);
  assert.equal(t.points[1].total, 102.6);
  assert.equal(t.points[1].inProgress, true);
  assert.equal(t.average, 10);
  assert.equal(t.change.diff, score.monthlyComparison(now, WORKOUTS, PHOTOS).diff);
  assert.equal(t.points[1].total, score.calendarMonth('2026-10', now, WORKOUTS, PHOTOS).summary.total);
});

test('캘린더: 날짜별 상태·점수·농도·사진·아이콘', () => {
  const cal = score.calendarMonth('2026-10', kst('2026-10-07T20:00:00'), WORKOUTS, PHOTOS, { signupDate: '2026-09-20' });
  assert.equal(cal.title, '2026년 10월');
  assert.equal(cal.weeks[0].length, 7);
  const cells = new Map(cal.weeks.flat().map((c) => [c.date, c]));

  // 앞 달 날짜는 흐리게, 누를 수 없음
  assert.equal(cells.get('2026-09-30').state, 'outside');
  assert.equal(cells.get('2026-09-30').clickable, false);

  // 10/4는 사진이 있어도 휴식일
  const d4 = cells.get('2026-10-04');
  assert.equal(d4.state, 'rest');
  assert.equal(d4.hasPhoto, true);
  assert.equal(d4.scoreLabel, null);

  const d1 = cells.get('2026-10-01');
  assert.deepEqual([d1.state, d1.scoreLabel, d1.level, d1.fire, d1.perfect], ['worked', '12p', 3, false, false]);
  const d3 = cells.get('2026-10-03');
  assert.deepEqual([d3.scoreLabel, d3.level, d3.fire, d3.perfect, d3.hasPhoto], ['23p', 4, true, true, true]);
  const d5 = cells.get('2026-10-05');
  assert.deepEqual([d5.scoreLabel, d5.level], ['7.7p', 2]);
  assert.equal(cells.get('2026-10-07').isToday, true);
  assert.equal(cells.get('2026-10-08').state, 'future');
  assert.equal(cells.get('2026-10-08').clickable, false);

  assert.deepEqual(cal.summary, { total: 102.6, workedDays: 6, restDays: 1, longestStreak: 3 });
  assert.equal(cal.daysLeft, 24);
  assert.equal(cal.canPrev, true);
  assert.equal(cal.canNext, false);
});

test('캘린더: 오늘 운동 전은 휴식이 아님, 가입 전 날짜는 누를 수 없음, 지난달은 D-day 숨김', () => {
  const now = kst('2026-10-08T09:00:00');
  const cal = score.calendarMonth('2026-10', now, WORKOUTS, PHOTOS, { signupDate: '2026-10-01' });
  const today = cal.weeks.flat().find((c) => c.date === '2026-10-08');
  assert.equal(today.state, 'today');
  assert.equal(cal.summary.restDays, 1);
  assert.equal(cal.canPrev, false);

  const sep = score.calendarMonth('2026-09', now, WORKOUTS, PHOTOS, { signupDate: '2026-09-29' });
  const cells = new Map(sep.weeks.flat().map((c) => [c.date, c]));
  assert.equal(cells.get('2026-09-28').state, 'beforeSignup');
  assert.equal(cells.get('2026-09-29').state, 'rest');
  assert.equal(cells.get('2026-09-30').scoreLabel, '10p');
  assert.equal(sep.daysLeft, null);
  assert.equal(sep.canNext, true);
});

test('농도 4단계 경계', () => {
  assert.deepEqual([5.9, 6, 11.9, 12, 17.9, 18, 23].map(score.scoreLevel), [1, 2, 2, 3, 3, 4, 4]);
});

test('날짜 상세: 10/3은 기록별 +20(복싱), +10(근력)이지만 운동 합계 20', () => {
  const d = score.dayDetail('2026-10-03', WORKOUTS, PHOTOS);
  assert.deepEqual(
    d.workouts.map((w) => [w.activity ?? '근력', w.score]),
    [['근력', 10], ['복싱', 20]],
  );
  assert.equal(d.exercise, 20);
  assert.equal(d.total, 23);
  assert.equal(d.maxTotal, 23);
  assert.equal(d.allClear, true);
  assert.equal(d.photos[0].uploadedAt, '18:42');
  assert.equal(d.breakdownLabel, '운동 20 (상한 적용) · 연속 보너스 +2 · 인증 +1');

  const d5 = score.dayDetail('2026-10-05', WORKOUTS, PHOTOS);
  assert.equal(d5.allClear, false);
  assert.equal(d5.breakdownLabel, '운동 6.7 · 연속 보너스 +0 · 인증 +1');
});
