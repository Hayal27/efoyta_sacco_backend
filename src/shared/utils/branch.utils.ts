import { prisma } from '../../config/prisma';

/**
 * UserScope describes what data a user is allowed to see.
 *
 * - all:    super_admin / admin — no filter, sees everything
 * - branch: branch-assigned role — filtered by branchId(s)
 * - focal:  focal_agent role — filtered by focalAgentId
 */
export type UserScope =
  | { type: 'all' }
  | { type: 'branch'; branchIds: string[] }
  | { type: 'focal'; focalAgentId: string }
  | { type: 'crm'; focalAgentIds: string[] }
  | { type: 'self'; userId: string };

/**
 * Resolve the data scope for the logged-in user.
 * Used by dashboard, reports, and list queries.
 */
export async function getUserScope(userId: string): Promise<UserScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, focalAgent: true },
  });

  const roleSlug = user?.role?.slug ?? '';

  // Super admin, admin and auditor see everything on the dashboard.
  if (
    roleSlug === 'super_admin' ||
    roleSlug === 'admin' ||
    roleSlug === 'auditor'
  ) {
    return { type: 'all' };
  }

  // Focal agents see data scoped to their focal agent record
  if (roleSlug === 'focal_agent' && user?.focalAgent) {
    return { type: 'focal', focalAgentId: user.focalAgent.id };
  }

  // CRM Heads see data scoped to their assigned focal agents
  if (roleSlug === 'crm_head') {
    const focalAgents = await prisma.focalAgent.findMany({
      where: { crmHeadId: userId },
      select: { id: true },
    });
    return { type: 'crm', focalAgentIds: focalAgents.map(f => f.id) };
  }

  // Other roles (cashier, branch_manager, etc): scope by assigned branches
  const userBranches = await prisma.userBranch.findMany({
    where: { userId },
    select: { branchId: true },
  });

  if (userBranches.length > 0) {
    return { type: 'branch', branchIds: userBranches.map((ub) => ub.branchId) };
  }

  // Fallback — no branch assigned yet, show all
  return { type: 'all' };
}

/**
 * Legacy helper — returns branchIds array or null.
 * Kept for backwards compat with list endpoints.
 * New code should prefer getUserScope().
 */
export async function getUserBranchIds(userId: string): Promise<string[] | null> {
  const scope = await getUserScope(userId);
  if (scope.type === 'all') return null;
  if (scope.type === 'branch') return scope.branchIds;
  return null; // focal agents: list endpoints handle their own scoping
}

/**
 * Returns the primary branchId for a user, useful for stamping new transactions.
 */
export async function getPrimaryBranchId(userId: string): Promise<string | null> {
  const primary = await prisma.userBranch.findFirst({ where: { userId, isPrimary: true } });
  if (primary) return primary.branchId;
  const anyBranch = await prisma.userBranch.findFirst({ where: { userId } });
  return anyBranch ? anyBranch.branchId : null;
}

/**
 * Scope for the Self-Service Dashboard (only their own transactions or members)
 */
export async function getSelfServiceScope(userId: string): Promise<UserScope> {
  return { type: 'self', userId };
}

/**
 * Scope for the Branch Dashboard
 */
export async function getBranchScope(userId: string): Promise<UserScope> {
  const userBranches = await prisma.userBranch.findMany({
    where: { userId },
    select: { branchId: true },
  });
  if (userBranches.length > 0) {
    return { type: 'branch', branchIds: userBranches.map((ub) => ub.branchId) };
  }
  return { type: 'all' }; // Fallback
}

/**
 * Scope for the Coop Dashboard
 */
export function getCoopScope(): UserScope {
  return { type: 'all' };
}
