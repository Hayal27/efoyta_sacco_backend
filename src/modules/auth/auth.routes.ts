import { Router } from 'express';
import { authRateLimit } from '../../shared/middleware/rate-limit.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { loginSchema, resetPasswordRequestSchema, resetPasswordSchema, changePasswordSchema } from '@coop/validation';
import * as authController from './auth.controller';
import * as oidcController from './oidc.controller';

export const authRouter = Router();

authRouter.post('/login', authRateLimit, authController.login);
authRouter.post('/refresh', authRateLimit, authController.refresh);
authRouter.post('/logout', authMiddleware, authController.logout);
authRouter.post('/password-reset/request', authRateLimit, authController.requestPasswordReset);
authRouter.post('/password-reset/confirm', authRateLimit, authController.confirmPasswordReset);
authRouter.post('/password-change', authMiddleware, authController.changePassword);
authRouter.post('/2fa/setup', authMiddleware, authController.setup2FA);
authRouter.post('/2fa/enable', authMiddleware, authController.enable2FA);
authRouter.get('/me', authMiddleware, authController.me);

// ── OpenID Connect (OIDC) & Enterprise SSO Routes (Keycloak / Temenos) ───────
authRouter.get('/oidc/config', oidcController.getOidcStatus);
authRouter.get('/oidc/login', oidcController.initiateOidcLogin);
authRouter.get('/oidc/callback', oidcController.handleOidcCallback);
authRouter.get('/userinfo', authMiddleware, oidcController.getUserInfo);


