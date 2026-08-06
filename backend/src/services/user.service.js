import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import env from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { passwordPolicyError } from '../utils/passwordPolicy.js';
import { phoneKey } from '../utils/phone.js';

/**
 * Hash a plaintext password using the configured bcrypt cost.
 * @param {string} plain
 * @returns {Promise<string>}
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

/**
 * List users with optional text/role/active filters.
 * @param {object} filters
 * @param {string} [filters.q] - matches name or email (case-insensitive).
 * @param {string} [filters.role]
 * @param {boolean} [filters.isActive]
 * @returns {Promise<Array>}
 */
export async function listUsers({ q, role, isActive } = {}) {
  const query = {};

  if (role) query.role = role;
  if (typeof isActive === 'boolean') query.isActive = isActive;

  if (q && q.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  return User.find(query).sort({ createdAt: -1 });
}

/**
 * Fetch a single user by id or throw 404.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
}

/**
 * Throw 409 if another user already holds a phone number matching `phone`
 * on the last-10-digits comparison used for login.
 */
async function assertPhoneAvailable(phone, excludeId) {
  const key = phoneKey(phone);
  if (!key) return;

  const criteria = { phone: { $ne: null } };
  if (excludeId) criteria._id = { $ne: excludeId };

  const others = await User.find(criteria).select('phone');
  if (others.some((u) => phoneKey(u.phone) === key)) {
    throw new AppError(
      'A user with this phone number already exists',
      409,
      'PHONE_TAKEN'
    );
  }
}

/**
 * Create a new user. Enforces unique email (and phone, when provided) plus
 * the role-aware password policy for the account being created.
 * @param {object} input - { name, email, password, role, phone }
 * @param {object} req - express request for audit context.
 * @returns {Promise<object>} created user document.
 */
export async function createUser(input, req) {
  const { name, email, password, role, phone } = input;

  const policyMessage = passwordPolicyError(password, role || 'sales_exec');
  if (policyMessage) {
    throw new AppError(policyMessage, 400, 'PASSWORD_POLICY');
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('A user with this email already exists', 409, 'EMAIL_TAKEN');
  }

  if (phone) {
    await assertPhoneAvailable(phone);
  }

  const passwordHash = await hashPassword(password);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: role || 'sales_exec',
    phone: phone || null,
  });

  await writeAudit({
    req,
    action: 'user_created',
    entityType: 'User',
    entityId: user._id,
    summary: `Created user ${user.email} (${user.role})`,
    meta: { name: user.name, email: user.email, role: user.role },
  });

  return user;
}

/**
 * Update mutable user fields (name, role, isActive).
 * Re-activating users is allowed; deactivating via this path is guarded
 * against self and last-active-admin removal.
 * @param {string} id
 * @param {object} updates - { name?, role?, isActive? }
 * @param {object} req
 * @returns {Promise<object>} updated user document.
 */
export async function updateUser(id, updates, req) {
  const user = await getUserById(id);
  const actorId = req?.user?.id;

  const changes = {};

  if (typeof updates.name === 'string' && updates.name !== user.name) {
    changes.name = updates.name;
  }

  if (typeof updates.role === 'string' && updates.role !== user.role) {
    // Demoting the last active admin away from 'admin' must be blocked.
    if (user.role === 'admin' && updates.role !== 'admin') {
      await assertNotLastActiveAdmin(user._id);
    }
    changes.role = updates.role;
  }

  if (typeof updates.isActive === 'boolean' && updates.isActive !== user.isActive) {
    if (updates.isActive === false) {
      assertNotSelf(actorId, user._id, 'You cannot deactivate your own account');
      if (user.role === 'admin') {
        await assertNotLastActiveAdmin(user._id);
      }
    }
    changes.isActive = updates.isActive;
  }

  // phone is null (clear) or a validated string; undefined means "unchanged".
  if (updates.phone !== undefined && updates.phone !== (user.phone || null)) {
    if (updates.phone) {
      await assertPhoneAvailable(updates.phone, user._id);
    }
    changes.phone = updates.phone;
  }

  if (Object.keys(changes).length === 0) {
    return user;
  }

  Object.assign(user, changes);
  await user.save();

  await writeAudit({
    req,
    action: 'user_updated',
    entityType: 'User',
    entityId: user._id,
    summary: `Updated user ${user.email}`,
    meta: { changes },
  });

  return user;
}

/**
 * Reset (admin override) a user's password. The password must satisfy the
 * policy for the TARGET account's role (PINs are admin-only).
 * @param {string} id
 * @param {string} newPassword
 * @param {object} req
 * @returns {Promise<object>} the user document.
 */
export async function resetUserPassword(id, newPassword, req) {
  const user = await getUserById(id);

  const policyMessage = passwordPolicyError(newPassword, user.role);
  if (policyMessage) {
    throw new AppError(policyMessage, 400, 'PASSWORD_POLICY');
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await writeAudit({
    req,
    action: 'password_changed',
    entityType: 'User',
    entityId: user._id,
    summary: `Reset password for ${user.email}`,
    meta: { byAdmin: true },
  });

  return user;
}

/**
 * Soft-deactivate a user (isActive=false). Blocks deactivating self
 * or the last remaining active admin.
 * @param {string} id
 * @param {object} req
 * @returns {Promise<object>} the deactivated user document.
 */
export async function deactivateUser(id, req) {
  const user = await getUserById(id);
  const actorId = req?.user?.id;

  assertNotSelf(actorId, user._id, 'You cannot deactivate your own account');

  if (!user.isActive) {
    throw new AppError('User is already deactivated', 409, 'ALREADY_INACTIVE');
  }

  if (user.role === 'admin') {
    await assertNotLastActiveAdmin(user._id);
  }

  user.isActive = false;
  await user.save();

  await writeAudit({
    req,
    action: 'user_deactivated',
    entityType: 'User',
    entityId: user._id,
    summary: `Deactivated user ${user.email}`,
    meta: { email: user.email, role: user.role },
  });

  return user;
}

/**
 * Throw if the target id matches the acting user id.
 */
function assertNotSelf(actorId, targetId, message) {
  if (actorId && String(actorId) === String(targetId)) {
    throw new AppError(message, 400, 'SELF_ACTION_FORBIDDEN');
  }
}

/**
 * Throw if deactivating/demoting `userId` would leave zero active admins.
 */
async function assertNotLastActiveAdmin(userId) {
  const otherActiveAdmins = await User.countDocuments({
    _id: { $ne: userId },
    role: 'admin',
    isActive: true,
  });

  if (otherActiveAdmins === 0) {
    throw new AppError(
      'Cannot remove the last active administrator',
      400,
      'LAST_ADMIN'
    );
  }
}

export default {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  resetUserPassword,
  deactivateUser,
};
