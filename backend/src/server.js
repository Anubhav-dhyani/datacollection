const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const argon2 = require('argon2');
const config = require('./config');
const { User } = require('./models');
const { requireAuth } = require('./middleware/auth');

function createApp() {
  const app = express();
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, callback) { callback(null, !origin || config.frontendOrigins.includes(origin)); }, credentials: true }));
  app.use(express.json({ limit: '7mb' }));
  app.use(cookieParser());
  app.get(`${config.prefix}/health`, (_req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'database unavailable' }));
  app.use(`${config.prefix}/auth`, require('./routes/auth'));
  const api = express.Router();
  api.use(requireAuth);
  api.use((req, _res, next) => req.user.mustChangePassword && req.session.method === 'PASSWORD' ? next(Object.assign(new Error('Change your initial password to continue.'), { status: 403 })) : next());
  api.use('/uploads', require('./routes/uploads'));
  api.use('/daily-reports', require('./routes/dailyReports'));
  api.use('/report-team', require('./routes/reportTeam'));
  api.use('/admin/database', require('./routes/adminDatabase'));
  app.use(config.prefix, api);
  app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
  app.use((cause, _req, res, _next) => {
    if (cause.status) return res.status(cause.status).json({ message: cause.message });
    if (cause.code === 11000) return res.status(409).json({ message: 'A record with that value already exists.' });
    if (cause.name === 'ValidationError' || cause.name === 'CastError') return res.status(400).json({ message: cause.message });
    console.error(cause);
    res.status(500).json({ message: 'Internal server error.' });
  });
  return app;
}
async function seedAdmin() {
  let admin = await User.findOne({ role: 'MAIN_ADMIN' }).select('+passwordHash');
  if (admin) {
    return;
  }
  if (!config.admin.email || !config.admin.password || config.admin.password.length < 10) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (10+ characters) in backend/.env for the first start.');
  admin = await User.create({ id: require('node:crypto').randomUUID(), name: config.admin.name, email: config.admin.email,
    employeeId: config.admin.employeeId,
    role: 'MAIN_ADMIN', status: 'ACTIVE', mustChangePassword: true, passwordHash: await argon2.hash(config.admin.password) });
  console.log(`Super Admin account created for ${admin.email}`);
}
async function start() {
  if (!config.mongoUri || !/^mongodb(\+srv)?:\/\//.test(config.mongoUri)) throw new Error('Set MONGODB_URI in backend/.env.');
  if (!config.s3.bucket || !config.s3.region) throw new Error('Set S3_BUCKET and AWS_REGION in backend/.env. Photo storage requires S3.');
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDb, serverSelectionTimeoutMS: 10000, autoIndex: true });
  await User.updateMany({ role: 'LAB_ASSISTANT' }, { $set: { role: 'EMPLOYEE' } });
  await seedAdmin();
  return createApp();
}
if (require.main === module) {
  start().then(app => {
    const server = app.listen(config.port, process.env.HOST || '127.0.0.1', () => console.log(`API ready at http://localhost:${config.port}${config.prefix}`));
    server.on('error', cause => { console.error('Could not start API:', cause.message); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => mongoose.disconnect().finally(() => process.exit(0))));
  }).catch(cause => { console.error('Could not initialize API:', cause.message); process.exitCode = 1; mongoose.disconnect().catch(() => {}); });
}
module.exports = { createApp, start, seedAdmin };
