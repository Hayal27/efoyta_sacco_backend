import { auditLogsRepo } from './audit-logs.repository';

export async function getAuditLogs(params: {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const skip = (page - 1) * limit;

  const { logs, total } = await auditLogsRepo.findAuditLogs({
    skip,
    take: limit,
    search: params.search,
    action: params.action,
    entityType: params.entityType,
    userId: params.userId,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  return {
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getAuditLog(id: string) {
  const log = await auditLogsRepo.findAuditLogById(id);
  if (!log) {
    throw new Error('Audit log not found');
  }
  return log;
}

export async function getAuditAnalytics(days: number = 14) {
  return auditLogsRepo.getAuditAnalytics(days);
}

/**
 * Compliance Export Engine — fetches ALL logs in date range (no pagination).
 * Used by the export controller to generate CSV/JSON compliance reports.
 */
export async function exportAuditLogs(params: {
  startDate?: string;
  endDate?: string;
  action?: string;
  entityType?: string;
}) {
  return auditLogsRepo.findAuditLogs({
    skip: 0,
    take: 100_000, // Safety cap — 100k rows max per export
    action: params.action,
    entityType: params.entityType,
    startDate: params.startDate,
    endDate: params.endDate,
  });
}
