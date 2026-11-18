const { User } = require('../models');
const { error } = require('./common');

const assignedIds = person => Array.isArray(person.reportSubAdminIds) && person.reportSubAdminIds.length
  ? person.reportSubAdminIds : person.reportSubAdminId ? [person.reportSubAdminId] : [];
const assignedTo = id => ({ $or: [{ reportSubAdminIds: id }, { reportSubAdminId: id }] });

async function validateAssignments(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20 || value.some(id => typeof id !== 'string' || !id.trim())) error(400, 'Choose 1 to 20 sub-admins.');
  const ids = [...new Set(value.map(id => id.trim()))];
  const count = await User.countDocuments({ id: { $in: ids }, role: 'SUB_ADMIN', status: 'ACTIVE' });
  if (count !== ids.length) error(400, 'Choose active sub-admins only.');
  return ids;
}

module.exports = { assignedIds, assignedTo, validateAssignments };
