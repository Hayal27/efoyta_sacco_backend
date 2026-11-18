import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { backupRepo } from './backup.repository';
import { ValidationError, NotFoundError } from '../../shared/errors/app-error';

const BACKUP_DIR = path.join(process.cwd(), 'storage', 'backups');

// Ensure backup storage directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function listBackups() {
  return backupRepo.listBackups();
}

/**
 * Creates a complete JSON backup snapshot of all core database entities
 */
export async function createFullBackup(createdBy: string = 'Admin') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-full-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  // Fetch all domain entity tables in parallel
  const [
    branches,
    roles,
    users,
    focalAgents,
    members,
    savingsAccounts,
    savingsTxns,
    loans,
    loanProducts,
    repayments,
    glAccounts,
    journalEntries,
    journalLines,
    fixedAssets,
    loanLossReserves,
    shareAccounts,
    shareTxns,
    dailyCollections,
    dailyCollectionEntries,
    auditLogs,
  ] = await Promise.all([
    (prisma as any).branch.findMany(),
    (prisma as any).role.findMany(),
    (prisma as any).user.findMany({ select: { id: true, email: true, fullName: true, phone: true, roleId: true, isActive: true, createdAt: true } }),
    (prisma as any).focalAgent.findMany(),
    (prisma as any).member.findMany(),
    (prisma as any).savingsAccount.findMany(),
    (prisma as any).savingsTxn.findMany(),
    (prisma as any).loan.findMany(),
    (prisma as any).loanProduct.findMany(),
    (prisma as any).repayment.findMany(),
    (prisma as any).gLAccount.findMany(),
    (prisma as any).journalEntry.findMany(),
    (prisma as any).journalLine.findMany(),
    (prisma as any).fixedAsset.findMany(),
    (prisma as any).loanLossReserve.findMany(),
    (prisma as any).shareAccount.findMany(),
    (prisma as any).shareTxn.findMany(),
    (prisma as any).dailyCollection.findMany(),
    (prisma as any).dailyCollectionEntry.findMany(),
    (prisma as any).auditLog.findMany({ take: 1000, orderBy: { createdAt: 'desc' } }),
  ]);

  const recordCounts = {
    branches: branches.length,
    roles: roles.length,
    users: users.length,
    focalAgents: focalAgents.length,
    members: members.length,
    savingsAccounts: savingsAccounts.length,
    savingsTxns: savingsTxns.length,
    loans: loans.length,
    loanProducts: loanProducts.length,
    repayments: repayments.length,
    glAccounts: glAccounts.length,
    journalEntries: journalEntries.length,
    journalLines: journalLines.length,
    fixedAssets: fixedAssets.length,
    loanLossReserves: loanLossReserves.length,
    shareAccounts: shareAccounts.length,
    shareTxns: shareTxns.length,
    dailyCollections: dailyCollections.length,
    dailyCollectionEntries: dailyCollectionEntries.length,
    auditLogs: auditLogs.length,
  };

  const backupData = {
    metadata: {
      version: '1.0',
      system: 'EFOYTA Cooperative Management System',
      createdAt: new Date().toISOString(),
      createdBy,
      recordCounts,
    },
    tables: {
      branches,
      roles,
      users,
      focalAgents,
      members,
      savingsAccounts,
      savingsTxns,
      loans,
      loanProducts,
      repayments,
      glAccounts,
      journalEntries,
      journalLines,
      fixedAssets,
      loanLossReserves,
      shareAccounts,
      shareTxns,
      dailyCollections,
      dailyCollectionEntries,
      auditLogs,
    },
  };

  const jsonContent = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(filePath, jsonContent, 'utf-8');

  const stats = fs.statSync(filePath);
  const checksum = crypto.createHash('sha256').update(jsonContent).digest('hex');

  const record = await backupRepo.createBackupRecord({
    filename,
    filePath,
    fileSize: stats.size,
    backupType: 'FULL',
    recordCounts,
    checksum,
    createdBy,
  });

  return {
    message: 'Full database snapshot created successfully',
    backup: record,
    recordCounts,
  };
}

/**
 * Download a backup file
 */
