import type { Request, Response } from 'express';
import { env } from '../../config/env';
import * as oidcService from './oidc.service';
import * as authService from './auth.service';
import { UnauthorizedError } from '../../shared/errors/app-error';

/**
 * Returns public OIDC SSO status and configuration for frontend
 */
export async function getOidcStatus(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      enabled: env.OIDC_ENABLED,
      providerName: env.OIDC_PROVIDER_NAME || 'Keycloak OIDC',
      loginUrl: '/api/v1/auth/oidc/login',
    },
  });
}

/**
 * Initiates the OpenID Connect Authorization Code Flow
 */
export async function initiateOidcLogin(req: Request, res: Response): Promise<void> {
  if (!env.OIDC_ENABLED) {
    res.status(400).json({ success: false, error: 'OIDC SSO is not enabled on this server' });
    return;
  }

  const host = `${req.protocol}://${req.get('host')}`;
  const { url } = await oidcService.buildAuthorizationUrl(host);
  res.redirect(url);
}

/**
 * Handles the redirect callback from Keycloak / Temenos Identity
 */
export async function handleOidcCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const errorMsg = (error_description as string) || (error as string) || 'Authentication failed at IdP';
    const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');
    res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errorMsg)}`);
    return;
  }

  if (!code || !state) {
    throw new UnauthorizedError('Missing required OIDC authorization code or state parameter');
  }

  const host = `${req.protocol}://${req.get('host')}`;
  const { claims } = await oidcService.exchangeAuthorizationCode(code as string, state as string, host);

  // Map or JIT provision user in database
  const user = await oidcService.resolveOrProvisionOidcUser(claims);

  // Issue standard SACCO session tokens
  const tokens = await authService.generateTokens(user);

  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, '');
  const accessToken = tokens.accessToken;
  const refreshToken = tokens.refreshToken;

  res.redirect(`${frontendUrl}/login?sso_token=${encodeURIComponent(accessToken)}&sso_refresh=${encodeURIComponent(refreshToken)}`);
}

/**
 * Standard OpenID Connect UserInfo Endpoint (RFC 5322 / OpenID Core 1.0)
 * Allows Temenos and external OIDC clients to query user profile details
 */
export async function getUserInfo(req: Request, res: Response): Promise<void> {
  if (!req.user?.sub) {
    throw new UnauthorizedError('User unauthenticated');
  }

  const userInfo = await oidcService.getStandardUserInfo(req.user.sub);
  res.json(userInfo);
}

/**
 * Standard OpenID Connect Discovery Endpoint
 */
export function getDiscovery(req: Request, res: Response): void {
  const origin = `${req.protocol}://${req.get('host')}`;
  const config = oidcService.getLocalOpenIdConfiguration(origin);
  res.json(config);
}
