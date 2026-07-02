-- AlterTable: Remove webSourceMode (always use website when enabled + URL)
ALTER TABLE "ConnectedPage" DROP COLUMN IF EXISTS "webSourceMode";
