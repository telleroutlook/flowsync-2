/**
 * AI Limits - Re-exported from centralized config
 *
 * This file maintains backward compatibility by re-exporting constants
 * from the centralized config.ts. New code should import from config.ts directly.
 */

export { MAX_HISTORY_PART_CHARS } from './config';

// For backward compatibility, also export the full config
export { config } from './config';
