const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const date = require('./date');

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
    if (err instanceof auth.AuthError) return res.status(err.status).json({ error: err.message });
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
