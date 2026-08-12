import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { AppError } from '../utils/apiResponse.js';

/**
 * Word → PDF conversion via LibreOffice headless (`soffice`). Emails must
 * always carry PDFs, while the team edits agreements in Word — this bridges
 * the two without losing the letterhead/typography of the source document.
 *
 * Requires LibreOffice on the host. Override the binary with SOFFICE_PATH.
 */

const WINDOWS_CANDIDATES = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
];

const UNIX_CANDIDATES = [
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
];

const CONVERT_TIMEOUT_MS = 120 * 1000;

let resolvedBinary = null;

function converterMissingError() {
  return new AppError(
    'Converting Word documents to PDF requires LibreOffice on the server. ' +
      'Install LibreOffice, or set SOFFICE_PATH in the backend .env to the soffice binary.',
    500,
    'PDF_CONVERTER_MISSING'
  );
}

async function findSoffice() {
  if (resolvedBinary) return resolvedBinary;
  const candidates = [
    process.env.SOFFICE_PATH,
    ...(process.platform === 'win32' ? WINDOWS_CANDIDATES : UNIX_CANDIDATES),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK);
      resolvedBinary = candidate;
      return resolvedBinary;
    } catch {
      // keep looking
    }
  }
  // Last resort: rely on PATH; spawn reports ENOENT if it's not there either.
  return process.platform === 'win32' ? 'soffice.exe' : 'soffice';
}

function runSoffice(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AppError('PDF conversion timed out', 500, 'PDF_CONVERSION_FAILED'));
    }, CONVERT_TIMEOUT_MS);
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err?.code === 'ENOENT' ? converterMissingError() : err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `LibreOffice exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
          )
        );
      }
    });
  });
}

/** Converts a Word document buffer to a PDF buffer. */
export async function convertWordToPdf(buffer, filename) {
  const binary = await findSoffice();
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'cph-docx2pdf-'));
  try {
    const ext = path.extname(filename || '').toLowerCase() || '.docx';
    const inputPath = path.join(workDir, `document${ext}`);
    await writeFile(inputPath, buffer);

    // A per-run user profile lets concurrent conversions coexist.
    const profileDir = path.join(workDir, 'profile');
    await runSoffice(binary, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      '--headless',
      '--norestore',
      '--convert-to',
      'pdf',
      '--outdir',
      workDir,
      inputPath,
    ]);

    try {
      return await readFile(path.join(workDir, 'document.pdf'));
    } catch {
      throw new Error('LibreOffice produced no PDF output');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      `Failed to convert document to PDF: ${err?.message || 'unknown error'}`,
      500,
      'PDF_CONVERSION_FAILED'
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export default { convertWordToPdf };
