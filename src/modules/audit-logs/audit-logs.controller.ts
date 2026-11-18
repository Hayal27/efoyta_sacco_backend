import { Request, Response } from 'express';
import * as auditLogsService from './audit-logs.service';

export async function listAuditLogs(req: Request, res: Response) {
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const search = req.query.search as string;
  const action = req.query.action as string;
  const entityType = req.query.entityType as string;
  const userId = req.query.userId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  const result = await auditLogsService.getAuditLogs({ page, limit, search, action, entityType, userId, startDate, endDate });
  res.json({ status: 'success', ...result });
}

export async function getAuditAnalytics(req: Request, res: Response) {
  const days = parseInt(req.query.days as string, 10) || 14;
  const analytics = await auditLogsService.getAuditAnalytics(days);
  res.json({ status: 'success', data: analytics });
}

export async function getAuditLog(req: Request, res: Response) {
  const log = await auditLogsService.getAuditLog(req.params.id);
  res.json({ status: 'success', data: log });
}

/**
 * Compliance Export Engine
 * GET /api/v1/audit-logs/export?format=csv|json&startDate=...&endDate=...&action=...&entityType=...
 * Streams a downloadable compliance report file.
 */
export async function exportAuditLogs(req: Request, res: Response) {
  const format = (req.query.format as string) || 'csv';
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const action = req.query.action as string;
  const entityType = req.query.entityType as string;
  const forensic = req.query.forensic === 'true'; // include diffBefore/diffAfter

  const { logs, total } = await auditLogsService.exportAuditLogs({
    startDate,
    endDate,
    action,
    entityType,
  });

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `audit-compliance-export-${timestamp}`;

  if (format === 'json') {
    // ── JSON Export ──────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);

    const output = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.sub ?? 'system',
      periodFrom: startDate ?? 'all-time',
      periodTo: endDate ?? new Date().toISOString(),
      totalRecords: total,
      cooperative: 'EFOYTA Cooperative Management System',
      records: logs.map((l: any) => formatLogRecord(l, forensic)),
    };
    res.json(output);

  } else {
    // ── CSV Export ───────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

    // BOM for Excel UTF-8 compatibility
    res.write('\uFEFF');

    // Header row
    const headers = [
      'timestamp', 'user_id', 'user_name', 'user_email',
      'action', 'entity_type', 'entity_id',
      'ip_address', 'user_agent',
      ...(forensic ? ['diff_before', 'diff_after'] : []),
      'metadata',
    ];
    res.write(headers.join(',') + '\r\n');

    // Data rows
    for (const log of logs) {
      const rec = formatLogRecord(log, forensic);
      const row = [
        csvCell(rec.timestamp),
        csvCell(rec.userId),
        csvCell(rec.userName),
        csvCell(rec.userEmail),
        csvCell(rec.action),
        csvCell(rec.entityType),
        csvCell(rec.entityId),
        csvCell(rec.ipAddress),
        csvCell(rec.userAgent),
        ...(forensic
          ? [csvCell(JSON.stringify(rec.diffBefore)), csvCell(JSON.stringify(rec.diffAfter))]
          : []),
        csvCell(JSON.stringify(rec.metadata)),
      ];
      res.write(row.join(',') + '\r\n');
    }

    res.end();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLogRecord(log: any, forensic: boolean) {
  return {
    timestamp:  log.createdAt?.toISOString?.() ?? log.createdAt ?? '',
    userId:     log.userId ?? '',
    userName:   log.user?.fullName ?? '',
    userEmail:  log.user?.email ?? '',
    action:     log.action ?? '',
    entityType: log.entityType ?? '',
    entityId:   log.entityId ?? '',
    ipAddress:  log.ipAddress ?? '',
    userAgent:  log.userAgent ?? '',
    ...(forensic ? { diffBefore: log.diffBefore ?? null, diffAfter: log.diffAfter ?? null } : {}),
    metadata:   log.metadata ?? {},
  };
}

/** Wrap a cell value for CSV — escape quotes and wrap in quotes */
function csvCell(value: unknown): string {
  const str = value == null ? '' : String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}
