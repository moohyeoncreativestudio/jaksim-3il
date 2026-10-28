// 날짜 경계 점검 (현재 시각 주입). 서버(UTC)에서도 한국 시간 기준으로 동작하는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const date = require('../lib/date');
const score = require('../lib/score');
const home = require('../lib/home');

const kst = (s) => new Date(`${s}+09:00`);

test('한국 시간 23:50은 그날, 00:10은 다음 날 (UTC 서버 기준)', () => {
  assert.equal(date.today(kst('2026-10-28T23:50:00')), '2026-10-28'); // UTC 14:50
  assert.equal(date.today(kst('2026-10-29T00:10:00')), '2026-10-29'); // UTC 15:10 (UTC로는 아직 28일)
  assert.equal(new Date('2026-10-28T15:10:00Z').toISOString().slice(0, 10), '2026-10-28');
  assert.equal(date.today(new Date('2026-10-28T15:10:00Z')), '2026-10-29');
  // 월말·연말 경계
  assert.equal(date.today(kst('2026-10-31T23:59:59')), '2026-10-31');
  assert.equal(date.today(kst('2026-11-01T00:00:00')), '2026-11-01');
  assert.equal(date.today(kst('2027-01-01T00:00:00')), '2027-01-01');
});

test('월요일 0시에 새 주가 시작', () => {
  assert.deepEqual(date.thisWeek(kst('2026-10-04T23:59:59')), { start: '2026-09-28', end: '2026-10-04' }); // 일요일 밤
  assert.deepEqual(date.thisWeek(kst('2026-10-05T00:00:00')), { start: '2026-10-05', end: '2026-10-11' }); // 월요일 0시
  assert.equal(date.recentWeeks(kst('2026-10-05T00:00:00')).at(-1).start, '2026-10-05');
});

test('10월 31일에는 최종 비교(9월 전체), 10월 30일까지는 같은 기간 비교', () => {
  const d30 = date.comparisonPeriods(kst('2026-10-30T23:59:00'));
  assert.deepEqual([d30.final, d30.previous.end], [false, '2026-09-30']); // 9월은 30일까지라 같은 기간도 9/30
  const d31 = date.comparisonPeriods(kst('2026-10-31T00:00:00'));
  assert.deepEqual([d31.final, d31.current.end, d31.previous.start, d31.previous.end], [true, '2026-10-31', '2026-09-01', '2026-09-30']);
});

test('3월 30일에는 2월 전체(평년 28일, 윤년 29일)와 비교 — 홈 문구까지', () => {
  for (const [y, last] of [[2026, 28], [2028, 29]]) {
    const now = kst(`${y}-03-30T12:00:00`);
    const p = date.comparisonPeriods(now);
    assert.deepEqual([p.final, p.previous.start, p.previous.end], [false, `${y}-02-01`, `${y}-02-${last}`]);
    const h = home.buildHome({ now, username: 'u', signupDate: `${y}-01-01`, workouts: [], photos: [], allWorkedDates: [] });
    assert.equal(h.month.comparison.previousLabel, `2월 1~${last}일 0점`);
  }
});

test('월이 바뀌어도 연속 보너스·연속 일수가 이어짐 (10/30~11/2)', () => {
  const w = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((d) => ({ done_on: d, type: 'strength', sets: 3 }));
  const days = score.dailyScores('2026-11-01', '2026-11-02', w, []);
  assert.deepEqual(days.map((d) => d.streakBonus), [2, 2]);
  assert.equal(score.currentStreak(w, '2026-11-02'), 4);
  // 11월 캘린더: 11/1은 연속 3일째라 불꽃
  const cal = score.calendarMonth('2026-11', kst('2026-11-02T12:00:00'), w, []);
  assert.equal(cal.weeks.flat().find((c) => c.date === '2026-11-01').fire, true);
});
