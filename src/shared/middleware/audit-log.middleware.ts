import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';

/**
 * Forensic Audit Log Middleware — records every state-changing request
 * with immutable, append-only events containing:
 *   { timestamp, userId, action, entityType, entityId, ipAddress,
 *     userAgent, diffBefore, diffAfter, metadata }
 *
 * Usage: router.post('/path', authMiddleware, auditLog('CREATE_MEMBER', 'member'), handler)
 *
 * For diff capture, pass the entity table name:
 *   router.patch('/:id', auditLog('UPDATE_MEMBER', 'member', 'members'))
 */
export function auditLog(action: string, entityType?: string, entityTable?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ── 1. Capture BEFORE state (if we have an entityId and table) ─────────────
    let diffBefore: Record<string, unknown> | null = null;
    const entityId = (req.params.id as string) ?? null;

    if (entityTable && entityId) {
      try {
        diffBefore = await fetchEntitySnapshot(entityTable, entityId);
      } catch {
        // Non-blocking — snapshot failure must never break a request
      }
    }

    // ── 2. Intercept response to capture AFTER state ───────────────────────────
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Fire-and-forget after-state capture
      setImmediate(async () => {
        let diffAfter: Record<string, unknown> | null = null;

        if (entityTable && entityId) {
          try {
            diffAfter = await fetchEntitySnapshot(entityTable, entityId);
          } catch {
            // Non-blocking
          }
        }

        // Strip before/after to only changed fields (reduce storage)
        const delta = computeDelta(diffBefore, diffAfter);

        try {
          await prisma.auditLog.create({
            data: {
              userId:     req.user?.sub ?? null,
              action,
              entityType: entityType ?? req.baseUrl.split('/').filter(Boolean).pop() ?? 'unknown',
              entityId:   entityId ?? null,
              ipAddress:  (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
                          ?? req.socket.remoteAddress
                          ?? null,
              userAgent:  (req.headers['user-agent'] as string) ?? null,
              diffBefore: delta.before ?? undefined,
              diffAfter:  delta.after ?? undefined,
              metadata: {
                method:     req.method,
                path:       req.originalUrl,
                statusCode: res.statusCode,
                body:       sanitizeBody(req.body),
              },
            },
          });
        } catch (err) {
          // Audit failures must NEVER block or crash the app
          console.error('[AuditLog] Write failed:', err);
        }
      });

      return originalJson(body);
    };

    next();
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch a lightweight snapshot of any entity by table name + ID.
 * Supported tables: members, loans, users, savings_accounts, savings_txns
 */
async function fetchEntitySnapshot(
  table: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const tableMap: Record<string, () => Promise<unknown>> = {
    members:          () => (prisma as any).member.findUnique({ where: { id }, select: memberSnapshotFields() }),
    loans:            () => (prisma as any).loan.findUnique({ where: { id }, select: loanSnapshotFields() }),
    users:            () => (prisma as any).user.findUnique({ where: { id }, select: userSnapshotFields() }),
    savings_accounts: () => (prisma as any).savingsAccount.findUnique({ where: { id } }),
    savings_txn:      () => (prisma as any).savingsTxn.findUnique({ where: { id } }),
    repayment:        () => (prisma as any).repayment.findUnique({ where: { id } }),
  };

  const fetcher = tableMap[table];
  if (!fetcher) return null;

  const result = await fetcher();
  return result ? (result as Record<string, unknown>) : null;
}

/** Only keep fields that changed between before and after */
function computeDelta(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before && !after) return { before: null, after: null };
  if (!before) return { before: null, after };
  if (!after)  return { before, after: null };

  const changedKeys = Object.keys(after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );

  if (changedKeys.length === 0) return { before: null, after: null };

  const deltaB: Record<string, unknown> = {};
  const deltaA: Record<string, unknown> = {};
  for (const k of changedKeys) {
    deltaB[k] = before[k];
    deltaA[k] = after[k];
  }

  return { before: deltaB, after: deltaA };
}

/** Strip sensitive fields from request body before logging */
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...(body as Record<string, unknown>) };
  for (const key of ['password', 'passwordHash', 'token', 'refreshToken', 'otp', 'pin', 'secret']) {
    if (key in sanitized) sanitized[key] = '[REDACTED]';
  }
  return sanitized;
}

// ── Snapshot field selectors (exclude sensitive/large fields) ─────────────────

function memberSnapshotFields() {
  return {
    id: true, memberNo: true, fullName: true, phone: true, email: true,
    status: true, kycStatus: true, branchId: true, updatedAt: true,
  };
}

function loanSnapshotFields() {
  return {
    id: true, loanNo: true, memberId: true, principalAmount: true,
    status: true, reviewStatus: true, disbursedAt: true,
    outstandingBalance: true, updatedAt: true,
  };
}

function userSnapshotFields() {
  return {
    id: true, email: true, fullName: true, phone: true,
    roleId: true, isActive: true, updatedAt: true,
  };
}
