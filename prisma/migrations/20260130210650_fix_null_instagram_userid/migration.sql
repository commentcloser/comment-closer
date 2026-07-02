UPDATE "ConnectedPage"
SET "instagramUserId" = "pageId"
WHERE "provider" = 'instagram'
  AND "instagramUserId" IS NULL;
