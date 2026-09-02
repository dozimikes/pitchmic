import { z } from 'zod';
import { UserRole, OfferStatus } from './types';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const SignInSchema = z.object({
  email: z.string().email('Please enter a valid email address').trim(),
  password: z.string().min(1, 'Password is required'),
  remember_me: z.boolean().optional().default(false),
});

export type SignInInput = z.infer<typeof SignInSchema>;

export const SignUpSchemaBase = z.object({
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
  password: passwordSchema,
  confirm_password: z.string().min(1, 'Please confirm your password'),
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be at most 50 characters')
    .trim(),
  last_name: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be at most 50 characters')
    .trim(),
});

export const StartupSignUpSchema = SignUpSchemaBase.extend({
  role: z.literal(UserRole.STARTUP),
  startup_name: z
    .string()
    .min(2, 'Startup name must be at least 2 characters')
    .max(100, 'Startup name must be at most 100 characters')
    .trim(),
  founder_title: z
    .string()
    .min(2, 'Founder title is required')
    .max(50, 'Founder title must be at most 50 characters')
    .trim(),
  niche: z.string().max(500).trim().optional(),
  address: z.string().max(512).trim().optional(),
  phone: z.string().max(50).trim().optional(),
  pitch_video_url: z.string().url('Please enter a valid URL').max(500).trim().optional().or(z.literal('')),
  target_market: z.string().max(500).trim().optional(),
  co_founders: z.array(z.string().trim().max(255)).max(4, 'Up to 4 co-founders').optional().default([]),
})
  .strict('Unexpected fields in startup sign-up payload')
  .superRefine((data, ctx) => {
    if (data.first_name && data.first_name.length > 0 && !data.founder_title) {
      ctx.addIssue({
        code: 'custom',
        path: ['founder_title'],
        message: 'Founder title is required when first name is provided',
      });
    }
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const InvestorSignUpSchema = SignUpSchemaBase.extend({
  role: z.literal(UserRole.INVESTOR),
  investor_name: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim())
    .refine((v) => v.length === 0 || v.length >= 2, {
      message: 'Investor/company name must be at least 2 characters',
    }),
  niche: z
    .string()
    .min(2, 'Investment niche is required')
    .max(100, 'Niche must be at most 100 characters')
    .trim(),
  address: z.string().max(512).trim().optional(),
  phone: z.string().max(50).trim().optional(),
  company: z.string().max(255).trim().optional(),
})
  .strict('Unexpected fields in investor sign-up payload')
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const SignUpSchema = z.union([
  StartupSignUpSchema,
  InvestorSignUpSchema,
]);

export type SignUpInput = z.infer<typeof SignUpSchema>;
export type StartupSignUpInput = z.infer<typeof StartupSignUpSchema>;
export type InvestorSignUpInput = z.infer<typeof InvestorSignUpSchema>;

export const PitchCreateSchema = z
  .object({
    title: z
      .string()
      .min(5, 'Title must be at least 5 characters')
      .max(200, 'Title must be at most 200 characters')
      .trim(),
    description: z
      .string()
      .min(20, 'Description must be at least 20 characters')
      .max(2000, 'Description must be at most 2000 characters')
      .trim(),
    problem: z
      .string()
      .min(10, 'Problem must be at least 10 characters')
      .max(1000, 'Problem must be at most 1000 characters')
      .trim(),
    solution: z
      .string()
      .min(10, 'Solution must be at least 10 characters')
      .max(1000, 'Solution must be at most 1000 characters')
      .trim(),
    market_size: z
      .string()
      .max(500, 'Market size must be at most 500 characters')
      .trim()
      .optional(),
    business_model: z
      .string()
      .max(1000, 'Business model must be at most 1000 characters')
      .trim()
      .optional(),
    traction: z
      .string()
      .max(1000, 'Traction must be at most 1000 characters')
      .trim()
      .optional(),
    asking_amount: z.coerce
      .number({ invalid_type_error: 'Funding amount must be a number' })
      .positive('Funding amount must be positive')
      .max(1_000_000_000, 'Asking amount is too large'),
    equity_offered: z.coerce
      .number({ invalid_type_error: 'Equity % must be a number' })
      .positive('Equity % must be positive')
      .max(100, 'Equity cannot exceed 100%'),
    use_of_funds: z
      .string()
      .max(2000, 'Use of funds must be at most 2000 characters')
      .trim()
      .optional(),
    video_url: z
      .string()
      .max(500, 'Video URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v === '' ? undefined : v))
      .pipe(z.string().url('Please enter a valid URL').optional()),
    deck_url: z
      .string()
      .max(500, 'Deck URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v === '' ? undefined : v))
      .pipe(z.string().url('Please enter a valid URL').optional()),
    tags: z.array(z.string().trim()).max(10, 'You can add up to 10 tags').default([]),
  })
  .superRefine((data, ctx) => {
    // Cross-field sanity: implied pre-money valuation should be non-trivial
    if (data.asking_amount > 0 && data.equity_offered > 0) {
      const impliedValuation = data.asking_amount / (data.equity_offered / 100);
      if (impliedValuation < data.asking_amount) {
        ctx.addIssue({
          code: 'custom',
          path: ['equity_offered'],
          message: `Equity ${data.equity_offered}% is too high for the asking amount (implied valuation < raise amount)`,
        });
      }
      if (data.equity_offered > 50) {
        ctx.addIssue({
          code: 'custom',
          path: ['equity_offered'],
          message: `Equity over 50% in a single round is unusual — please review`,
        });
      }
    }
  });

export type PitchCreateInput = z.infer<typeof PitchCreateSchema>;

export const OfferCreateSchema = z
  .object({
    pitch_id: z.string().min(1, 'Pitch ID is required'),
    amount: z.coerce
      .number({ invalid_type_error: 'Amount must be a number' })
      .positive('Investment amount must be positive')
      .max(1_000_000_000, 'Amount is too large'),
    equity_pct: z.coerce
      .number({ invalid_type_error: 'Equity must be a number' })
      .positive('Equity must be positive')
      .max(100, 'Equity cannot exceed 100%'),
    valuation: z.coerce
      .number({ invalid_type_error: 'Valuation must be a number' })
      .positive('Valuation must be positive')
      .optional(),
    message: z
      .string()
      .min(10, 'Message must be at least 10 characters')
      .max(2000, 'Message must be at most 2000 characters')
      .trim(),
    expires_at: z
      .string()
      .refine((val) => !Number.isNaN(new Date(val).getTime()), 'Please select a valid date')
      .optional(),
  })
  .strict('Unexpected fields in offer create payload')
  .superRefine((data, ctx) => {
    // Cross-check: if explicit valuation is given, verify it's in the same ballpark
    // as the implied valuation (amount / (equity_pct / 100))
    const implied = data.amount / (data.equity_pct / 100);
    if (data.valuation !== undefined && data.valuation > 0) {
      const ratio = implied / data.valuation;
      if (ratio < 0.3 || ratio > 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['valuation'],
          message: `Valuation differs significantly from implied valuation (${Math.round(implied).toLocaleString()}) — please review`,
        });
      }
    }
    // Expiry must be in the future when provided
    if (data.expires_at) {
      const expiry = new Date(data.expires_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry.getTime() <= today.getTime()) {
        ctx.addIssue({
          code: 'custom',
          path: ['expires_at'],
          message: 'Expiry date must be in the future',
        });
      }
    }
    // Warn on very high equity asks
    if (data.equity_pct > 40) {
      ctx.addIssue({
        code: 'custom',
        path: ['equity_pct'],
        message: `${data.equity_pct}% equity for a single round is very high — confirm with the fund mandate`,
      });
    }
  });

export type OfferCreateInput = z.infer<typeof OfferCreateSchema>;

export const OfferStatusUpdateSchema = z.object({
  status: z.enum([
    OfferStatus.ACCEPTED,
    OfferStatus.REJECTED,
    OfferStatus.NEGOTIATING,
    OfferStatus.WITHDRAWN,
  ]),
  message: z
    .string()
    .max(2000, 'Message must be at most 2000 characters')
    .trim()
    .optional(),
});

export type OfferStatusUpdateInput = z.infer<typeof OfferStatusUpdateSchema>;

export const ProfileUpdateSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal(UserRole.STARTUP),
    startup_name: z
      .string()
      .min(2, 'Startup name must be at least 2 characters')
      .max(100, 'Startup name must be at most 100 characters')
      .trim(),
    tagline: z
      .string()
      .max(150, 'Tagline must be at most 150 characters')
      .trim()
      .optional(),
    description: z
      .string()
      .max(5000, 'Description must be at most 5000 characters')
      .trim()
      .optional(),
    website_url: z
      .string()
      .url('Please enter a valid URL')
      .max(500, 'Website URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal('')),
    linkedin_url: z
      .string()
      .url('Please enter a valid URL')
      .max(500, 'LinkedIn URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal('')),
    twitter_url: z
      .string()
      .url('Please enter a valid URL')
      .max(500, 'Twitter URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal('')),
    industry: z
      .string()
      .max(100, 'Industry must be at most 100 characters')
      .trim()
      .optional(),
    stage: z
      .string()
      .max(50, 'Stage must be at most 50 characters')
      .trim()
      .optional(),
    location: z
      .string()
      .max(100, 'Location must be at most 100 characters')
      .trim()
      .optional(),
    founded_year: z.coerce
      .number({ invalid_type_error: 'Year must be a number' })
      .int('Year must be an integer')
      .min(1900, 'Year must be 1900 or later')
      .max(new Date().getFullYear(), 'Year cannot be in the future')
      .optional(),
    number_of_employees: z.coerce
      .number({ invalid_type_error: 'Must be a number' })
      .int('Must be an integer')
      .nonnegative('Cannot be negative')
      .optional(),
    funding_raised: z.coerce
      .number({ invalid_type_error: 'Must be a number' })
      .nonnegative('Cannot be negative')
      .optional(),
  }),
  z.object({
    role: z.literal(UserRole.INVESTOR),
    company_name: z
      .string()
      .max(100, 'Company name must be at most 100 characters')
      .trim()
      .optional(),
    position: z
      .string()
      .max(100, 'Position must be at most 100 characters')
      .trim()
      .optional(),
    bio: z
      .string()
      .max(5000, 'Bio must be at most 5000 characters')
      .trim()
      .optional(),
    website_url: z
      .string()
      .url('Please enter a valid URL')
      .max(500, 'Website URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal('')),
    linkedin_url: z
      .string()
      .url('Please enter a valid URL')
      .max(500, 'LinkedIn URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal('')),
    twitter_url: z
      .string()
      .url('Please enter a valid URL')
      .max(500, 'Twitter URL must be at most 500 characters')
      .trim()
      .optional()
      .or(z.literal('')),
    niche: z
      .string()
      .max(100, 'Niche must be at most 100 characters')
      .trim()
      .optional(),
    investment_stage: z
      .array(z.string())
      .max(10, 'Up to 10 stages allowed')
      .optional(),
    minimum_investment: z.coerce
      .number({ invalid_type_error: 'Must be a number' })
      .nonnegative('Cannot be negative')
      .optional(),
    maximum_investment: z.coerce
      .number({ invalid_type_error: 'Must be a number' })
      .nonnegative('Cannot be negative')
      .optional(),
  }),
]);

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
