import { describe, expect, it } from "vitest";
import {
  findFootballDataMatch,
  resultFromFootballData,
  type FootballDataMatch
} from "./football-data";

function fixture(overrides: Partial<FootballDataMatch> = {}): FootballDataMatch {
  return {
    id: 500,
    utcDate: "2026-06-13T01:00:00Z",
    status: "FINISHED",
    homeTeam: { id: 1, name: "USA", shortName: "United States" },
    awayTeam: { id: 2, name: "Paraguay" },
    score: {
      winner: "HOME_TEAM",
      duration: "REGULAR",
      fullTime: { home: 2, away: 0 }
    },
    ...overrides
  };
}

const localMatch = {
  id: "local",
  homeTeam: "United States",
  awayTeam: "Paraguay",
  startsAt: new Date("2026-06-12T22:00:00-03:00"),
  round: "GROUP",
  externalFixtureId: null,
  externalProvider: null,
  disciplineSyncedAt: null
};

describe("football-data.org matching", () => {
  it("matches using provider short names", () => {
    expect(findFootballDataMatch(localMatch, [fixture()])?.id).toBe(500);
  });
});

describe("football-data.org results", () => {
  it("uses the final regular score", () => {
    expect(resultFromFootballData(fixture(), localMatch)).toMatchObject({
      homeGoals: 2,
      awayGoals: 0,
      homePenalties: null,
      awayPenalties: null
    });
  });

  it("separates the extra-time score from the penalty shootout", () => {
    const knockout = { ...localMatch, round: "FINAL" };
    const penalties = fixture({
      score: {
        winner: "HOME_TEAM",
        duration: "PENALTY_SHOOTOUT",
        fullTime: { home: 7, away: 6 },
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 6, away: 5 }
      }
    });

    expect(resultFromFootballData(penalties, knockout)).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      homePenalties: 6,
      awayPenalties: 5,
      winnerTeam: "United States"
    });
  });
});
