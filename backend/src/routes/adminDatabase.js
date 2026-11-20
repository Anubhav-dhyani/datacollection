const express = require('express');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { User, Session, DailyReport, Attachment } = require('../models');
const { error, text, plain, audit, wrap } = require('../services/common');
const { assignedTo, validateAssignments } = require('../services/assignments');
const imageStorage = require('../services/imageStorage');

const router = express.Router();
router.use((req, _res, next) => req.user.role === 'MAIN_ADMIN' ? next() : next(Object.assign(new Error('Admin access required.'), { status: 403 })));

function validEmail(value) {
  const email = text(value, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Enter a valid email address.');
  return email;
}

function validEmployeeId(value) {
  const employeeId = text(value, 'employee ID', 30).toUpperCase();
  if (!/^[A-Z0-9/_-]{2,30}$/.test(employeeId)) error(400, 'Invalid employee ID.');
  return employeeId;
}

function validReportDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) error(400, 'Choose a valid report date.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) error(400, 'Choose a valid report date.');
  return value;
}

function reportSnapshot(reports) {
  return crypto.createHash('sha256').update(reports.map(report => report.id).sort().join('\n')).digest('hex');
}

router.get('/accounts/:employeeId/reports/by-date', wrap(async (req, res) => {
  const employee = await User.findOne({ id: req.params.employeeId, role: 'EMPLOYEE' }).select('id name').lean();
  if (!employee) error(404, 'Employee not found.');
  const date = validReportDate(req.query.date);
  const reports = await DailyReport.find({ date, employeeId: employee.id }).select('id photos.attachmentId').lean();
  res.json({ date, employeeId: employee.id, employeeName: employee.name, reportCount: reports.length,
    photoCount: reports.reduce((count, report) => count + (report.photos?.length || 0), 0), snapshot: reportSnapshot(reports) });
}));

router.delete('/accounts/:employeeId/reports/by-date', wrap(async (req, res) => {
  const employee = await User.findOne({ id: req.params.employeeId, role: 'EMPLOYEE' }).select('id name').lean();
  if (!employee) error(404, 'Employee not found.');
  const date = validReportDate(req.body.date);
  if (req.body.confirmDate !== date || !Number.isSafeInteger(req.body.expectedCount) || req.body.expectedCount < 1 || !/^[a-f0-9]{64}$/.test(req.body.snapshot || '')) error(400, 'Confirm the date and report count before deleting.');
  const reports = await DailyReport.find({ date, employeeId: employee.id }).select('id photos.attachmentId').lean();
  if (reports.length !== req.body.expectedCount || reportSnapshot(reports) !== req.body.snapshot) error(409, 'The reports changed. Review the selected date again before deleting.');
  const reportIds = reports.map(report => report.id);
  const photoIds = [...new Set(reports.flatMap(report => (report.photos || []).map(photo => photo.attachmentId)))];
  const attachments = await Attachment.find({ $or: [{ reportId: { $in: reportIds } }, { id: { $in: photoIds } }] }).select('id storageKey').lean();
  const removed = await DailyReport.deleteMany({ date, employeeId: employee.id, id: { $in: reportIds } });
  await Attachment.deleteMany({ id: { $in: attachments.map(attachment => attachment.id) } });
  const keys = [...new Set(attachments.map(attachment => attachment.storageKey).filter(Boolean))];
  const failedKeys = [];
  for (let offset = 0; offset < keys.length; offset += 8) {
    const results = await Promise.all(keys.slice(offset, offset + 8).map(async key => ({ key, deleted: await imageStorage.deleteImage(key) })));
    failedKeys.push(...results.filter(result => !result.deleted).map(result => result.key));
  }
  await audit(req.user.id, 'DELETE_EMPLOYEE_REPORTS_BY_DATE', 'DailyReport', employee.id,
    { date, employeeName: employee.name, reportCount: removed.deletedCount, attachmentCount: attachments.length, failedPhotoKeys: failedKeys });
  res.json({ date, employeeId: employee.id, deletedReports: removed.deletedCount, deletedPhotos: attachments.length - failedKeys.length, failedPhotoDeletes: failedKeys.length });
}));

