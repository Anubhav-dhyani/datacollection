const express = require('express');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const config = require('../config');
const { User, Session, AuthLimit } = require('../models');
const { error, text, plain, audit, wrap } = require('../services/common');
const { requireAuth, hashToken } = require('../middleware/auth');
const router = express.Router();
const MINUTE = 60000;

async function limit(key, maximum, period) {
  const now = new Date();
  const record = await AuthLimit.findOne({ key });
  if (!record) {
    try { await AuthLimit.create({ key, count: 1, resetsAt: new Date(now.getTime() + period) }); return; }
    catch (cause) { if (cause.code !== 11000) throw cause; }
  } else if (record.resetsAt <= now) {
    await AuthLimit.updateOne({ key }, { $set: { count: 0, resetsAt: new Date(now.getTime() + period) } });
  }
  if (!await AuthLimit.findOneAndUpdate({ key, count: { $lt: maximum } }, { $inc: { count: 1 } })) error(429, 'Too many attempts. Try again later.');
}

async function checkLimit(key, maximum) {
  const record = await AuthLimit.findOne({ key }).lean();
  if (record && record.resetsAt > new Date() && record.count >= maximum) error(429, 'Too many attempts. Try again later.');
}

async function beginSession(user, res, method) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionHours * 3600000);
  await Session.create({ tokenHash: hashToken(token), userId: user.id, method, expiresAt });
  await User.updateOne({ id: user.id }, { $set: { lastLoginAt: new Date() } });
  await audit(user.id, 'LOGIN', 'User', user.id, { method });
  res.cookie(config.cookieName, token, { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/', expires: expiresAt });
  res.json({ user: { ...plain(user), passwordChangeRequired: !!user.mustChangePassword && method === 'PASSWORD' } });
}

router.post('/login', wrap(async (req, res) => {
  const identifier = text(req.body.identifier, 'identifier', 254).toLowerCase();
  const password = text(req.body.password, 'password', 128);
  await checkLimit(`password-ip:${req.ip}`, 50);
  await checkLimit(`password:${req.ip}:${identifier}`, 10);
  const user = await User.findOne({ email: identifier }).select('+passwordHash');
  if (!user || user.status !== 'ACTIVE' || !['MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'].includes(user.role) || !user.passwordHash || !await argon2.verify(user.passwordHash, password)) {
    await limit(`password-ip:${req.ip}`, 50, 15 * MINUTE);
    await limit(`password:${req.ip}:${identifier}`, 10, 15 * MINUTE);
    error(401, 'Those credentials did not match an active account.');
  }
  if (!user.lastLoginAt && !user.mustChangePassword) { user.mustChangePassword = true; await user.save(); }
  await beginSession(user, res, 'PASSWORD');
}));

router.use(requireAuth);
router.get('/me', (req, res) => res.json({ user: { ...req.user, passwordChangeRequired: !!req.user.mustChangePassword && req.session.method === 'PASSWORD' } }));
router.post('/logout', wrap(async (req, res) => {
  await Session.deleteOne({ tokenHash: req.session.tokenHash });
  res.clearCookie(config.cookieName, { path: '/' }).status(204).end();
}));
router.post('/change-password', wrap(async (req, res) => {
  const user = await User.findOne({ id: req.user.id }).select('+passwordHash');
  if (!user?.passwordHash || !await argon2.verify(user.passwordHash, req.body.currentPassword || '')) error(400, 'Current password is incorrect.');
  const password = text(req.body.newPassword, 'newPassword', 128);
  if (password.length < 10) error(400, 'Password must be at least 10 characters.');
  if (await argon2.verify(user.passwordHash, password)) error(400, 'Choose a different password.');
  user.passwordHash = await argon2.hash(password);
  user.mustChangePassword = false;
  await user.save();
  await Session.deleteMany({ userId: user.id, tokenHash: { $ne: req.session.tokenHash } });
  await audit(user.id, 'CHANGE_PASSWORD', 'User', user.id);
  res.json({ user: { ...plain(user), passwordChangeRequired: false } });
}));
module.exports = router;
