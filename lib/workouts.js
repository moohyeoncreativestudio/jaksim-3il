// 운동 기록 입력 검증과 화면용 변환 (순수 함수, DB 접근 없음). 점수는 score.js로 계산한다.
const score = require('./score');
const date = require('./date');
const { BODY_PARTS } = require('./db');

const ACTIVITY_MAX = 20;
const MEMO_MAX = 100;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// 점수 계산에 필요한 값만 검사 (예상 점수 미리보기용)
function parseScoreFields(body) {
  const type = body?.type;
  if (type === 'cardio') {
    const minutes = Number(body.minutes);
    const intensity = Number(body.intensity);
    if (!isInt(minutes, 1, 600)) return { error: '운동 시간은 1~600분으로 입력해 주세요.', field: 'minutes' };
    if (!isInt(intensity, 1, 3)) return { error: '강도를 선택해 주세요.', field: 'intensity' };
    return { value: { type, minutes, intensity } };
  }
  if (type === 'strength') {
    const sets = Number(body.sets);
    if (!isInt(sets, 1, 100)) return { error: '세트 수는 1~100으로 입력해 주세요.', field: 'sets' };
    return { value: { type, sets } };
  }
  return { error: '운동 종류가 올바르지 않습니다.', field: 'type' };
}

// 저장할 기록 전체 검사. DB 칼럼 형태로 돌려준다.
function parseWorkout(body) {
  const base = parseScoreFields(body);
  if (base.error) return base;
  const v = base.value;
  if (v.type === 'cardio') {
    const activity = typeof body.activity === 'string' ? body.activity.trim() : '';
    if (!activity) return { error: '종목을 선택하거나 입력해 주세요.', field: 'activity' };
    if (activity.length > ACTIVITY_MAX) return { error: `종목명은 ${ACTIVITY_MAX}자까지 입력할 수 있어요.`, field: 'activity' };
    return {
      value: { type: 'cardio', activity, minutes: v.minutes, intensity: v.intensity, sets: null, body_parts: null, memo: null },
    };
  }
  const parts = body.bodyParts ?? [];
  if (!Array.isArray(parts) || parts.some((p) => !BODY_PARTS.includes(p)) || new Set(parts).size !== parts.length) {
    return { error: '운동 부위가 올바르지 않습니다.', field: 'bodyParts' };
  }
  const memoRaw = body.memo ?? '';
  if (typeof memoRaw !== 'string') return { error: '메모 형식이 올바르지 않습니다.', field: 'memo' };
  const memo = memoRaw.trim();
  if (memo.length > MEMO_MAX) return { error: `메모는 ${MEMO_MAX}자까지 입력할 수 있어요.`, field: 'memo' };
  const sorted = BODY_PARTS.filter((p) => parts.includes(p)); // 하체, 가슴, 등 … 순서로 저장
  return {
    value: {
      type: 'strength',
      activity: null,
      minutes: null,
      intensity: null,
      sets: v.sets,
      body_parts: sorted.length ? sorted.join(',') : null,
      memo: memo || null,
    },
  };
}

// 'HH:MM' → '오전 07:30'
function koreanTime(instant) {
  const [h, m] = date.toSeoulTime(instant).split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h < 12 ? '오전' : '오후'} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// DB 행 → 화면용 기록
function toItem(row) {
  return {
    id: row.id,
    type: row.type,
    activity: row.activity,
    minutes: row.minutes,
    intensity: row.intensity,
    sets: row.sets,
    bodyParts: row.body_parts ? row.body_parts.split(',') : [],
    memo: row.memo,
    score: score.workoutScore(row),
    timeLabel: koreanTime(row.created_at),
  };
}

// 오늘 운동 점수 요약(상한 적용)
function todaySummary(today, rows) {
  const ex = score.exerciseScore(rows);
  return {
    date: today,
    workouts: rows.map(toItem),
    exercise: ex.score,
    capped: ex.capped,
    remaining: score.round1(score.MAX_EXERCISE - ex.score),
    max: score.MAX_EXERCISE,
  };
}

// 예상 점수: draft를 저장(수정이면 editingId 기록을 대신)했을 때 오늘 운동 점수
function previewScore(rows, draft, editingId = null) {
  const others = rows.filter((r) => r.id !== editingId);
  const before = score.exerciseScore(others).score;
  const after = score.exerciseScore([...others, draft]).score;
  return {
    recordScore: score.workoutScore(draft),
    before,
    after,
    atCap: before >= score.MAX_EXERCISE,
    max: score.MAX_EXERCISE,
  };
}

module.exports = { parseScoreFields, parseWorkout, koreanTime, toItem, todaySummary, previewScore, ACTIVITY_MAX, MEMO_MAX };
