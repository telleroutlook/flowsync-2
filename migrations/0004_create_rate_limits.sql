-- Create rate_limits table for API rate limiting
-- This table tracks request counts per identifier (IP, user ID, etc.) to enforce rate limits
CREATE TABLE rate_limits (id text PRIMARY KEY NOT NULL, identifier text NOT NULL, type text NOT NULL, timestamp integer NOT NULL);
