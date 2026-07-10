import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import env from './config/env.js';
import { connectDB } from './config/db.js';

import User from './models/User.js';
import Lead from './models/Lead.js';
import RefreshToken from './models/RefreshToken.js';
import AuditLog from './models/AuditLog.js';

/**
 * Seed script for the CPH Leads CRM.
 *
 * Wipes users, leads, refresh tokens and audit logs, then creates a single
 * admin account. Credentials can be overridden with the ADMIN_EMAIL and
 * ADMIN_PASSWORD environment variables (recommended in production).
 *
 * Run with: npm run seed
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@cph.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'CPH Admin';

async function run() {
  await connectDB();

  console.log('[seed] clearing existing collections...');
  await Promise.all([
    User.deleteMany({}),
    Lead.deleteMany({}),
    RefreshToken.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  console.log('[seed] creating admin user...');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, env.BCRYPT_ROUNDS);

  await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    passwordHash,
    role: 'admin',
    isActive: true,
  });

  console.log('\n========================================');
  console.log(' CPH Leads CRM — Seed complete');
  console.log('========================================');
  console.log(' Login credentials:');
  console.log('');
  console.log('  Admin');
  console.log(`    email:    ${ADMIN_EMAIL}`);
  console.log(`    password: ${ADMIN_PASSWORD}`);
  console.log('');
  console.log('  Users: 1   Leads: 0');
  console.log('========================================\n');
}

run()
  .then(async () => {
    await mongoose.disconnect();
    console.log('[seed] done. disconnected.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] failed:', err);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors during failure cleanup
    }
    process.exit(1);
  });
