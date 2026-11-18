const express = require('express');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { User, Session } = require('../models');
const { id, error, text, plain, audit, wrap } = require('../services/common');
const { parseCsv } = require('../services/csv');
const { assignedIds, assignedTo, validateAssignments } = require('../services/assignments');
const router = express.Router();
router.use((req, _res, next) => ['MAIN_ADMIN', 'SUB_ADMIN'].includes(req.user.role) ? next() : next(Object.assign(new Error('Team access denied.'), { status: 403 })));

function validEmail(value) {
  const email = text(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Enter a valid email address.');
  return email;
}
function credentials(body) {
  const email = validEmail(body.email);
  const password = text(body.password, 'password', 128);
  if (password.length < 10) error(400, 'Password must be at least 10 characters.');
  return { email, password };
}
function generatedEmployeeId(role) {
  return `GEU-${role === 'SUB_ADMIN' ? 'S' : 'E'}-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}
async function createAccount(actor, body) {
  const role = body.role;
  if (!['SUB_ADMIN', 'EMPLOYEE'].includes(role) || (role === 'SUB_ADMIN' && actor.role !== 'MAIN_ADMIN')) error(403, 'Cannot create this role.');
  const name = text(body.name, 'name', 120);
  const { email, password } = credentials(body);
  let reportSubAdminIds = [];
  if (role === 'EMPLOYEE') {
    reportSubAdminIds = await validateAssignments(actor.role === 'SUB_ADMIN' ? [actor.id] : body.reportSubAdminIds !== undefined ? body.reportSubAdminIds : body.reportSubAdminId ? [body.reportSubAdminId] : []);
  }
  const user = await User.create({ id: id(), role, name, email, employeeId: generatedEmployeeId(role), reportSubAdminId: reportSubAdminIds[0] || null, reportSubAdminIds,
    passwordHash: await argon2.hash(password), mustChangePassword: true, status: 'ACTIVE' });
  await audit(actor.id, 'CREATE_USER', 'User', user.id, { role, reportSubAdminIds });
  return user;
}
router.get('/', wrap(async (req, res) => {
  const filter = req.user.role === 'MAIN_ADMIN' ? { role: { $in: ['SUB_ADMIN', 'EMPLOYEE'] } } : { role: 'EMPLOYEE', ...assignedTo(req.user.id) };
  res.json((await User.find(filter).sort({ name: 1 }).lean()).map(plain));
}));
router.post('/', wrap(async (req, res) => {
  const user = await createAccount(req.user, req.body);
  res.status(201).json(plain(user));
}));
router.get('/template.csv', (req, res) => {
  const admin = req.user.role === 'MAIN_ADMIN';
  const type = admin ? req.query.type || 'combined' : 'employee';
  if (!['employee', 'sub-admin', 'combined'].includes(type) || (!admin && req.query.type && req.query.type !== 'employee')) error(400, 'Invalid CSV template type.');
  const header = type === 'combined' ? 'role,name,email,sub_admin_emails,initial_password'
    : type === 'sub-admin' || !admin ? 'name,email,initial_password' : 'name,email,sub_admin_emails,initial_password';
  const filename = admin ? `${type}-team-template.csv` : 'employee-team-template.csv';
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + header + '\r\n');
});
router.post('/import.csv', express.text({ type: 'text/csv', limit: '1mb' }), wrap(async (req, res) => {
  const rows = parseCsv(req.body);
  const admin = req.user.role === 'MAIN_ADMIN';
  const formats = admin ? [
    { type: 'combined', columns: ['role', 'name', 'email', 'sub_admin_emails', 'initial_password'] },
    { type: 'employee', columns: ['name', 'email', 'sub_admin_emails', 'initial_password'] },
    { type: 'combined', columns: ['role', 'name', 'email', 'sub_admin_email', 'initial_password'] },
    { type: 'employee', columns: ['name', 'email', 'sub_admin_email', 'initial_password'] },
    { type: 'sub-admin', columns: ['name', 'email', 'initial_password'] },
  ] : [{ type: 'employee', columns: ['name', 'email', 'initial_password'] }];
  const header = rows[0]?.fields.map(value => value.trim().toLowerCase()).join(',');
  const format = formats.find(candidate => candidate.columns.join(',') === header);
  if (!format) error(400, 'CSV columns do not match a team template. Download the correct template and include initial_password.');
  const column = name => format.columns.indexOf(name);
  const records = rows.slice(1);
  if (!records.length) error(400, 'Add at least one account row to the CSV.');
  if (records.length > 100) error(400, 'Import at most 100 accounts per CSV.');
  const firstEmailRow = new Map();
  for (const record of records) {
    const email = (record.fields[column('email')] || '').trim().toLowerCase();
    if (email && !firstEmailRow.has(email)) firstEmailRow.set(email, record.line);
  }
  const managers = admin ? await User.find({ role: 'SUB_ADMIN', status: 'ACTIVE' }).select('id email').lean() : [];
  const managerByEmail = new Map(managers.map(manager => [manager.email, manager.id]));
  const roleFor = record => format.type === 'combined' ? (record.fields[column('role')] || '').trim().toUpperCase().replace(/[\s-]/g, '_') : format.type === 'sub-admin' ? 'SUB_ADMIN' : 'EMPLOYEE';
  const ordered = format.type === 'combined' ? [...records].sort((left, right) => Number(roleFor(right) === 'SUB_ADMIN') - Number(roleFor(left) === 'SUB_ADMIN')) : records;
  const results = new Map();
  for (const record of ordered) {
    const email = (record.fields[column('email')] || '').trim().toLowerCase();
    try {
      if (record.fields.length !== format.columns.length) error(400, `Expected ${format.columns.length} columns.`);
      if (email && firstEmailRow.get(email) !== record.line) error(400, 'Duplicate email in this CSV.');
      const role = roleFor(record);
      if (!['SUB_ADMIN', 'EMPLOYEE'].includes(role)) error(400, 'Role must be SUB_ADMIN or EMPLOYEE.');
      const name = record.fields[column('name')];
      const valid = validEmail(email);
      if (await User.exists({ email: valid })) error(409, 'An account with this email already exists.');
      let reportSubAdminIds;
      if (admin && role === 'EMPLOYEE') {
        const emails = String(record.fields[column(format.columns.includes('sub_admin_emails') ? 'sub_admin_emails' : 'sub_admin_email')] || '').split(';').map(value => validEmail(value));
        reportSubAdminIds = emails.map(value => managerByEmail.get(value));
        if (reportSubAdminIds.some(value => !value)) error(400, 'Every sub-admin email must match an active sub-admin or a successful SUB_ADMIN row in this CSV.');
      }
      const password = record.fields[column('initial_password')];
      const user = await createAccount(req.user, { role, name, email: valid, password, reportSubAdminIds });
      if (role === 'SUB_ADMIN') managerByEmail.set(user.email, user.id);
      results.set(record.line, { row: record.line, status: 'created', role, name: user.name, email: user.email, employeeId: user.employeeId });
    } catch (cause) {
      if (!cause.status && cause.code !== 11000) console.error('CSV account import failed:', cause);
      results.set(record.line, { row: record.line, status: 'error', email, message: cause.code === 11000 ? 'An account with this email already exists.' : cause.status ? cause.message : 'Could not create account.' });
    }
  }
  const orderedResults = records.map(record => results.get(record.line));
  res.set('Cache-Control', 'no-store').json({ created: orderedResults.filter(row => row.status === 'created').length,
    failed: orderedResults.filter(row => row.status === 'error').length, rows: orderedResults });
}));
router.patch('/:id', wrap(async (req, res) => {
  const user = await User.findOne({ id: req.params.id, role: 'EMPLOYEE' }).select('+passwordHash');
  if (!user || (req.user.role === 'SUB_ADMIN' && !assignedIds(user).includes(req.user.id))) error(404, 'Employee not found.');
  if (req.body.reportSubAdminIds !== undefined || req.body.reportSubAdminId !== undefined) {
    if (req.user.role !== 'MAIN_ADMIN') error(403, 'Only the admin can reassign employees.');
    const ids = await validateAssignments(req.body.reportSubAdminIds !== undefined ? req.body.reportSubAdminIds : [req.body.reportSubAdminId]);
    user.reportSubAdminIds = ids; user.reportSubAdminId = ids[0];
  }
  if (req.body.status !== undefined) {
    if (req.user.role !== 'MAIN_ADMIN' || !['ACTIVE', 'DISABLED'].includes(req.body.status)) error(403, 'Only the admin can change status.');
    user.status = req.body.status;
    if (user.status === 'DISABLED') await Session.deleteMany({ userId: user.id });
  }
  if (req.body.password !== undefined) {
    const password = text(req.body.password, 'password', 128);
    if (password.length < 10) error(400, 'Password must be at least 10 characters.');
    user.passwordHash = await argon2.hash(password); user.mustChangePassword = true;
    await Session.deleteMany({ userId: user.id });
  }
  await user.save();
  await audit(req.user.id, 'UPDATE_USER', 'User', user.id, { fields: Object.keys(req.body).filter(key => key !== 'password') });
  res.json(plain(user));
}));
module.exports = router;
