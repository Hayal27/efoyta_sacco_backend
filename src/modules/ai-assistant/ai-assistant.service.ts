import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { ValidationError } from '../../shared/errors/app-error';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Fetches quick live system stats to give context to the AI assistant
 */
async function fetchSystemContext() {
  try {
    const [memberCount, savingsAgg, activeLoansAgg] = await Promise.all([
      (prisma as any).member.count().catch(() => 0),
      (prisma as any).savingsAccount.aggregate({ _sum: { balance: true } }).catch(() => ({ _sum: { balance: 0 } })),
      (prisma as any).loan.aggregate({ where: { status: 'active' }, _sum: { principal: true } }).catch(() => ({ _sum: { principal: 0 } })),
    ]);

    return {
      memberCount,
      totalSavingsBalance: Number(savingsAgg._sum?.balance || 0),
      totalActiveLoansAmount: Number(activeLoansAgg._sum?.principal || 0),
    };
  } catch (err) {
    return { memberCount: 0, totalSavingsBalance: 0, totalActiveLoansAmount: 0 };
  }
}

/**
 * Generates AI chat responses powered by Groq API (Llama 3.3 70B)
 */
export async function generateAiResponse(params: {
  message: string;
  history?: ChatMessage[];
  contextPage?: string;
  userRole?: string;
  userName?: string;
}) {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    throw new ValidationError('Groq API Key is missing. Please configure GROQ_API_KEY in your environment.');
  }

  const liveStats = await fetchSystemContext();

  const systemPrompt = `You are Efoyta AI Assistant (እፎይታ ኤአይ ረዳት), an expert AI agent embedded inside the EFOYTA Cooperative Management System.
Your job is to provide clear, friendly, and step-by-step guidance to cooperative staff, managers, auditors, and administrators.

--- LIVE SYSTEM CONTEXT ---
- Total Registered Members: ${liveStats.memberCount}
- Total Savings Volume: ${liveStats.totalSavingsBalance.toLocaleString()} ETB
- Total Active Loans Disbursed: ${liveStats.totalActiveLoansAmount.toLocaleString()} ETB
- Active User Name: ${params.userName || 'Staff Operator'}
- Active User Role: ${params.userRole || 'Admin'}
- Current View/Page: ${params.contextPage || 'Dashboard'}

--- KNOWLEDGE BASE & SYSTEM CAPABILITIES ---
1. Members & KYC (/members): Register new members, upload identity docs, status (active, suspended, exited), KYC verification.
2. Savings (/savings): Account types (voluntary, regular, children, woman, loan saving). Processing deposits, withdrawals, standing orders.
3. Loans & Credit (/loans): Application -> Credit Score Review -> Approval -> Disbursement Queue -> Repayment processing -> Loss Reserves & Rescheduling.
4. GL Accounting & CoA (/accounting): Chart of Accounts tree (1 Assets, 2 Liabilities, 3 Equity, 4 Revenues, 5 Expenses). Atomic Journal Processor (requires strictly balanced Σ Debits = Σ Credits). Financial statements & Asset Depreciation.
5. Shares & Dividends (/shares): Share purchasing, transfers, automated Dividend Engine (flat rate or time-weighted).
6. Daily Collections (/collections): Field entry sheets, focal agent handovers, and reconciliation.
7. Database & Backups (/backups): Full database snapshots (JSON/SQL), CSV/JSON module exporters, atomic restore console, and automated scheduled backup cron.
8. Audit Trail Logs (/audit-logs): Unalterable forensic audit trail, before/after diff tracking, regulatory compliance export engine.
9. Settings (/settings): User management, role permissions (RBAC), branch management.

--- INSTRUCTIONS FOR RESPONDING ---
- Respond in the language used by the user. If the user writes in Amharic (አማርኛ), reply in clear, professional Amharic. If in English, reply in English. If bilingual, provide Amharic with key terms in English.
- Be concise, direct, and actionable. Use bullet points and step-by-step guides.
- If asked how to perform a task in the system, specify the exact menu path (e.g. "Go to **Loans > Disbursement Queue**").
- You can explain financial calculations, accounting double-entry rules, and cooperative regulations.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(params.history || []).slice(-6), // Include last 6 conversation turns
    { role: 'user', content: params.message },
  ];

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.5,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[ai-assistant] Groq API error response:', errText);
      // Fallback try with llama3-8b-8192
      const fallbackRes = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages,
          temperature: 0.5,
          max_tokens: 1024,
        }),
      });
      if (!fallbackRes.ok) {
        throw new Error('AI Assistant service unavailable. Please try again.');
      }
      const fallbackData = await fallbackRes.json();
      return {
        reply: fallbackData.choices[0]?.message?.content || 'No response generated.',
        model: 'llama3-8b-8192',
      };
    }

    const data = await res.json();
    const reply = data.choices[0]?.message?.content || 'No response generated.';

    return {
      reply,
      model: GROQ_MODEL,
    };
  } catch (err: any) {
    console.error('[ai-assistant] AI error:', err);
    throw new ValidationError(err.message || 'Failed to connect to AI Assistant service');
  }
}
