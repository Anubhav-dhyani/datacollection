const mongoose = require('mongoose');
const { Schema } = mongoose;
const options = collection => ({ collection, timestamps: true, versionKey: false });

const userSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  role: { type: String, required: true, enum: ['MAIN_ADMIN', 'SUB_ADMIN', 'EMPLOYEE'] },
  reportSubAdminId: { type: String, default: null, index: true },
  status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  passwordHash: { type: String, required: true, select: false },
  mustChangePassword: { type: Boolean, default: true },
  lastLoginAt: Date,
}, options('users'));
userSchema.index({ role: 1, status: 1 });

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  method: { type: String, enum: ['PASSWORD'], default: 'PASSWORD' },
  expiresAt: { type: Date, required: true },
}, options('sessions'));
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const authLimitSchema = new Schema({ key: { type: String, required: true, unique: true }, count: { type: Number, default: 0 }, resetsAt: { type: Date, required: true } }, options('auth_limits'));
authLimitSchema.index({ resetsAt: 1 }, { expireAfterSeconds: 3600 });

const attachmentSchema = new Schema({
  id: { type: String, required: true, unique: true }, mimeType: { type: String, required: true },
  data: Buffer, storageKey: String, sizeBytes: Number,
  ownerId: { type: String, required: true }, reportId: String, expiresAt: Date,
  kind: { type: String, enum: ['REPORT'], required: true },
}, options('attachments'));
attachmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const photoSchema = new Schema({ attachmentId: { type: String, required: true } }, { _id: false });
const dailyReportSchema = new Schema({
  id: { type: String, required: true, unique: true }, date: { type: String, required: true, index: true },
  employeeId: { type: String, required: true, index: true }, employeeName: { type: String, required: true },
  subAdminId: { type: String, required: true, index: true },
  eventDetail: { type: String, required: true, maxlength: 3000 }, city: { type: String, required: true, maxlength: 120 },
  studentsAttended: { type: Number, min: 0 }, studentsAttendedNA: { type: Boolean, default: false },
  dataCollected: { type: Number, min: 0 }, dataCollectedNA: { type: Boolean, default: false },
  eventRemarks: { type: String, default: '', maxlength: 3000 },
  additionalRemarks: { type: String, default: '', maxlength: 3000 }, photos: { type: [photoSchema], default: [] },
}, options('daily_reports'));
dailyReportSchema.index({ subAdminId: 1, date: -1 });

const auditSchema = new Schema({ at: { type: Date, default: Date.now }, actorId: String, action: String, targetType: String, targetId: String, details: Schema.Types.Mixed }, { collection: 'audit_logs', versionKey: false });
auditSchema.index({ at: -1 });

module.exports = {
  User: mongoose.model('User', userSchema), Session: mongoose.model('Session', sessionSchema),
  AuthLimit: mongoose.model('AuthLimit', authLimitSchema), Attachment: mongoose.model('Attachment', attachmentSchema),
  DailyReport: mongoose.model('DailyReport', dailyReportSchema), AuditLog: mongoose.model('AuditLog', auditSchema),
};
