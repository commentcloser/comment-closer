-- Add profileImageUrl column without dropping existing columns
ALTER TABLE "ConnectedPage" ADD COLUMN IF NOT EXISTS "profileImageUrl" TEXT;
