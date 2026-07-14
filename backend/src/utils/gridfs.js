import mongoose from 'mongoose';

let bucket = null;

/** Lazily-created GridFS bucket for signed confirmation uploads. */
export function getKitFilesBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'kitFiles',
    });
  }
  return bucket;
}

/** Uploads a buffer to GridFS and resolves with the stored file id. */
export function uploadBufferToGridFS(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const uploadStream = getKitFilesBucket().openUploadStream(filename, {
      contentType,
    });
    uploadStream.once('error', reject);
    uploadStream.once('finish', () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

/** Deletes a GridFS file, ignoring "not found" errors. */
export async function deleteGridFSFile(fileId) {
  try {
    await getKitFilesBucket().delete(
      new mongoose.Types.ObjectId(String(fileId))
    );
  } catch (err) {
    if (!/file not found/i.test(err?.message || '')) throw err;
  }
}

export default { getKitFilesBucket, uploadBufferToGridFS, deleteGridFSFile };
