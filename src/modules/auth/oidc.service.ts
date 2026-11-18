import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError, UnauthorizedError } from '../../shared/errors/app-error';

interface JwkKey {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x5c?: string[];
  [key: string]: any;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface OidcConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  scopes_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
}

// In-memory cache for remote JWKS and OIDC configuration
let jwksCache: { keys: JwkKey[]; expiresAt: number } | null = null;
let oidcConfigCache: { config: OidcConfiguration; expiresAt: number } | null = null;

// PKCE / State store for in-flight authorization flows (TTL: 10 minutes)
interface InFlightFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
}
const flowStore = new Map<string, InFlightFlow>();

// Periodic cleanup of expired flow states
setInterval(() => {
  const now = Date.now();
  for (const [key, flow] of flowStore.entries()) {
    if (now - flow.createdAt > 10 * 60 * 1000) {
      flowStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Discovers OIDC endpoints from the IdP (Keycloak, Temenos Identity, etc.)
 */
export async function getRemoteOidcConfig(): Promise<OidcConfiguration> {
  const issuer = env.OIDC_ISSUER_URL?.replace(/\/+$/, '');
  if (!issuer) {
    throw new AppError(500, 'OIDC_ISSUER_URL is not configured.');
  }

  const now = Date.now();
  if (oidcConfigCache && oidcConfigCache.expiresAt > now) {
    return oidcConfigCache.config;
  }

  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new AppError(502, `Failed to fetch OIDC discovery document from ${discoveryUrl} (Status: ${response.status})`);
  }

  const config = (await response.json()) as OidcConfiguration;
  oidcConfigCache = {
    config,
    expiresAt: now + 60 * 60 * 1000, // 1 hour cache
  };
  return config;
}

/**
 * Fetches and caches remote JWKS from the IdP
 */
export async function getRemoteJwks(): Promise<JwkKey[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  let jwksUri = env.OIDC_JWKS_URI;
  if (!jwksUri) {
    const config = await getRemoteOidcConfig();
    jwksUri = config.jwks_uri;
  }

  const response = await fetch(jwksUri, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new AppError(502, `Failed to fetch JWKS from ${jwksUri} (Status: ${response.status})`);
  }

  const data = (await response.json()) as JwksResponse;
  jwksCache = {
    keys: data.keys || [],
    expiresAt: now + 30 * 60 * 1000, // 30 minutes cache
  };
  return jwksCache.keys;
}

/**
 * Verifies an RS256 token against remote IdP JWKS (Keycloak / Temenos)
 */
export async function verifyOidcToken(token: string): Promise<any> {
  const decodedHeader = jwt.decode(token, { complete: true })?.header;
  if (!decodedHeader || typeof decodedHeader !== 'object') {
    throw new UnauthorizedError('Malformed token header');
  }

  const keys = await getRemoteJwks();
  let matchedKey: JwkKey | undefined;

  if (decodedHeader.kid) {
    matchedKey = keys.find((k) => k.kid === decodedHeader.kid);
  }
  if (!matchedKey && keys.length > 0) {
    // Fallback: match by alg or first RSA key
    matchedKey = keys.find((k) => k.kty === 'RSA') || keys[0];
  }

  if (!matchedKey) {
    throw new UnauthorizedError('Unable to find matching public key in IdP JWKS to verify token');
  }

  // Convert JWK to Node.js KeyObject
  const publicKey = crypto.createPublicKey({
    key: matchedKey as any,
    format: 'jwk',
  });

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      publicKey,
      {
        algorithms: ['RS256', 'RS384', 'RS512', 'ES256'],
      },
      (err, decoded) => {
        if (err) {
          if (err instanceof jwt.TokenExpiredError) {
            return reject(new UnauthorizedError('OIDC token expired'));
          }
          return reject(new UnauthorizedError(`OIDC signature verification failed: ${err.message}`));
        }
        resolve(decoded);
      }
    );
  });
}

/**
 * Resolves or Just-In-Time (JIT) provisions a user from verified OIDC claims
 */
