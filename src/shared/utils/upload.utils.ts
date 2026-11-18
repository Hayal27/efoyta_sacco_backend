import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Returns a prioritized list of potential upload directory roots on disk.
 * Handles local dev, Docker, and cPanel / Phusion Passenger environments where
 * process.cwd() may unexpectedly be root ('/') or '/home'.
 */
export function getCandidateUploadRoots(): string[] {
  const roots: string[] = [];

  // 1. Explicit environment variable
  if (process.env.UPLOAD_DIR && process.env.UPLOAD_DIR.trim()) {
    roots.push(path.resolve(process.env.UPLOAD_DIR.trim()));
  }

  // 2. Relative to the compiled/source file directory (always inside the deployed app folder)
  roots.push(path.resolve(__dirname, '../../uploads'));
  roots.push(path.resolve(__dirname, '../uploads'));
  roots.push(path.resolve(__dirname, 'uploads'));

  // 3. process.cwd() - only if it is NOT root or /home
  const cwd = process.cwd();
  const normalizedCwd = path.resolve(cwd).replace(/\\/g, '/').toLowerCase();
  const isRestrictedRoot =
    normalizedCwd === '/' ||
    normalizedCwd === '/home' ||
    normalizedCwd === '/root' ||
    normalizedCwd === 'c:/' ||
    normalizedCwd === 'c:\\';

  if (!isRestrictedRoot) {
    roots.push(path.resolve(cwd, 'uploads'));
  }

  // 4. Guaranteed-writable OS temp folder fallback
  roots.push(path.resolve(os.tmpdir(), 'efoyta-uploads'));

  // Deduplicate preserving order
  return Array.from(new Set(roots));
}

/**
 * Resolves a safe, guaranteed-writable directory for the given subfolder (e.g. 'banners', 'kyc', 'members').
 * Automatically creates the folder recursively if it doesn't exist.
 */
export function resolveUploadDir(subfolder: string = ''): string {
  const safeSubfolder = subfolder.replace(/[^a-zA-Z0-9_\-\/]/g, '').replace(/^\/+|\/+$/g, '');
  const candidateRoots = getCandidateUploadRoots();

  for (const root of candidateRoots) {
    try {
      const targetDir = safeSubfolder ? path.join(root, safeSubfolder) : root;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Verify write permission by touching a test probe or checking access
      fs.accessSync(targetDir, fs.constants.W_OK);
      return targetDir;
    } catch {
      // Continue to next candidate root if this one is read-only or restricted
      continue;
    }
  }

  // Extreme fallback: OS temp folder
  const fallbackDir = path.resolve(os.tmpdir(), 'efoyta-uploads', safeSubfolder);
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return fallbackDir;
}

/**
 * Returns all active upload directories on disk so Express can serve static assets from all of them.
 */
export function getAllExistingUploadRoots(): string[] {
  return getCandidateUploadRoots().filter((root) => {
    try {
      return fs.existsSync(root);
    } catch {
      return false;
    }
  });
}

