const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const date = require('./date');
const workouts = require('./workouts');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  });
  next();
});

// 회원가입·로그인 오류(AuthError)는 정해진 문구만, 나머지는 오류 처리기로 넘긴다
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof auth.AuthError) return res.status(err.status).json({ error: err.message, field: err.field });
    next(err);
  }
};

// 이니셜: 아이디 앞 2글자 대문자 (musclekim → MK)
const initials = (username) => username.slice(0, 2).toUpperCase();

// ---------- 인증 ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post(
  '/api/signup',
  handle(async (req, res) => {
    const user = await auth.signup({
      username: req.body?.username,
      password: req.body?.password,
      passwordConfirm: req.body?.passwordConfirm,
    });
    // 가입하면 바로 로그인 상태로 둔다 (브라우저를 닫으면 끝나는 세션 쿠키)
    auth.setSessionCookie(req, res, user.id, false);
    res.status(201).json({ id: user.id, username: user.username });
  }),
);

app.post(
  '/api/login',
  handle(async (req, res) => {
    const user = await auth.login({ username: req.body?.username, password: req.body?.password });
    auth.setSessionCookie(req, res, user.id, req.body?.remember === true);
    res.json({ id: user.id, username: user.username });
  }),
);

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(req, res);
  res.json({ ok: true });
});

// 아래 API는 모두 로그인 필요. 조회·수정·삭제는 req.user.id 범위로 제한한다.
app.use('/api', auth.requireAuth);

app.get(
  '/api/me',
  handle(async (req, res) => {
    const sql = await db();
    const [user] = await sql`SELECT id, username, created_at FROM users WHERE id = ${req.user.id}`;
    if (!user) {
      auth.clearSessionCookie(req, res);
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    res.json({
      id: user.id,
      username: user.username,
      initials: initials(user.username),
      signupDate: date.toSeoulDate(user.created_at),
    });
  }),
);

// ---------- 운동 기록 (날짜는 서버가 정한 오늘, 본인 기록만) ----------
const WORKOUT_COLUMNS = 'id, type, activity, minutes, intensity, sets, body_parts, memo, created_at';

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

async function todayRows(sql, userId, today) {
  return sql.query(
    `SELECT ${WORKOUT_COLUMNS} FROM workouts WHERE user_id = $1 AND done_on = $2::date ORDER BY created_at, id`,
    [userId, today],
  );
}

async function sendToday(res, sql, userId, today, status = 200) {
  res.status(status).json(workouts.todaySummary(today, await todayRows(sql, userId, today)));
}

// 수정·삭제 대상이 없을 때: 내 기록이지만 오늘 것이 아니면 403, 아니면 404 (남의 기록은 존재 여부도 알리지 않음)
async function notEditable(res, sql, userId, id) {
  const [own] = await sql`SELECT 1 FROM workouts WHERE id = ${id} AND user_id = ${userId}`;
  if (own) return res.status(403).json({ error: '오늘 기록만 수정·삭제할 수 있어요.' });
  return res.status(404).json({ error: '기록을 찾을 수 없어요.' });
}

app.get(
  '/api/workouts/today',
  handle(async (req, res) => {
    await sendToday(res, await db(), req.user.id, date.today());
  }),
);

app.post(
  '/api/workouts/preview',
  handle(async (req, res) => {
    const parsed = workouts.parseScoreFields(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error, field: parsed.field });
    const editingId = req.body?.editingId == null ? null : parseId(req.body.editingId);
    const rows = await todayRows(await db(), req.user.id, date.today());
    res.json(workouts.previewScore(rows, parsed.value, editingId));
  }),
);

app.post(
  '/api/workouts',
  handle(async (req, res) => {
    const parsed = workouts.parseWorkout(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error, field: parsed.field });
    const w = parsed.value;
    const today = date.today();
    const sql = await db();
    await sql`
      INSERT INTO workouts (user_id, done_on, type, activity, minutes, intensity, sets, body_parts, memo)
      VALUES (${req.user.id}, ${today}::date, ${w.type}, ${w.activity}, ${w.minutes}, ${w.intensity},
              ${w.sets}, ${w.body_parts}, ${w.memo})`;
    await sendToday(res, sql, req.user.id, today, 201);
  }),
);

app.put(
  '/api/workouts/:id',
  handle(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: '기록을 찾을 수 없어요.' });
    const parsed = workouts.parseWorkout(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error, field: parsed.field });
    const w = parsed.value;
    const today = date.today();
    const sql = await db();
    const updated = await sql`
      UPDATE workouts SET type = ${w.type}, activity = ${w.activity}, minutes = ${w.minutes},
             intensity = ${w.intensity}, sets = ${w.sets}, body_parts = ${w.body_parts}, memo = ${w.memo}
      WHERE id = ${id} AND user_id = ${req.user.id} AND done_on = ${today}::date
      RETURNING id`;
    if (updated.length === 0) return notEditable(res, sql, req.user.id, id);
    await sendToday(res, sql, req.user.id, today);
  }),
);

app.delete(
  '/api/workouts/:id',
  handle(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: '기록을 찾을 수 없어요.' });
    const today = date.today();
    const sql = await db();
    const deleted = await sql`
      DELETE FROM workouts WHERE id = ${id} AND user_id = ${req.user.id} AND done_on = ${today}::date
      RETURNING id`;
    if (deleted.length === 0) return notEditable(res, sql, req.user.id, id);
    await sendToday(res, sql, req.user.id, today);
  }),
);

app.use('/api', (req, res) => res.status(404).json({ error: '존재하지 않는 API입니다.' }));

// 오류 처리: 내부 정보(연결 문자열 등)는 클라이언트에 노출하지 않음
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
  }
  console.error('[server error]', err.message);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

module.exports = app;
