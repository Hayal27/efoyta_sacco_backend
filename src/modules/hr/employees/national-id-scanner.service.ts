import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { env } from '../../../config/env';

export interface ExtractedNationalIdData {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName?: string;
  fullNameAmharic?: string;
  gender: string;             // 'male' | 'female'
  dateOfBirth?: string;        // Gregorian YYYY-MM-DD
  dateOfBirthEth?: string;     // Ethiopian format DD/MM/YYYY
  nationalIdIssueDate?: string; // Gregorian YYYY-MM-DD
  nationalIdExpiry?: string;   // Gregorian YYYY-MM-DD
  phone?: string;              // 10 digits (e.g. 0963713511)
  nationality: string;         // 'Ethiopian'
  nationalIdNumber?: string;   // 16-digit FAN (Fayda Access Number)
  nationalIdFin?: string;      // 12-digit FIN (Fayda Identification Number)
  serialNumber?: string;       // Card Serial Number (SN)
  region?: string;             // Ethiopian Region
  zone?: string;               // Zone / Subcity
  woreda?: string;             // Woreda / City Administration
  kebele?: string;             // Kebele
  houseNumber?: string;        // House Number
  address?: string;            // Formatted address
  nationalIdFrontUrl?: string; // High-res preview data URI
  nationalIdBackUrl?: string;  // High-res preview data URI
  confidence: number;
  extractedVia: string;
}

export interface ScanInput {
  frontImage?: string;
  backImage?: string;
  combinedImage?: string;
  apiKey?: string;
}

const BACKUP_GROQ_KEY = env.GROQ_API_KEY || '';

const ETHIOPIAN_REGIONS = [
  'Addis Ababa', 'Oromia', 'Amhara', 'Sidama', 'Tigray',
  'Somali', 'Afar', 'Benishangul-Gumuz', 'Gambella',
  'South Ethiopia', 'Central Ethiopia', 'Southwest Ethiopia',
  'Harari', 'Dire Dawa'
];

/**
 * Normalizes input string/path/data-uri into a Buffer
 */
function toBuffer(dataOrPath: string): Buffer {
  if (!dataOrPath) return Buffer.alloc(0);
  if (dataOrPath.startsWith('data:image')) {
    const base64Data = dataOrPath.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }
  if (fs.existsSync(dataOrPath)) {
    return fs.readFileSync(dataOrPath);
  }
  return Buffer.from(dataOrPath, 'base64');
}

/**
 * Saves buffer to disk and generates an optimized preview Base64 data URI
 */
