import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const auditLogsRepo = {
  async findAuditLogs(params: {
    skip?: number;
    take?: number;
    search?: string;
    action?: string;
    entityType?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { skip, take, search, action, entityType, userId, startDate, endDate } = params;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
        { ipAddress: { contains: search } },
        { user: { fullName: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip,
        take,
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Cast to include new fields (in case of older Prisma client cache)
    return { logs: logs as any[], total };
  },

  async findAuditLogById(id: string) {
    return prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  },

  async getAuditAnalytics(days: number = 14) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch recent logs for aggregation
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        user: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalCount = await prisma.auditLog.count();

    // 1. Action Breakdown
    const actionCounts: Record<string, number> = {};
    // 2. Entity Breakdown
    const entityCounts: Record<string, number> = {};
    // 3. User Breakdown
    const userCounts: Record<string, { count: number; name: string }> = {};
    // 4. Daily Activity Timeline
    const dailyCounts: Record<string, number> = {};

    recentLogs.forEach((log) => {
      // Action count
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

      // Entity count
      const entity = log.entityType || 'other';
      entityCounts[entity] = (entityCounts[entity] || 0) + 1;

      // User count
      if (log.user) {
        const uId = log.user.id;
        if (!userCounts[uId]) {
          userCounts[uId] = { count: 0, name: log.user.fullName };
        }
        userCounts[uId].count += 1;
      }

      // Date timeline (YYYY-MM-DD)
      const dateKey = log.createdAt.toISOString().split('T')[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
    });

    const actionBreakdown = Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const entityBreakdown = Object.entries(entityCounts)
      .map(([entityType, count]) => ({ entityType, count }))
      .sort((a, b) => b.count - a.count);

    const topUsers = Object.values(userCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const timeline = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      totalLogs: totalCount,
      recentPeriodDays: days,
      actionBreakdown,
      entityBreakdown,
      topUsers,
      timeline,
    };
  },
};

