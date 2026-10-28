const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET ||= 'test-secret-'.padEnd(64, 'x');
const auth = require('../lib/auth');

test('비밀번호는 scrypt + 랜덤 salt로 해시하고 평문을 담지 않는다', async () => {
  const a = await auth.hashPassword('password123');
  const b = await auth.hashPassword('password123');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.ok(!a.includes('password123'));
  assert.equal(await auth.verifyPassword('password123', a), true);
  assert.equal(await auth.verifyPassword('password124', a), false);
});

test('토큰에 user_id와 만료 시각을 담고 HMAC으로 서명한다', () => {
  const now = Date.now();
  const token = auth.createToken(42, 60_000, now);
  assert.deepEqual(auth.verifyToken(token, now), { id: 42 });
  assert.equal(auth.verifyToken(token, now + 60_001), null); // 만료

  const [v, , exp, sig] = token.split('.');
  assert.equal(auth.verifyToken(`${v}.43.${exp}.${sig}`, now), null); // user_id 위조
  assert.equal(auth.verifyToken(`${v}.42.${Number(exp) + 1e9}.${sig}`, now), null); // 만료 연장 위조
  assert.equal(auth.verifyToken('garbage', now), null);
  assert.equal(auth.verifyToken(undefined, now), null);
});

test('자동 로그인 체크 시 30일 쿠키, 미체크 시 세션 쿠키', () => {
  const req = { headers: {} };
  const remember = auth.cookieOptions(req, true);
  assert.equal(remember.maxAge, 30 * 24 * 60 * 60 * 1000);
  assert.equal(remember.httpOnly, true);
  assert.equal(remember.sameSite, 'lax');
  assert.equal(auth.cookieOptions(req, false).maxAge, undefined);
  assert.equal(auth.cookieOptions({ headers: { 'x-forwarded-proto': 'https' } }).secure, true);
});

test('requireAuth가 req.user를 채우고, 쿠키가 없으면 401', () => {
  const token = auth.createToken(7, 60_000);
  const req = { headers: { cookie: `other=1; ${auth.COOKIE_NAME}=${token}` } };
  let called = false;
  auth.requireAuth(req, {}, () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.user, { id: 7 });

  let status;
  const res = { status(s) { status = s; return this; }, json() {} };
  auth.requireAuth({ headers: {} }, res, () => assert.fail('통과하면 안 됨'));
  assert.equal(status, 401);
});
