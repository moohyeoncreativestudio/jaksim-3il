const { Readable } = require('stream');
const express = require('express');
const blob = require('@vercel/blob');
const { db, fetchRecords } = require('./db');
const auth = require('./auth');
const date = require('./date');
const workouts = require('./workouts');
const photos = require('./photos');
const score = require('./score');

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

// 오늘 요약: 오늘 운동 점수(상한 적용) + 오늘 사진 + 하루 점수(연속 보너스·인증샷 포함)
// 연속 보너스 계산을 위해 오늘 2일 전부터 기록을 한 번에 조회한다.
async function sendToday(res, sql, userId, today, status = 200) {
  const [rows, recent] = await Promise.all([todayRows(sql, userId, today), fetchRecords(userId, score.fetchStart(today), today)]);
  const [day] = score.dailyScores(today, today, recent.workouts, recent.photos);
  res.status(status).json({
    ...workouts.todaySummary(today, rows),
    photos: recent.photos.filter((p) => p.done_on === today).map(photos.toItem),
    day: { total: day.total, exercise: day.exercise, streakBonus: day.streakBonus, photo: day.photo, worked: day.worked, max: score.MAX_DAILY },
  });
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

// ---------- 인증샷 (비공개 Blob, 오늘 사진만 추가·삭제, 본인 사진만 조회) ----------
const BLOB_ACCESS = 'private';

app.post(
  '/api/photos',
  express.raw({ type: () => true, limit: photos.MAX_BYTES }),
  handle(async (req, res) => {
    const kind = photos.detectImageType(req.body);
    if (!kind) return res.status(400).json({ error: 'JPEG, PNG, WEBP 사진만 올릴 수 있어요.' });
    const today = date.today();
    const sql = await db();
    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM photos WHERE user_id = ${req.user.id} AND done_on = ${today}::date`;
    if (count >= photos.MAX_PER_DAY) {
      return res.status(400).json({ error: `사진은 하루 ${photos.MAX_PER_DAY}장까지 올릴 수 있어요.` });
    }
    const stored = await blob.put(photos.randomPath(kind.ext), req.body, {
      access: BLOB_ACCESS,
      contentType: kind.mime,
      addRandomSuffix: true,
    });
    try {
      await sql`INSERT INTO photos (user_id, done_on, blob_url) VALUES (${req.user.id}, ${today}::date, ${stored.url})`;
    } catch (err) {
      await blob.del(stored.url).catch(() => {}); // DB 저장에 실패하면 올린 파일도 지운다
      throw err;
    }
    await sendToday(res, sql, req.user.id, today, 201);
  }),
);

// 사진 보기: 본인 사진일 때만 서버가 토큰으로 Blob을 읽어 그대로 전달한다 (Blob 주소는 노출하지 않음)
app.get(
  '/api/photos/:id/image',
  handle(async (req, res) => {
    const id = parseId(req.params.id);
    const sql = await db();
    const [row] = id ? await sql`SELECT blob_url FROM photos WHERE id = ${id} AND user_id = ${req.user.id}` : [];
    if (!row) return res.status(404).json({ error: '사진을 찾을 수 없어요.' });
    const file = await blob.get(row.blob_url, { access: BLOB_ACCESS });
    if (!file || file.statusCode !== 200) return res.status(404).json({ error: '사진을 찾을 수 없어요.' });
    res.set({
      'Content-Type': file.blob.contentType,
      'Content-Length': String(file.blob.size),
      // 공유 기기에서 로그아웃 뒤 다른 계정이 브라우저 캐시로 사진을 보지 못하게 저장하지 않는다
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline',
    });
    Readable.fromWeb(file.stream).pipe(res);
  }),
);

app.delete(
  '/api/photos/:id',
  handle(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: '사진을 찾을 수 없어요.' });
    const today = date.today();
    const sql = await db();
    const [deleted] = await sql`
      DELETE FROM photos WHERE id = ${id} AND user_id = ${req.user.id} AND done_on = ${today}::date
      RETURNING blob_url`;
    if (!deleted) {
      const [own] = await sql`SELECT 1 FROM photos WHERE id = ${id} AND user_id = ${req.user.id}`;
      if (own) return res.status(403).json({ error: '오늘 사진만 삭제할 수 있어요.' });
      return res.status(404).json({ error: '사진을 찾을 수 없어요.' });
    }
    await blob.del(deleted.blob_url).catch((err) => console.error('[blob delete]', err.message));
    await sendToday(res, sql, req.user.id, today);
  }),
);

app.use('/api', (req, res) => res.status(404).json({ error: '존재하지 않는 API입니다.' }));

// 오류 처리: 내부 정보(연결 문자열 등)는 클라이언트에 노출하지 않음
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    const message = req.path === '/api/photos' ? '사진은 2MB 이하만 올릴 수 있어요.' : '요청이 너무 커요.';
    return res.status(413).json({ error: message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
  }
  console.error('[server error]', err.message);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

module.exports = app;
