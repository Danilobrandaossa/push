-- Migration: Add unique constraint on token (endpoint) for idempotent device registration
-- For WEB platform, endpoint (token) is globally unique and should be used as the primary key
-- This enables idempotent registration: same endpoint = update existing device

-- Add unique constraint on token column
-- This allows the backend to use endpoint as the primary key for Web Push devices
DO $$
BEGIN
    -- Check if unique constraint already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'device_token_unique'
        AND conrelid = 'device'::regclass
    ) THEN
        -- Add unique constraint on token
        ALTER TABLE "device" 
        ADD CONSTRAINT "device_token_unique" UNIQUE ("token");
    END IF;
END $$;

