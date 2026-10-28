const { neon } = require('@neondatabase/serverless');

let sqlClient = null;
let schemaReady = null;

const BODY_PARTS = ['하체', '가슴', '등', '어깨', '팔', '복근'];

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id              SERIAL PRIMARY KEY,
          username        VARCHAR(20) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9]{4,20}$'),
          password_hash   TEXT NOT NULL,
          failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
          locked_until    TIMESTAMPTZ,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      // 운동 부위: 하체, 가슴, 등, 어깨, 팔, 복근 중 쉼표 구분 (예: "하체,등")
      await sql`
        CREATE TABLE IF NOT EXISTS workouts (
          id         SERIAL PRIMARY KEY,
          user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          done_on    DATE NOT NULL,
          type       VARCHAR(10) NOT NULL CHECK (type IN ('cardio', 'strength')),
          activity   VARCHAR(30) CHECK (char_length(btrim(activity)) > 0),
          minutes    INT CHECK (minutes BETWEEN 1 AND 600),
          intensity  SMALLINT CHECK (intensity BETWEEN 1 AND 3),
          sets       INT CHECK (sets BETWEEN 1 AND 100),
          body_parts VARCHAR(50)
                     CHECK (body_parts ~ '^(하체|가슴|등|어깨|팔|복근)(,(하체|가슴|등|어깨|팔|복근))*$'),
          memo       VARCHAR(100),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT workouts_type_fields CHECK (
            (type = 'cardio'
              AND activity IS NOT NULL AND minutes IS NOT NULL AND intensity IS NOT NULL
              AND sets IS NULL AND body_parts IS NULL)
            OR
            (type = 'strength'
              AND sets IS NOT NULL
              AND activity IS NULL AND minutes IS NULL AND intensity IS NULL)
          )
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS photos (
          id         SERIAL PRIMARY KEY,
          user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          done_on    DATE NOT NULL,
          blob_url   TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS workouts_user_done_on_idx ON workouts (user_id, done_on)`;
      await sql`CREATE INDEX IF NOT EXISTS photos_user_done_on_idx ON photos (user_id, done_on)`;
    })().catch((err) => {
      schemaReady = null; // 다음 요청에서 재시도
      throw err;
    });
  }
  return schemaReady;
}

async function db() {
  await ensureSchema();
  return getSql();
}

// 한 사용자의 from~to 기록을 한 번에 조회한다. done_on은 'YYYY-MM-DD' 문자열로 꺼내 score.js에 그대로 넘긴다.
// 점수 계산용이면 from을 score.fetchStart(기간 시작)로 넘겨 연속 보너스용 2일 전 기록까지 받는다.
async function fetchRecords(userId, from, to) {
  const sql = await db();
  const [workouts, photos] = await Promise.all([
    sql`
      SELECT id, done_on::text AS done_on, type, activity, minutes, intensity, sets, body_parts, memo, created_at
      FROM workouts
      WHERE user_id = ${userId} AND done_on BETWEEN ${from}::date AND ${to}::date
      ORDER BY done_on, created_at, id`,
    sql`
      SELECT id, done_on::text AS done_on, blob_url, created_at
      FROM photos
      WHERE user_id = ${userId} AND done_on BETWEEN ${from}::date AND ${to}::date
      ORDER BY done_on, created_at, id`,
  ]);
  return { workouts, photos };
}

module.exports = { db, ensureSchema, fetchRecords, BODY_PARTS };
