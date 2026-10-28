// 로컬 개발 서버: 정적 파일(public) + API
const path = require('path');
const express = require('express');
const app = require('./lib/app');

const server = express();
server.use(express.static(path.join(__dirname, 'public')));
server.use(app);

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`작심삼일 서버 실행 중: http://localhost:${port}`);
  if (!process.env.DATABASE_URL) console.warn('⚠ DATABASE_URL이 설정되지 않았습니다 (.env 확인)');
  if (!process.env.SESSION_SECRET) console.warn('⚠ SESSION_SECRET이 설정되지 않았습니다 (.env 확인)');
});
