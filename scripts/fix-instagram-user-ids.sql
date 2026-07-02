-- Fix Instagram User IDs for pages where instagramUserId is null
-- These pages were connected before the instagramUserId field was added

-- For pages where pageId already equals the Instagram Business Account ID,
-- we can safely copy pageId to instagramUserId

UPDATE "ConnectedPage"
SET "instagramUserId" = "pageId"
WHERE "provider" = 'instagram' 
  AND "instagramUserId" IS NULL
  AND "pageId" IS NOT NULL;

-- Verify the update
SELECT "id", "pageId", "pageName", "instagramUserId", "provider"
FROM "ConnectedPage"
WHERE "provider" = 'instagram';