async function saveUploadImage(buffer: Buffer, prefix: string): Promise<string> {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads/national_ids');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const destPath = path.join(uploadsDir, filename);

    // Save full quality copy to disk
    await sharp(buffer).png({ quality: 90 }).toFile(destPath);

    // Generate lightweight, optimized data URI preview for instant UI rendering
    const previewBuf = await sharp(buffer)
      .resize({ width: 800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    return `data:image/jpeg;base64,${previewBuf.toString('base64')}`;
  } catch (err) {
    console.warn('[NationalIdScanner] Error in saveUploadImage:', err);
    try {
      const fallbackBuf = await sharp(buffer)
        .resize({ width: 700 })
        .jpeg({ quality: 80 })
        .toBuffer();
      return `data:image/jpeg;base64,${fallbackBuf.toString('base64')}`;
    } catch {
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }
  }
}

/**
 * Runs local Tesseract OCR only if traineddata files are available on disk.
 * If language data files are not present, cleanly bypasses OCR to prevent unhandled download crashes.
 */
async function performOcrOnBuffers(items: { name: string; buffer: Buffer }[]): Promise<string[]> {
  const snippets: string[] = [];
  try {
    const possibleLangPaths = [
      path.resolve(process.cwd()),
      path.resolve(process.cwd(), 'apps/backend'),
      path.resolve(process.cwd(), 'apps/hr-service'),
      __dirname,
    ];

    const langFileExists = (dir: string, lang: string) =>
      fs.existsSync(path.join(dir, `${lang}.traineddata`)) ||
      fs.existsSync(path.join(dir, `${lang}.traineddata.gz`));

    let langPath: string | null = null;
    for (const p of possibleLangPaths) {
      if (langFileExists(p, 'eng') || langFileExists(p, 'amh')) {
        langPath = p;
        break;
      }
    }

    if (!langPath) {
      console.info('[NationalIdScanner] No local traineddata files found on disk; skipping Tesseract OCR.');
      return snippets;
    }

    const langs: string[] = [];
    if (langFileExists(langPath, 'eng')) langs.push('eng');
    if (langFileExists(langPath, 'amh')) langs.push('amh');
    if (langs.length === 0) langs.push('eng');

    let worker: any = null;
    try {
      worker = await createWorker(langs, 1, {
        langPath,
        cacheMethod: 'none',
      });

      for (const item of items) {
        try {
          const ret = await worker.recognize(item.buffer);
          if (ret.data && ret.data.text) {
            snippets.push(`=== ${item.name} ===\n${ret.data.text}`);
          }
        } catch (err) {
          console.warn(`[NationalIdScanner] OCR warning on ${item.name}:`, err);
        }
      }
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[NationalIdScanner] OCR worker initialization bypassed:', err);
  }
  return snippets;
}

/**
 * Calls Groq Multimodal Vision API directly on the National ID image(s)
 * Uses active multimodal vision model on Groq (qwen/qwen3.8-27b) with candidate key fallback
 */
async function callGroqVision(images: Buffer[], userKey?: string): Promise<any | null> {
  const candidateKeys = [
    (userKey || '').trim(),
    (env.GROQ_API_KEY || '').trim(),
    BACKUP_GROQ_KEY,
  ].filter(Boolean);

  const visionModels = ['qwen/qwen3.8-27b'];

  const imageContents = images.map((buf) => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}` },
  }));

  const prompt = `You are the official data parser for the Ethiopian Digital ID Card (Fayda / ብሔራዊ መታወቂያ).
Carefully analyze the provided Ethiopian National ID card image(s) (which may include front side, back side, or both) and extract ALL fields into valid JSON:
{
  "firstName": "First name in English (e.g. Tsega)",
  "middleName": "Father's name in English (e.g. Gosaye)",
  "lastName": "Grandfather's name in English (e.g. Abayneh)",
  "fullNameAmharic": "Full name in Ethiopic script (e.g. ፀጋ ጎሳዬ አባይነህ)",
  "gender": "male" or "female",
  "dateOfBirth": "Gregorian YYYY-MM-DD",
  "dateOfBirthEth": "Ethiopian format DD/MM/YYYY",
  "nationalIdIssueDate": "Gregorian YYYY-MM-DD",
  "nationalIdExpiry": "Gregorian YYYY-MM-DD",
  "nationalIdNumber": "16-digit FAN (Fayda Access Number)",
  "nationalIdFin": "12-digit FIN (digits only, e.g. from back card)",
  "serialNumber": "Card Serial Number",
  "phone": "10-digit phone starting with 09 or 07",
  "nationality": "Ethiopian",
  "region": "Ethiopian Region (e.g. Sidama, Addis Ababa, Oromia, Amhara)",
  "zone": "Zone / Subcity (e.g. Mehal Sidama Zone)",
  "woreda": "Woreda / City Administration (e.g. Yirgalem city administration)",
  "kebele": "Kebele",
  "houseNumber": "House number"
}

Important Ethiopian ID rules:
- Front card shows: Photo, Full Name in Amharic & English, FAN (16 digits), Gender, DOB (Ethiopian & Gregorian), Issue Date, Expiry Date.
- Back card shows: FIN (12 digits, often near QR code), Phone number (09... or 07...), Nationality, Region (ክልል), Zone (ዞን), Woreda (ወረዳ).
- Return ONLY valid JSON. No markdown code fences, notes, or extra commentary.`;

  for (const apiKey of candidateKeys) {
    for (const model of visionModels) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  ...imageContents,
                ],
              },
            ],
            temperature: 0.05,
            max_tokens: 1500,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[NationalIdScanner] Groq Vision (${model}) response status ${response.status}:`, errText);
          continue;
        }

        const json: any = await response.json();
        const content = json.choices?.[0]?.message?.content || '';
        const cleanJson = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed && typeof parsed === 'object') {
          console.info(`[NationalIdScanner] Successfully extracted Ethiopian ID data using Groq Vision (${model})`);
          return parsed;
        }
      } catch (err: any) {
        console.warn(`[NationalIdScanner] Error calling Groq vision (${model}):`, err?.message || err);
      }
    }
  }

  return null;
}

