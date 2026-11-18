const express = require('express');
const { Attachment, DailyReport } = require('../models');
const { id, error, wrap } = require('../services/common');
const imageStorage = require('../services/imageStorage');
const config = require('../config');
const router = express.Router();
const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' });

async function store(ownerId, mimeType, buffer) {
  const attachmentId = id();
  const storageKey = `attachments/${attachmentId}`;
  await imageStorage.putImage(storageKey, mimeType, buffer);
  try {
    await Attachment.create({ id: attachmentId, ownerId, kind: 'REPORT', mimeType, storageKey, sizeBytes: buffer.length,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600000) });
  } catch (cause) {
    await imageStorage.deleteImage(storageKey);
    throw cause;
  }
  return attachmentId;
}

router.post('/report-photo', rawImage, wrap(async (req, res) => {
  if (req.user.role !== 'EMPLOYEE') error(403, 'Only employees can upload report photos.');
  const mimeType = req.get('content-type');
  const buffer = req.body;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5 * 1024 * 1024) error(400, 'Use a JPG, PNG or WebP image up to 5 MB.');
  res.status(201).json({ attachmentId: await store(req.user.id, mimeType, buffer) });
}));

router.get('/:id', wrap(async (req, res) => {
  const attachment = await Attachment.findOne({ id: req.params.id, kind: 'REPORT' }).lean();
  if (!attachment) error(404, 'Attachment not found.');
  if (attachment.reportId) {
    const report = await DailyReport.findOne({ id: attachment.reportId }).lean();
    if (!report || !(req.user.role === 'MAIN_ADMIN' || (req.user.role === 'SUB_ADMIN' && (report.subAdminIds?.includes(req.user.id) || report.subAdminId === req.user.id)) || (req.user.role === 'EMPLOYEE' && report.employeeId === req.user.id))) error(404, 'Attachment not found.');
  } else if (attachment.ownerId !== req.user.id) error(404, 'Attachment not found.');
  res.set('Cache-Control', 'private, max-age=300');
  res.type(attachment.mimeType);
  if (attachment.storageKey) {
    const stream = await imageStorage.getImageStream(attachment.storageKey);
    stream.on('error', cause => res.destroy(cause));
    stream.pipe(res);
  } else if (attachment.data) res.send(attachment.data);
  else error(404, 'Attachment not found.');
}));
module.exports = router;
