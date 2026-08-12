import crypto from 'node:crypto';

import env from '../config/env.js';

/**
 * Reversible encryption for stored mailbox passwords: SMTP needs the plain
 * password at send time, so hashing is not an option. AES-256-GCM with a key
 * derived from CRED_ENCRYPTION_KEY. Encoded as base64 "iv.tag.ciphertext".
 */

let cachedKey = null;

function getKey() {
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(env.CRED_ENCRYPTION_KEY, 'cph-mail-cred', 32);
  }
  return cachedKey;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(encoded) {
  const [iv, tag, data] = String(encoded)
    .split('.')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export default { encryptSecret, decryptSecret };