router.get('/accounts', wrap(async (_req, res) => {
  const people = await User.find({ role: { $in: ['MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] } }).sort({ role: 1, name: 1 }).lean();
  res.json(people.map(plain));
}));

router.patch('/accounts/:id', wrap(async (req, res) => {
  const user = await User.findOne({ id: req.params.id, role: { $in: ['MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] } });
  if (!user) error(404, 'Account not found.');
  const allowed = ['name', 'email', 'employeeId', 'reportSubAdminId', 'reportSubAdminIds', 'status'];
  const fields = Object.keys(req.body);
  if (!fields.length || fields.some(field => !allowed.includes(field))) error(400, 'Unsupported account change.');
  if (req.body.name !== undefined) user.name = text(req.body.name, 'name', 120);
  if (req.body.email !== undefined) user.email = validEmail(req.body.email);
  if (req.body.employeeId !== undefined) user.employeeId = validEmployeeId(req.body.employeeId);
  if (req.body.reportSubAdminIds !== undefined || req.body.reportSubAdminId !== undefined) {
    if (user.role !== 'EMPLOYEE') error(400, 'Only employees can be assigned to a sub-admin.');
    const ids = await validateAssignments(req.body.reportSubAdminIds !== undefined ? req.body.reportSubAdminIds : [req.body.reportSubAdminId]);
    user.reportSubAdminIds = ids;
    user.reportSubAdminId = ids[0];
  }
  if (req.body.status !== undefined) {
    if (user.id === req.user.id) error(400, 'You cannot disable your own account.');
    if (!['ACTIVE', 'DISABLED'].includes(req.body.status)) error(400, 'Invalid account status.');
    if (user.role === 'SUB_ADMIN' && req.body.status === 'DISABLED' && await User.exists({ role: 'EMPLOYEE', ...assignedTo(user.id), status: 'ACTIVE' })) error(409, 'Reassign this sub-admin’s active employees first.');
    user.status = req.body.status;
  }
  await user.save();
  if (user.status === 'DISABLED') await Session.deleteMany({ userId: user.id });
  await audit(req.user.id, 'UPDATE_USER', 'User', user.id, { fields });
  res.json(plain(user));
}));

router.post('/accounts/:id/reset-password', wrap(async (req, res) => {
  const user = await User.findOne({ id: req.params.id, role: { $in: ['MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] } }).select('+passwordHash');
  if (!user) error(404, 'Account not found.');
  const password = text(req.body.password, 'password', 128);
  if (password.length < 10) error(400, 'Password must be at least 10 characters.');
  user.passwordHash = await argon2.hash(password);
  user.mustChangePassword = true;
  await user.save();
  await Session.deleteMany({ userId: user.id });
  await audit(req.user.id, 'RESET_USER_PASSWORD', 'User', user.id);
  res.json({ message: 'Password changed. The account must set a new password at next sign-in.' });
}));

router.delete('/accounts/:id', wrap(async (req, res) => {
  const user = await User.findOne({ id: req.params.id, role: { $in: ['MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] } });
  if (!user) error(404, 'Account not found.');
  if (user.role === 'MAIN_ADMIN') error(403, 'The super-admin account cannot be deleted.');
  if (user.role === 'SUB_ADMIN' && await User.exists({ role: 'EMPLOYEE', ...assignedTo(user.id) })) error(409, 'Reassign or delete this sub-admin’s employees first.');
  await Session.deleteMany({ userId: user.id });
  await User.deleteOne({ id: user.id });
  await audit(req.user.id, 'DELETE_USER', 'User', user.id, { role: user.role, email: user.email });
  res.status(204).end();
}));

module.exports = router;
