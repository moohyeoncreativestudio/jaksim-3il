const test = require('node:test');
const assert = require('node:assert/strict');
const records = require('../lib/records');
const score = require('../lib/score');

const kst = (s) => new Date(`${s}+09:00`);
const at = (d) => `${d}T00:30:00Z`; // 한국 시각 09:30
const cardio = (done_on, minutes, intensity, activity = '러닝', memo = null) => ({ id: Math.random(), done_on, type: 'cardio', activity, minutes, intensity, memo, created_at: at(done_on) });
const strength = (done_on, sets, body_parts = null, memo = null) => ({ id: Math.random(), done_on, type: 'strength', sets, body_parts, memo, created_at: at(done_on) });
const photo = (done_on, id) => ({ id, done_on, blob_url: 'x', created_at: `${done_on}T09:42:00Z` });

// CLAUDE.md 검증 예시
const WORKOUTS = [
  strength('2026-09-30', 10), cardio('2026-10-01', 30, 3), strength('2026-10-02', 25),
  strength('2026-10-03', 10, '등,팔', '풀업'), cardio('2026-10-03', 60, 3, '복싱'), cardio('2026-10-05', 60, 1, '걷기'),
  cardio('2026-10-06', 40, 2), strength('2026-10-06', 5), cardio('2026-10-07', 90, 2, '축구'),
];
const PHOTOS = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07'].map((d, i) => photo(d, i + 1));
const NOW = kst('2026-10-07T20:00:00');
const dates = [...new Set(WORKOUTS.map((w) => w.done_on))].sort();
const cal = () => records.buildCalendar({ now: NOW, ym: '2026-10', signupDate: '2026-09-20', workouts: WORKOUTS, photos: PHOTOS, allWorkedDates: dates });

test('볼 수 있는 달: 가입한 달 ~ 이번 달', () => {
  assert.equal(records.monthAllowed('2026-10', NOW, '2026-09-20'), true);
  assert.equal(records.monthAllowed('2026-09', NOW, '2026-09-20'), true);
  assert.equal(records.monthAllowed('2026-08', NOW, '2026-09-20'), false); // 가입 전 달
  assert.equal(records.monthAllowed('2026-11', NOW, '2026-09-20'), false); // 미래 달
  assert.equal(records.monthAllowed('2026-13', NOW, '2026-09-20'), false);
  assert.equal(records.monthAllowed('abc', NOW, '2026-09-20'), false);
});

test('조회 범위: 그 달 1일 2일 전 ~ 말일(이번 달은 오늘)', () => {
  assert.deepEqual(records.calendarRange('2026-10', NOW), { from: '2026-09-29', to: '2026-10-07' });
  assert.deepEqual(records.calendarRange('2026-09', NOW), { from: '2026-08-30', to: '2026-09-30' });
  const r = records.statsRange(NOW);
  assert.deepEqual(r, { from: '2026-04-29', to: '2026-10-07' }); // 6개월 첫날(5/1)이 12주 첫 월요일(7/20)보다 이름
});

test('캘린더 응답: 월 요약, 남은 날, 연속 문구, 오늘 선택', () => {
  const c = cal();
  assert.equal(c.title, '2026년 10월');
  assert.deepEqual(c.summary, { total: 102.6, workedDays: 6, restDays: 1, longestStreak: 3 });
  assert.equal(c.daysLeft, 24);
  assert.equal(c.selected, '2026-10-07');
  assert.deepEqual(c.streak, { current: 3, headline: '작심 연속 3일차 순항 중!', next: '다음 작심 7일 달성까지 4일' });
  assert.deepEqual([c.canPrev, c.canNext], [true, false]);
  // 날짜별 점수 합계 = 월 누적 점수
  const sum = c.weeks.flat().filter((x) => x.clickable).reduce((s, x) => s + x.total, 0);
  assert.equal(score.round1(sum), c.summary.total);
});

