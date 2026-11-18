import { Router } from 'express';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import * as aiController from './ai-assistant.controller';

export const aiAssistantRouter = Router();

aiAssistantRouter.use(authMiddleware);

aiAssistantRouter.post('/chat', aiController.chatWithAi);
aiAssistantRouter.get('/suggestions', aiController.getSuggestions);
