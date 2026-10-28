// 로컬 확인용 예시 데이터 정의 (seed-demo.js / clear-demo.js 공용). API·화면에서는 사용하지 않는다.
const date = require('../lib/date');

// 예시 기록 표시: 이 메모·사진 주소를 가진 행만 예시 데이터로 보고 지운다.
const DEMO_MEMO = '[예시] seed-demo';
const DEMO_PHOTO_PREFIX = 'https://demo.invalid/jaksim-seed/'; // .invalid는 실제로 존재할 수 없는 주소

const cardio = (activity, minutes, intensity) => ({ type: 'cardio', activity, minutes, intensity });
const strength = (sets, bodyParts) => ({ type: 'strength', sets, bodyParts });

// 오늘부터 거꾸로 k일 전의 기록: 10일 주기로 반복
//  휴식일(3·7번), 사진만 있고 운동 없는 날(4번), 20점 상한에 걸리는 날(1·2번), 연속 구간이 생기도록 배치
const PATTERN = [
  { workouts: [cardio('러닝', 40, 2), strength(6, '하체')], photo: true }, // 0: 14.9
  { workouts: [strength(25, '가슴,등')], photo: true }, // 1: 25 → 20 (상한)
  { workouts: [cardio('복싱', 60, 3), strength(10, '팔')], photo: true }, // 2: 30 → 20 (상한)
  { workouts: [cardio('걷기', 45, 1)], photo: false }, // 3: 5
  { workouts: [], photo: true }, // 4: 사진만 (휴식일)
  { workouts: [cardio('사이클', 50, 2)], photo: true }, // 5: 11.1
  { workouts: [strength(12, '어깨')], photo: false }, // 6: 12
  { workouts: [], photo: false }, // 7: 휴식
  { workouts: [cardio('수영', 40, 2)], photo: true }, // 8: 8.9
  { workouts: [strength(8, '복근'), cardio('러닝', 20, 3)], photo: false }, // 9: 14.7
];

// 지난달 1일 ~ 오늘의 예시 기록. 오늘은 사진을 넣지 않는다 (운동 추가 화면 썸네일이 실제 사진이어야 하므로).
function buildDemo(now = new Date()) {
  const today = date.today(now);
  const start = date.monthRange(date.addMonths(date.monthOf(today), -1)).start;
  const days = date.eachDay(start, today);
  const workouts = [];
  const photos = [];
  for (const d of days) {
    const k = date.diffDays(d, today);
    const p = PATTERN[k % PATTERN.length];
    p.workouts.forEach((w, i) => workouts.push({ done_on: d, order: i, ...w }));
    if (p.photo && d !== today) photos.push({ done_on: d });
  }
  return { start, today, workouts, photos };
}

module.exports = { DEMO_MEMO, DEMO_PHOTO_PREFIX, PATTERN, buildDemo };
