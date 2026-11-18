const express = require('express');
const argon2 = require('argon2');
const { User, Session } = require('../models');
const { error, text, plain, audit, wrap } = require('../services/common');
const { assignedTo, validateAssignments } = require('../services/assignments');

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
