const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, PutObjectTaggingCommand } = require('@aws-sdk/client-s3');
const config = require('../config');
const { error } = require('./common');

let client;
function s3() {
  if (!config.s3.bucket || !config.s3.region) error(503, 'S3 image storage is not configured.');
  if (!client) client = new S3Client({ region: config.s3.region });
  return client;
}

async function putImage(key, mimeType, buffer) {
  try {
    await s3().send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: buffer, ContentType: mimeType, Tagging: 'state=pending' }));
  } catch (cause) {
    if (cause.status) throw cause;
    console.error('S3 image upload failed:', cause);
    error(502, 'Could not store the image. Please try again.');
  }
}

async function setImageState(key, state) {
  try {
    await s3().send(new PutObjectTaggingCommand({ Bucket: config.s3.bucket, Key: key, Tagging: { TagSet: [{ Key: 'state', Value: state }] } }));
  } catch (cause) {
    console.error('S3 image tagging failed:', cause);
    error(502, 'Could not finalize the image. Please try again.');
  }
}

async function getImageStream(key) {
  try {
    const response = await s3().send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    if (!response.Body) error(502, 'Could not load the image.');
    return response.Body;
  } catch (cause) {
    if (cause.status) throw cause;
    if (cause.name === 'NoSuchKey' || cause.$metadata?.httpStatusCode === 404) error(404, 'Image not found.');
    console.error('S3 image download failed:', cause);
    error(502, 'Could not load the image. Please try again.');
  }
}

async function deleteImage(key) {
  try { await s3().send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key })); }
  catch (cause) { console.error('S3 image cleanup failed:', cause); }
}

module.exports = { putImage, getImageStream, deleteImage, setImageState };
