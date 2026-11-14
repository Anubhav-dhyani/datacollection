const express = require('express');
const argon2 = require('argon2');
const { User, Session } = require('../models');
const { id, error, text, plain, audit, wrap } = require('../services/common');
const router = express.Router();
router.use((req, _res, next) => ['MAIN_ADMIN', 'SUB_ADMIN'].includes(req.user.role) ? next() : next(Object.assign(new Error('Team access denied.'), { status: 403 })));

function credentials(body) {
  const email = text(body.email, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Enter a valid email address.');
  const password = text(body.password, 'password', 128);
  if (password.length < 10) error(400, 'Password must be at least 10 characters.');
  return { email, password };
}
router.get('/', wrap(async (req, res) => {
  const filter = req.user.role === 'MAIN_ADMIN' ? { role: { $in: ['SUB_ADMIN', 'EMPLOYEE'] } } : { role: 'EMPLOYEE', reportSubAdminId: req.user.id };
  res.json((await User.find(filter).sort({ name: 1 }).lean()).map(plain));
}));
router.post('/', wrap(async (req, res) => {
  const role = req.body.role;
  if (!['SUB_ADMIN', 'EMPLOYEE'].includes(role) || (role === 'SUB_ADMIN' && req.user.role !== 'MAIN_ADMIN')) error(403, 'Cannot create this role.');
  const name = text(req.body.name, 'name', 120);
  const employeeId = text(req.body.employeeId, 'employeeId', 30).toUpperCase();
  if (!/^[A-Z0-9/_-]{2,30}$/.test(employeeId)) error(400, 'Invalid employee ID.');
  const { email, password } = credentials(req.body);
  let reportSubAdminId = null;
  if (role === 'EMPLOYEE') {
    reportSubAdminId = req.user.role === 'SUB_ADMIN' ? req.user.id : text(req.body.reportSubAdminId, 'sub-admin ID', 100);
    if (!await User.exists({ id: reportSubAdminId, role: 'SUB_ADMIN', status: 'ACTIVE' })) error(400, 'Choose an active sub-admin.');
  }
  const user = await User.create({ id: id(), role, name, email, employeeId, reportSubAdminId,
    passwordHash: await argon2.hash(password), mustChangePassword: true, status: 'ACTIVE' });
  await audit(req.user.id, 'CREATE_USER', 'User', user.id, { role, reportSubAdminId });
  res.status(201).json(plain(user));
}));
router.patch('/:id', wrap(async (req, res) => {
  const user = await User.findOne({ id: req.params.id, role: 'EMPLOYEE' }).select('+passwordHash');
  if (!user || (req.user.role === 'SUB_ADMIN' && user.reportSubAdminId !== req.user.id)) error(404, 'Employee not found.');
  if (req.body.reportSubAdminId !== undefined) {
    if (req.user.role !== 'MAIN_ADMIN') error(403, 'Only the admin can reassign employees.');
    if (!await User.exists({ id: req.body.reportSubAdminId, role: 'SUB_ADMIN', status: 'ACTIVE' })) error(400, 'Choose an active sub-admin.');
    user.reportSubAdminId = req.body.reportSubAdminId;
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