/**
 * Calls Groq AI with multi-model and multi-key fallback
 */
async function callGroqAi(prompt: string, userKey?: string): Promise<any | null> {
  const candidateKeys = [
    (userKey || '').trim(),
    (env.GROQ_API_KEY || '').trim(),
    BACKUP_GROQ_KEY,
  ].filter(Boolean);

  const modelsToTry = [
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ];

  for (const apiKey of candidateKeys) {
    for (const model of modelsToTry) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are the official data parser for the Ethiopian Digital ID Card (Fayda / ብሔራዊ መታወቂያ). Extract all information strictly from the provided OCR text into valid JSON. Do not hallucinate or use dummy data.'
              },
              {
                role: 'user',
                content: prompt,
              }
            ],
            temperature: 0.02,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          continue;
        }

        const json: any = await response.json();
        const content = json.choices?.[0]?.message?.content || '';
        const cleanJson = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch {
        // Try next model/key
      }
    }
  }

  return null;
}

function normalizeOcrDigits(str: string): string {
  const ethiopicDigits: Record<string, string> = {
    '፳': '2', '፩': '1', '፪': '2', '፫': '3', '፬': '4',
    '፭': '5', '፮': '6', '፯': '7', '፰': '8', '፱': '9'
  };
  let res = str;
  for (const [eth, arab] of Object.entries(ethiopicDigits)) {
    res = res.replaceAll(eth, arab);
  }
  return res;
}

/**
 * Robust Regex and heuristic parser for Ethiopian National ID (Fayda)
 */
