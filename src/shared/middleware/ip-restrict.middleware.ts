import type { Request, Response, NextFunction } from 'express';
import { Address4, Address6 } from 'ip-address';
import { env } from '../../config/env';
import { ForbiddenError } from '../errors/app-error';

/**
 * Checks whether `clientIP` matches any entry in `allowedEntries`.
 * Each entry can be:
 *   - an exact IPv4 address:   196.190.61.41
 *   - an IPv4 CIDR range:      192.168.8.0/24
 *   - an exact IPv6 address:   ::1
 *   - an IPv6 CIDR range:      fc00::/7
 *
 * Uses the `ip-address` package (built-in TypeScript types, maintained).
 */
function isIpAllowed(clientIP: string, allowedEntries: string[]): boolean {
  if (allowedEntries.includes('*')) return true;
  for (const entry of allowedEntries) {
    try {
      // ── Exact match (fast path before subnet check) ──────────────────────
      if (entry === clientIP) return true;

      // ── IPv4 CIDR range check ────────────────────────────────────────────
      if (entry.includes('/') && Address4.isValid(clientIP) && Address4.isValid(entry)) {
        const client = new Address4(clientIP);
        const network = new Address4(entry);
        if (client.isInSubnet(network)) return true;
        continue;
      }

      // ── IPv6 CIDR range check ────────────────────────────────────────────
      if (entry.includes('/') && Address6.isValid(clientIP) && Address6.isValid(entry)) {
        const client = new Address6(clientIP);
        const network = new Address6(entry);
        if (client.isInSubnet(network)) return true;
        continue;
      }

      // ── Exact IPv4/IPv6 entry (no CIDR) ─────────────────────────────────
      // Already handled by the === check above; skip to avoid duplicate logic.
    } catch {
      // Malformed entry — log and skip; don't crash the server.
      console.warn(`[IP-RESTRICT] Skipping malformed allowlist entry: "${entry}"`);
    }
  }
  return false;
}

/**
 * ipRestrict(envVarName)
 *
 * Middleware factory that restricts access to a route based on the client's
 * IP address. The allowlist is read from process.env[envVarName] as a
 * comma-separated list of exact IPs and/or CIDR ranges.
 *
 * Examples:
 *   BRANCH_IPS=196.190.61.41,192.168.8.0/24
 *   ADMIN_IPS=196.190.61.41
 *
 * Behaviour:
 *   - In `development` / `test` mode the check is skipped entirely so that
 *     local development does not require configuring IPs in .env.
 *   - In `production` an empty allowlist blocks ALL requests to the route
 *     (fail-closed safe default). Populate the list before deploying.
 *
 * Prerequisites:
 *   - `app.set('trust proxy', 1)` must be set in app.ts so that req.ip
 *     resolves the real client IP when sitting behind nginx.
 *
 * @param envVarName  Name of the process.env variable that holds the comma-
 *                    separated allowlist (e.g. 'BRANCH_IPS', 'ADMIN_IPS').
 */
export function ipRestrict(envVarName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Skip enforcement in non-production environments for developer convenience.
    if (env.NODE_ENV !== 'production') {
      next();
      return;
    }

    const rawList = process.env[envVarName] ?? '';
    const allowedEntries = rawList
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    // Fail-closed: empty list in production blocks everything.
    if (allowedEntries.length === 0) {
      console.warn(
        `[IP-RESTRICT] BLOCKED — ${envVarName} is empty. ` +
          `All access to ${req.method} ${req.originalUrl} denied until the list is populated.`,
      );
      throw new ForbiddenError(
        'Access denied — no IP allowlist configured for this resource.',
      );
    }

    // Normalise IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1 → 127.0.0.1)
    let clientIP = req.ip ?? req.socket.remoteAddress ?? '';
    if (clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.replace('::ffff:', '');
    }

    const allowed = isIpAllowed(clientIP, allowedEntries);

    if (!allowed) {
      console.warn(
        `[IP-RESTRICT] BLOCKED  — IP ${clientIP} tried ${req.method} ${req.originalUrl} (list: ${envVarName})`,
      );
      throw new ForbiddenError(
        `Your IP (${clientIP}) is not permitted to access this resource.`,
      );
    }

    console.info(
      `[IP-RESTRICT] ALLOWED  — IP ${clientIP} accessed ${req.method} ${req.originalUrl}`,
    );
    next();
  };
}
