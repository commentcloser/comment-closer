-- Additive only. Nullable columns, safe on existing rows.
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "identityType" TEXT;
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "type" TEXT;
