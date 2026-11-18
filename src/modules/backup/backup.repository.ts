import { prisma } from '../../config/prisma';

export const backupRepo = {
  async listBackups() {
    const backups = await (prisma as any).databaseBackup.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return backups.map((b: any) => ({
      ...b,
      fileSize: Number(b.fileSize),
    }));
  },

  async findByFilename(filename: string) {
    const backup = await (prisma as any).databaseBackup.findUnique({
      where: { filename },
    });
    if (!backup) return null;
    return {
      ...backup,
      fileSize: Number(backup.fileSize),
    };
  },

  async createBackupRecord(data: {
    filename: string;
    filePath: string;
    fileSize: number;
    backupType: string;
    moduleName?: string;
    recordCounts?: Record<string, number>;
    checksum?: string;
    createdBy?: string;
  }) {
    const created = await (prisma as any).databaseBackup.create({
      data: {
        filename: data.filename,
        filePath: data.filePath,
        fileSize: BigInt(data.fileSize),
        backupType: data.backupType,
        moduleName: data.moduleName ?? null,
        recordCounts: data.recordCounts ?? undefined,
        checksum: data.checksum ?? null,
        createdBy: data.createdBy ?? 'System',
      },
    });
    return {
      ...created,
      fileSize: Number(created.fileSize),
    };
  },

  async deleteBackupRecord(filename: string) {
    return (prisma as any).databaseBackup.delete({
      where: { filename },
    });
  },
};
