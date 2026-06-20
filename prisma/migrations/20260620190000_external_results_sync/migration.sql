ALTER TABLE "Match"
ADD COLUMN "externalFixtureId" INTEGER,
ADD COLUMN "externalSyncedAt" TIMESTAMP(3),
ADD COLUMN "disciplineSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Match_externalFixtureId_key" ON "Match"("externalFixtureId");

ALTER TABLE "TournamentState"
ADD COLUMN "lastExternalSyncAt" TIMESTAMP(3),
ADD COLUMN "lastExternalSyncStatus" TEXT,
ADD COLUMN "lastExternalSyncRequests" INTEGER NOT NULL DEFAULT 0;
