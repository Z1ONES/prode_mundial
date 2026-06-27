import { describe, expect, it } from "vitest";
import { THIRD_PLACE_MATRIX, THIRD_PLACE_WINNER_GROUPS } from "./third-place-matrix";
import {
  buildRoundOf32Preview,
  calculateGroupStandings,
  conductScore,
  rankThirdPlacedTeams,
  resolveKnockoutWinner,
  thirdPlaceAssignment,
  type TournamentMatch
} from "./tournament";

function groupMatch(
  homeTeam: string,
  awayTeam: string,
  homeGoals: number,
  awayGoals: number,
  phase = "Grupo A"
): TournamentMatch {
  return {
    phase,
    round: "GROUP",
    homeTeam,
    awayTeam,
    homeGoals,
    awayGoals
  };
}

describe("FIFA 2026 standings", () => {
  it("calculates points, goals and positions", () => {
    const standings = calculateGroupStandings([
      groupMatch("A", "B", 2, 0),
      groupMatch("C", "D", 1, 1),
      groupMatch("A", "C", 1, 0),
      groupMatch("D", "B", 0, 2),
      groupMatch("D", "A", 0, 3),
      groupMatch("B", "C", 1, 0)
    ]);
    const group = standings.get("A")!;
    expect(group.map((team) => team.team)).toEqual(["A", "B", "C", "D"]);
    expect(group[0]).toMatchObject({ points: 9, goalsFor: 6, goalsAgainst: 0 });
  });

  it("uses head-to-head before overall goal difference", () => {
    const standings = calculateGroupStandings([
      groupMatch("A", "B", 1, 0),
      groupMatch("A", "C", 0, 1),
      groupMatch("A", "D", 3, 0),
      groupMatch("B", "C", 5, 0),
      groupMatch("B", "D", 1, 0),
      groupMatch("C", "D", 1, 0)
    ]);
    const group = standings.get("A")!;
    expect(group.slice(0, 3).map((team) => team.team)).toEqual(["B", "A", "C"]);
  });

  it("calculates FIFA conduct deductions", () => {
    expect(
      conductScore({
        yellowCards: 2,
        secondYellowReds: 1,
        directReds: 1,
        yellowDirectReds: 1
      })
    ).toBe(-14);
  });

  it("ranks the best eight third-placed teams", () => {
    const matches: TournamentMatch[] = [];
    for (const group of "ABCDEFGHIJKL") {
      matches.push(
        groupMatch(`${group}1`, `${group}2`, 1, 0, `Grupo ${group}`),
        groupMatch(`${group}3`, `${group}4`, 1, 0, `Grupo ${group}`),
        groupMatch(`${group}1`, `${group}3`, 2, 0, `Grupo ${group}`),
        groupMatch(`${group}4`, `${group}2`, 0, 2, `Grupo ${group}`),
        groupMatch(`${group}4`, `${group}1`, 0, 3, `Grupo ${group}`),
        groupMatch(`${group}2`, `${group}3`, 1, 0, `Grupo ${group}`)
      );
    }
    const thirds = rankThirdPlacedTeams(calculateGroupStandings(matches));
    expect(thirds).toHaveLength(12);
    expect(thirds.filter((team) => team.qualified)).toHaveLength(8);
  });

  it("orders third-placed teams by points before goal difference", () => {
    const thirdRows = [
      ["A", "A3", 4, -2, 1],
      ["B", "B3", 3, 5, 8],
      ["C", "C3", 3, 0, 3],
      ["D", "D3", 3, -1, 2],
      ["E", "E3", 3, -2, 1],
      ["F", "F3", 2, 2, 4],
      ["G", "G3", 2, 1, 3],
      ["H", "H3", 2, 0, 2],
      ["I", "I3", 1, 10, 10],
      ["J", "J3", 1, 0, 1],
      ["K", "K3", 0, 0, 0],
      ["L", "L3", 0, -1, 0]
    ] as const;

    const standings = new Map(
      thirdRows.map(([group, team, points, goalDifference, goalsFor]) => [
        group,
        [
          {
            team: `${group}1`,
            group,
            position: 1,
            played: 3,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            conduct: 0,
            currentRank: null,
            previousRank: null,
            resolved: true
          },
          {
            team: `${group}2`,
            group,
            position: 2,
            played: 3,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            conduct: 0,
            currentRank: null,
            previousRank: null,
            resolved: true
          },
          {
            team,
            group,
            position: 3,
            played: 3,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor,
            goalsAgainst: 0,
            goalDifference,
            points,
            conduct: 0,
            currentRank: null,
            previousRank: null,
            resolved: true
          }
        ]
      ])
    );

    const thirds = rankThirdPlacedTeams(standings);
    expect(thirds[0]).toMatchObject({ team: "A3", points: 4, qualified: true });
    expect(thirds.find((team) => team.team === "I3")?.qualified).toBe(false);
  });
});

describe("FIFA 2026 Annex C", () => {
  it("contains all 495 combinations with unique valid assignments", () => {
    expect(Object.keys(THIRD_PLACE_MATRIX)).toHaveLength(495);
    for (const [groups, assignments] of Object.entries(THIRD_PLACE_MATRIX)) {
      expect(groups).toHaveLength(8);
      expect(assignments).toHaveLength(8);
      expect(new Set(assignments).size).toBe(8);
      expect([...assignments].sort().join("")).toBe(groups);
      expect(THIRD_PLACE_WINNER_GROUPS).toHaveLength(8);
    }
  });

  it("resolves a known Annex C row", () => {
    expect(thirdPlaceAssignment(["E", "F", "G", "H", "I", "J", "K", "L"])).toEqual({
      A: "E",
      B: "J",
      D: "I",
      E: "F",
      G: "H",
      I: "G",
      K: "L",
      L: "K"
    });
  });

  it("builds all 16 round-of-32 slots without duplicate third teams", () => {
    const standings = new Map(
      "ABCDEFGHIJKL".split("").map((group) => [
        group,
        [1, 2, 3, 4].map((position) => ({
          team: `${group}${position}`,
          group,
          position,
          played: 3,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          conduct: 0,
          currentRank: position,
          previousRank: position,
          resolved: true
        }))
      ])
    );
    const thirds = [...standings.values()].map((group, index) => ({
      ...group[2],
      qualified: index >= 4
    }));
    const preview = buildRoundOf32Preview(standings, thirds);
    expect(preview).toHaveLength(16);
    expect(preview.every((match) => match.homeTeam && match.awayTeam)).toBe(true);
  });
});

describe("knockout winner", () => {
  it("uses penalties after an extra-time draw", () => {
    expect(
      resolveKnockoutWinner({
        phase: "Final",
        round: "FINAL",
        homeTeam: "Argentina",
        awayTeam: "Brasil",
        homeGoals: 1,
        awayGoals: 1,
        homePenalties: 5,
        awayPenalties: 4
      })
    ).toBe("Argentina");
  });
});
