import { describe, expect, it } from "vitest";
import {
  countDiscipline,
  findExternalFixture,
  normalizeTeamName,
  type ApiCardEvent,
  type ApiFixture
} from "./api-football";

function fixture(id: number, home: string, away: string, date: string): ApiFixture {
  return {
    fixture: { id, date, status: { short: "FT" } },
    league: { round: "Group Stage" },
    teams: {
      home: { id: 1, name: home },
      away: { id: 2, name: away }
    },
    goals: { home: 1, away: 0 },
    score: { penalty: null }
  };
}

describe("API-Football matching", () => {
  it("normalizes provider aliases", () => {
    expect(normalizeTeamName("USA")).toBe("united states");
    expect(normalizeTeamName("Côte d'Ivoire")).toBe("ivory coast");
    expect(normalizeTeamName("Korea Republic")).toBe("south korea");
  });

  it("matches the closest fixture for the same teams", () => {
    const match = {
      id: "local",
      homeTeam: "United States",
      awayTeam: "Paraguay",
      startsAt: new Date("2026-06-12T22:00:00-03:00"),
      round: "GROUP",
      externalFixtureId: null,
      disciplineSyncedAt: null
    };
    const selected = findExternalFixture(match, [
      fixture(1, "USA", "Paraguay", "2026-01-01T00:00:00Z"),
      fixture(2, "USA", "Paraguay", "2026-06-13T01:00:00Z")
    ]);

    expect(selected?.fixture.id).toBe(2);
  });
});

describe("API-Football discipline", () => {
  it("converts card events to FIFA conduct categories", () => {
    const events: ApiCardEvent[] = [
      {
        team: { id: 1 },
        player: { id: 10, name: "One" },
        type: "Card",
        detail: "Yellow Card"
      },
      {
        team: { id: 1 },
        player: { id: 10, name: "One" },
        type: "Card",
        detail: "Second Yellow card"
      },
      {
        team: { id: 1 },
        player: { id: 20, name: "Two" },
        type: "Card",
        detail: "Yellow Card"
      },
      {
        team: { id: 1 },
        player: { id: 20, name: "Two" },
        type: "Card",
        detail: "Red Card"
      },
      {
        team: { id: 1 },
        player: { id: 30, name: "Three" },
        type: "Card",
        detail: "Yellow Card"
      },
      {
        team: { id: 1 },
        player: { id: 40, name: "Four" },
        type: "Card",
        detail: "Red Card"
      }
    ];

    expect(countDiscipline(events, 1)).toEqual({
      yellowCards: 1,
      secondYellowReds: 1,
      directReds: 1,
      yellowDirectReds: 1
    });
  });
});
