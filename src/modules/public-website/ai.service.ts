export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiChatResponse {
  reply: string;
  suggestions: string[];
  actionLinks?: Array<{ label: string; url: string }>;
}

export class PublicAiService {
  /**
   * Process a message from a public website visitor / member
   */
  async processQuery(userMessage: string, history: ChatMessage[] = []): Promise<AiChatResponse> {
    const text = userMessage.trim();
    const lower = text.toLowerCase();

    // Check if user is asking in Amharic
    const isAmharic = /[\u1200-\u137F]/.test(text);

    // ── 1. LOAN CALCULATION / SIMULATION INTENT ──────────────────────────────
    const loanMatch = lower.match(/(?:calculate|simulate|loan of|compute|payment for|borrow)\s*(\d[\d,\.]*)\s*(?:etb|birr)?(?:\s*(?:for|over|in)?\s*(\d+)\s*(?:months|years|yrs|mo)?)?/i) ||
      text.match(/(\d[\d,\.]*)\s*(?:ብር|etb)?(?:\s*(?:ለ)?(\d+)\s*(?:ወር|አመት)?)?/i);

    if ((lower.includes('calculate') || lower.includes('simulate') || lower.includes('monthly payment') || isAmharic && (text.includes('አስላ') || text.includes('ክፍያ'))) && loanMatch) {
      const rawAmount = loanMatch[1].replace(/,/g, '');
      const amount = parseFloat(rawAmount);

      if (!isNaN(amount) && amount > 1000) {
        let months = 12;
        if (loanMatch[2]) {
          const rawDuration = parseInt(loanMatch[2], 10);
          if (lower.includes('year') || lower.includes('yr') || (isAmharic && text.includes('አመት'))) {
            months = rawDuration * 12;
          } else {
            months = rawDuration;
          }
        }

        const annualRate = 0.125; // 12.5% p.a.
        const monthlyRate = annualRate / 12;
        const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
        const totalPayment = monthlyPayment * months;
        const totalInterest = totalPayment - amount;

        if (isAmharic) {
          return {
            reply: `📊 **የብድር ክፍያ ስሌት ውጤት (የተገመተ)**\n\n` +
              `* **የተጠየቀው የብድር መጠን:** ${amount.toLocaleString()} ብር (ETB)\n` +
              `* **የመክፈያ ጊዜ:** ${months} ወራት (${(months / 12).toFixed(1)} ዓመታት)\n` +
              `* **ዓመታዊ የወለድ ተመን:** 12.5% (የህብረት ስራ ማህበር ምቹ ተመን)\n` +
              `* **ወርሃዊ መደበኛ ክፍያ:** **${monthlyPayment.toFixed(2).toLocaleString()} ብር**\n` +
              `* **አጠቃላይ ወለድ:** ${totalInterest.toFixed(2).toLocaleString()} ብር\n` +
              `* **አጠቃላይ ተመላሽ ክፍያ:** ${totalPayment.toFixed(2).toLocaleString()} ብር\n\n` +
              `💡 *ውጤቱ አመላካች ሲሆን ትክክለኛውን ውል የብድር ኮሚቴው ማመልከቻዎን ሲመረምር ይወስናል።*`,
            suggestions: [
              'የብድር ማመልከቻ ቅጽ',
              'የብድር ቅድመ-ሁኔታዎች ምንድን ናቸው?',
              'የቁጠባ ትርፍ ድርሻ (ዲቪደንድ) ስንት ነው?',
            ],
            actionLinks: [
              { label: 'በካልኩሌተር አስላ (Full Calculator)', url: '/calculators' },
              { label: 'ለብድር ያመልክቱ', url: '/products' },
            ],
          };
        }

        return {
          reply: `📊 **Estimated Loan Repayment Simulation**\n\n` +
            `* **Principal Loan Amount:** ${amount.toLocaleString()} ETB\n` +
            `* **Repayment Term:** ${months} Months (${(months / 12).toFixed(1)} Years)\n` +
            `* **Cooperative Interest Rate:** 12.5% p.a.\n` +
            `* **Estimated Monthly Payment:** **${monthlyPayment.toFixed(2).toLocaleString()} ETB / month**\n` +
            `* **Total Interest:** ${totalInterest.toFixed(2).toLocaleString()} ETB\n` +
            `* **Total Repayment Amount:** ${totalPayment.toFixed(2).toLocaleString()} ETB\n\n` +
            `💡 *Efoyta SACCO processes credit approvals within 48 hours for verified members.*`,
          suggestions: [
            'How can I qualify for this loan?',
            'What documents are required?',
            'What is the maximum loan limit?',
          ],
          actionLinks: [
            { label: 'Interactive Loan Calculator', url: '/calculators' },
            { label: 'Explore Loan Products', url: '/products' },
          ],
        };
      }
    }

    // ── 2. DIVIDENDS & INTEREST RATES ────────────────────────────────────────
    if (lower.includes('dividend') || lower.includes('interest') || lower.includes('yield') || lower.includes('rate') || lower.includes('return') ||
      (isAmharic && (text.includes('ትርፍ') || text.includes('ዲቪደንድ') || text.includes('ወለድ')))) {
      if (isAmharic) {
        return {
          reply: `🌟 **የእፎይታ የቁጠባና ብድር ህብረት ስራ ማህበር የትርፍ ድርሻ (ዲቪደንድ)**\n\n` +
            `* **የቅርብ ጊዜ የተረጋገጠ የትርፍ ድርሻ:** **18.5% በዓመት** (በጠቅላላ ጉባኤ የጸደቀ)\n` +
            `* **መደበኛ የቁጠባ ወለድ:** ከ 8.0% እስከ 10.5%\n` +
            `* **የጊዜ ገደብ ተቀማጭ (Fixed Time Deposit):** እስከ 14.5% ዓመታዊ ወለድ\n\n` +
            `በእፎይታ የቁጠባ ሂሳብ መክፈት ማለት የባንክ ደንበኛ መሆን ብቻ ሳይሆን የማህበሩ ባለቤትና የትርፍ ተጋሪ መሆን ነው!`,
          suggestions: [
            'የቁጠባ ሂሳብ አይነቶች',
            'አባል ለመሆን ምን ያስፈልጋል?',
            'የብድር ወለድ ተመን ስንት ነው?',
          ],
          actionLinks: [
            { label: 'የቁጠባና ተቀማጭ አይነቶች', url: '/products' },
            { label: 'አባል ይሁኑ', url: '/membership' },
          ],
        };
      }

      return {
        reply: `🌟 **Efoyta SACCO Dividend Yield & Interest Rates**\n\n` +
          `* **Audited Annual Dividend Yield:** **18.5% p.a.** (Approved at 2026 AGM)\n` +
          `* **Regular Savings Interest:** 8.0% – 10.5% p.a.\n` +
          `* **Fixed Time Deposits:** Up to 14.5% annual return based on term maturity\n` +
          `* **Loan Lending Rates:** Subsidized cooperative rates starting from 11.5% to 13.5% p.a.\n\n` +
          `Unlike commercial banks where shareholders take all profits, Efoyta SACCO distributes **100% of audited profits** back to its 45,800+ members in proportion to their savings and share equity.`,
        suggestions: [
          'How do I open a high-yield savings account?',
          'What are your loan products?',
          'How do I track my membership application?',
        ],
        actionLinks: [
          { label: 'View Products & Rates', url: '/products' },
          { label: 'Open Account Online', url: '/membership' },
        ],
      };
    }

    // ── 3. MEMBERSHIP & HOW TO JOIN ──────────────────────────────────────────
    if (lower.includes('join') || lower.includes('membership') || lower.includes('become a member') || lower.includes('eligibility') || lower.includes('register') ||
      (isAmharic && (text.includes('አባል') || text.includes('መመዝገብ') || text.includes('መቀላቀል')))) {
      if (isAmharic) {
        return {
          reply: `📝 **የእፎይታ ኃ/የተ/የቁ/ብ/ህ/ሥ ማህበር አባል የመሆን ቅደም-ተከተል**\n\n` +
            `1. **መታወቂያ:** የታደሰ የቀበሌ፣ የመንጃ ፍቃድ ወይም የፓስፖርት ኮፒ\n` +
            `2. **የመመዝገቢያ ክፍያ:** 500 ብር (አንድ ጊዜ የሚከፈል)\n` +
            `3. **ዝቅተኛ የአክሲዮን መዋጮ:** 1,000 ብር (10 አክሲዮኖች)\n` +
            `4. **ወርሃዊ መደበኛ ቁጠባ:** ከ 500 ብር ጀምሮ እንደ ፍላጎትዎ\n\n` +
            `🚀 በድረ-ገጻችን አማካኝነት በ3 ደቂቃ ውስጥ የኦንላይን ቅድመ-ምዝገባ ማጠናቀቅ ይችላሉ!`,
          suggestions: [
            'የኦንላይን አባልነት ፎርም',
            'ያመለከትኩትን ማመልከቻ እንዴት እከታተላለሁ?',
            'የቅርንጫፎች አድራሻ የት ነው?',
          ],
          actionLinks: [
            { label: 'ኦንላይን ያመልክቱ (3 ደቂቃ)', url: '/membership' },
            { label: 'ማመልከቻ ይከታተሉ', url: '/track-application' },
          ],
        };
      }

      return {
        reply: `📝 **How to Become an Efoyta SACCO Member**\n\n` +
          `1. **Identification:** Valid Ethiopian Kebele ID, Resident Card, or Passport.\n` +
          `2. **Registration Fee:** 500 ETB (one-time non-refundable administration fee).\n` +
          `3. **Minimum Share Capital:** 1,000 ETB (10 shares @ 100 ETB each, giving you full shareholder voting rights).\n` +
          `4. **Monthly Savings Commitment:** Minimum 500 ETB per month.\n\n` +
          `**Member Benefits:**\n` +
          `* Right to vote in General Assembly meetings\n` +
          `* Historic 18.5% annual dividend earnings\n` +
          `* Fast-tracked business and personal credit up to 3x your total savings`,
        suggestions: [
          'Start Online Application',
          'Track existing application status',
          'What are the loan requirements?',
        ],
        actionLinks: [
          { label: 'Apply Online Now', url: '/membership' },
          { label: 'Track Application Status', url: '/track-application' },
        ],
      };
    }

    // ── 4. LOAN PRODUCTS & REQUIREMENTS ──────────────────────────────────────
    if (lower.includes('loan') || lower.includes('credit') || lower.includes('borrow') || lower.includes('financing') ||
      (isAmharic && (text.includes('ብድር') || text.includes('ተበዳሪ') || text.includes('ማበደር')))) {
      if (isAmharic) {
        return {
          reply: `💼 **የእፎይታ የቁጠባና ብድር ማህበር የብድር አይነቶች**\n\n` +
            `* **የንግድና ኢንቨስትመንት ብድር (Business & SME Loans):** ለአነስተኛና መካከለኛ ንግዶች ማጠናከሪያ\n` +
            `* **የግብርና ብድር (Agricultural Credit):** ለአርሶ አደሮችና ማህበራት የምርት ማሳደጊያ\n` +
            `* **የአስቸኳይ ጊዜ ብድር (Emergency Loan):** በ 48 ሰዓታት ውስጥ ውሳኔ የሚያገኝ ፈጣን ብድር\n` +
            `* **የግልና የፍጆታ ብድር (Personal & Consumer Loans):** ለመኖሪያ ቤት፣ ለመኪና እና ለትምህርት\n\n` +
            `📌 **ዋና መስፈርቶች:** ቢያንስ ለ6 ወራት መደበኛ ቆጣቢ መሆን እና ተገቢውን ዋስትና (Guarantor or Collateral) ማቅረብ።`,
          suggestions: [
            'የብድር ክፍያ ስሌት አስላ',
            'የወለድ መጠኑ ስንት ነው?',
            'የአባልነት ማመልከቻ',
          ],
          actionLinks: [
            { label: 'ሁሉንም የብድር አይነቶች ይመልከቱ', url: '/products' },
            { label: 'የብድር ካልኩሌተር', url: '/calculators' },
          ],
        };
      }

      return {
        reply: `💼 **Efoyta SACCO Credit & Loan Facilities**\n\n` +
          `* **Business & SME Loans:** Flexible working capital and inventory credit up to 36 months repayment.\n` +
          `* **Agricultural Financing:** Aligned with planting and harvest crop cycles for cooperatives and farmers.\n` +
          `* **Fast-Track Emergency Loans:** Instant decision within **48 hours** for urgent medical, education, or business cash flow needs.\n` +
          `* **Asset & Vehicle Loans:** Financing for machinery, transport vehicles, and property acquisition.\n\n` +
          `**Eligibility Guidelines:**\n` +
          `* Active membership with at least 6 months of continuous monthly savings.\n` +
          `* Borrow up to 3x your accumulated savings balance.\n` +
          `* Low cooperative interest rates from 11.5% to 13.5% p.a.`,
        suggestions: [
          'Simulate a monthly payment',
          'What are the interest rates?',
          'How can I become a member?',
        ],
        actionLinks: [
          { label: 'Loan Products & Tariffs', url: '/products' },
          { label: 'Simulate Loan Repayment', url: '/calculators' },
        ],
      };
    }

    // ── 5. BRANCHES, LOCATION & CONTACT ──────────────────────────────────────
    if (lower.includes('branch') || lower.includes('location') || lower.includes('address') || lower.includes('phone') || lower.includes('contact') || lower.includes('office') || lower.includes('hours') ||
      (isAmharic && (text.includes('ቅርንጫፍ') || text.includes('አድራሻ') || text.includes('ስልክ') || text.includes('ቢሮ') || text.includes('ቦሌ')))) {
      if (isAmharic) {
        return {
          reply: `📍 **የእፎይታ የቁጠባና ብድር ህ/ሥ/ማ አድራሻና ቅርንጫፎች**\n\n` +
            `* **ዋና መሥሪያ ቤት:** አዲስ አበባ፣ ቦሌ መድኃኒዓለም፣ እፎይታ ታወር፣ 4ኛ ፎቅ\n` +
            `* **የነጻ ስልክ መስመር (Toll-Free):** **8844**\n` +
            `* **የስልክ ቁጥር:** +251 11 667 8900 / +251 911 234 567\n` +
            `* **ኢሜይል:** info@efoytasacco.com\n` +
            `* **የሥራ ሰዓት:** ሰኞ - ዓርብ: 2:00 ጠዋት - 11:00 ከሰዓት | ቅዳሜ: 2:00 ጠዋት - 6:30 ቀትር`,
          suggestions: [
            'የቅርንጫፎች ዝርዝር ካርታ',
            'አባል ለመሆን ምን ያስፈልጋል?',
            'የኦንላይን ባንኪንግ ፖርታል',
          ],
          actionLinks: [
            { label: 'የቅርንጫፎች ሙሉ ማውጫ', url: '/branches' },
            { label: 'መልእክት ይላኩልን', url: '/contact' },
          ],
        };
      }

      return {
        reply: `📍 **Efoyta SACCO Headquarters & Branch Network**\n\n` +
          `* **Headquarters:** Bole Medhanialem, Efoyta Tower, 4th Floor, Addis Ababa, Ethiopia.\n` +
          `* **Toll-Free Hotline:** **8844** (Free from any Ethio Telecom line)\n` +
          `* **Direct Telephones:** +251 11 667 8900 / +251 11 667 8901\n` +
          `* **Official Email:** info@efoytasacco.com\n` +
          `* **Business Hours:**\n` +
          `  - Monday to Friday: 8:00 AM – 5:00 PM\n` +
          `  - Saturday: 8:00 AM – 12:30 PM\n` +
          `  - Sundays & Public Holidays: Closed (24/7 Member Web Portal Available)`,
        suggestions: [
          'Locate branches on map',
          'Send an inquiry message',
          'Access Online Member Portal',
        ],
        actionLinks: [
          { label: 'Branch Directory', url: '/branches' },
          { label: 'Contact Us', url: '/contact' },
        ],
      };
    }

    // ── 6. GREETINGS & GENERAL ASSISTANCE ─────────────────────────────────────
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || (isAmharic && (text.includes('ሰላም') || text.includes('እንደምን')))) {
      if (isAmharic) {
        return {
          reply: `👋 **ሰላም! እንኳን ወደ እፎይታ የቁጠባና ብድር ህብረት ስራ ማህበር በሰላም መጡ!**\n\n` +
            `እኔ የእፎይታ ዲጂታል የፋይናንስ ረዳት ነኝ። በምን ልርዳዎት?\n\n` +
            `* 💰 **የቁጠባ ሂሳቦችና የትርፍ ድርሻ (18.5% ዓመታዊ ዲቪደንድ)**\n` +
            `* ⚡ **የንግድና የግል ብድሮች (የ 48 ሰዓት ፈጣን ውሳኔ)**\n` +
            `* 📝 **የአባልነት ማመልከቻና ቅድመ-ሁኔታዎች**\n` +
            `* 🧮 **የብድር ወርሃዊ ክፍያ ስሌት**\n` +
            `* 📍 **የቅርንጫፎች አድራሻና የሥራ ሰዓት**`,
          suggestions: [
            'የ18.5% የትርፍ ድርሻ ዝርዝር',
            'አባል መሆን እፈልጋለሁ',
            'ብድር ማስላት እፈልጋለሁ',
            'የቅርንጫፎች አድራሻ',
          ],
          actionLinks: [
            { label: 'አባል ይሁኑ', url: '/membership' },
            { label: 'የብድር ካልኩሌተር', url: '/calculators' },
          ],
        };
      }

      return {
        reply: `👋 **Welcome to Efoyta SACCO!**\n\n` +
          `I am your 24/7 AI Financial Assistant. How can I assist you with your cooperative financial needs today?\n\n` +
          `Here are popular topics I can help you with:\n` +
          `* 💰 **Savings & Audited 18.5% Annual Dividends**\n` +
          `* ⚡ **Business, Farming & Emergency Loans (48-Hour Approval)**\n` +
          `* 📝 **Membership Pre-Registration & Application Tracking**\n` +
          `* 🧮 **Instant Loan Repayment & Savings Calculators**\n` +
          `* 📍 **Branch Directory & Office Operating Hours**`,
        suggestions: [
          'What are your dividend rates?',
          'How do I apply for a loan?',
          'How can I become a member?',
          'Where is your head office?',
        ],
        actionLinks: [
          { label: 'Apply Online', url: '/membership' },
          { label: 'Interactive Calculators', url: '/calculators' },
        ],
      };
    }

