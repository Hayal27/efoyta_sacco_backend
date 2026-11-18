import { Router } from 'express';
import { cmsController } from './cms.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';

export const cmsRouter = Router();

// Protect all CMS routes with JWT auth
cmsRouter.use(authMiddleware);

// Overview stats
cmsRouter.get('/overview-stats', (req, res) => cmsController.getOverviewStats(req as any, res));

// Articles
cmsRouter.get('/articles', (req, res) => cmsController.listArticles(req as any, res));
cmsRouter.post('/articles', (req, res) => cmsController.createArticle(req as any, res));
cmsRouter.put('/articles/:id', (req, res) => cmsController.updateArticle(req as any, res));
cmsRouter.delete('/articles/:id', (req, res) => cmsController.deleteArticle(req as any, res));

// Membership Leads / Online Applications
cmsRouter.get('/applications', (req, res) => cmsController.listApplications(req as any, res));
cmsRouter.patch('/applications/:id/status', (req, res) => cmsController.updateApplicationStatus(req as any, res));
cmsRouter.delete('/applications/:id', (req, res) => cmsController.deleteApplication(req as any, res));

// Inquiries / Messages
cmsRouter.get('/inquiries', (req, res) => cmsController.listInquiries(req as any, res));
cmsRouter.patch('/inquiries/:id/status', (req, res) => cmsController.updateInquiryStatus(req as any, res));
cmsRouter.delete('/inquiries/:id', (req, res) => cmsController.deleteInquiry(req as any, res));

// Hero Banners
cmsRouter.get('/banners', (req, res) => cmsController.listBanners(req as any, res));
cmsRouter.post('/banners', (req, res) => cmsController.createBanner(req as any, res));
cmsRouter.put('/banners/:id', (req, res) => cmsController.updateBanner(req as any, res));
cmsRouter.delete('/banners/:id', (req, res) => cmsController.deleteBanner(req as any, res));

// Branches
cmsRouter.get('/branches', (req, res) => cmsController.listBranches(req as any, res));
cmsRouter.post('/branches', (req, res) => cmsController.createBranch(req as any, res));
cmsRouter.put('/branches/:id', (req, res) => cmsController.updateBranch(req as any, res));
cmsRouter.delete('/branches/:id', (req, res) => cmsController.deleteBranch(req as any, res));

// FAQs
cmsRouter.get('/faqs', (req, res) => cmsController.listFaqs(req as any, res));
cmsRouter.post('/faqs', (req, res) => cmsController.createFaq(req as any, res));
cmsRouter.put('/faqs/:id', (req, res) => cmsController.updateFaq(req as any, res));
cmsRouter.delete('/faqs/:id', (req, res) => cmsController.deleteFaq(req as any, res));

// Publications
cmsRouter.get('/publications', (req, res) => cmsController.listPublications(req as any, res));
cmsRouter.post('/publications', (req, res) => cmsController.createPublication(req as any, res));
cmsRouter.put('/publications/:id', (req, res) => cmsController.updatePublication(req as any, res));
cmsRouter.delete('/publications/:id', (req, res) => cmsController.deletePublication(req as any, res));

// Settings
cmsRouter.get('/settings', (req, res) => cmsController.listSettings(req as any, res));
cmsRouter.post('/settings/bulk', (req, res) => cmsController.saveSettingsBulk(req as any, res));

// Upload Media (Local file storage)
cmsRouter.post('/upload', (req, res) => cmsController.uploadMedia(req as any, res));

