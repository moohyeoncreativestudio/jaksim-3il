const test = require('node:test');
const assert = require('node:assert/strict');
const photos = require('../lib/photos');

const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

test('매직 바이트로 형식 판단: jpeg/png/webp만 허용', () => {
  assert.equal(photos.detectImageType(pad([0xff, 0xd8, 0xff, 0xe0])).mime, 'image/jpeg');
  assert.equal(photos.detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime, 'image/png');
  assert.equal(photos.detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')).mime, 'image/webp');
  assert.equal(photos.detectImageType(Buffer.from('GIF89a........')), null);
  assert.equal(photos.detectImageType(Buffer.from('%PDF-1.7 hello world')), null);
  assert.equal(photos.detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  assert.equal(photos.detectImageType(Buffer.from([0xff, 0xd8])), null); // 너무 짧음
  assert.equal(photos.detectImageType({}), null); // JSON 본문 등 Buffer가 아님
});

test('Blob 경로는 추측할 수 없는 난수 (사용자·날짜 정보 없음)', () => {
  const a = photos.randomPath('jpg');
  const b = photos.randomPath('jpg');
  assert.match(a, /^photos\/[0-9a-f]{32}\.jpg$/);
  assert.notEqual(a, b);
});

test('화면용 사진에는 Blob 주소 대신 본인 확인 API 주소와 업로드 시각만', () => {
  const item = photos.toItem({ id: 7, blob_url: 'https://secret.private.blob.vercel-storage.com/x.jpg', created_at: '2026-10-28T09:42:00Z' });
  assert.deepEqual(item, { id: 7, timeLabel: '18:42', imageUrl: '/api/photos/7/image' });
  assert.ok(!JSON.stringify(item).includes('blob.vercel-storage'));
});
