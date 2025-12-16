-- Migration: Update automation table to support multiple notification templates
-- Changes notificationTemplate (single JSON) to notificationTemplates (array of JSON)
-- Also removes delayMinutes column as delay is now part of each template

-- Step 1: Rename column and convert single template to array
ALTER TABLE "automation" 
  RENAME COLUMN "notificationTemplate" TO "notificationTemplates";

-- Step 2: Convert existing single template objects to arrays
-- This updates any existing automations to have their single template wrapped in an array
UPDATE "automation"
SET "notificationTemplates" = jsonb_build_array("notificationTemplates")
WHERE jsonb_typeof("notificationTemplates") = 'object';

-- Step 3: For automations with delayMinutes, add it to the first template's delayMinutes
-- Use a function to handle the update
DO $$
DECLARE
  rec RECORD;
  updated_templates jsonb;
BEGIN
  FOR rec IN SELECT id, "notificationTemplates", "delayMinutes" FROM "automation" WHERE "delayMinutes" IS NOT NULL
  LOOP
    SELECT jsonb_agg(
      CASE 
        WHEN ordinality = 1 AND rec."delayMinutes" > 0 THEN
          jsonb_set(
            COALESCE(elem, '{}'::jsonb),
            '{delayMinutes}',
            to_jsonb(rec."delayMinutes"::int)
          )
        ELSE
          jsonb_set(
            COALESCE(elem, '{}'::jsonb),
            '{delayMinutes}',
            to_jsonb(COALESCE((elem->>'delayMinutes')::int, 0))
          )
      END
    )
    INTO updated_templates
    FROM jsonb_array_elements(rec."notificationTemplates") WITH ORDINALITY AS t(elem, ordinality);
    
    UPDATE "automation" SET "notificationTemplates" = updated_templates WHERE id = rec.id;
  END LOOP;
END $$;

-- Step 4: Ensure all templates have delayMinutes field (set to 0 if missing)
UPDATE "automation"
SET "notificationTemplates" = (
  SELECT jsonb_agg(
    jsonb_set(
      elem,
      '{delayMinutes}',
      to_jsonb(COALESCE((elem->>'delayMinutes')::int, 0))
    )
  )
  FROM jsonb_array_elements("notificationTemplates") AS t(elem)
)
WHERE EXISTS (
  SELECT 1 
  FROM jsonb_array_elements("notificationTemplates") AS t(elem)
  WHERE NOT (elem ? 'delayMinutes')
);

-- Step 5: Remove delayMinutes column (no longer needed at automation level)
ALTER TABLE "automation" 
  DROP COLUMN IF EXISTS "delayMinutes";

-- Step 6: Ensure notificationTemplates is not null and is an array
ALTER TABLE "automation"
  ALTER COLUMN "notificationTemplates" SET NOT NULL;

-- Add a check constraint to ensure it's always an array
ALTER TABLE "automation"
  ADD CONSTRAINT "automation_notificationTemplates_is_array" 
  CHECK (jsonb_typeof("notificationTemplates") = 'array');

