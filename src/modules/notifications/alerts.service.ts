import { prisma } from '../../config/prisma';
import { emitToUser } from '../../config/socket';

// ── Roles that trigger a KYC upload alert to admins ──────────────────────────
const ALERT_ROLES = new Set(['focal_agent', 'cashier', 'crm_head', 'focal']);

/* ─────────────────────────────────────────────────────────────────────────────
   createKycUploadAlert
   Called after a non-admin uploads a KYC document.
   • Creates one SystemAlert DB row per admin/super_admin user.
   • Broadcasts in real-time via Socket.IO to each admin's personal room.
───────────────────────────────────────────────────────────────────────────── */
export async function createKycUploadAlert(opts: {
  actorId: string;
  actorName: string | null;
  actorRole: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  docType: string;
}) {
  if (!ALERT_ROLES.has(opts.actorRole)) return; // admins don't alert themselves

  // Find all admin-level users to notify
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { slug: { in: ['super_admin', 'admin'] } },
    },
    select: { id: true },
  });

  if (!admins.length) return;

  const docLabel = opts.docType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const title   = `KYC Document Uploaded`;
  const message = `${opts.actorName || opts.actorRole} uploaded a "${docLabel}" for member ${opts.memberName} (${opts.memberCode}).`;
  const createdAt = new Date().toISOString();

  // 1. Persist to DB
  await (prisma as any).systemAlert.createMany({
    data: admins.map((admin) => ({
      userId:    admin.id,
      memberId:  opts.memberId,
      event:     'kyc.document_uploaded',
      title,
      message,
      actorId:   opts.actorId,
      actorName: opts.actorName || opts.actorRole,
      actorRole: opts.actorRole,
      isRead:    false,
    })),
  });

  // 2. Real-time push via Socket.IO to each admin's personal room
  const socketPayload = {
    event:      'kyc.document_uploaded',
    title,
    message,
    memberId:   opts.memberId,
    memberName: opts.memberName,
    memberCode: opts.memberCode,
    actorRole:  opts.actorRole,
    actorName:  opts.actorName || opts.actorRole,
    createdAt,
  };

  for (const admin of admins) {
    emitToUser(admin.id, 'system_alert', socketPayload);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   createLoanAlert
   Triggered on loan application lifecycle events:
   • loan.submitted  -> Alert reviewers (admin, super_admin)
   • loan.reviewed   -> Alert final approvers (super_admin)
   • loan.approved   -> Alert applicant & focal agent / admins
   • loan.rejected   -> Alert applicant & focal agent / admins
───────────────────────────────────────────────────────────────────────────── */
export async function createLoanAlert(opts: {
  event: 'loan.submitted' | 'loan.reviewed' | 'loan.approved' | 'loan.rejected';
  loanId: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  principal: number;
  productName: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}) {
  let recipientRoleSlugs: string[] = [];
  let title = '';
  let message = '';
  let notifyTargetUsers: string[] = [];

  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'ETB' }).format(opts.principal);

  if (opts.event === 'loan.submitted') {
    recipientRoleSlugs = ['super_admin', 'admin', 'focal_agent', 'cashier'];
    title = 'New Loan Application Submitted';
    message = `${opts.memberName} (${opts.memberCode}) applied for ${opts.productName} of ${formattedAmount}. Needs initial review.`;
  } else if (opts.event === 'loan.reviewed') {
    recipientRoleSlugs = ['super_admin'];
    title = 'Loan Application Forwarded for Approval';
    message = `Loan application for ${opts.memberName} (${formattedAmount}) reviewed by ${opts.actorName || 'Reviewer'} & forwarded for final approval.`;
  } else if (opts.event === 'loan.approved') {
    recipientRoleSlugs = ['super_admin', 'admin', 'focal_agent', 'cashier'];
    title = 'Loan Application Approved';
    message = `Loan application for ${opts.memberName} (${formattedAmount}) has been APPROVED!`;
  } else if (opts.event === 'loan.rejected') {
    recipientRoleSlugs = ['super_admin', 'admin', 'focal_agent', 'cashier'];
    title = 'Loan Application Declined';
    message = `Loan application for ${opts.memberName} (${formattedAmount}) was DECLINED.`;
  }

  // Find recipient users by role
  const targetUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { slug: { in: recipientRoleSlugs } },
    },
    select: { id: true },
  });

  notifyTargetUsers = Array.from(new Set(targetUsers.map((u) => u.id)));
  if (!notifyTargetUsers.length) return;

  const createdAt = new Date().toISOString();

  // 1. Save SystemAlert rows
  await (prisma as any).systemAlert.createMany({
    data: notifyTargetUsers.map((userId) => ({
      userId,
      memberId: opts.memberId,
      event: opts.event,
      title,
      message,
      actorId: opts.actorId || null,
      actorName: opts.actorName || null,
      actorRole: opts.actorRole || null,
      isRead: false,
    })),
  });

  // 2. Push real-time alert via socket
  const socketPayload = {
    event: opts.event,
    title,
    message,
    loanId: opts.loanId,
    memberId: opts.memberId,
    memberName: opts.memberName,
    memberCode: opts.memberCode,
    createdAt,
  };

  for (const userId of notifyTargetUsers) {
    emitToUser(userId, 'system_alert', socketPayload);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   getUnreadAlerts  — fetch unread alerts for a given user
───────────────────────────────────────────────────────────────────────────── */
export async function getUnreadAlerts(userId: string) {
  return (prisma as any).systemAlert.findMany({
    where: { userId, isRead: false },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   markAlertRead  — mark a single alert as read
───────────────────────────────────────────────────────────────────────────── */
export async function markAlertRead(alertId: string, userId: string) {
  return (prisma as any).systemAlert.updateMany({
    where: { id: alertId, userId },
    data:  { isRead: true, readAt: new Date() },
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   markAllAlertsRead  — dismiss all unread alerts for a user
───────────────────────────────────────────────────────────────────────────── */
export async function markAllAlertsRead(userId: string) {
  return (prisma as any).systemAlert.updateMany({
    where: { userId, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
}
