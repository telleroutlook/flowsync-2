-- Add allow_thinking column to users table
-- This column was defined in schema but missing from the initial migration
ALTER TABLE "users" ADD COLUMN "allow_thinking" boolean DEFAULT false NOT NULL;
