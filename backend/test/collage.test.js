const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the route without requiring a running database or S3.
function route(reports) {
  const handlers = new Map();
  const router = { get(path, handler) { handlers.set(path, handler); }, post() {} };
  const matches = (report, filter) => Object.entries(filter).every(([key, value]) => key === '$or'
    ? value.some(option => matches(report, option))
    : Array.isArray(report[key]) ? report[key].includes(value) : report[key] === value);
  const models = { DailyReport: { find(filter) {
    let rows = reports.filter(report => matches(report, filter));
    return {
      sort() { rows = rows.sort((a, b) => b.createdAt - a.createdAt); return this; },
      select() { return this; },
      lean: async () => rows,
    };
  } } };
  const common = {
    wrap: handler => handler,
    error(status, message) { throw Object.assign(new Error(message), { status }); },
    text: value => value,
  };
  const imports = {
    express: { Router: () => router }, '../models': models,
    '../services/common': common, '../services/imageStorage': {},
    '../config': { prefix: '/api/v1' }, '../services/assignments': {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/dailyReports.js'), 'utf8');
  vm.runInNewContext(source, { require: name => imports[name], module: { exports: {} }, Map, Intl, Date, Set });
  return async (role, query = { date: '2026-11-19' }, id = 'lead') => {
    let result;
    await handlers.get('/collage')({ user: { role, id }, query }, { json(value) { result = value; } });
    return result;
  };
}

const report = (id, overrides = {}) => ({ id, employeeId: id, employeeName: id, city: 'Jammu', studentsAttended: 50,
  date: '2026-11-19', createdAt: 1, subAdminIds: ['lead'], photos: [{ attachmentId: `photo-${id}` }], ...overrides });

test('collage includes all employees beyond the report table cap, once each', async () => {
  const reports = Array.from({ length: 1002 }, (_, index) => report(`employee-${index}`));
  reports.push(report('new-report', { employeeId: 'employee-0', createdAt: 2, city: 'Bhopal', studentsAttendedNA: true }));
  reports.push(report('other-date', { date: '2026-11-18' }));
  const result = await route(reports)('MAIN_ADMIN');
  assert.equal(result.length, 1002);
  assert.equal(new Set(result.map(item => item.employeeId)).size, 1002);
  const latest = result.find(item => item.employeeId === 'employee-0');
  assert.equal(latest.city, 'Bhopal');
  assert.equal(latest.studentsAttended, 'NA');
  assert.equal(latest.photo.url, '/api/v1/uploads/photo-new-report');
});

test('sub-admin collage includes only their reports, including legacy assignments', async () => {
  const result = await route([report('own'), report('other', { subAdminIds: ['another'] }), report('legacy', { subAdminIds: [], subAdminId: 'lead' })])('SUB_ADMIN');
  assert.deepEqual(Array.from(result, item => item.employeeId).sort(), ['legacy', 'own']);
});

test('employees cannot use an employee filter to see someone else', async () => {
  const result = await route([report('own'), report('other')])('EMPLOYEE', { date: '2026-11-19', employeeId: 'other' }, 'own');
  assert.deepEqual(Array.from(result, item => item.employeeId), ['own']);
});

test('admin employee filter is applied and missing photos remain visible', async () => {
  const result = await route([report('own', { photos: [] }), report('other')])('MAIN_ADMIN', { date: '2026-11-19', employeeId: 'own' });
  assert.equal(result.length, 1);
  assert.equal(result[0].photo, null);
});

test('collages require a valid date', async () => {
  const invoke = route([]);
  await assert.rejects(invoke('MAIN_ADMIN', {}), { status: 400 });
  await assert.rejects(invoke('MAIN_ADMIN', { date: 'bad-date' }), { status: 400 });
});
