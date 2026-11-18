import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import * as portalController from './member-portal.controller';

export const memberPortalRouter = Router();

// Public routes for Member Portal channel
memberPortalRouter.post('/auth/login', portalController.loginMember);
memberPortalRouter.post('/auth/password-reset/request', portalController.requestPasswordReset);
memberPortalRouter.post('/auth/password-reset/confirm', portalController.confirmPasswordReset);

// Dual Auth Middleware: Accepts Bearer Token OR Inter-Service Channel API Key
function portalSecurityMiddleware(req: Request, res: Response, next: NextFunction) {
  const serviceKey = req.headers['x-portal-api-key'] as string;
  const forwardedUserId = req.headers['x-member-user-id'] as string;

  if (serviceKey === (process.env.PORTAL_API_KEY || 'efoyta-portal-secure-token-2026') && forwardedUserId) {
    req.user = {
      sub: forwardedUserId,
      email: (req.headers['x-member-email'] as string) || 'member@portal.efoyta',
      role: 'member',
    };
    return next();
  }

  // Otherwise standard JWT auth
  return authMiddleware(req, res, next);
}

// Protected routes
memberPortalRouter.use(portalSecurityMiddleware);

// 360 Dashboard Overview (Account status, Fayda KYC, Level, Net worth)
memberPortalRouter.get('/overview', portalController.getOverview);

// Savings Accounts & Passbook Transactions (with search, filter, pagination)
memberPortalRouter.get('/savings', portalController.getSavingsPassbook);

// Loans, Amortization Schedule, Eligibility Checker
memberPortalRouter.get('/loans', portalController.getLoanDetails);
memberPortalRouter.post('/loans/apply', portalController.applyLoan);

// Shares, Equity, Dividend History & Share Purchase Application
memberPortalRouter.get('/shares', portalController.getSharesData);
memberPortalRouter.post('/shares/buy', portalController.buyShares);

// Real-Time Transaction & System Notifications Feed
memberPortalRouter.get('/notifications', portalController.getNotifications);

// Multi-Bank Accounts Management
memberPortalRouter.get('/bank-accounts', portalController.listBankAccounts);
memberPortalRouter.post('/bank-accounts', portalController.addBankAccount);
memberPortalRouter.delete('/bank-accounts/:accountId', portalController.deleteBankAccount);

// Deposit & Withdrawal Requests with OTP Verification
memberPortalRouter.post('/transactions/request-otp', portalController.requestTransactionOtp);
memberPortalRouter.post('/transactions/deposit', portalController.createDepositRequest);
memberPortalRouter.post('/transactions/withdraw', portalController.createWithdrawalRequest);
memberPortalRouter.get('/transactions/my-requests', portalController.getMyTransactionRequests);

// Receipt / Deposit Slip Upload
memberPortalRouter.post('/upload-receipt', portalController.uploadReceipt);

