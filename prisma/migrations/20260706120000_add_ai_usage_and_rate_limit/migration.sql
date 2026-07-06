-- Additive only: two new tables (AiUsageEvent metering + durable RateLimit).
-- IF NOT EXISTS keeps this idempotent given this project's db-push workflow.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "connectedPageId" TEXT,
    "source" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "webSearch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "firstAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageEvent_connectedPageId_createdAt_idx" ON "AiUsageEvent"("connectedPageId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimit_blockedUntil_idx" ON "RateLimit"("blockedUntil");
