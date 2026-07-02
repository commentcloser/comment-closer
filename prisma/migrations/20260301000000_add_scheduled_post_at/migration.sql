-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "scheduledPostAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Comment_scheduledPostAt_status_idx" ON "Comment"("scheduledPostAt", "status");
