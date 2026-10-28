const test = require('node:test');
const assert = require('node:assert/strict');
const home = require('../lib/home');

const kst = (s) => new Date(`${s}+09:00`);
const cardio = (done_on, minutes, intensity, activity = '러닝') => ({ done_on, type: 'cardio', activity, minutes, intensity });
const strength = (done_on, sets) => ({ done_on, type: 'strength', sets });
const photo = (done_on) => ({ done_on });
const datesOf = (ws) => [...new Set(ws.map((w) => w.done_on))].sort();

// CLAUDE.md 검증 예시 (9/29 휴식, 9/30 근력 10세트, 10/1~10/7)
const WORKOUTS = [
  strength('2026-09-30', 10), cardio('2026-10-01', 30, 3), strength('2026-10-02', 25),
  strength('2026-10-03', 10), cardio('2026-10-03', 60, 3, '복싱'), cardio('2026-10-05', 60, 1, '걷기'),
  cardio('2026-10-06', 40, 2), strength('2026-10-06', 5), cardio('2026-10-07', 90, 2, '축구'),
];
const PHOTOS = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07'].map(photo);
const build = (now, workouts, photos, extra = {}) =>
  home.buildHome({ now, username: 'musclekim', signupDate: '2026-09-20', workouts, photos, allWorkedDates: datesOf(workouts), ...extra });

test('조회 범위: 지난달 비교 기간 시작 2일 전 ~ 오늘', () => {
  assert.deepEqual(home.fetchRange(kst('2026-10-07T20:00:00')), { from: '2026-08-30', to: '2026-10-07' });
});

test('검증 예시로 홈 전체 값 (10/7 20:00)', () => {
  const h = build(kst('2026-10-07T20:00:00'), WORKOUTS, PHOTOS);
  assert.equal(h.dateLabel, '10월 7일 수요일');
  assert.equal(h.month.label, '10월 누적 점수');
  assert.equal(h.month.total, 102.6);

  const c = h.month.comparison;
  assert.deepEqual([c.tone, c.headline, c.chip, c.previousLabel], ['none', '이번 달이 첫 기록이에요', '▲ 102.6점 · 지난달 기록 없음', '9월 1~7일 0점']);

  assert.deepEqual(h.streak, {
    current: 3, longest: 4, recordBreaking: false,
    banner: { level: 'hot', title: '작심삼일 돌파! 3일째', sub: '+2점 연속 보너스 유지 중' },
  });
  assert.deepEqual(h.stats, { workedDays: 6, elapsedDays: 7, ratio: 86, photoDays: 4, photoPoints: 4 });

  assert.equal(h.week.label, '10.5 ~ 10.11');
  assert.deepEqual(h.week.days.map((d) => `${d.weekday}${d.day}:${d.status}:${d.label}`), [
    '월5:done:완료', '화6:done:완료', '수7:today-done:오늘', '목8:future:-', '금9:future:-', '토10:future:-', '일11:future:-',
  ]);
  assert.deepEqual(
    [h.todayScore.total, h.todayScore.exercise, h.todayScore.streakBonus, h.todayScore.photo],
    [23, 20, 2, 1],
  );
});

test('지난주 휴식일은 "휴식", 오늘 운동 전은 "오늘", 연속은 어제까지 기준', () => {
  const h = build(kst('2026-10-08T09:00:00'), WORKOUTS, PHOTOS); // 목요일, 아직 운동 전
  assert.equal(h.streak.current, 3);
  assert.deepEqual(h.week.days.slice(0, 4).map((d) => d.status), ['done', 'done', 'done', 'today']);
  assert.equal(h.todayScore.total, 0);
  const sun = build(kst('2026-10-04T12:00:00'), WORKOUTS, PHOTOS); // 일요일: 10/4는 사진만 → 오늘(운동 전)
  // 9/28(월)·9/29(화) 휴식, 9/30~10/3 운동, 10/4는 사진만 있어 아직 운동 전인 오늘
  assert.deepEqual(sun.week.days.map((d) => d.status), ['rest', 'rest', 'done', 'done', 'done', 'done', 'today']);
  assert.equal(sun.week.days[1].label, '휴식');
});

