const crypto = require('node:crypto');
const ExifReader = require('exifreader');
const { error } = require('./common');

const EDITORS = /\b(?:photoshop|lightroom|gimp|snapseed|picsart|canva|affinity photo|pixelmator)\b/i;
const DATE = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

function formatFromBytes(buffer) {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'JPEG';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'PNG';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'WEBP';
  return null;
}

function safeText(value, max = 160) {
  return typeof value === 'string' && value.length <= max ? value.trim() : null;
}

function dateInfo(raw, offset) {
  if (!raw) return { captureDate: null, captureUtc: null, timezoneStatus: 'missing' };
  const match = DATE.exec(raw);
  if (!match) return { captureDate: raw, captureUtc: null, timezoneStatus: 'invalid' };
  const [, year, month, day, hour, minute, second, embedded] = match;
  const normalized = `${year}-${month}-${day} ${hour}:${minute}:${second}${embedded || ''}`;
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day) || check.getUTCHours() !== Number(hour) || check.getUTCMinutes() !== Number(minute) || check.getUTCSeconds() !== Number(second)) return { captureDate: raw, captureUtc: null, timezoneStatus: 'invalid' };
  const value = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const zone = embedded || offset;
  if (embedded && offset && embedded !== offset) return { captureDate: normalized, captureUtc: null, timezoneStatus: 'conflicting' };
  if (!zone) return { captureDate: normalized, captureUtc: null, timezoneStatus: 'unknown' };
  if (zone !== 'Z' && (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(zone) || zone.slice(1, 3) === '14' && zone.slice(4) !== '00')) return { captureDate: normalized, captureUtc: null, timezoneStatus: 'invalid' };
  const parsed = new Date(`${value}${zone}`);
  if (Number.isNaN(parsed.getTime())) return { captureDate: normalized, captureUtc: null, timezoneStatus: 'invalid' };
  return { captureDate: normalized, captureUtc: parsed.toISOString(), timezoneStatus: 'embedded' };
}

function fromTags(tags, buffer, uploadedAt = new Date()) {
  const exifDate = safeText(tags['ExifIFD:DateTimeOriginal'] || tags['EXIF:DateTimeOriginal'], 80);
  const xmpDate = safeText(tags['XMP-exif:DateTimeOriginal'], 80);
  const captureSource = exifDate ? 'EXIF DateTimeOriginal' : xmpDate ? 'XMP DateTimeOriginal' : null;
  const raw = exifDate || xmpDate;
  const offset = exifDate ? safeText(tags['ExifIFD:OffsetTimeOriginal'], 16) : null;
  const capture = dateInfo(raw, offset);
  const software = safeText(tags['IFD0:Software'] || tags['XMP-xmp:CreatorTool'] || tags['PNG:Software'], 160);
  const indicators = [];
  if (software && EDITORS.test(software)) indicators.push('Editing software appears in metadata');
  if (tags['XMP-xmpMM:HistoryAction'] || tags['XMP-xmpMM:HistoryWhen']) indicators.push('XMP edit history appears in metadata');
  if (capture.timezoneStatus === 'conflicting') indicators.push('Capture timezone fields conflict');
  if (capture.timezoneStatus === 'invalid') indicators.push('Capture date or timezone is invalid');
  const status = indicators.length ? 'possible_edit' : capture.captureDate ? 'capture_present' : 'capture_missing';
  return {
    ...capture, captureSource, status, indicators,
    cameraMake: safeText(tags['IFD0:Make'] || tags['XMP-tiff:Make']),
    cameraModel: safeText(tags['IFD0:Model'] || tags['XMP-tiff:Model']),
    software, uploadedAt, sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

async function inspect(buffer, mimeType) {
  const format = formatFromBytes(buffer);
  const expected = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP' }[mimeType];
  if (!format || format !== expected) error(400, 'The photo content does not match its image type.');
  try {
    const groups = await ExifReader.load(buffer, { expanded: true, async: true });
    const tag = (group, name) => {
      const value = groups[group]?.[name]?.description;
      return typeof value === 'string' ? value : null;
    };
    if (tag('file', 'FileType') !== format) error(400, 'The photo is not a valid supported image.');
    return fromTags({
      'ExifIFD:DateTimeOriginal': tag('exif', 'DateTimeOriginal'),
      'ExifIFD:OffsetTimeOriginal': tag('exif', 'OffsetTimeOriginal'),
      'XMP-exif:DateTimeOriginal': tag('xmp', 'DateTimeOriginal'),
      'IFD0:Make': tag('exif', 'Make'),
      'IFD0:Model': tag('exif', 'Model'),
      'IFD0:Software': tag('exif', 'Software'),
      'XMP-xmp:CreatorTool': tag('xmp', 'CreatorTool'),
      'XMP-xmpMM:HistoryAction': tag('xmp', 'HistoryAction'),
      'XMP-xmpMM:HistoryWhen': tag('xmp', 'HistoryWhen'),
      'XMP-tiff:Make': tag('xmp', 'Make'),
      'XMP-tiff:Model': tag('xmp', 'Model'),
      'PNG:Software': tag('pngText', 'Software') || tag('png', 'Software'),
    }, buffer);
  } catch (cause) {
    if (cause.status) throw cause;
    console.error('Photo metadata inspection failed:', cause.message);
    error(400, 'Could not read the photo. Use a valid JPG, PNG, or WebP image.');
  }
}

let activeInspections = 0;
const waiting = [];
async function inspectQueued(buffer, mimeType) {
  if (activeInspections >= 4) await new Promise(resolve => waiting.push(resolve));
  else activeInspections++;
  try { return await inspect(buffer, mimeType); }
  finally {
    const next = waiting.shift();
    if (next) next();
    else activeInspections--;
  }
}

module.exports = { inspect: inspectQueued, fromTags, dateInfo, formatFromBytes };
