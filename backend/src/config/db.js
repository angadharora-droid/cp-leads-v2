import mongoose from 'mongoose';
import env from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  const { host, port, name } = mongoose.connection;
  console.log(`[db] connected to mongodb ${host}:${port}/${name}`);
  return mongoose.connection;
}

export default connectDB;
