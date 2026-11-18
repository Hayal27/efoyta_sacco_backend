import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import { env } from '../../config/env';
import { ZodError } from 'zod';

/**
 * Global error handler middleware.
 * Must be registered LAST in the Express app (after all routes).
 * Converts AppError, ZodError, and unexpected errors into consistent JSON responses.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Handle known operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      // Include field-level details if present (from ValidationError)
      ...((err as AppError & { details?: unknown }).details && {
        details: (err as AppError & { details?: unknown }).details,
      }),
    });
    return;
  }

  // Zod errors that somehow bypass the validate middleware
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Prisma unique constraint violation (P2002)
  if (
    err instanceof Error &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  ) {
    const target = String((err as any)?.meta?.target || '').toLowerCase();
    let message = 'A record with this value already exists';
    let field = 'unknown';

    if (target.includes('phone')) {
      message = 'A member with this phone number already exists. Each member must have a unique phone number.';
      field = 'phone';
    } else if (target.includes('email')) {
      message = 'A member with this email address already exists. Each member must have a unique email address.';
      field = 'email';
    } else if (target.includes('nationalidfin') || target.includes('fin')) {
      message = 'A member with this Fayda FIN already exists. Each member must have a unique FIN number.';
      field = 'nationalIdFin';
    } else if (target.includes('nationalid') || target.includes('fan')) {
      message = 'A member with this Fayda FAN / National ID already exists. Each member must have a unique National ID.';
      field = 'nationalId';
    } else if (target.includes('membercode')) {
      message = 'A member with this Member Code already exists.';
      field = 'memberCode';
    }

    res.status(409).json({
      success: false,
      error: message,
      code: 'DUPLICATE_IDENTIFIER',
      field,
    });
    return;
  }

  // Unknown / unexpected errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal server error' : String(err),
    code: 'INTERNAL_ERROR',
  });
}
