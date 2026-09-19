import mongoose from 'mongoose';
import env from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  const { host, port, name } = mongoose.connection;
  console.log(`[db] connected to mongodb ${host}:${port}/${name}`);
  await dropStaleIndexes();
  return mongoose.connection;
}

/**
 * Indexes left behind by earlier schema versions that would now reject valid
 * writes. Each entry is dropped only when it exists with the old shape.
 */
const STALE_INDEXES = [
  // ARCs used to be one-per-lead (unique lead_1); they are now per department.
  { collection: 'arcs', name: 'lead_1', onlyIfUnique: true },
];

async function dropStaleIndexes() {
  for (const { collection, name, onlyIfUnique } of STALE_INDEXES) {
    try {
      const coll = mongoose.connection.db.collection(collection);
      const indexes = await coll.indexes();
      const match = indexes.find((ix) => ix.name === name);
      if (!match) continue;
      if (onlyIfUnique && !match.unique) continue;
      await coll.dropIndex(name);
      console.log(`[db] dropped stale index ${collection}.${name}`);
    } catch (err) {
      // A missing collection (ns not found) is fine; anything else is logged.
      if (err?.codeName !== 'NamespaceNotFound' && err?.code !== 26) {
        console.warn(`[db] could not drop index ${collection}.${name}:`, err?.message);
      }
    }
  }
}

export default connectDB;