test('가입 전 날짜는 휴식이 아니라 "-"', () => {
  const h = build(kst('2026-10-01T12:00:00'), WORKOUTS, PHOTOS, { signupDate: '2026-09-30' });
  assert.deepEqual(h.week.days.slice(0, 4).map((d) => d.status), ['before', 'before', 'done', 'today-done']);
  assert.equal(h.week.days[0].label, '-');
});

test('지난달 대비 상승·하락·같음 문구와 색', () => {
  const prev = [strength('2026-09-02', 10)]; // 9/1~9/7 = 10점
  const up = build(kst('2026-10-07T20:00:00'), [...prev, strength('2026-10-03', 15)], []);
  assert.deepEqual([up.month.comparison.tone, up.month.comparison.headline, up.month.comparison.chip], ['up', '지난달의 나, 이기는 중 🔥', '▲ 5.0점 · 50.0% 상승']);
  const down = build(kst('2026-10-07T20:00:00'), [...prev, strength('2026-10-03', 4)], []);
  assert.deepEqual([down.month.comparison.tone, down.month.comparison.headline, down.month.comparison.chip], ['down', '지난달의 나, 아직 앞서는 중', '▼ 6.0점 · 60.0% 하락']);
  const same = build(kst('2026-10-07T20:00:00'), [...prev, strength('2026-10-03', 10)], []);
  assert.deepEqual([same.month.comparison.tone, same.month.comparison.chip], ['same', '변화 없음']);
});

test('연속 배너 0·1·2·3일 이상, 기록 경신은 현재 = 최장이고 3일 이상', () => {
  assert.equal(home.streakBanner(0).title, '오늘 작심하면 1일차 시작!');
  assert.equal(home.streakBanner(1).title, '작심 1일차, 내일도 오면 +1점');
  assert.equal(home.streakBanner(2).title, '내일 넘기면 작심삼일 돌파!');
  assert.deepEqual(home.streakBanner(7), { level: 'hot', title: '작심삼일 돌파! 7일째', sub: '+2점 연속 보너스 유지 중' });

  const run = ['2026-10-05', '2026-10-06', '2026-10-07'].map((d) => strength(d, 3));
  assert.equal(build(kst('2026-10-07T20:00:00'), run, []).streak.recordBreaking, true); // 3 = 3
  const two = run.slice(1);
  assert.equal(build(kst('2026-10-07T20:00:00'), two, []).streak.recordBreaking, false); // 2일은 표시 안 함
});

test('신규 사용자(기록 없음): 0점, 지난달 기록 없음, "오늘 작심하면 1일차 시작!"', () => {
  const h = home.buildHome({ now: kst('2026-10-28T10:00:00'), username: 'newbie', signupDate: '2026-10-28', workouts: [], photos: [], allWorkedDates: [] });
  assert.equal(h.month.total, 0);
  assert.deepEqual([h.month.comparison.tone, h.month.comparison.headline, h.month.comparison.chip], ['none', '이번 달이 첫 기록이에요', '변화 없음 · 지난달 기록 없음']);
  assert.deepEqual([h.streak.current, h.streak.longest, h.streak.recordBreaking, h.streak.banner.title], [0, 0, false, '오늘 작심하면 1일차 시작!']);
  assert.deepEqual(h.stats, { workedDays: 0, elapsedDays: 28, ratio: 0, photoDays: 0, photoPoints: 0 });
  assert.deepEqual(h.week.days.map((d) => d.status), ['before', 'before', 'today', 'future', 'future', 'future', 'future']);
  assert.equal(h.todayScore.total, 0);
});

test('사진만 있는 오늘은 인증샷 0점', () => {
  const h = build(kst('2026-10-04T12:00:00'), WORKOUTS, PHOTOS);
  assert.deepEqual([h.todayScore.worked, h.todayScore.hasPhoto, h.todayScore.photo, h.todayScore.total], [false, true, 0, 0]);
});
