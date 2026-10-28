// 사용법: npm run clear-demo -- <아이디>
// seed-demo로 넣은 예시 기록만 지운다. 직접 입력한 기록(예시 표시가 없는 행)은 남긴다.
const { db } = require('../lib/db');
const { DEMO_MEMO, DEMO_PHOTO_PREFIX } = require('./demo-data');

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('사용법: npm run clear-demo -- <아이디>');
  const sql = await db();
  const [user] = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (!user) throw new Error(`"${username}" 계정을 찾을 수 없어요.`);
  const w = await sql`DELETE FROM workouts WHERE user_id = ${user.id} AND memo = ${DEMO_MEMO} RETURNING id`;
  const p = await sql`DELETE FROM photos WHERE user_id = ${user.id} AND blob_url LIKE ${DEMO_PHOTO_PREFIX + '%'} RETURNING id`;
  console.log(`${username}: 예시 운동 ${w.length}건, 사진 ${p.length}건을 지웠어요. 직접 입력한 기록은 그대로예요.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
