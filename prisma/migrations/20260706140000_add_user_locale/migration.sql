-- Additive only. Nullable with default, safe on existing rows.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locale" TEXT DEFAULT 'en';
