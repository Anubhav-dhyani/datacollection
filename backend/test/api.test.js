const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const request = require('supertest');
const mongoose = require('mongoose');
const { Readable } = require('node:stream');

const binary = process.env.MONGOD_BINARY || path.join(os.homedir(), '.cache/mongodb-binaries/mongod-arm64-darwin-7.0.14');
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitMongo(uri) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 300 }); return; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Local MongoDB did not start.');
}

test('email login, reporting roles, photos, filters, and removed ticket routes', { skip: !process.env.MONGODB_TEST_URI && !fs.existsSync(binary) }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'geu-report-test-'));
  let processMongo;
  try {
    const uri = process.env.MONGODB_TEST_URI || `mongodb://127.0.0.1:${await freePort()}`;
    if (!process.env.MONGODB_TEST_URI) {
      processMongo = spawn(binary, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', new URL(uri.replace('mongodb://', 'http://')).port, '--quiet'], { stdio: 'ignore' });
      await waitMongo(uri);
      await mongoose.disconnect();
    }
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB_NAME = `geu_report_test_${Date.now()}`;
    process.env.SEED_ADMIN_EMAIL = 'admin@example.com';
    process.env.SEED_ADMIN_PASSWORD = 'TestingPass123';
    process.env.S3_BUCKET = 'test-report-photos';
    process.env.AWS_REGION = 'ap-south-1';
    const objects = new Map();
    const imageStorage = require('../src/services/imageStorage');
    imageStorage.putImage = async (key, _mimeType, buffer) => { objects.set(key, { data: Buffer.from(buffer), state: 'pending' }); };
    imageStorage.getImageStream = async key => Readable.from([objects.get(key).data]);
    imageStorage.deleteImage = async key => { objects.delete(key); };
    imageStorage.setImageState = async (key, state) => { const object = objects.get(key); if (!object) throw new Error('Image missing'); object.state = state; };
    const { start } = require('../src/server');
    const app = await start();
    const root = '/api/v1';
    const admin = request.agent(app), manager = request.agent(app), other = request.agent(app), employee = request.agent(app);
    assert.equal((await request(app).get(`${root}/daily-reports`)).status, 401);
    assert.equal((await admin.post(`${root}/auth/login`).send({ identifier: 'admin@example.com', password: 'TestingPass123' })).body.user.passwordChangeRequired, true);
    assert.equal((await admin.get(`${root}/report-team`)).status, 403);
    assert.equal((await admin.post(`${root}/auth/change-password`).send({ currentPassword: 'TestingPass123', newPassword: 'AdminChanged123' })).status, 200);
    assert.equal((await admin.get(`${root}/tickets`)).status, 404);
    assert.equal((await admin.get(`${root}/admin/users`)).status, 404);
    assert.equal((await admin.post(`${root}/auth/otp/request`).send({ phone: '+919000000000' })).status, 404);

    const createManager = (name, email, employeeId) => admin.post(`${root}/report-team`).send({ role: 'SUB_ADMIN', name, email, employeeId, password: 'ManagerPass123' });
    const managerUser = await createManager('Team Lead', 'lead@example.com', 'GEU-S-101');
    const otherUser = await createManager('Other Lead', 'other@example.com', 'GEU-S-102');
    assert.equal(managerUser.status, 201, JSON.stringify(managerUser.body));
    assert.equal(otherUser.status, 201, JSON.stringify(otherUser.body));
    const employeeUser = await admin.post(`${root}/report-team`).send({ role: 'EMPLOYEE', name: 'Field Employee', email: 'employee@example.com', employeeId: 'GEU-E-101', password: 'EmployeePass123', reportSubAdminId: managerUser.body.id });
    assert.equal(employeeUser.status, 201, JSON.stringify(employeeUser.body));
    assert.equal(employeeUser.body.reportSubAdminId, managerUser.body.id);

    assert.equal((await manager.post(`${root}/auth/login`).send({ identifier: 'lead@example.com', password: 'ManagerPass123' })).status, 200);
    assert.equal((await manager.post(`${root}/auth/change-password`).send({ currentPassword: 'ManagerPass123', newPassword: 'ManagerChanged123' })).status, 200);
    assert.equal((await other.post(`${root}/auth/login`).send({ identifier: 'other@example.com', password: 'ManagerPass123' })).status, 200);
    assert.equal((await other.post(`${root}/auth/change-password`).send({ currentPassword: 'ManagerPass123', newPassword: 'OtherChanged123' })).status, 200);
    const secondEmployee = await manager.post(`${root}/report-team`).send({ role: 'EMPLOYEE', name: 'Second Employee', email: 'second@example.com', employeeId: 'GEU-E-102', password: 'SecondPass123' });
    assert.equal(secondEmployee.status, 201, JSON.stringify(secondEmployee.body));
    assert.equal(secondEmployee.body.reportSubAdminId, managerUser.body.id);
    assert.equal((await manager.post(`${root}/report-team`).send({ role: 'SUB_ADMIN' })).status, 403);
    assert.equal((await other.get(`${root}/report-team`)).body.length, 0);

    assert.equal((await employee.post(`${root}/auth/login`).send({ identifier: 'employee@example.com', password: 'EmployeePass123' })).status, 200);
    assert.equal((await employee.post(`${root}/auth/change-password`).send({ currentPassword: 'EmployeePass123', newPassword: 'EmployeeChanged123' })).status, 200);
    assert.equal((await employee.get(`${root}/report-team`)).status, 403);
    const image = await employee.post(`${root}/uploads/report-photo`).set('Content-Type', 'image/png').send(Buffer.from('image-bytes'));
    assert.equal(image.status, 201, JSON.stringify(image.body));
    const { Attachment } = require('../src/models');
    const stored = await Attachment.findOne({ id: image.body.attachmentId }).lean();
    assert.equal(stored.data, undefined);
    assert.equal(stored.storageKey, `attachments/${image.body.attachmentId}`);
    assert.equal(objects.get(stored.storageKey).state, 'pending');
    assert.equal((await employee.post(`${root}/uploads/report-file`).set('Content-Type', 'application/octet-stream').send(Buffer.from('file'))).status, 404);
    const report = await employee.post(`${root}/daily-reports`).send({ eventDetail: 'Visited the event venue', city: 'Dehradun', eventRemarks: 'Well attended', additionalRemarks: 'Follow up tomorrow', photos: [{ attachmentId: image.body.attachmentId }] });
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.equal(report.body.employeeName, 'Field Employee');
    assert.equal(report.body.subAdminId, managerUser.body.id);
    assert.equal(objects.get(stored.storageKey).state, 'attached');
    assert.equal('data' in report.body, false);
    assert.equal('dataSections' in report.body, false);
    assert.deepEqual(report.body.photos, [{ attachmentId: image.body.attachmentId, url: `${root}/uploads/${image.body.attachmentId}` }]);
    assert.match(report.body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await employee.get(report.body.photos[0].url)).status, 200);
    assert.equal((await manager.get(report.body.photos[0].url)).status, 200);
    assert.equal((await admin.get(report.body.photos[0].url)).status, 200);
    assert.equal((await other.get(report.body.photos[0].url)).status, 404);
    assert.equal((await other.get(`${root}/daily-reports/${report.body.id}`)).status, 404);
    assert.equal((await manager.get(`${root}/daily-reports`)).body.length, 1);
    assert.equal((await employee.get(`${root}/daily-reports`)).body.length, 1);
    assert.equal((await other.get(`${root}/daily-reports`)).body.length, 0);
    assert.equal((await admin.get(`${root}/daily-reports?date=${report.body.date}&employeeId=${employeeUser.body.id}`)).body.length, 1);
    assert.equal((await manager.get(`${root}/daily-reports/summary`)).body.employees.filter(person => person.submitted).length, 1);
    assert.equal((await manager.get(`${root}/daily-reports/summary`)).body.employees.filter(person => !person.submitted).length, 1);
    const { DailyReport } = require('../src/models');
    await DailyReport.collection.updateOne({ id: report.body.id }, { $set: { 'photos.0.latitude': 30.3165, 'photos.0.longitude': 78.0322 } });
    assert.equal('latitude' in (await admin.get(`${root}/daily-reports/${report.body.id}`)).body.photos[0], false);
    const csv = (await admin.get(`${root}/daily-reports/export.csv`)).text;
    assert.match(csv, /Event Remarks/);
    assert.match(csv, /Event pictures/);
    assert.match(csv, new RegExp(image.body.attachmentId));
    assert.doesNotMatch(csv, /30\.3165|78\.0322/);
    assert.doesNotMatch(csv, /Data Files/);
    assert.equal((await employee.post(`${root}/daily-reports`).send({ eventDetail: 'Old field', city: 'Dehradun', data: '42 attendees', photos: [] })).status, 400);
    assert.equal((await employee.post(`${root}/daily-reports`).send({ eventDetail: 'Old section', city: 'Dehradun', dataSections: [], photos: [] })).status, 400);
    const accounts = await admin.get(`${root}/admin/database/accounts`);
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.length, 5);
    assert.equal(accounts.body.filter(person => person.role === 'MAIN_ADMIN').length, 1);
    assert.equal(accounts.body.some(person => person.passwordHash), false);
    assert.equal((await manager.get(`${root}/admin/database/accounts`)).status, 403);
    assert.equal((await employee.get(`${root}/admin/database/accounts`)).status, 403);
    assert.equal((await admin.delete(`${root}/admin/database/accounts/${accounts.body.find(person => person.role === 'MAIN_ADMIN').id}`)).status, 403);
    assert.equal((await admin.delete(`${root}/admin/database/accounts/${managerUser.body.id}`)).status, 409);
    const edited = await admin.patch(`${root}/admin/database/accounts/${employeeUser.body.id}`).send({ name: 'Updated Employee', email: 'updated@example.com', employeeId: 'GEU-E-201' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.email, 'updated@example.com');
    assert.equal((await admin.patch(`${root}/admin/database/accounts/${employeeUser.body.id}`).send({ role: 'MAIN_ADMIN' })).status, 400);
    const reset = await admin.post(`${root}/admin/database/accounts/${employeeUser.body.id}/reset-password`).send({ password: 'NewTemporary123' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal((await employee.get(`${root}/daily-reports`)).status, 401);
    assert.equal((await employee.post(`${root}/auth/login`).send({ identifier: 'updated@example.com', password: 'NewTemporary123' })).body.user.passwordChangeRequired, true);
    assert.equal((await admin.delete(`${root}/admin/database/accounts/${secondEmployee.body.id}`)).status, 204);
    assert.equal((await manager.get(`${root}/report-team`)).body.length, 1);
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (processMongo && processMongo.exitCode === null) { processMongo.kill(); await new Promise(resolve => processMongo.once('exit', resolve)); }
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
