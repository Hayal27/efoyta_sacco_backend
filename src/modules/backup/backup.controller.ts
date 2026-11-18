import { Request, Response } from 'express';
import * as backupService from './backup.service';

export async function listBackups(_req: Request, res: Response) {
  const backups = await backupService.listBackups();
  res.json({ status: 'success', data: backups });
}

export async function createFullBackup(req: Request, res: Response) {
  const createdBy = req.user?.sub ? `User ${req.user.sub}` : 'Admin';
  const result = await backupService.createFullBackup(createdBy);
  res.json({ status: 'success', data: result });
}

export async function downloadBackup(req: Request, res: Response) {
  const filename = req.params.filename;
  const { filePath } = await backupService.getBackupFileStream(filename);
  res.download(filePath, filename);
}

export async function exportModule(req: Request, res: Response) {
  const moduleName = req.params.moduleName;
  const format = (req.query.format as string) === 'csv' ? 'csv' : 'json';
  
  const content = await backupService.exportModuleData(moduleName, format);
  const timestamp = new Date().toISOString().split('T')[0];

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="export-${moduleName}-${timestamp}.csv"`);
    res.send(content);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="export-${moduleName}-${timestamp}.json"`);
    res.send(content);
  }
}

export async function deleteBackup(req: Request, res: Response) {
  const filename = req.params.filename;
  const result = await backupService.deleteBackup(filename);
  res.json({ status: 'success', data: result });
}

export async function restoreSnapshot(req: Request, res: Response) {
  const snapshotContent = req.body;
  const restoredBy = req.user?.sub ? `User ${req.user.sub}` : 'Admin';
  const result = await backupService.restoreFromSnapshot(snapshotContent, restoredBy);
  res.json({ status: 'success', data: result });
}

export async function getScheduleConfig(_req: Request, res: Response) {
  const { getOrCreateScheduleConfig } = await import('../../shared/jobs/backup-schedule.job');
  const config = await getOrCreateScheduleConfig();
  res.json({ status: 'success', data: config });
}

export async function updateScheduleConfig(req: Request, res: Response) {
  const { updateScheduleConfig: updateJob } = await import('../../shared/jobs/backup-schedule.job');
  const updated = await updateJob(req.body);
  res.json({ status: 'success', data: updated });
}

export async function runScheduledBackupNow(_req: Request, res: Response) {
  const { evaluateAndRunScheduledBackup, getOrCreateScheduleConfig } = await import('../../shared/jobs/backup-schedule.job');
  const config = await getOrCreateScheduleConfig();
  // Temporarily force lastRunAt to null to force immediate run
  const { prisma } = await import('../../config/prisma');
  await (prisma as any).backupSchedule.update({
    where: { id: 'default-schedule' },
    data: { lastRunAt: null },
  });
  await evaluateAndRunScheduledBackup();
  const updatedConfig = await getOrCreateScheduleConfig();
  res.json({ status: 'success', message: 'Scheduled backup evaluated and executed', data: updatedConfig });
}