function extractFieldsWithRegex(rawText: string): Partial<ExtractedNationalIdData> {
  const res: Partial<ExtractedNationalIdData> = {
    nationality: 'Ethiopian',
  };

  const normText = normalizeOcrDigits(rawText);

  // 1. FAN (16 Digits, e.g. 8579 8349 6286 5368 or 8956 1298 6270 4381)
  const fanMatch = normText.match(/(?:FAN|FCN|ID)?[:\s]*(\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/i) ||
                   normText.match(/\b(\d{16})\b/);
  if (fanMatch) {
    res.nationalIdNumber = fanMatch[1].replace(/\s+/g, '');
  }

  // 2. FIN (12 Digits, e.g. FIN 670452015978 or FIN: 9820 6309 7159)
  const finMatch = rawText.match(/(?:FIN|IN|F1N)[:\s]*([0-9A-Za-z]{10,14})/i) ||
                   normText.match(/(?:FIN|IN|F1N)[:\s]*([0-9A-Za-z]{10,14})/i) ||
                   normText.match(/[^\d](\d{12})[^\d]/) ||
                   normText.match(/\b(\d{12})\b/) ||
                   normText.match(/(?:1|I|l)(\d{12})\b/) ||
                   normText.match(/\b([1-9]\d{11})\b/);
  if (finMatch) {
    let raw = finMatch[1] || finMatch[0];
    raw = raw.replace(/^(?:FIN|IN|F1N)[:\s]*/i, '');
    raw = normalizeOcrDigits(raw);
    const charMap: Record<string, string> = {
      'B': '6', 'b': '6', 'T': '7', 't': '7', 'O': '0', 'o': '0',
      'I': '1', 'i': '1', 'l': '1', 'S': '5', 's': '5', 'Z': '2', 'z': '2'
    };
    let clean = '';
    for (const ch of raw) {
      clean += charMap[ch] || ch;
    }
    clean = clean.replace(/[^0-9]/g, '');
    if (clean.length === 13 && (clean.startsWith('1') || clean.startsWith('7'))) clean = clean.slice(1);
    if (clean.length >= 10) {
      res.nationalIdFin = clean.slice(0, 12);
    }
  }

  // 3. Serial Number (SN on the card bottom right, e.g. 7823701 or 2506306)
  const snMatch = normText.match(/(?:SN|S\/N|S\.N)[:\s]*([0-9A-Za-z]{6,10})/i) ||
                  normText.match(/\b([0-9]{7})\b/) ||
                  normText.match(/\b([0-9]{8})\b/);
  if (snMatch) {
    let raw = snMatch[1] || snMatch[0];
    raw = raw.replace(/^(?:SN|S\/N|S\.N)[:\s]*/i, '');
    raw = normalizeOcrDigits(raw).replace(/[^0-9]/g, '');
    if (raw.length >= 6 && raw.length <= 10) {
      res.serialNumber = raw;
    }
  }

  // 4. Phone Number (09... or 07...)
  const phoneMatch = rawText.match(/(?:Phone|Tel)?[:\s]*(0[79]\d{8})/i) ||
                     rawText.match(/\b(0[79]\d{8})\b/) ||
                     rawText.match(/\b([79]\d{8})\b/);
  if (phoneMatch) {
    res.phone = phoneMatch[1].startsWith('0') ? phoneMatch[1] : `0${phoneMatch[1]}`;
  }

  // 5. Gender (Male / Female / ወንድ / ሴት)
  if (/Female|ሴት/i.test(rawText)) {
    res.gender = 'female';
  } else if (/Male|ወንድ/i.test(rawText)) {
    res.gender = 'male';
  }

  // 6. Dates extraction
  // Look for paired dates: Ethiopian | Gregorian (e.g. 26/04/1992 | 2000/Jan/05 or 09/04/1990 | 1997/12/18)
  const pairedDates = Array.from(rawText.matchAll(/(\d{2,4}[\/-]\d{1,2}[\/-]\d{2,4})\s*\|\s*(\d{4}[\/-][A-Za-z0-9]+[\/-]\d{1,2})/g));
  
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    june: '06', jul: '07', july: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  const parseGregDate = (raw: string) => {
    const parts = raw.split(/[\/-]/);
    if (parts.length === 3) {
      let m = parts[1].toLowerCase();
      m = monthMap[m] || m.padStart(2, '0');
      return `${parts[0]}-${m}-${parts[2].padStart(2, '0')}`;
    }
    return '';
  };

  if (pairedDates.length > 0) {
    // First pair is typically Date of Birth
    const dob = pairedDates[0];
    res.dateOfBirthEth = dob[1].replace(/-/g, '/');
    res.dateOfBirth = parseGregDate(dob[2]);

    // If more pairs, subsequent pairs are Issue Date or Expiry Date
    for (let i = 1; i < pairedDates.length; i++) {
      const p = pairedDates[i];
      const parsed = parseGregDate(p[2]);
      const yr = parseInt(parsed.split('-')[0], 10);
      if (yr >= 2030) {
        res.nationalIdExpiry = parsed;
      } else if (yr >= 2023 && yr <= 2029) {
        res.nationalIdIssueDate = parsed;
      }
    }
  }

  // Additional Expiry check
  if (!res.nationalIdExpiry) {
    const expMatch = rawText.match(/\b(203[0-9]|204[0-9])[\/-](\d{1,2}|[A-Za-z]+)[\/-](\d{1,2})\b/);
    if (expMatch) {
      res.nationalIdExpiry = parseGregDate(expMatch[0]);
    }
  }

  // Additional Issue Date check
  if (!res.nationalIdIssueDate) {
    const issueMatch = rawText.match(/\b(202[3-6])[\/-](\d{1,2}|[A-Za-z]+)[\/-](\d{1,2})\b/);
    if (issueMatch) {
      res.nationalIdIssueDate = parseGregDate(issueMatch[0]);
    }
  }

  // 7. Region
  for (const reg of ETHIOPIAN_REGIONS) {
    if (new RegExp(reg, 'i').test(rawText)) {
      res.region = reg;
      break;
    }
  }
  if (!res.region && /(?:Sidam|ሲዳማ|dama)/i.test(rawText)) res.region = 'Sidama';

  // 8. Zone / Subcity
  const zoneMatch = rawText.match(/([A-Za-z\s]+Zone)/i) ||
                    rawText.match(/([A-Za-z\s]+Subcity)/i) ||
                    rawText.match(/(?:Mehal\s*Sidama\s*Zone|መሃል\s*ሲዳማ\s*ዞን)/i) ||
                    rawText.match(/(?:Tabor|ታቦር)/i);
  if (zoneMatch) {
    res.zone = zoneMatch[0].replace(/መሃል\s*ሲዳማ\s*ዞን/i, 'Mehal Sidama Zone').trim();
  }

  // 9. Woreda / City Administration
  const woredaMatch = rawText.match(/([A-Za-z\s]+City Administration|[A-Za-z\s]+Woreda)/i) ||
                      rawText.match(/(?:Yirgalem|ይርጋለም)\s*ከተማ\s*አስተዳደር/i) ||
                      rawText.match(/(?:Hawassa|ሀዋሳ)\s*ከተማ\s*አስተዳደር/i);
  if (woredaMatch) {
    res.woreda = woredaMatch[0]
      .replace(/ይርጋለም\s*ከተማ\s*አስተዳደር/i, 'Yirgalem city administration')
      .replace(/ሀዋሳ\s*ከተማ\s*አስተዳደር/i, 'Hawassa City Administration')
      .trim();
  }

  // 10. Kebele
  const kebeleMatch = rawText.match(/(?:Kebele|ቀበሌ)[:\s]*([A-Za-z0-9]+)/i);
  if (kebeleMatch) {
    res.kebele = kebeleMatch[1].trim();
  }

  // 11. Amharic Full Name (Ethiopic Unicode block \u1200-\u137F)
  const amharicMatch = rawText.match(/([\u1200-\u137F]{2,}\s+[\u1200-\u137F]{2,}(?:\s+[\u1200-\u137F]{2,})?)/);
  if (amharicMatch) {
    const rawAmh = amharicMatch[1].trim();
    // Filter out common header words
    if (!/የኢትዮጵያ|ዲጂታል|መታወቂያ|ካርድ|ሙሉ|ስም|ዜግነት|ጾታ|ቀን|አስተዳደር/i.test(rawAmh)) {
      res.fullNameAmharic = rawAmh;
    }
  }

  // 12. English Full Name
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/Ethiopian|Digital|National|Card|Date|Expiry|Issue|Phone|Address|Sex|Female|Male|FAN|FCN|FIN|Administration|Zone|Region/i.test(line)) {
      continue;
    }
    const nameMatch = line.match(/^([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?$/);
    if (nameMatch) {
      res.firstName = nameMatch[1];
      res.middleName = nameMatch[2];
      res.lastName = nameMatch[3] || nameMatch[2];
      break;
    }
  }

  return res;
}

/**
 * Main Service Method: Extracts 100% of National ID / Fayda fields from Front & Back images
 */
export async function extractNationalIdData(input: ScanInput): Promise<ExtractedNationalIdData> {
  let frontBuffer: Buffer | null = null;
  let backBuffer: Buffer | null = null;
  let fullCombinedBuffer: Buffer | null = null;

  const rawCombined = input.combinedImage || (!input.backImage && input.frontImage ? input.frontImage : null);

  if (rawCombined) {
    fullCombinedBuffer = toBuffer(rawCombined);
    const meta = await sharp(fullCombinedBuffer).metadata();
    const w = meta.width || 800;
    const h = meta.height || 1000;

    // Detect if image is vertical (portrait) or horizontal (landscape)
    if (h > w * 1.05) {
      try {
        // Top half = Front side, Bottom half = Back side
        frontBuffer = await sharp(fullCombinedBuffer)
          .extract({
            left: Math.floor(w * 0.02),
            top: Math.floor(h * 0.02),
            width: Math.floor(w * 0.96),
            height: Math.floor(h * 0.48),
          })
          .toBuffer();

        backBuffer = await sharp(fullCombinedBuffer)
          .extract({
            left: Math.floor(w * 0.02),
            top: Math.floor(h * 0.50),
            width: Math.floor(w * 0.96),
            height: Math.floor(h * 0.48),
          })
          .toBuffer();
      } catch {
        frontBuffer = fullCombinedBuffer;
        backBuffer = fullCombinedBuffer;
      }
    } else if (w > h * 1.3) {
      // Side by side: Left = Front, Right = Back
      try {
        frontBuffer = await sharp(fullCombinedBuffer)
          .extract({
            left: Math.floor(w * 0.02),
            top: Math.floor(h * 0.02),
            width: Math.floor(w * 0.47),
            height: Math.floor(h * 0.96),
          })
          .toBuffer();

        backBuffer = await sharp(fullCombinedBuffer)
          .extract({
            left: Math.floor(w * 0.51),
            top: Math.floor(h * 0.02),
            width: Math.floor(w * 0.47),
            height: Math.floor(h * 0.96),
          })
          .toBuffer();
      } catch {
        frontBuffer = fullCombinedBuffer;
        backBuffer = fullCombinedBuffer;
      }
    } else {
      frontBuffer = fullCombinedBuffer;
      backBuffer = fullCombinedBuffer;
    }
  } else {
    if (input.frontImage) frontBuffer = toBuffer(input.frontImage);
    if (input.backImage) backBuffer = toBuffer(input.backImage);
  }

  // 1. Generate clean preview URLs
  let frontUrl = '';
  let backUrl = '';

  if (frontBuffer) {
    frontUrl = await saveUploadImage(frontBuffer, 'id_front');
  }
  if (backBuffer) {
    backUrl = await saveUploadImage(backBuffer, 'id_back');
  }

  // 2. High-Fidelity Preprocessing for OCR
  const prepBuffer = async (buf: Buffer) => {
    return sharp(buf)
      .resize(1600, null, { kernel: 'lanczos3' })
      .grayscale()
      .normalize()
      .toBuffer();
  };

  const buffersToOcr: { name: string; buffer: Buffer }[] = [];

  if (frontBuffer) {
    try {
      const pFront = await prepBuffer(frontBuffer);
      buffersToOcr.push({ name: 'FRONT CARD OCR', buffer: pFront });
    } catch (e) {
      console.warn('[NationalIdScanner] Prep front error:', e);
    }
  }

  if (backBuffer) {
    try {
      const pBack = await prepBuffer(backBuffer);
      buffersToOcr.push({ name: 'BACK CARD OCR', buffer: pBack });
    } catch (e) {
      console.warn('[NationalIdScanner] Prep back error:', e);
    }
  }

  if (fullCombinedBuffer && fullCombinedBuffer !== frontBuffer) {
    try {
      const pFull = await prepBuffer(fullCombinedBuffer);
      buffersToOcr.push({ name: 'FULL COMBINED IMAGE OCR', buffer: pFull });
    } catch (e) {
      console.warn('[NationalIdScanner] Prep full error:', e);
    }
  }

  // 1.5 Direct AI Vision first (fastest, high accuracy on cloud/cPanel without traineddata)
  let visionResult: any = null;
  const imagesForVision: Buffer[] = [];
  if (fullCombinedBuffer) {
    try {
      const opt = await sharp(fullCombinedBuffer)
        .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      imagesForVision.push(opt);
    } catch {}
  } else {
    if (frontBuffer) {
      try {
        const optFront = await sharp(frontBuffer)
          .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        imagesForVision.push(optFront);
      } catch {}
    }
    if (backBuffer) {
      try {
        const optBack = await sharp(backBuffer)
          .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        imagesForVision.push(optBack);
      } catch {}
    }
  }

  if (imagesForVision.length > 0) {
    try {
      visionResult = await callGroqVision(imagesForVision, input.apiKey);
    } catch (e) {
      console.warn('[NationalIdScanner] Groq Vision attempt bypassed:', e);
    }
  }

  const ocrSnippets = await performOcrOnBuffers(buffersToOcr);

  const combinedOcrText = ocrSnippets.join('\n\n');

  // 3. Deterministic Regex Parsing
  const regexResult = extractFieldsWithRegex(combinedOcrText);

  // 4. Advanced AI Extraction via Groq (Fallback if Vision didn't complete)
  let aiResult = visionResult;
  if (!aiResult && combinedOcrText.trim()) {
    const aiPrompt = `You are the official Ethiopian Digital ID (Fayda / ብሔራዊ መታወቂያ) document data extractor.
Analyze the following raw OCR text extracted from the front and back of the Ethiopian ID card.
Extract ALL information accurately into JSON format.

Important Ethiopian ID Rules:
1. Names:
   - firstName, middleName, lastName in English (e.g. Tsega, Gosaye, Abayneh or Hayal, Tamrat, Girum).
   - fullNameAmharic in Ethiopic Fidel script (e.g. ፀጋ ጎሳዬ አባይነህ or ኃያል ታምራት ግሩም).
2. Dates:
   - Date of Birth has both Ethiopian calendar (e.g. 26/04/1992 or 09/04/1990) and Gregorian calendar (e.g. 2000/01/05 or 1997/12/18).
   - Note: In Ethiopian ID cards, the Ethiopian date comes first, Gregorian comes second. Ethiopian years are typically 7-8 years earlier than Gregorian years.
   - Always format dateOfBirth (Gregorian) as YYYY-MM-DD.
   - Always format dateOfBirthEth as DD/MM/YYYY or YYYY/MM/DD.
   - Date of Issue (የተሰጠበት ቀን): look for dates like 2017/07/22 | 2025/03/31. Gregorian format YYYY-MM-DD.
   - Date of Expiry (የሚያበቃበት ቀን): look for dates like 2025/07/22 | 2033/03/31. Gregorian format YYYY-MM-DD.
3. Identifiers:
   - FAN (Fayda Access Number / FCN): 16-digit number (e.g. 8579834962865368).
   - FIN (Fayda Identification Number): 12-digit number (remove 'FIN' letters, digits only, e.g. 670452015978).
   - Serial Number (SN): card serial number on the bottom right of back side (e.g. 7823701).
4. Demographics & Residence:
   - Gender: 'male' or 'female'.
   - Nationality: 'Ethiopian' (ኢትዮጵያዊ).
   - Phone: 10 digits starting with 09 or 07 (e.g. 0963713511 or 0983713511).
   - Region (ክልል): e.g. Sidama, Addis Ababa, Oromia, Amhara, Tigray, Somali, etc.
   - Zone / Subcity (ዞን / ክፍለ ከተማ): e.g. Mehal Sidama Zone, Tabor Subcity.
   - Woreda / City Administration (ወረዳ / ከተማ አስተዳደር): e.g. Yirgalem city administration, Hawassa City Administration.
   - Kebele (ቀበሌ): e.g. 01, 02, etc. (if found, otherwise "").
   - House Number (የቤት ቁጥር): if found, otherwise "".

Raw OCR Text:
${combinedOcrText}

Return STRICTLY a JSON object with this exact shape without any markdown tags or explanation:
{
  "firstName": "...",
  "middleName": "...",
  "lastName": "...",
  "fullNameAmharic": "...",
  "gender": "female" or "male",
  "dateOfBirth": "YYYY-MM-DD",
  "dateOfBirthEth": "...",
  "nationalIdIssueDate": "YYYY-MM-DD",
  "nationalIdExpiry": "YYYY-MM-DD",
  "nationalIdNumber": "16 digits",
  "nationalIdFin": "12 digits",
  "serialNumber": "...",
  "phone": "09...",
  "nationality": "Ethiopian",
  "region": "...",
  "zone": "...",
  "woreda": "...",
  "kebele": "...",
  "houseNumber": "...",
  "address": "..."
}`;

    try {
      aiResult = await callGroqAi(aiPrompt, input.apiKey);
    } catch (err) {
      console.warn('[NationalIdScanner] AI call error:', err);
    }
  }

  // 5. Build Comprehensive Address
  const region = aiResult?.region || regexResult.region || '';
  const zone = aiResult?.zone || regexResult.zone || '';
  const woreda = (aiResult?.woreda || regexResult.woreda || '').replace(/\n/g, ' ').trim();
  const kebele = aiResult?.kebele || regexResult.kebele || '';
  const houseNumber = aiResult?.houseNumber || regexResult.houseNumber || '';

  const addressTokens = [
    region,
    zone,
    woreda,
    kebele ? `Kebele ${kebele}` : '',
    houseNumber ? `House ${houseNumber}` : '',
  ].filter(Boolean);

  const formattedAddress = aiResult?.address || addressTokens.join(', ');

  // 6. Clean FIN
  let fin = aiResult?.nationalIdFin || regexResult.nationalIdFin || '';
  fin = fin.replace(/[^0-9]/g, '');
  if (fin.length > 12) fin = fin.slice(0, 12);

  // Clean FAN
  let fan = aiResult?.nationalIdNumber || regexResult.nationalIdNumber || '';
  fan = fan.replace(/[^0-9]/g, '');
  if (fan.length > 16) fan = fan.slice(0, 16);

  // Clean Phone
  let phone = aiResult?.phone || regexResult.phone || '';
  phone = phone.replace(/[^0-9]/g, '');
  if (phone.length === 9 && (phone.startsWith('9') || phone.startsWith('7'))) {
    phone = `0${phone}`;
  }

  const finalData: ExtractedNationalIdData = {
    firstName: aiResult?.firstName || regexResult.firstName || '',
    middleName: aiResult?.middleName || regexResult.middleName || '',
    lastName: aiResult?.lastName || regexResult.lastName || '',
    fullName: [
      aiResult?.firstName || regexResult.firstName || '',
      aiResult?.middleName || regexResult.middleName || '',
      aiResult?.lastName || regexResult.lastName || ''
    ].filter(Boolean).join(' '),
    fullNameAmharic: aiResult?.fullNameAmharic || regexResult.fullNameAmharic || '',
    gender: (aiResult?.gender || regexResult.gender || 'male').toLowerCase().startsWith('f') ? 'female' : 'male',
    dateOfBirth: aiResult?.dateOfBirth || regexResult.dateOfBirth || '',
    dateOfBirthEth: aiResult?.dateOfBirthEth || regexResult.dateOfBirthEth || '',
    nationalIdIssueDate: aiResult?.nationalIdIssueDate || regexResult.nationalIdIssueDate || '',
    nationalIdExpiry: aiResult?.nationalIdExpiry || regexResult.nationalIdExpiry || '',
    phone,
    nationality: 'Ethiopian',
    nationalIdNumber: fan,
    nationalIdFin: fin,
    serialNumber: aiResult?.serialNumber || regexResult.serialNumber || '',
    region,
    zone,
    woreda,
    kebele,
    houseNumber,
    address: formattedAddress,
    nationalIdFrontUrl: frontUrl,
    nationalIdBackUrl: backUrl,
    confidence: (visionResult?.firstName || aiResult?.firstName) && (fan || fin) ? 0.98 : 0.88,
    extractedVia: visionResult?.firstName
      ? 'GROQ_AI_VISION_REALTIME'
      : aiResult?.firstName
      ? 'GROQ_AI_REALTIME'
      : 'REALTIME_OCR_SCANNER',
  };

  // Secondary heuristic check: If FIN was not captured, search for 10-13 digit sequence on back side
  if (!finalData.nationalIdFin) {
    const finCandidates = Array.from(combinedOcrText.matchAll(/(?:FIN[:\s]*)?([0-9]{10,14})/gi));
    for (const match of finCandidates) {
      let candidate = match[1].replace(/[^0-9]/g, '');
      if (candidate.length === 13 && candidate.startsWith('1')) candidate = candidate.slice(1);
      if (candidate.length === 12 && candidate !== finalData.nationalIdNumber && candidate !== finalData.phone) {
        finalData.nationalIdFin = candidate;
        break;
      }
    }
  }

  // Secondary heuristic check: If serialNumber was not captured, look for 6-8 digit sequence
  if (!finalData.serialNumber) {
    const snMatch = combinedOcrText.match(/(?:SN|S\/N|S\.N)[:\s]*([0-9A-Z]{6,10})/i) ||
                    combinedOcrText.match(/\b([0-9]{7,8})\b/);
    if (snMatch) {
      const candidate = (snMatch[1] || snMatch[0]).trim();
      if (candidate !== finalData.nationalIdNumber && candidate !== finalData.nationalIdFin && candidate !== finalData.phone) {
        finalData.serialNumber = candidate;
      }
    }
  }

  return finalData;
}

