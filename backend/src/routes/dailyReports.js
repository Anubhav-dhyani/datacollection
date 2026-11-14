const express = require('express');
const { DailyReport, Attachment, User } = require('../models');
const { id, error, text, audit, wrap } = require('../services/common');
const imageStorage = require('../services/imageStorage');
const config = require('../config');
const router = express.Router();

function today() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function scope(req) {
  const filter = req.user.role === 'MAIN_ADMIN' ? {} : req.user.role === 'SUB_ADMIN' ? { subAdminId: req.user.id } : { employeeId: req.user.id };
  if (req.query.date) {
    if (typeof req.query.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) error(400, 'Invalid date filter.');
    filter.date = req.query.date;
  }
  if (req.query.employeeId && req.user.role !== 'EMPLOYEE') filter.employeeId = text(req.query.employeeId, 'employee ID', 100);
  return filter;
}
function visible(user, report) {
  return user.role === 'MAIN_ADMIN' || (user.role === 'SUB_ADMIN' && report.subAdminId === user.id) || (user.role === 'EMPLOYEE' && report.employeeId === user.id);
}
function output(report) {
  const value = report.toObject ? report.toObject() : { ...report };
  delete value._id;
  delete value.data;
  delete value.dataFiles;
  delete value.dataSections;
  return { ...value,
    photos: (value.photos || []).map(photo => ({ attachmentId: photo.attachmentId, url: `${config.prefix}/uploads/${photo.attachmentId}` })),
  };
}
router.get('/summary', wrap(async (req, res) => {
  if (!['MAIN_ADMIN', 'SUB_ADMIN'].includes(req.user.role)) error(403, 'Access denied.');
  const date = today();
  const employees = await User.find({ role: 'EMPLOYEE', status: 'ACTIVE', ...(req.user.role === 'SUB_ADMIN' ? { reportSubAdminId: req.user.id } : {}) }).sort({ name: 1 }).lean();
  const submitted = new Set(await DailyReport.distinct('employeeId', { date, employeeId: { $in: employees.map(person => person.id) } }));
  res.json({ date, employees: employees.map(person => ({ id: person.id, name: person.name, employeeId: person.employeeId, subAdminId: person.reportSubAdminId, submitted: submitted.has(person.id) })) });
}));
router.get('/export.csv', wrap(async (req, res) => {
  const reports = await DailyReport.find(scope(req)).sort({ date: -1, createdAt: -1 }).lean();
  const cell = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const photoUrl = attachmentId => new URL(`${config.prefix}/uploads/${attachmentId}`, config.frontendOrigins[0]).href;
  const rows = [['Date', 'Name', 'Event Detail', 'City', 'Event Remarks', 'Additional Remarks', 'Event pictures'],
    ...reports.map(report => [report.date, report.employeeName, report.eventDetail, report.city, report.eventRemarks, report.additionalRemarks,
      report.photos.map(photo => photoUrl(photo.attachmentId)).join('; ')])];
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="geu-daily-reports.csv"');
  res.send('\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n'));
}));
router.get('/', wrap(async (req, res) => {
  res.json((await DailyReport.find(scope(req)).sort({ date: -1, createdAt: -1 }).limit(1000).lean()).map(output));
}));
router.get('/:id', wrap(async (req, res) => {
  const report = await DailyReport.findOne({ id: req.params.id }).lean();
  if (!report || !visible(req.user, report)) error(404, 'Report not found.');
  res.json(output(report));
}));
router.post('/', wrap(async (req, res) => {
  if (req.user.role !== 'EMPLOYEE') error(403, 'Only employees can submit reports.');
  if (['data', 'dataFileIds', 'dataSections'].some(field => req.body[field] !== undefined)) error(400, 'Data sections are no longer supported.');
  const manager = await User.findOne({ id: req.user.reportSubAdminId, role: 'SUB_ADMIN', status: 'ACTIVE' }).lean();
  if (!manager) error(400, 'Ask the admin to assign an active sub-admin.');
  if (!Array.isArray(req.body.photos) || req.body.photos.length < 1 || req.body.photos.length > 8) error(400, 'Add 1 to 8 event pictures.');
  const ids = new Set();
  const photos = req.body.photos.map(photo => {
    const attachmentId = text(photo.attachmentId, 'photo ID', 100);
    if (ids.has(attachmentId)) error(400, 'A photo was selected twice.');
    ids.add(attachmentId);
    return { attachmentId };
  });
  const attachments = await Attachment.find({ id: { $in: [...ids] }, ownerId: req.user.id, kind: 'REPORT', reportId: { $exists: false }, expiresAt: { $gt: new Date() } }).select('storageKey').lean();
  if (attachments.length !== photos.length) error(400, 'Upload photos again before submitting.');
  const reportFields = { id: id(), date: today(), employeeId: req.user.id, employeeName: req.user.name, subAdminId: manager.id,
    eventDetail: text(req.body.eventDetail, 'event detail', 3000), city: text(req.body.city, 'city', 120),
    eventRemarks: String(req.body.eventRemarks || '').slice(0, 3000),
    additionalRemarks: String(req.body.additionalRemarks || '').slice(0, 3000), photos };
  const marked = [];
  let report;
  try {
    for (const attachment of attachments) {
      if (attachment.storageKey) { await imageStorage.setImageState(attachment.storageKey, 'attached'); marked.push(attachment.storageKey); }
    }
    report = await DailyReport.create(reportFields);
  } catch (cause) {
    await Promise.allSettled(marked.map(key => imageStorage.setImageState(key, 'pending')));
    throw cause;
  }
  await Attachment.updateMany({ id: { $in: [...ids] }, ownerId: req.user.id, reportId: { $exists: false } }, { $set: { reportId: report.id }, $unset: { expiresAt: 1 } });
  await audit(req.user.id, 'CREATE_DAILY_REPORT', 'DailyReport', report.id, { date: report.date, subAdminId: manager.id });
  res.status(201).json(output(report));
}));
module.exports = router;
