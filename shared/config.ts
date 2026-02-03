/**
 * Centralized Configuration
 *
 * This file consolidates all hardcoded constants across the codebase.
 * Benefits:
 * - Single source of truth for configuration
 * - Easy to tune parameters without searching multiple files
 * * - Type-safe with `as const` for readonly guarantees
 * - Supports environment variable overrides for production tuning
 */

// ============================================================================
// Environment Variable Helper
// ============================================================================

// Accept both Bindings interface and generic env objects
export type EnvBindings = Record<string, unknown> | undefined;

/**
 * Safely reads an environment variable with a fallback value.
 * Works in both Node.js (build time) and Cloudflare Workers (runtime).
 *
 * @param key - Environment variable name
 * @param defaultValue - Fallback value if env var is not set
 * @param env - Optional explicit environment object (e.g., Cloudflare Workers bindings)
 * @returns The environment variable value converted to number, or defaultValue
 */
function getEnvNumber(key: string, defaultValue: number, env?: Record<string, unknown> | undefined): number {
  if (env && key in env && typeof env[key] === 'string') {
    const parsed = Number(env[key]);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  // Try globalThis (Cloudflare Workers runtime)
  if (typeof globalThis !== 'undefined') {
    const globalEnv = (globalThis as { ENV?: Record<string, string | undefined> }).ENV || {};
    const value = globalEnv[key];
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  // Try process.env (Node.js build time)
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return defaultValue;
}

// ============================================================================
// AI Configuration
// ============================================================================

export const getConfig = (env?: Record<string, unknown> | undefined) => {
  const aiConfig = {
    // History and message limits
    history: {
      maxMessages: getEnvNumber('AI_MAX_HISTORY_MESSAGES', 30, env),
      maxPartChars: getEnvNumber('AI_MAX_HISTORY_PART_CHARS', 2000, env),
      maxMessageChars: getEnvNumber('AI_MAX_MESSAGE_CHARS', 4000, env),
      maxSystemContextChars: getEnvNumber('AI_MAX_SYSTEM_CONTEXT_CHARS', 8000, env),
      maxToolArgsChars: getEnvNumber('AI_MAX_TOOL_ARGS_CHARS', 8000, env),
    },

    // Execution limits
    execution: {
      maxToolCalls: getEnvNumber('AI_MAX_TOOL_CALLS', 30, env),
      maxTurns: getEnvNumber('AI_MAX_TURNS', 5, env),
      requestTimeoutMs: getEnvNumber('AI_REQUEST_TIMEOUT_MS', 60000, env),
      maxRetries: getEnvNumber('AI_MAX_RETRIES', 2, env),
      baseRetryDelayMs: getEnvNumber('AI_BASE_RETRY_DELAY_MS', 500, env),
    },
  } as const;

  const cacheConfig = {
    project: {
      ttlMs: getEnvNumber('PROJECT_CACHE_TTL_MS', 30000, env), // 30 seconds
      maxSize: getEnvNumber('PROJECT_CACHE_MAX_SIZE', 50, env), // Maximum number of workspace caches to keep
    },
  } as const;

  const paginationConfig = {
    defaultPageSize: getEnvNumber('PAGINATION_DEFAULT_PAGE_SIZE', 100, env),
    maxPageSize: getEnvNumber('PAGINATION_MAX_PAGE_SIZE', 100, env),
  } as const;

  const rateLimitConfig = {
    auth: {
      maxRequests: getEnvNumber('RATE_LIMIT_AUTH_MAX_REQUESTS', 5, env),
      windowMs: getEnvNumber('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000, env), // 15 minutes
    },
    general: {
      maxRequests: getEnvNumber('RATE_LIMIT_GENERAL_MAX_REQUESTS', 100, env),
      windowMs: getEnvNumber('RATE_LIMIT_GENERAL_WINDOW_MS', 60 * 1000, env), // 1 minute
    },
    ai: {
      maxRequests: getEnvNumber('RATE_LIMIT_AI_MAX_REQUESTS', 20, env),
      windowMs: getEnvNumber('RATE_LIMIT_AI_WINDOW_MS', 60000, env), // 1 minute
    },
  } as const;

  return {
    ai: aiConfig,
    cache: cacheConfig,
    pagination: paginationConfig,
    rateLimit: rateLimitConfig,
  } as const;
};

// Backward compatibility: export commonly used constants with legacy names
export const config = getConfig();
export const MAX_HISTORY_PART_CHARS = config.ai.history.maxPartChars;

// ============================================================================
// Type Exports
// ============================================================================

export type Config = ReturnType<typeof getConfig>;
export type AiConfig = Config['ai'];
export type CacheConfig = Config['cache'];
export type PaginationConfig = Config['pagination'];
export type RateLimitConfig = Config['rateLimit'];
