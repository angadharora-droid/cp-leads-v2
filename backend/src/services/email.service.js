import nodemailer from 'nodemailer';

import env from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';

let transporter = null;

export function isEmailConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/**
 * Hostname announced in the SMTP EHLO/HELO handshake. Containers (Railway,
 * Docker) have machine hostnames that strict servers — Rediffmail Pro in
 * particular — reject with "550 Invalid HeloHost", so announce the sender's
 * own mail domain instead (overridable via SMTP_HELO_NAME).
 */
function heloName(address) {
  if (env.SMTP_HELO_NAME) return env.SMTP_HELO_NAME;
  const domain = String(address || '').split('@')[1];
  return domain || undefined;
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new AppError(
      'Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in the backend environment.',
      503,
      'EMAIL_NOT_CONFIGURED'
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      name: heloName(env.SMTP_USER),
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/** Builds a one-off transporter for a per-user mailbox account. */
function accountTransporter(account) {
  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    name: heloName(account.user),
    auth: { user: account.user, pass: account.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });
}

/**
 * Verifies SMTP login for a mailbox account (used before saving a user's
 * sending mailbox, so bad passwords are rejected immediately).
 * @param {{host: string, port: number, secure: boolean, user: string, pass: string}} account
 */
export async function verifyMailAccount(account) {
  try {
    await accountTransporter(account).verify();
  } catch (err) {
    throw new AppError(
      `Could not sign in to this mailbox: ${err?.message || 'unknown error'}. Check the email address, password and SMTP settings.`,
      422,
      'MAILBOX_VERIFY_FAILED'
    );
  }
}

/**
 * Sends an email with optional attachments.
 * @param {object} opts
 * @param {string} opts.to - Recipient(s), comma-separated allowed.
 * @param {string} [opts.cc]
 * @param {string} opts.subject
 * @param {string} opts.text - Plain-text body.
 * @param {Array<{filename: string, content: Buffer, contentType?: string}>} [opts.attachments]
 * @param {{host: string, port: number, secure: boolean, user: string, pass: string}} [opts.account]
 *   - Per-user mailbox to send through; falls back to the global SMTP_* env transport.
 * @param {string} [opts.from] - From header override (defaults per transport).
 */
export async function sendMail({ to, cc, subject, text, attachments, account, from }) {
  const transport = account ? accountTransporter(account) : getTransporter();
  return transport.sendMail({
    from:
      from ||
      (account ? account.user : env.MAIL_FROM || env.SMTP_USER),
    to,
    cc: cc || undefined,
    subject,
    text,
    attachments,
  });
}

export default { isEmailConfigured, verifyMailAccount, sendMail };
