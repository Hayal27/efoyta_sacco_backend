import rateLimit from 'express-rate-limit';

/** Global rate limiter: 100 requests per minute per IP */
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
});

/** Auth-specific rate limiter: 5 requests per minute per IP */
export const authRateLimit = rateLimit({
  windowMs: 6 * 1,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts', code: 'RATE_LIMITED' },
});

export const publicSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Request rate limit reached.', code: 'RATE_LIMITED' },
});