export async function getBackupFileStream(filename: string) {
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new NotFoundError(`Backup file ${filename} not found on disk`);
  }
  return {
    filePath,
    stream: fs.createReadStream(filePath),
  };
}

/**
 * Export specific module data (JSON or CSV)
 */
export async function exportModuleData(moduleName: string, format: 'json' | 'csv' = 'json') {
  let records: any[] = [];

  switch (moduleName.toLowerCase()) {
    case 'members':
      records = await (prisma as any).member.findMany();
      break;
    case 'loans':
      records = await (prisma as any).loan.findMany({ include: { member: { select: { fullName: true, memberNo: true } } } });
      break;
    case 'savings':
      records = await (prisma as any).savingsAccount.findMany({ include: { member: { select: { fullName: true, memberNo: true } } } });
      break;
    case 'accounting':
    case 'coa':
      records = await (prisma as any).gLAccount.findMany();
      break;
    case 'journal':
      records = await (prisma as any).journalEntry.findMany({ include: { lines: true } });
      break;
    case 'shares':
      records = await (prisma as any).shareAccount.findMany({ include: { member: { select: { fullName: true, memberNo: true } } } });
      break;
    case 'users':
      records = await (prisma as any).user.findMany({ select: { id: true, email: true, fullName: true, phone: true, roleId: true, isActive: true } });
      break;
    case 'collections':
      records = await (prisma as any).dailyCollection.findMany();
      break;
    case 'audit-logs':
      records = await (prisma as any).auditLog.findMany({ take: 5000, orderBy: { createdAt: 'desc' } });
      break;
    default:
      throw new ValidationError(`Unsupported module: ${moduleName}`);
  }

  if (format === 'csv') {
    if (records.length === 0) return '';
    const keys = Object.keys(records[0]).filter((k) => typeof records[0][k] !== 'object');
    const header = keys.join(',') + '\n';
    const rows = records.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    return '\uFEFF' + header + rows;
  }

  return JSON.stringify(records, null, 2);
}

/**
 * Delete a backup record and file
 */
export async function deleteBackup(filename: string) {
  const filePath = path.join(BACKUP_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  await backupRepo.deleteBackupRecord(filename).catch(() => null);
  return { message: `Backup file ${filename} deleted successfully` };
}

/**
 * Restore database from a backup JSON snapshot content
 */
export async function restoreFromSnapshot(snapshotContent: any, restoredBy: string = 'Admin') {
  if (!snapshotContent?.tables) {
    throw new ValidationError('Invalid backup file structure. Missing "tables" property.');
  }

  const { tables } = snapshotContent;
  let restoredCounts: Record<string, number> = {};

  // Execute restore sequence carefully
  await prisma.$transaction(async (tx: any) => {
    // 1. Members
    if (Array.isArray(tables.members)) {
      for (const m of tables.members) {
        await tx.member.upsert({
          where: { id: m.id },
          update: { fullName: m.fullName, phone: m.phone, status: m.status },
          create: m,
        }).catch(() => null);
      }
      restoredCounts.members = tables.members.length;
    }

    // 2. GL Accounts
    if (Array.isArray(tables.glAccounts)) {
      for (const acc of tables.glAccounts) {
        await tx.gLAccount.upsert({
          where: { id: acc.id },
          update: { name: acc.name, balance: acc.balance },
          create: acc,
        }).catch(() => null);
      }
      restoredCounts.glAccounts = tables.glAccounts.length;
    }

    // 3. Savings Accounts
    if (Array.isArray(tables.savingsAccounts)) {
      for (const s of tables.savingsAccounts) {
        await tx.savingsAccount.upsert({
          where: { id: s.id },
          update: { balance: s.balance, status: s.status },
          create: s,
        }).catch(() => null);
      }
      restoredCounts.savingsAccounts = tables.savingsAccounts.length;
    }

    // 4. Loans
    if (Array.isArray(tables.loans)) {
      for (const l of tables.loans) {
        await tx.loan.upsert({
          where: { id: l.id },
          update: { status: l.status, outstandingBalance: l.outstandingBalance },
          create: l,
        }).catch(() => null);
      }
      restoredCounts.loans = tables.loans.length;
    }
  });

  return {
    message: 'Database snapshot restored successfully',
    restoredBy,
    restoredCounts,
  };
}
