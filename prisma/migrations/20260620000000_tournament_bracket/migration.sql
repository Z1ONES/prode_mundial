ALTER TABLE "Match"
ADD COLUMN "matchNumber" INTEGER,
ADD COLUMN "round" TEXT NOT NULL DEFAULT 'GROUP',
ADD COLUMN "homePenalties" INTEGER,
ADD COLUMN "awayPenalties" INTEGER,
ADD COLUMN "winnerTeam" TEXT,
ADD COLUMN "homeYellowCards" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "awayYellowCards" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "homeSecondYellowReds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "awaySecondYellowReds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "homeDirectReds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "awayDirectReds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "homeYellowDirectReds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "awayYellowDirectReds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Prediction"
ADD COLUMN "advancingTeam" TEXT;

CREATE UNIQUE INDEX "Match_matchNumber_key" ON "Match"("matchNumber");

CREATE TABLE "TeamRanking" (
  "team" TEXT NOT NULL,
  "currentRank" INTEGER,
  "previousRank" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamRanking_pkey" PRIMARY KEY ("team")
);

CREATE TABLE "StandingOverride" (
  "id" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandingOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StandingOverride_group_team_key"
ON "StandingOverride"("group", "team");

CREATE UNIQUE INDEX "StandingOverride_group_position_key"
ON "StandingOverride"("group", "position");

CREATE TABLE "TournamentState" (
  "id" TEXT NOT NULL DEFAULT 'world-cup-2026',
  "bracketLockedAt" TIMESTAMP(3),
  "thirdPlaceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TournamentState_pkey" PRIMARY KEY ("id")
);