export async function resolveOrProvisionOidcUser(claims: any) {
  const oidcSub = claims.sub || claims.id;
  if (!oidcSub) {
    throw new UnauthorizedError('OIDC token lacks a "sub" (subject) claim');
  }

  const email = (claims.email || claims.preferred_username || `${oidcSub}@sso.local`).toLowerCase().trim();
  const fullName = claims.name || claims.preferred_username || claims.given_name || 'SSO User';

  // 1. Check if user is already mapped by oidcSub
  let user = await prisma.user.findFirst({
    where: { oidcSub },
    include: { role: true },
  });

  // 2. Fallback: match by email
  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (user) {
      // Link the existing account to this OIDC subject
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          oidcSub,
          idpProvider: env.OIDC_PROVIDER_NAME || 'keycloak',
        },
        include: { role: true },
      });
    }
  }

  // 3. JIT Provision new user if not present
  if (!user) {
    // Map Keycloak / Temenos roles to SACCO role
    const externalRoles = [
      ...(claims.realm_access?.roles || []),
      ...(claims.resource_access?.[env.OIDC_CLIENT_ID || '']?.roles || []),
      ...(Array.isArray(claims.roles) ? claims.roles : []),
    ].map((r: string) => r.toLowerCase());

    let targetRoleSlug = 'member';
    if (externalRoles.some((r) => ['super_admin', 'superadmin', 'realm-admin'].includes(r))) {
      targetRoleSlug = 'super_admin';
    } else if (externalRoles.some((r) => ['admin', 'administrator', 'corebanking_admin'].includes(r))) {
      targetRoleSlug = 'admin';
    } else if (externalRoles.some((r) => ['manager', 'branch_manager'].includes(r))) {
      targetRoleSlug = 'manager';
    } else if (externalRoles.some((r) => ['cashier', 'teller'].includes(r))) {
      targetRoleSlug = 'cashier';
    } else if (externalRoles.some((r) => ['auditor', 'compliance'].includes(r))) {
      targetRoleSlug = 'auditor';
    } else if (externalRoles.some((r) => ['focal_agent', 'field_agent'].includes(r))) {
      targetRoleSlug = 'focal_agent';
    }

    const assignedRole = await prisma.role.findFirst({
      where: { slug: targetRoleSlug },
    });

    user = await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash: '', // External account; local password login disabled
        roleId: assignedRole?.id || null,
        oidcSub,
        idpProvider: env.OIDC_PROVIDER_NAME || 'keycloak',
        isExternal: true,
        isActive: true,
        mustChangePassword: false,
        isEmailVerified: Boolean(claims.email_verified),
      },
      include: { role: true },
    });
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Your account has been deactivated in the cooperative system.');
  }

  return user;
}

/**
 * Builds the Authorization URL for PKCE Authorization Code flow
 */
export async function buildAuthorizationUrl(redirectHost?: string): Promise<{ url: string; state: string }> {
  const config = await getRemoteOidcConfig();
  const clientId = env.OIDC_CLIENT_ID;
  if (!clientId) {
    throw new AppError(500, 'OIDC_CLIENT_ID is not configured');
  }

  // Generate cryptographic PKCE verifier & challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  flowStore.set(state, {
    state,
    nonce,
    codeVerifier,
    createdAt: Date.now(),
  });

  const redirectUri = env.OIDC_REDIRECT_URI || `${redirectHost || ''}/api/v1/auth/oidc/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: redirectUri,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${config.authorization_endpoint}?${params.toString()}`,
    state,
  };
}

/**
 * Exchanges the Authorization Code for Tokens at the IdP
 */
export async function exchangeAuthorizationCode(code: string, state: string, redirectHost?: string) {
  const flow = flowStore.get(state);
  if (!flow) {
    throw new UnauthorizedError('Invalid or expired OIDC state parameter. Please retry signing in.');
  }
  flowStore.delete(state);

  const config = await getRemoteOidcConfig();
  const clientId = env.OIDC_CLIENT_ID!;
  const clientSecret = env.OIDC_CLIENT_SECRET;
  const redirectUri = env.OIDC_REDIRECT_URI || `${redirectHost || ''}/api/v1/auth/oidc/callback`;

  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: flow.codeVerifier,
  });

  if (clientSecret) {
    bodyParams.append('client_secret', clientSecret);
  }

  const response = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: bodyParams.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new AppError(response.status, `Failed to exchange OIDC code: ${errorBody}`);
  }

  const tokens = await response.json();
  const tokenToVerify = tokens.id_token || tokens.access_token;
  const claims = await verifyOidcToken(tokenToVerify);

  return {
    tokens,
    claims,
  };
}

/**
 * Returns standard OpenID UserInfo response (RFC 5322 / OpenID Core 1.0)
 */
export async function getStandardUserInfo(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      branches: { include: { branch: true } },
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const primaryBranch = user.branches.find((b) => b.isPrimary)?.branch || user.branches[0]?.branch;

  return {
    sub: user.oidcSub || user.id,
    name: user.fullName || user.email,
    preferred_username: user.email.split('@')[0],
    email: user.email,
    email_verified: user.isEmailVerified,
    phone_number: user.phone || undefined,
    phone_number_verified: user.isPhoneVerified,
    roles: user.role ? [user.role.slug] : ['member'],
    role_name: user.role?.name || 'Member',
    branch: primaryBranch
      ? {
          id: primaryBranch.id,
          code: primaryBranch.code,
          name: primaryBranch.name,
        }
      : null,
    zoneinfo: 'Africa/Addis_Ababa',
    updated_at: Math.floor(user.updatedAt.getTime() / 1000),
  };
}

/**
 * Generates OpenID Connect Discovery JSON for this system
 */
export function getLocalOpenIdConfiguration(origin: string): OidcConfiguration {
  const base = origin.replace(/\/+$/, '');
  return {
    issuer: `${base}/api/v1`,
    authorization_endpoint: `${base}/api/v1/auth/oidc/login`,
    token_endpoint: `${base}/api/v1/auth/login`,
    userinfo_endpoint: `${base}/api/v1/auth/userinfo`,
    jwks_uri: `${base}/api/v1/auth/jwks`,
    response_types_supported: ['code', 'token', 'id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256', 'HS256'],
    scopes_supported: ['openid', 'profile', 'email', 'phone', 'roles'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    claims_supported: ['sub', 'name', 'preferred_username', 'email', 'email_verified', 'roles', 'branch'],
  };
}

