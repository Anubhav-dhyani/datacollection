const crypto = require('node:crypto');
const { AuditLog } = require('../models');
const id = () => crypto.randomUUID();
function error(status, message) { const cause = new Error(message); cause.status = status; throw cause; }
function text(value, name, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) error(400, `${name} is required (max ${max} characters).`);
  return value.trim();
}
function plain(doc) {
  if (!doc) return null;
  const value = doc.toObject ? doc.toObject() : { ...doc };
  const fields = ['id', 'name', 'email', 'employeeId', 'role', 'reportSubAdminId', 'status', 'mustChangePassword', 'lastLoginAt'];
  return Object.fromEntries(fields.filter(field => value[field] !== undefined).map(field => [field, value[field]]));
}
async function audit(actorId, action, targetType, targetId, details = {}) {
  await AuditLog.create({ actorId, action, targetType, targetId, details });
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { id, error, text, plain, audit, wrap };
