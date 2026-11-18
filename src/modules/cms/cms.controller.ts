import type { Request, Response } from 'express';
import { cmsService } from './cms.service';

export class CmsController {
  // Stats
  async getOverviewStats(_req: Request, res: Response) {
    try {
      const stats = await cmsService.getOverviewStats();
      res.json({ success: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Articles
  async listArticles(req: Request, res: Response) {
    try {
      const { page, limit, search, category, isPublished } = req.query;
      const result = await cmsService.listArticles({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        category: category ? String(category) : undefined,
        isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async createArticle(req: Request, res: Response) {
    try {
      const article = await cmsService.createArticle(req.body);
      res.status(201).json({ success: true, data: article });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateArticle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updateArticle(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteArticle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deleteArticle(id);
      res.json({ success: true, message: 'Article deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Applications
  async listApplications(req: Request, res: Response) {
    try {
      const { page, limit, search, status, city } = req.query;
      const result = await cmsService.listApplications({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        status: status ? String(status) : undefined,
        city: city ? String(city) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async updateApplicationStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updateApplicationStatus(id, {
        ...req.body,
        reviewedById: req.user?.id,
      });
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteApplication(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deleteApplication(id);
      res.json({ success: true, message: 'Application deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Inquiries
  async listInquiries(req: Request, res: Response) {
    try {
      const { page, limit, search, status } = req.query;
      const result = await cmsService.listInquiries({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        status: status ? String(status) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async updateInquiryStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updateInquiryStatus(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteInquiry(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deleteInquiry(id);
      res.json({ success: true, message: 'Inquiry deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Banners
  async listBanners(_req: Request, res: Response) {
    try {
      const banners = await cmsService.listBanners();
      res.json({ success: true, data: banners });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async createBanner(req: Request, res: Response) {
    try {
      const banner = await cmsService.createBanner(req.body);
      res.status(201).json({ success: true, data: banner });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateBanner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updateBanner(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteBanner(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deleteBanner(id);
      res.json({ success: true, message: 'Banner removed successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Branches
  async listBranches(req: Request, res: Response) {
    try {
      const { page, limit, search, city } = req.query;
      const result = await cmsService.listBranches({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        city: city ? String(city) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async createBranch(req: Request, res: Response) {
    try {
      const branch = await cmsService.createBranch(req.body);
      res.status(201).json({ success: true, data: branch });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateBranch(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updateBranch(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteBranch(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deleteBranch(id);
      res.json({ success: true, message: 'Branch removed successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // FAQs
  async listFaqs(req: Request, res: Response) {
    try {
      const { page, limit, search, category } = req.query;
      const result = await cmsService.listFaqs({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        category: category ? String(category) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async createFaq(req: Request, res: Response) {
    try {
      const faq = await cmsService.createFaq(req.body);
      res.status(201).json({ success: true, data: faq });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateFaq(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updateFaq(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteFaq(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deleteFaq(id);
      res.json({ success: true, message: 'FAQ deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Publications
  async listPublications(req: Request, res: Response) {
    try {
      const { page, limit, search, category } = req.query;
      const result = await cmsService.listPublications({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        category: category ? String(category) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async createPublication(req: Request, res: Response) {
    try {
      const pub = await cmsService.createPublication(req.body);
      res.status(201).json({ success: true, data: pub });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updatePublication(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await cmsService.updatePublication(id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deletePublication(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await cmsService.deletePublication(id);
      res.json({ success: true, message: 'Publication deleted successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Settings
  async listSettings(_req: Request, res: Response) {
    try {
      const settings = await cmsService.listSettings();
      res.json({ success: true, data: settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async saveSettingsBulk(req: Request, res: Response) {
    try {
      const { settings, group } = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ success: false, error: 'Settings object is required.' });
      }
      await cmsService.saveSettingsBulk(settings, group);
      res.json({ success: true, message: 'Settings saved successfully.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // Upload Media
  async uploadMedia(req: Request, res: Response) {
    try {
      const { fileName, fileData, folder } = req.body;
      const result = await cmsService.saveUploadedMedia({ fileName, fileData, folder });
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export const cmsController = new CmsController();

