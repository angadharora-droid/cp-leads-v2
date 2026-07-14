import nodemailer from 'nodemailer';

import env from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';

let transporter = null;

export function isEmailConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
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
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends an email with optional attachments.
 * @param {object} opts
 * @param {string} opts.to - Recipient(s), comma-separated allowed.
 * @param {string} [opts.cc]
 * @param {string} opts.subject
 * @param {string} opts.text - Plain-text body.
 * @param {Array<{filename: string, content: Buffer, contentType?: string}>} [opts.attachments]
 */
export async function sendMail({ to, cc, subject, text, attachments }) {
  const transport = getTransporter();
  return transport.sendMail({
    from: env.MAIL_FROM || env.SMTP_USER,
    to,
    cc: cc || undefined,
    subject,
    text,
    attachments,
  });
}

export default { isEmailConfigured, sendMail };
