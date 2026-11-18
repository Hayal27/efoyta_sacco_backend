import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../errors/app-error';

type ValidateTarget = 'body' | 'query' | 'params';

/**
 * Generic Zod validation middleware factory.
 * Usage: validate(memberSchema)           — validates req.body
 *        validate(searchSchema, 'query')  — validates req.query
 *
 * On success: assigns parsed/coerced data back to req[target].
 * On failure: throws ValidationError with field-level details.
 */
export function validate(schema: ZodSchema, target: ValidateTarget = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors as Record<string, string[]>;
      const message = Object.entries(details)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      const err = new ValidationError(message || 'Validation failed');
      (err as ValidationError & { details?: unknown }).details = details;
      throw err;
    }
    // Replace with coerced/parsed data (e.g. dates converted from strings)
    (req as Record<string, unknown>)[target] = result.data;
    next();
  };
}
