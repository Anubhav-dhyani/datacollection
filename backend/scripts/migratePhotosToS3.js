const mongoose = require('mongoose');
const config = require('../src/config');
const { Attachment } = require('../src/models');
const imageStorage = require('../src/services/imageStorage');

async function main() {
  if (!config.mongoUri || !config.s3.bucket || !config.s3.region) throw new Error('Configure MONGODB_URI, S3_BUCKET, and AWS_REGION first.');
  const apply = process.argv.includes('--apply');
  await mongoose.connect(config.mongoUri, { dbName: config.mongoDb, serverSelectionTimeoutMS: 10000 });
  const filter = { kind: 'REPORT', storageKey: { $exists: false }, data: { $exists: true } };
  const count = await Attachment.countDocuments(filter);
  console.log(`${count} legacy photos found. ${apply ? 'Migrating' : 'Dry run; pass --apply to migrate'}.`);
  if (!apply) return;
  let migrated = 0;
  for await (const attachment of Attachment.find(filter).cursor()) {
    const key = `attachments/${attachment.id}`;
    await imageStorage.putImage(key, attachment.mimeType, attachment.data);
    try {
      if (attachment.reportId) await imageStorage.setImageState(key, 'attached');
      const result = await Attachment.updateOne({ id: attachment.id, storageKey: { $exists: false } }, { $set: { storageKey: key }, $unset: { data: 1 } });
      if (result.modifiedCount !== 1) throw new Error(`Photo ${attachment.id} changed during migration.`);
      migrated += 1;
    } catch (cause) {
      await imageStorage.deleteImage(key);
      throw cause;
    }
  }
  console.log(`${migrated} photos migrated to S3.`);
}

main().catch(cause => { console.error(cause); process.exitCode = 1; }).finally(() => mongoose.disconnect());