    // ── 7. FALLBACK INTELLIGENT COOPERATIVE ADVISOR ───────────────────────────
    if (isAmharic) {
      return {
        reply: `🤝 **የእፎይታ SACCO የፋይናንስ ረዳት**\n\n` +
          `ስለ ማህበራችን አገልግሎቶች፣ የቁጠባ አይነቶች፣ የትርፍ ድርሻ (18.5%)፣ የብድር አሰጣጥ እና አባልነት ዙሪያ ማንኛውንም ጥያቄ ማቅረብ ይችላሉ።\n\n` +
          `እንዲሁም ለፈጣን ድጋፍ በነጻ የጥሪ መስመራችን **8844** በስራ ሰዓት መደወል ይችላሉ።`,
        suggestions: [
          'የቁጠባና ዲቪደንድ ተመን',
          'የብድር አይነቶች',
          'አባል ለመሆን የሚያስፈልጉ ነገሮች',
          'የቢሮ አድራሻ',
        ],
        actionLinks: [
          { label: 'የምርቶች ዝርዝር', url: '/products' },
          { label: 'ማመልከቻ ቅጽ', url: '/membership' },
        ],
      };
    }

    return {
      reply: `🤝 **Efoyta SACCO AI Advisor**\n\n` +
        `I am here to help you navigate our savings products, competitive loan solutions, membership benefits, and cooperative dividend returns.\n\n` +
        `You can also reach our member relations team toll-free at **8844** or visit our Bole Medhanialem Headquarters.`,
      suggestions: [
        'What are your dividend rates?',
        'Calculate a 200,000 ETB loan',
        'How do I join Efoyta SACCO?',
        'Where are your branches?',
      ],
      actionLinks: [
        { label: 'Explore Products & Rates', url: '/products' },
        { label: 'Apply for Membership', url: '/membership' },
      ],
    };
  }
}

export const publicAiService = new PublicAiService();

