import { eq, and, gt, lt } from 'drizzle-orm';
import { rateLimits } from '../db/schema';
import type { DrizzleDB } from '../types';
import { now as getCurrentTime } from './utils';

/**
 * Rate Limit Configuration
 *
 * Limits are per IP address and endpoint type:
 * - AUTH: 5 attempts per 15 minutes (login, register)
 * - GENERAL: 100 requests per minute
 */
export const RATE_LIMITS = {
  AUTH: { maxAttempts: 5, windowMs: 15 * 60 * 1000 }, // 15 minutes
  GENERAL: { maxAttempts: 100, windowMs: 60 * 1000 }, // 1 minute
  AI: { maxAttempts: 20, windowMs: 60 * 1000 }, // 1 minute - cost protection
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;

/**
 * Check if request should be rate limited
 *
 * @param db - Database instance
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param type - Type of rate limit to apply
 * @returns Object with { allowed: boolean, retryAfter?: number }
 */
export async function checkRateLimit(
  db: DrizzleDB,
  identifier: string,
  type: RateLimitType
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const config = RATE_LIMITS[type];
  const currentTime = getCurrentTime();
  const windowStart = currentTime - config.windowMs;

  // Clean up old entries before counting (prevent unbounded growth)
  // Check if delete method exists (may not in test environments)
  if (typeof db.delete === 'function') {
    try {
      await db
        .delete(rateLimits)
        .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.type, type), lt(rateLimits.timestamp, windowStart)));
    } catch (error) {
      // Log but don't fail on cleanup errors
      console.error('[rateLimit] cleanup failed', { error, identifier, type });
    }
  }

  // Count recent attempts
  const recentAttempts = await db
    .select()
    .from(rateLimits)
    .where(and(eq(rateLimits.identifier, identifier), eq(rateLimits.type, type), gt(rateLimits.timestamp, windowStart)));

  const attemptCount = recentAttempts.length;

  if (attemptCount >= config.maxAttempts) {
    // Rate limit exceeded - calculate retry after time using the earliest attempt
    // Use Math.min to find the earliest timestamp (results may not be sorted)
    const timestamps = recentAttempts.map(a => Number(a.timestamp));
    const oldestAttempt = Math.min(...timestamps);
    const retryAfter = Math.ceil((oldestAttempt + config.windowMs - currentTime) / 1000);
    return { allowed: false, retryAfter };
  }

  // Record this attempt
  await db.insert(rateLimits).values({
    id: `${identifier}-${type}-${currentTime}`,
    identifier,
    type,
    timestamp: currentTime,
  });

  return { allowed: true };
}

/**
 * Get client IP address from request headers
 *
 * In Cloudflare Workers, the CF-Connecting-IP header contains the real client IP
 */
export function getClientIp(request: Request): string {
  // Try CF-Connecting-IP first (Cloudflare)
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;

  // Fallback to X-Forwarded-For
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]!.trim();
  }

  // Fallback to X-Real-IP
  const xRealIp = request.headers.get('X-Real-IP');
  if (xRealIp) return xRealIp;

  // Last resort - use a placeholder (should not happen in production)
  return 'unknown';
}
