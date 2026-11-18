import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error';

/**
 * Role-based access control middleware factory.
 * Usage: router.get('/path', authMiddleware, rbac('admin', 'cashier'), handler)
 */
export function rbac(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    // super_admin always has access
    if (req.user.role === 'super_admin') {
      return next();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Role '${req.user.role}' is not allowed. Required: ${allowedRoles.join(', ')}`,
      );
    }
    next();
  };
}
