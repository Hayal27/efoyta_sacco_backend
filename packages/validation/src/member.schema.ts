import { z } from 'zod';

const phoneRegex = /^\+?[0-9]{9,15}$/;

export const memberSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(200),
  phone: z.string().regex(phoneRegex, 'Invalid phone number (9–15 digits)'),
  email: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
  nationalId: z.string().max(50).optional().nullable().or(z.literal('')),
  address: z.string().max(255).optional().nullable().or(z.literal('')),
  gender: z.enum(['m', 'f']).optional().nullable().or(z.literal('')),
  dateOfBirth: z.preprocess((arg) => (arg === '' || arg === null ? undefined : arg), z.coerce.date().optional().nullable()),
  qualification: z.string().max(100).optional().nullable().or(z.literal('')),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional().nullable().or(z.literal('')),
  familyMembers: z.preprocess((arg) => (arg === '' || arg === null ? undefined : Number(arg)), z.number().int().min(0).optional().nullable()),
  birthPlace: z.string().max(100).optional().nullable().or(z.literal('')),
  focalAgentId: z.preprocess((arg) => (arg === '' ? null : arg), z.string().uuid('Invalid focal agent').optional().nullable()),
  registrationFee: z.number().min(0, 'Registration fee cannot be negative').default(0),
  joinDate: z.coerce.date({ required_error: 'Join date is required' }),

  // Ethiopian National ID (Fayda / ብሔራዊ መታወቂያ) & Residence Details
  fullNameAmharic: z.string().max(200).optional().nullable().or(z.literal('')),
  nationalIdFin: z.string().max(50).optional().nullable().or(z.literal('')),
  nationalIdFrontUrl: z.string().optional().nullable().or(z.literal('')),
  nationalIdBackUrl: z.string().optional().nullable().or(z.literal('')),
  nationalIdExpiry: z.preprocess((arg) => (arg === '' || arg === null ? undefined : arg), z.coerce.date().optional().nullable()),
  nationalIdIssueDate: z.preprocess((arg) => (arg === '' || arg === null ? undefined : arg), z.coerce.date().optional().nullable()),
  region: z.string().max(100).optional().nullable().or(z.literal('')),
  zone: z.string().max(100).optional().nullable().or(z.literal('')),
  woreda: z.string().max(100).optional().nullable().or(z.literal('')),
  kebele: z.string().max(100).optional().nullable().or(z.literal('')),
  houseNumber: z.string().max(100).optional().nullable().or(z.literal('')),

  // Biography & Employment
  occupation: z.string().max(150).optional().nullable().or(z.literal('')),
  employer: z.string().max(150).optional().nullable().or(z.literal('')),
  monthlyIncome: z.preprocess((arg) => (arg === '' || arg === null ? undefined : Number(arg)), z.number().min(0).optional().nullable()),

  // Emergency Contact
  emergencyContactName: z.string().max(150).optional().nullable().or(z.literal('')),
  emergencyContactPhone: z.string().max(50).optional().nullable().or(z.literal('')),
  emergencyContactRelation: z.string().max(100).optional().nullable().or(z.literal('')),

  // System Status & KYC
  kycLevel: z.string().max(20).optional().default('LEVEL_1'),
  kycStatus: z.string().max(20).optional().default('VERIFIED'),
  branchId: z.preprocess((arg) => (arg === '' ? null : arg), z.string().optional().nullable()),

  // Optional Self-Service Portal Login Credentials
  createAccount: z.boolean().optional(),
  userEmail: z.string().email().optional().nullable().or(z.literal('')),
  userPassword: z.string().min(6).optional().nullable().or(z.literal('')),
  documents: z.array(z.any()).optional(),
}).passthrough();

export const updateMemberSchema = memberSchema.partial().extend({
  status: z.enum(['active', 'suspended', 'exited']).optional(),
});

export const memberSearchSchema = z.object({
  query: z.string().optional(),
  focalAgentId: z.string().uuid().optional(),
  status: z.enum(['active', 'suspended', 'exited']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type MemberInput = z.infer<typeof memberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type MemberSearchInput = z.infer<typeof memberSearchSchema>;
