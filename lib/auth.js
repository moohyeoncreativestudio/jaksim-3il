const crypto = require('crypto');
const { promisify } = require('util');
const { db } = require('./db');

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = 'jaksim_session';
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 자동 로그인 체크: 30일 유지
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 체크 해제: 세션 쿠키(브라우저 종료 시 삭제), 토큰은 1일 후 만료
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

const USERNAME_RE = /^[a-z0-9]{4,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // 매우 긴 입력으로 해시 계산을 늘리는 것을 막는다

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// field: 화면에서 이 문구를 어느 입력칸 아래에 보여줄지 (username | password | passwordConfirm)
class AuthError extends Error {
  constructor(status, message, field = null) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

// ---------- 비밀번호 해시 (scrypt + 랜덤 salt) ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// 없는 아이디로 로그인할 때도 해시 계산 시간을 비슷하게 맞춰 아이디 존재 여부가 드러나지 않게 한다
let dummyHash = null;
async function burnTime(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
}

// ---------- 서명 토큰: v1.<user_id>.<만료 ms>.<HMAC> ----------

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET 환경변수가 없거나 너무 짧습니다.');
  return crypto.createHash('sha256').update(`jaksim-session:${secret}`).digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
}

function createToken(userId, ttlMs, now = Date.now()) {
  const payload = `v1.${userId}.${now + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

// 올바른 토큰이면 { id }를, 아니면 null을 돌려준다
function verifyToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const payload = parts.slice(0, 3).join('.');
  const given = Buffer.from(parts[3]);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const id = Number(parts[1]);
  const expires = Number(parts[2]);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(expires) || expires <= now) return null;
  return { id };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// remember=true: 30일 유지 / false: maxAge 없는 세션 쿠키
function cookieOptions(req, remember = false) {
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  const opts = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
  if (remember) opts.maxAge = REMEMBER_TTL_MS;
  return opts;
}

function setSessionCookie(req, res, userId, remember) {
  const token = createToken(userId, remember ? REMEMBER_TTL_MS : SESSION_TTL_MS);
  res.cookie(COOKIE_NAME, token, cookieOptions(req, remember));
}

function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(req, false));
}

function requireAuth(req, res, next) {
  const user = verifyToken(readCookie(req, COOKIE_NAME));
  if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.user = user;
  next();
}

// ---------- 회원가입·로그인 ----------

function validateUsername(username) {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

async function signup({ username, password, passwordConfirm }) {
  if (!validateUsername(username)) {
    throw new AuthError(400, '아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요.', 'username');
  }
  if (!validatePassword(password)) {
    throw new AuthError(400, `비밀번호는 ${PASSWORD_MIN}자 이상 입력해 주세요.`, 'password');
  }
  if (password !== passwordConfirm) {
    throw new AuthError(400, '비밀번호 확인이 일치하지 않아요.', 'passwordConfirm');
  }
  const sql = await db();
  const passwordHash = await hashPassword(password);
  const rows = await sql`
    INSERT INTO users (username, password_hash)
    VALUES (${username}, ${passwordHash})
    ON CONFLICT (username) DO NOTHING
    RETURNING id, username, created_at`;
  if (rows.length === 0) throw new AuthError(409, '이미 사용 중인 아이디예요.', 'username');
  return rows[0];
}

const LOGIN_FAILED = '아이디 또는 비밀번호가 올바르지 않아요.';
// 남은 잠금 시간은 DB 시계 기준으로 계산한 분(lock_minutes)을 쓴다
const lockedMessage = (minutes) =>
  `로그인에 ${MAX_FAILED_ATTEMPTS}회 실패해 잠겼어요. ${Math.max(1, minutes)}분 후 다시 시도해 주세요.`;

async function login({ username, password }) {
  if (!validateUsername(username) || typeof password !== 'string' || password.length > PASSWORD_MAX) {
    throw new AuthError(401, LOGIN_FAILED, 'password');
  }
  const sql = await db();
  const [user] = await sql`
    SELECT id, username, password_hash, (locked_until > now()) AS locked,
           CEIL(EXTRACT(EPOCH FROM (locked_until - now())) / 60)::int AS lock_minutes
    FROM users WHERE username = ${username}`;
  if (!user) {
    await burnTime(password);
    throw new AuthError(401, LOGIN_FAILED, 'password');
  }
  if (user.locked) throw new AuthError(423, lockedMessage(user.lock_minutes), 'password');

  if (await verifyPassword(password, user.password_hash)) {
    await sql`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ${user.id}`;
    return { id: user.id, username: user.username };
  }

  // 실패 횟수를 한 번의 쿼리로 올리고, 5회째면 10분 잠그고 횟수를 0으로 되돌린다
  const [after] = await sql`
    UPDATE users SET
      failed_attempts = CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN 0 ELSE failed_attempts + 1 END,
      locked_until = CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS}
                          THEN now() + make_interval(mins => ${LOCK_MINUTES}) ELSE locked_until END
    WHERE id = ${user.id} AND (locked_until IS NULL OR locked_until <= now())
    RETURNING (locked_until > now()) AS locked,
              CEIL(EXTRACT(EPOCH FROM (locked_until - now())) / 60)::int AS lock_minutes`;
  if (after?.locked) throw new AuthError(423, lockedMessage(after.lock_minutes), 'password');
  throw new AuthError(401, LOGIN_FAILED, 'password');
}

module.exports = {
  COOKIE_NAME,
  AuthError,
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  cookieOptions,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  signup,
  login,
};
