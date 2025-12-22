-- Migration: Add PENDING status to device_status enum
-- This allows devices to be created as PENDING and activated only after warm-up push succeeds

-- Add PENDING value to device_status enum if it doesn't exist
-- PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE, so we use DO block
DO $$
BEGIN
    -- Check if 'PENDING' value already exists in the enum
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'PENDING' 
        AND enumtypid = (
            SELECT oid 
            FROM pg_type 
            WHERE typname = 'device_status'
        )
    ) THEN
        -- Add PENDING value to device_status enum
        ALTER TYPE "public"."device_status" ADD VALUE 'PENDING';
    END IF;
END $$;

