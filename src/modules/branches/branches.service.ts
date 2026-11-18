import { NotFoundError, BusinessRuleError } from '../../shared/errors/app-error';
import * as branchesRepo from './branches.repository';

export async function listBranches() {
  return branchesRepo.listBranches();
}

export async function getBranch(id: string) {
  const branch = await branchesRepo.findById(id);
  if (!branch) throw new NotFoundError('Branch');
  return branch;
}

export async function createBranch(data: {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
}) {
  if (!data.name || !data.code) throw new BusinessRuleError('Name and code are required');
  return branchesRepo.createBranch(data);
}

export async function updateBranch(id: string, data: Record<string, any>) {
  const branch = await branchesRepo.findById(id);
  if (!branch) throw new NotFoundError('Branch');
  return branchesRepo.updateBranch(id, data);
}

export async function deleteBranch(id: string) {
  const branch = await branchesRepo.findById(id);
  if (!branch) throw new NotFoundError('Branch');
  if (branch._count.users > 0) {
    throw new BusinessRuleError('Cannot delete a branch that has assigned users. Remove all users first.');
  }
  return branchesRepo.deleteBranch(id);
}

export async function assignUser(branchId: string, userId: string, isPrimary: boolean) {
  const branch = await branchesRepo.findById(branchId);
  if (!branch) throw new NotFoundError('Branch');
  return branchesRepo.assignUser(branchId, userId, isPrimary);
}

export async function removeUser(branchId: string, userId: string) {
  return branchesRepo.removeUser(branchId, userId);
}

export async function getUserBranches(userId: string) {
  return branchesRepo.getUserBranches(userId);
}