test('날짜 상세: 기록별 실제 점수·부제, 상한 적용 합계, 올클리어', () => {
  const d = cal().details['2026-10-03'];
  assert.equal(d.label, '10월 3일 (토)');
  assert.deepEqual(d.workouts.map((w) => [w.title, w.subtitle, w.score]), [
    ['근력 10세트', '등, 팔 · 풀업', 10],
    ['복싱 60분', '강도 3 힘들게', 20],
  ]);
  assert.deepEqual([d.total, d.allClear, d.breakdownLabel], [23, true, '운동 20 (상한 적용) · 연속 보너스 +2 · 인증 +1']);
  assert.deepEqual(d.photos, [{ id: 2, timeLabel: '18:42', imageUrl: '/api/photos/2/image', points: 1 }]);
});

test('날짜 상세: 사진만 있는 휴식일은 0점, 미래·앞 달 날짜는 상세 없음', () => {
  const c = cal();
  const rest = c.details['2026-10-04'];
  assert.deepEqual([rest.worked, rest.total, rest.workouts.length, rest.photos.length, rest.photos[0].points], [false, 0, 0, 1, 0]);
  assert.equal(rest.breakdownLabel, '운동 0 · 연속 보너스 +0 · 인증 +0');
  assert.equal(c.details['2026-10-08'], undefined);
  assert.equal(c.details['2026-09-30'], undefined);
});

test('지난달 캘린더: D-day 없음, 선택 없음, 가입 전 날짜는 누를 수 없음', () => {
  const c = records.buildCalendar({ now: NOW, ym: '2026-09', signupDate: '2026-09-20', workouts: WORKOUTS, photos: PHOTOS, allWorkedDates: dates });
  assert.deepEqual([c.daysLeft, c.selected, c.canPrev, c.canNext], [null, null, false, true]);
  const cells = new Map(c.weeks.flat().map((x) => [x.date, x]));
  assert.equal(cells.get('2026-09-19').clickable, false);
  assert.equal(cells.get('2026-09-30').scoreLabel, '10p');
  assert.equal(c.summary.total, 10);
});

test('통계: 주간·월간 총점 = 같은 기간 일별 점수 합계, 요약', () => {
  const s = records.buildStats({ now: NOW, signupDate: '2026-09-20', workouts: WORKOUTS, photos: PHOTOS });
  const daily = (a, b) => score.round1(score.dailyScores(a, b, WORKOUTS, PHOTOS).reduce((x, d) => x + d.total, 0));
  for (const p of [...s.weekly.points, ...s.monthly.points]) {
    assert.equal(p.total, daily(p.start, p.end < s.today ? p.end : s.today), `${p.label}`);
  }
  assert.deepEqual(s.weekly.points.map((p) => p.total), [0, 0, 67, 45.6]);
  assert.deepEqual(s.monthly.points.map((p) => [p.label, p.total, p.workedDays, p.inProgress]), [['9월', 10, 1, false], ['10월', 102.6, 6, true]]);
  assert.equal(s.weekly.maxPerPeriod, 161);
  assert.equal(s.monthly.average, 10);
  assert.equal(s.monthly.best.label, '10월');
  assert.equal(s.weekly.change.current.total, 45.6); // 이번 주 월~수 vs 지난주 월~수
  assert.equal(s.weekly.change.previous.total, 10);
});

test('신규 사용자: 빈 캘린더와 0점 그래프', () => {
  const now = kst('2026-10-28T10:00:00');
  const c = records.buildCalendar({ now, ym: '2026-10', signupDate: '2026-10-28', workouts: [], photos: [], allWorkedDates: [] });
  assert.deepEqual(c.summary, { total: 0, workedDays: 0, restDays: 0, longestStreak: 0 });
  assert.equal(c.selected, '2026-10-28');
  assert.equal(c.details['2026-10-28'].total, 0);
  assert.equal(c.streak.headline, '오늘 작심하면 1일차 시작!');
  const s = records.buildStats({ now, signupDate: '2026-10-28', workouts: [], photos: [] });
  assert.deepEqual([s.weekly.points.length, s.monthly.points.length], [1, 1]);
  assert.deepEqual([s.weekly.average, s.monthly.average, s.monthly.points[0].total], [null, null, 0]);
});
