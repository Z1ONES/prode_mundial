import { prisma } from "@/lib/prisma";
import {
  buildRoundOf32Preview,
  calculateGroupStandings,
  groupStageComplete,
  KNOCKOUT_TOPOLOGY,
  rankThirdPlacedTeams,
  resolveKnockoutLoser,
  resolveKnockoutWinner
} from "@/lib/tournament";

const ROUND_LABELS: Record<string, string> = {
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTERFINAL: "Cuartos",
  SEMIFINAL: "Semifinal",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final"
};

function scheduledAt(matchNumber: number, round: string) {
  const dates: Record<number, string> = {
    73: "2026-06-28T16:00:00-03:00",
    74: "2026-06-29T17:30:00-03:00",
    75: "2026-06-29T22:00:00-03:00",
    76: "2026-06-29T14:00:00-03:00",
    77: "2026-06-30T18:00:00-03:00",
    78: "2026-06-30T14:00:00-03:00",
    79: "2026-06-30T22:00:00-03:00",
    80: "2026-07-01T13:00:00-03:00",
    81: "2026-07-01T21:00:00-03:00",
    82: "2026-07-01T17:00:00-03:00",
    83: "2026-07-02T20:00:00-03:00",
    84: "2026-07-02T16:00:00-03:00",
    85: "2026-07-03T00:00:00-03:00",
    86: "2026-07-03T19:00:00-03:00",
    87: "2026-07-03T22:30:00-03:00",
    88: "2026-07-03T15:00:00-03:00",
    89: "2026-07-04T14:00:00-03:00",
    90: "2026-07-04T18:00:00-03:00",
    91: "2026-07-05T17:00:00-03:00",
    92: "2026-07-05T21:00:00-03:00",
    93: "2026-07-06T16:00:00-03:00",
    94: "2026-07-06T21:00:00-03:00",
    95: "2026-07-07T13:00:00-03:00",
    96: "2026-07-07T17:00:00-03:00",
    97: "2026-07-09T17:00:00-03:00",
    98: "2026-07-10T16:00:00-03:00",
    99: "2026-07-11T18:00:00-03:00",
    100: "2026-07-11T22:00:00-03:00",
    101: "2026-07-14T16:00:00-03:00",
    102: "2026-07-15T16:00:00-03:00",
    103: "2026-07-18T18:00:00-03:00",
    104: "2026-07-19T16:00:00-03:00"
  };
  return new Date(dates[matchNumber] ?? dates[round === "FINAL" ? 104 : 103]);
}

export async function getTournamentSnapshot() {
  const [matches, rankings, overrides, state] = await Promise.all([
    prisma.match.findMany({ orderBy: [{ matchNumber: "asc" }, { startsAt: "asc" }] }),
    prisma.teamRanking.findMany(),
    prisma.standingOverride.findMany(),
    prisma.tournamentState.findUnique({ where: { id: "world-cup-2026" } })
  ]);
  const standings = calculateGroupStandings(matches, rankings, overrides);
  const thirds = rankThirdPlacedTeams(standings, overrides);
  const preview = buildRoundOf32Preview(standings, thirds);
  const complete = groupStageComplete(matches);
  const resolved = [...standings.values()].every((group) => group.every((team) => team.resolved));

  return {
    matches,
    rankings,
    overrides,
    state,
    standings,
    thirds,
    preview,
    complete,
    resolved
  };
}

export async function syncTournamentBracket() {
  const snapshot = await getTournamentSnapshot();
  let state = snapshot.state;

  if (!state?.bracketLockedAt && snapshot.complete && snapshot.resolved) {
    const teamsByMatch = new Map(
      snapshot.preview.map((match) => [match.matchNumber, [match.homeTeam, match.awayTeam] as const])
    );
    if (snapshot.preview.every((match) => match.homeTeam && match.awayTeam)) {
      const qualifiedGroups = snapshot.thirds
        .filter((team) => team.qualified)
        .map((team) => team.group)
        .sort()
        .join("");
      await prisma.$transaction(async (tx) => {
        for (const [matchNumber, teams] of teamsByMatch) {
          await tx.match.upsert({
            where: { matchNumber },
            update: {},
            create: {
              matchNumber,
              round: "ROUND_OF_32",
              phase: ROUND_LABELS.ROUND_OF_32,
              homeTeam: teams[0]!,
              awayTeam: teams[1]!,
              startsAt: scheduledAt(matchNumber, "ROUND_OF_32")
            }
          });
        }
        state = await tx.tournamentState.upsert({
          where: { id: "world-cup-2026" },
          update: { bracketLockedAt: new Date(), thirdPlaceKey: qualifiedGroups },
          create: {
            id: "world-cup-2026",
            bracketLockedAt: new Date(),
            thirdPlaceKey: qualifiedGroups
          }
        });
      });
    }
  }

  const knockoutMatches = await prisma.match.findMany({
    where: { round: { not: "GROUP" } },
    orderBy: { matchNumber: "asc" }
  });
  const byNumber = new Map(knockoutMatches.map((match) => [match.matchNumber!, match]));

  for (const slot of KNOCKOUT_TOPOLOGY) {
    if (byNumber.has(slot.matchNumber)) continue;
    const homeSource = byNumber.get(slot.homeFrom);
    const awaySource = byNumber.get(slot.awayFrom);
    if (!homeSource || !awaySource) continue;
    const useLosers = "useLosers" in slot && slot.useLosers;
    const homeTeam = useLosers
      ? resolveKnockoutLoser(homeSource)
      : homeSource.winnerTeam ?? resolveKnockoutWinner(homeSource);
    const awayTeam = useLosers
      ? resolveKnockoutLoser(awaySource)
      : awaySource.winnerTeam ?? resolveKnockoutWinner(awaySource);
    if (!homeTeam || !awayTeam) continue;

    const match = await prisma.match.create({
      data: {
        matchNumber: slot.matchNumber,
        round: slot.round,
        phase: ROUND_LABELS[slot.round],
        homeTeam,
        awayTeam,
        startsAt: scheduledAt(slot.matchNumber, slot.round)
      }
    });
    byNumber.set(slot.matchNumber, match);
  }

  return { state };
}

export async function canResetBracket() {
  const [predictions, completed] = await Promise.all([
    prisma.prediction.count({ where: { match: { round: { not: "GROUP" } } } }),
    prisma.match.count({
      where: {
        round: { not: "GROUP" },
        OR: [{ homeGoals: { not: null } }, { awayGoals: { not: null } }]
      }
    })
  ]);
  return predictions === 0 && completed === 0;
}

export async function resetTournamentBracket(force = false) {
  if (!force && !(await canResetBracket())) {
    throw new Error("El cuadro ya tiene resultados o pronosticos.");
  }
  await prisma.$transaction([
    prisma.prediction.deleteMany({ where: { match: { round: { not: "GROUP" } } } }),
    prisma.match.deleteMany({ where: { round: { not: "GROUP" } } }),
    prisma.tournamentState.upsert({
      where: { id: "world-cup-2026" },
      update: { bracketLockedAt: null, thirdPlaceKey: null },
      create: { id: "world-cup-2026" }
    })
  ]);
}
