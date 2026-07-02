-- AlterTable
ALTER TABLE "ConnectedPage" ADD COLUMN     "instagramUserId" TEXT;

-- CreateIndex
CREATE INDEX "ConnectedPage_instagramUserId_idx" ON "ConnectedPage"("instagramUserId");
