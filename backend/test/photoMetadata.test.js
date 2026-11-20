const test = require('node:test');
const assert = require('node:assert/strict');
const { fromTags, dateInfo, formatFromBytes, inspect } = require('../src/services/photoMetadata');

test('capture date keeps its embedded timezone and upload time separate', () => {
  const result = fromTags({ 'ExifIFD:DateTimeOriginal': '2024:07:08 12:34:56', 'ExifIFD:OffsetTimeOriginal': '+05:30', 'IFD0:Make': 'Example' }, Buffer.from('test'), new Date('2026-11-19T12:00:00Z'));
  assert.equal(result.captureDate, '2024-07-08 12:34:56');
  assert.equal(result.captureUtc, '2024-07-08T07:04:56.000Z');
  assert.equal(result.uploadedAt.toISOString(), '2026-11-19T12:00:00.000Z');
  assert.equal(result.status, 'capture_present');
  assert.equal(result.sha256.length, 64);
});

test('missing capture metadata does not become an upload or modified date', () => {
  const result = fromTags({ 'IFD0:ModifyDate': '2024:07:09 11:00:00' }, Buffer.from('test'));
  assert.equal(result.captureDate, null);
  assert.equal(result.status, 'capture_missing');
  assert.equal(result.captureUtc, null);
});

test('editing software is an indicator, not a definitive tampering result', () => {
  const result = fromTags({ 'ExifIFD:DateTimeOriginal': '2024:07:08 12:34:56', 'IFD0:Software': 'Adobe Photoshop' }, Buffer.from('test'));
  assert.equal(result.status, 'possible_edit');
  assert.equal(result.indicators.length, 1);
  assert.equal(result.timezoneStatus, 'unknown');
});

test('invalid and conflicting capture dates do not get converted to UTC', () => {
  assert.equal(dateInfo('2024:02:31 12:34:56', '+05:30').timezoneStatus, 'invalid');
  assert.equal(dateInfo('2024:07:08 12:34:56+05:30', '+04:00').timezoneStatus, 'conflicting');
  assert.equal(dateInfo('2024:07:08 12:34:56', '+14:30').timezoneStatus, 'invalid');
  const inconsistent = fromTags({ 'ExifIFD:DateTimeOriginal': '2024:02:31 12:34:56' }, Buffer.from('test'));
  assert.equal(inconsistent.status, 'possible_edit');
  assert.equal(inconsistent.captureUtc, null);
});

test('image type is determined from bytes', () => {
  assert.equal(formatFromBytes(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), 'JPEG');
  assert.equal(formatFromBytes(Buffer.from('not an image')), null);
});

function jpegWithCaptureDate() {
  const tiff = Buffer.alloc(83);
  tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x8769, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(2, 26);
  tiff.writeUInt16LE(0x9003, 28); tiff.writeUInt16LE(2, 30); tiff.writeUInt32LE(20, 32); tiff.writeUInt32LE(56, 36);
  tiff.writeUInt16LE(0x9011, 40); tiff.writeUInt16LE(2, 42); tiff.writeUInt32LE(7, 44); tiff.writeUInt32LE(76, 48);
  tiff.write('2024:07:08 12:34:56\0', 56, 'ascii'); tiff.write('+05:30\0', 76, 'ascii');
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const header = Buffer.alloc(4); header.writeUInt16BE(0xffe1, 0); header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), header, payload, Buffer.from([0xff, 0xd9])]);
}

test('Node upload inspector reads capture metadata from original image bytes', async () => {
  const result = await inspect(jpegWithCaptureDate(), 'image/jpeg');
  assert.equal(result.captureUtc, '2024-07-08T07:04:56.000Z');
  assert.equal(result.status, 'capture_present');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ErcAAAAASUVORK5CYII=', 'base64');
  assert.equal((await inspect(png, 'image/png')).status, 'capture_missing');
  await assert.rejects(() => inspect(Buffer.from('not an image'), 'image/jpeg'), { status: 400 });
});
