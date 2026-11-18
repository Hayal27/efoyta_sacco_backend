import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../errors/app-error';
import type { AuthTokenPayload } from '@coop/types';

// Extend Express Request with the authenticated user payload
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Dual-Mode Authentication Middleware:
 * 1. Validates local SACCO HS256 JWT tokens.
 * 2. Validates standard RS256/ES256 OpenID Connect (OIDC) Bearer tokens from Keycloak,
 *    Temenos Identity, or enterprise IdPs using remote JWKS signature verification.
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }

  const token = authHeader.slice(7).trim();
  try {
    const decodedHeader = jwt.decode(token, { complete: true })?.header;
    const alg = decodedHeader?.alg || 'HS256';

    if (alg === 'HS256') {
      // Local SACCO Token
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthTokenPayload;
      req.user = {
        ...payload,
        userId: payload.userId || payload.sub,
        id: payload.id || payload.sub,
      };
      return next();
    }

    // RS256 / ES256: Enterprise OIDC Token (Keycloak / Temenos Identity)
    if (env.OIDC_ENABLED || env.OIDC_ISSUER_URL) {
      const { verifyOidcToken, resolveOrProvisionOidcUser } = await import('../../modules/auth/oidc.service');
      const claims = await verifyOidcToken(token);
      const user = await resolveOrProvisionOidcUser(claims);

      req.user = {
        sub: user.id,
        userId: user.id,
        id: user.id,
        email: user.email,
        role: (user.role?.slug as any) || 'admin',
        menuPermissions: (user.menuPermissions as any) ?? null,
      };
      return next();
    }

    throw new UnauthorizedError(`Unsupported token algorithm '${alg}'. Please authenticate with a valid token.`);
  } catch (err: any) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token expired'));
    }
    if (err instanceof UnauthorizedError) {
      return next(err);
    }
    return next(new UnauthorizedError(err?.message || 'Invalid token'));
  }
}
