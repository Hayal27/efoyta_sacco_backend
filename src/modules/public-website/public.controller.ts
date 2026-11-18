import { Request, Response } from 'express';
import { publicService } from './public.service';
import { publicAiService } from './ai.service';

export class PublicController {
  async getHome(req: Request, res: Response) {
    try {
      const data = await publicService.getHomePayload();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getArticles(req: Request, res: Response) {
    try {
      const { page, limit, category, search, featured } = req.query;
      const result = await publicService.getArticles({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        category: category ? String(category) : undefined,
        search: search ? String(search) : undefined,
        featured: featured !== undefined ? featured === 'true' : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getArticleBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const article = await publicService.getArticleBySlug(slug);
      if (!article) {
        return res.status(404).json({ success: false, error: 'Article not found or not published' });
      }
      res.json({ success: true, data: article });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getBranches(req: Request, res: Response) {
    try {
      const { city, search } = req.query;
      const branches = await publicService.getBranches({
        city: city ? String(city) : undefined,
        search: search ? String(search) : undefined,
      });
      res.json({ success: true, data: branches });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getFaqs(req: Request, res: Response) {
    try {
      const { category, search } = req.query;
      const faqs = await publicService.getFaqs({
        category: category ? String(category) : undefined,
        search: search ? String(search) : undefined,
      });
      res.json({ success: true, data: faqs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getPublications(req: Request, res: Response) {
    try {
      const { category, year, search } = req.query;
      const publications = await publicService.getPublications({
        category: category ? String(category) : undefined,
        year: year ? Number(year) : undefined,
        search: search ? String(search) : undefined,
      });
      res.json({ success: true, data: publications });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async submitInquiry(req: Request, res: Response) {
    try {
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      const inquiry = await publicService.submitInquiry({
        ...req.body,
        ipAddress,
      });
      res.status(201).json({
        success: true,
        message: 'Your inquiry has been submitted successfully. A SACCO officer will get back to you shortly.',
        data: {
          id: inquiry.id,
          createdAt: inquiry.createdAt,
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async submitMembershipApplication(req: Request, res: Response) {
    try {
      const application = await publicService.submitMembershipApplication(req.body);
      res.status(201).json({
        success: true,
        message: 'Membership pre-application received successfully. Please save your application tracking number.',
        data: {
          applicationNumber: application.applicationNumber,
          fullName: application.fullName,
          status: application.status,
          createdAt: application.createdAt,
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async trackApplication(req: Request, res: Response) {
    try {
      const { applicationNumber } = req.params;
      const result = await publicService.trackApplication(applicationNumber);
      if (!result) {
        return res.status(404).json({
          success: false,
          error: `No membership application found for tracking code: ${applicationNumber}`,
        });
      }
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  simulateLoan(req: Request, res: Response) {
    try {
      const { amount, termMonths, annualInterestRate, repaymentType } = req.body;
      const result = publicService.simulateLoan({
        amount: Number(amount),
        termMonths: Number(termMonths),
        annualInterestRate: Number(annualInterestRate),
        repaymentType,
      });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getSettings(req: Request, res: Response) {
    try {
      const settings = await publicService.getSettings();
      res.json({ success: true, data: settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async chatWithAi(req: Request, res: Response) {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, error: 'A valid text message is required.' });
      }
      const result = await publicAiService.processQuery(message, Array.isArray(history) ? history : []);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const publicController = new PublicController();

