import { Router } from 'express';
import { publicController } from './public.controller';
import { publicSubmissionLimiter, publicApiLimiter } from '../../shared/middleware/rate-limit.middleware';

export const publicRouter = Router();

// Apply public API limiter
publicRouter.use(publicApiLimiter);

// Aggregated home payload
publicRouter.get('/home', (req, res) => publicController.getHome(req, res));

// Articles
publicRouter.get('/articles', (req, res) => publicController.getArticles(req, res));
publicRouter.get('/articles/:slug', (req, res) => publicController.getArticleBySlug(req, res));

// Branches
publicRouter.get('/branches', (req, res) => publicController.getBranches(req, res));

// FAQs
publicRouter.get('/faqs', (req, res) => publicController.getFaqs(req, res));

// Publications
publicRouter.get('/publications', (req, res) => publicController.getPublications(req, res));

// Financial & Loan Simulator
publicRouter.post('/loan-calculator/simulate', (req, res) => publicController.simulateLoan(req, res));

// Contact Inquiries (rate limited)
publicRouter.post('/inquiries', publicSubmissionLimiter, (req, res) => publicController.submitInquiry(req, res));

// Membership Online Pre-Application (rate limited)
publicRouter.post('/membership-apply', publicSubmissionLimiter, (req, res) =>
  publicController.submitMembershipApplication(req, res)
);
publicRouter.get('/membership-apply/track/:applicationNumber', (req, res) =>
  publicController.trackApplication(req, res)
);

// Global settings
publicRouter.get('/settings', (req, res) => publicController.getSettings(req, res));

// AI Assistant Endpoint for Public Visitors & Members
publicRouter.post('/ai-chat', (req, res) => publicController.chatWithAi(req, res));

