import { prisma } from '../../config/prisma';
import { createFullBackup, listBackups, deleteBackup } from '../../modules/backup/backup.service';

/**
 * Ensures a default backup schedule config exists in DB
 */
export async function getOrCreateScheduleConfig() {
  let schedule = await (prisma as any).backupSchedule.findUnique({
    where: { id: 'default-schedule' },
  });

  if (!schedule) {
    schedule = await (prisma as any).backupSchedule.create({
      data: {
        id: 'default-schedule',
        isEnabled: true,
        frequency: 'DAILY',
        timeOfDay: '02:00',
        retentionCount: 30,
        nextRunAt: calculateNextRun(new Date(), 'DAILY', '02:00'),
      },
    });
  }

  return schedule;
}

/**
 * Updates schedule configuration settings
 */
export async function updateScheduleConfig(data: {
  isEnabled?: boolean;
  frequency?: string;
  timeOfDay?: string;
  retentionCount?: number;
}) {
  const current = await getOrCreateScheduleConfig();
  const isEnabled = data.isEnabled ?? current.isEnabled;
  const frequency = data.frequency ?? current.frequency;
  const timeOfDay = data.timeOfDay ?? current.timeOfDay;
  const retentionCount = data.retentionCount ?? current.retentionCount;

  const nextRunAt = calculateNextRun(new Date(), frequency, timeOfDay);

  const updated = await (prisma as any).backupSchedule.update({
    where: { id: 'default-schedule' },
    data: {
      isEnabled,
      frequency,
      timeOfDay,
      retentionCount,
      nextRunAt,
    },
  });

  return updated;
}

/**
 * Evaluates and triggers automated backup if due
 */
export async function evaluateAndRunScheduledBackup() {
  try {
    const schedule = await getOrCreateScheduleConfig();
    if (!schedule.isEnabled) return;

    const now = new Date();
    const isDue = !schedule.lastRunAt || (schedule.nextRunAt && now >= new Date(schedule.nextRunAt));

    if (!isDue) return;

    console.info(`[backup-schedule] 🔄 Running automated scheduled backup (${schedule.frequency})...`);

    // 1. Generate full backup snapshot
    const backupResult = await createFullBackup('Automated Scheduler');

    // 2. Prune old backups to respect retention policy
    await pruneOldBackups(schedule.retentionCount);

    // 3. Update schedule record
    const nextRun = calculateNextRun(now, schedule.frequency, schedule.timeOfDay);
    await (prisma as any).backupSchedule.update({
      where: { id: 'default-schedule' },
      data: {
        lastRunAt: now,
        nextRunAt: nextRun,
      },
    });

    console.info(`[backup-schedule] ✅ Automated backup created: ${backupResult.backup?.filename}. Next run: ${nextRun.toISOString()}`);
  } catch (err) {
    console.error('[backup-schedule] ❌ Automated backup run failed:', err);
  }
}

/**
 * Auto-prunes oldest backup files if total count exceeds retention count
 */
async function pruneOldBackups(maxRetention: number) {
  try {
    const allBackups = await listBackups();
    if (allBackups.length <= maxRetention) return;

    const sorted = [...allBackups].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const toDeleteCount = sorted.length - maxRetention;
    const toDelete = sorted.slice(0, toDeleteCount);

    for (const b of toDelete) {
      console.info(`[backup-schedule] 🗑️ Pruning old backup file exceeding retention (${maxRetention}): ${b.filename}`);
      await deleteBackup(b.filename);
    }
  } catch (err) {
    console.error('[backup-schedule] Pruning old backups failed:', err);
  }
}

/**
 * Helper: calculates next run timestamp based on frequency & timeOfDay
 */
export function calculateNextRun(from: Date, frequency: string, timeOfDay: string): Date {
  const [hoursStr, minutesStr] = timeOfDay.split(':');
  const hours = parseInt(hoursStr || '2', 10);
  const minutes = parseInt(minutesStr || '0', 10);

  const next = new Date(from);
  next.setHours(hours, minutes, 0, 0);

  if (frequency === 'HOURLY') {
    next.setMinutes(from.getMinutes() + 60);
    return next;
  }

  // If timeOfDay for today has passed, push to tomorrow
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }

  if (frequency === 'WEEKLY') {
    // Run on next Sunday
    const day = next.getDay();
    const diff = (7 - day) % 7;
    if (diff > 0) next.setDate(next.getDate() + diff);
  } else if (frequency === 'MONTHLY') {
    // Run on 1st of next month
    next.setDate(1);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next;
}

// ── Start background evaluation loop every 10 minutes ──────────────────────
export function initBackupSchedulerLoop() {
  console.info('⏱️ Backup scheduler loop initialized (checking every 10 mins)');
  // Immediate check on server start
  setTimeout(() => {
    evaluateAndRunScheduledBackup().catch(() => {});
  }, 5000);

  // Periodic check every 10 minutes
  setInterval(() => {
    evaluateAndRunScheduledBackup().catch(() => {});
  }, 10 * 60 * 1000);
}
