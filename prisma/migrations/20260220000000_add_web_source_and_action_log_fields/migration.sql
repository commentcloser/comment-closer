ALTER TABLE "ConnectedPage" ADD COLUMN IF NOT EXISTS "customReplyPrompt" TEXT;
ALTER TABLE "ConnectedPage" ADD COLUMN IF NOT EXISTS "webSourceUrl" TEXT;
ALTER TABLE "ConnectedPage" ADD COLUMN IF NOT EXISTS "webSourceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConnectedPage" ADD COLUMN IF NOT EXISTS "webSourceMode" TEXT NOT NULL DEFAULT 'auto';

-- Ensure CommentActionLog table exists (for shadow DBs / fresh databases)
CREATE TABLE IF NOT EXISTS "CommentActionLog" (
    "id"              TEXT        NOT NULL,
    "commentId"       TEXT        NOT NULL,
    "connectedPageId" TEXT        NOT NULL,
    "provider"        TEXT        NOT NULL,
    "actionType"      TEXT        NOT NULL,
    "status"          TEXT        NOT NULL,
    "reason"          TEXT,
    "ruleTriggered"   TEXT,
    "aiPromptVersion" TEXT,
    "aiModel"         TEXT,
    "aiReplyText"     TEXT,
    "metaResponse"    JSONB,
    "errorMessage"    TEXT,
    "webUsed"         BOOLEAN,
    "webDomain"       TEXT,
    "promptSource"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentActionLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable: CommentActionLog - add web/prompt tracking columns
ALTER TABLE "CommentActionLog" ADD COLUMN IF NOT EXISTS "webUsed" BOOLEAN;
ALTER TABLE "CommentActionLog" ADD COLUMN IF NOT EXISTS "webDomain" TEXT;
ALTER TABLE "CommentActionLog" ADD COLUMN IF NOT EXISTS "promptSource" TEXT;
