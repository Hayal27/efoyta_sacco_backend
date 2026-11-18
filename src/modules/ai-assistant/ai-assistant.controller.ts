import { Request, Response } from 'express';
import * as aiService from './ai-assistant.service';

export async function chatWithAi(req: Request, res: Response) {
  const { message, history, contextPage } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ status: 'error', message: 'Message string is required' });
  }

  const result = await aiService.generateAiResponse({
    message,
    history,
    contextPage,
    userRole: (req.user as any)?.role || 'Admin',
    userName: (req.user as any)?.fullName || (req.user as any)?.sub || 'Staff',
  });

  res.json({ status: 'success', data: result });
}

export async function getSuggestions(req: Request, res: Response) {
  const page = (req.query.page as string) || 'dashboard';

  const suggestionsMap: Record<string, string[]> = {
    dashboard: [
      'የህብረት ስራ ማህበሩን አጠቃላይ ቁጠባና ብድር እንዴት ማየት እችላለሁ?',
      'How do I register a new member?',
      'እባክዎን የብድር ማመልከቻ ሂደቱን ያብራሩልኝ',
    ],
    members: [
      'የአዲስ አባል መመዝገቢያ ቅደም ተከተል ምንድን ነው?',
      'How to verify member KYC documents?',
      'አባል ከአባልነት ሲወጣ ምን ይደረጋል?',
    ],
    savings: [
      'የቁጠባ ሂሳብ አይነቶችና ልዩነቶቻቸው ምንድን ናቸው?',
      'How to record a savings deposit?',
      'የቋሚ ክፍያ ትእዛዝ (Standing Order) እንዴት ይሰራል?',
    ],
    loans: [
      'የብድር ማመልከቻ እንዴት ይገመገማል?',
      'How to disburse an approved loan?',
      'የብድር ስጋት ተቀማጭ (Loan Loss Reserve) እንዴት ይሰላል?',
    ],
    accounting: [
      'የጆርናል መመዝገቢያ (Atomic Journal) እንዴት ይሰራል?',
      'What is Chart of Accounts tree structure?',
      'የፋይናንስ መግለጫዎች (Balance Sheet) እንዴት ይወጣሉ?',
    ],
    backups: [
      'የሲስተም ባክአፕ እንዴት ይወሰዳል?',
      'How to configure automated daily backup schedule?',
      'የተወሰደ ባክአፕን ወደ ሲስተም ለመመለስ (Restore) ደረጃዎች ምንድን ናቸው?',
    ],
    audit: [
      'የሲስተም ክትትል (Audit Trail) መረጃዎችን እንዴት ማውረድ ይቻላል?',
      'What forensic information is captured in audit logs?',
    ],
  };

  const matchedKey = Object.keys(suggestionsMap).find((k) => page.toLowerCase().includes(k)) || 'dashboard';
  res.json({ status: 'success', data: suggestionsMap[matchedKey] });
}
