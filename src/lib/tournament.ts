import { THIRD_PLACE_MATRIX, THIRD_PLACE_WINNER_GROUPS } from "./third-place-matrix";

export const GROUPS = "ABCDEFGHIJKL".split("");

export type TournamentMatch = {
  id?: string;
  matchNumber?: number | null;
  round?: string;
  phase: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  winnerTeam?: string | null;
  homeYellowCards?: number;
  awayYellowCards?: number;
  homeSecondYellowReds?: number;
  awaySecondYellowReds?: number;
  homeDirectReds?: number;
  awayDirectReds?: number;
  homeYellowDirectReds?: number;
  awayYellowDirectReds?: number;
};

export type TeamRankingInput = {
  team: string;
  currentRank: number | null;
  previousRank: number | null;
};

export type StandingOverrideInput = {
  group: string;
  team: string;
  position: number;
};

export type TeamStanding = {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  conduct: number;
  currentRank: number | null;
  previousRank: number | null;
  position: number;
  resolved: boolean;
};

type StatLine = Omit<TeamStanding, "position" | "resolved">;

const groupLetter = (phase: string) => phase.replace(/^Grupo\s+/i, "").trim().toUpperCase();

export function conductScore(input: {
  yellowCards?: number;
  secondYellowReds?: number;
  directReds?: number;
  yellowDirectReds?: number;
}) {
  return -(
    (input.yellowCards ?? 0) +
    (input.secondYellowReds ?? 0) * 3 +
    (input.directReds ?? 0) * 4 +
    (input.yellowDirectReds ?? 0) * 5
  );
}

function emptyLine(team: string, group: string, rankings: Map<string, TeamRankingInput>): StatLine {
  const ranking = rankings.get(team);
  return {
    team,
    group,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    conduct: 0,
    currentRank: ranking?.currentRank ?? null,
    previousRank: ranking?.previousRank ?? null
  };
}

function applyMatch(line: StatLine, goalsFor: number, goalsAgainst: number, conduct: number) {
  line.played += 1;
  line.goalsFor += goalsFor;
  line.goalsAgainst += goalsAgainst;
  line.goalDifference = line.goalsFor - line.goalsAgainst;
  line.conduct += conduct;
  if (goalsFor > goalsAgainst) {
    line.won += 1;
    line.points += 3;
  } else if (goalsFor === goalsAgainst) {
    line.drawn += 1;
    line.points += 1;
  } else {
    line.lost += 1;
  }
}

function partitionBy<T>(items: T[], key: (item: T) => string) {
  const partitions: T[][] = [];
  for (const item of items) {
    const value = key(item);
    const current = partitions[partitions.length - 1];
    if (current && key(current[0]) === value) current.push(item);
    else partitions.push([item]);
  }
  return partitions;
}

function miniTable(teams: StatLine[], matches: TournamentMatch[]) {
  const selected = new Set(teams.map((team) => team.team));
  const lines = new Map(teams.map((team) => [team.team, emptyLine(team.team, team.group, new Map())]));
  for (const match of matches) {
    if (
      match.homeGoals === null ||
      match.awayGoals === null ||
      !selected.has(match.homeTeam) ||
      !selected.has(match.awayTeam)
    ) {
      continue;
    }
    applyMatch(lines.get(match.homeTeam)!, match.homeGoals, match.awayGoals, 0);
    applyMatch(lines.get(match.awayTeam)!, match.awayGoals, match.homeGoals, 0);
  }
  return lines;
}

function rankHeadToHead(teams: StatLine[], matches: TournamentMatch[]): StatLine[][] {
  if (teams.length <= 1) return [teams];
  const mini = miniTable(teams, matches);
  const sorted = [...teams].sort((a, b) => {
    const left = mini.get(a.team)!;
    const right = mini.get(b.team)!;
    return (
      right.points - left.points ||
      right.goalDifference - left.goalDifference ||
      right.goalsFor - left.goalsFor
    );
  });
  const partitions = partitionBy(sorted, (team) => {
    const stat = mini.get(team.team)!;
    return `${stat.points}:${stat.goalDifference}:${stat.goalsFor}`;
  });
  if (partitions.length === 1) return [teams];
  return partitions.flatMap((partition) =>
    partition.length === teams.length ? [partition] : rankHeadToHead(partition, matches)
  );
}

function finalTieBreak(
  teams: StatLine[],
  overrides: Map<string, number>
): Array<{ team: StatLine; resolved: boolean }> {
  const sorted = [...teams].sort((a, b) => {
    const overrideA = overrides.get(a.team);
    const overrideB = overrides.get(b.team);
    if (overrideA !== undefined || overrideB !== undefined) {
      return (overrideA ?? Number.MAX_SAFE_INTEGER) - (overrideB ?? Number.MAX_SAFE_INTEGER);
    }
    return (
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      b.conduct - a.conduct ||
      (a.currentRank ?? Number.MAX_SAFE_INTEGER) - (b.currentRank ?? Number.MAX_SAFE_INTEGER) ||
      (a.previousRank ?? Number.MAX_SAFE_INTEGER) - (b.previousRank ?? Number.MAX_SAFE_INTEGER) ||
      a.team.localeCompare(b.team)
    );
  });

  return sorted.map((team, index) => {
    const neighbor = sorted[index - 1] ?? sorted[index + 1];
    if (!neighbor) return { team, resolved: true };
    const hasOverride = overrides.has(team.team);
    const tiedThroughRankings =
      team.goalDifference === neighbor.goalDifference &&
      team.goalsFor === neighbor.goalsFor &&
      team.conduct === neighbor.conduct &&
      team.currentRank === neighbor.currentRank &&
      team.previousRank === neighbor.previousRank;
    return { team, resolved: hasOverride || !tiedThroughRankings };
  });
}

export function calculateGroupStandings(
  matches: TournamentMatch[],
  rankings: TeamRankingInput[] = [],
  overrideRows: StandingOverrideInput[] = []
) {
  const rankingMap = new Map(rankings.map((ranking) => [ranking.team, ranking]));
  const overridesByGroup = new Map<string, Map<string, number>>();
  for (const override of overrideRows) {
    const group = override.group.replace(/^Grupo\s+/i, "").toUpperCase();
    if (!overridesByGroup.has(group)) overridesByGroup.set(group, new Map());
    overridesByGroup.get(group)!.set(override.team, override.position);
  }

  const groupMatches = matches.filter((match) => (match.round ?? "GROUP") === "GROUP");
  const result = new Map<string, TeamStanding[]>();

  for (const group of GROUPS) {
    const matchesForGroup = groupMatches.filter((match) => groupLetter(match.phase) === group);
    const teams = [...new Set(matchesForGroup.flatMap((match) => [match.homeTeam, match.awayTeam]))];
    const lines = new Map(teams.map((team) => [team, emptyLine(team, group, rankingMap)]));

    for (const match of matchesForGroup) {
      if (match.homeGoals === null || match.awayGoals === null) continue;
      applyMatch(
        lines.get(match.homeTeam)!,
        match.homeGoals,
        match.awayGoals,
        conductScore({
          yellowCards: match.homeYellowCards,
          secondYellowReds: match.homeSecondYellowReds,
          directReds: match.homeDirectReds,
          yellowDirectReds: match.homeYellowDirectReds
        })
      );
      applyMatch(
        lines.get(match.awayTeam)!,
        match.awayGoals,
        match.homeGoals,
        conductScore({
          yellowCards: match.awayYellowCards,
          secondYellowReds: match.awaySecondYellowReds,
          directReds: match.awayDirectReds,
          yellowDirectReds: match.awayYellowDirectReds
        })
      );
    }

    const byPoints = [...lines.values()].sort((a, b) => b.points - a.points);
    const pointPartitions = partitionBy(byPoints, (team) => `${team.points}`);
    const ordered: Array<{ team: StatLine; resolved: boolean }> = [];
    for (const pointsTie of pointPartitions) {
      for (const h2hTie of rankHeadToHead(pointsTie, matchesForGroup)) {
        ordered.push(...finalTieBreak(h2hTie, overridesByGroup.get(group) ?? new Map()));
      }
    }
    result.set(
      group,
      ordered.map(({ team, resolved }, index) => ({
        ...team,
        position: index + 1,
        resolved
      }))
    );
  }

  return result;
}

export function rankThirdPlacedTeams(
  standings: Map<string, TeamStanding[]>,
  overrides: StandingOverrideInput[] = []
) {
  const overrideMap = new Map(
    overrides
      .filter((override) => override.group.toUpperCase() === "THIRD")
      .map((override) => [override.team, override.position])
  );
  const thirds = [...standings.values()].map((group) => group[2]).filter(Boolean);
  return finalTieBreak(thirds, overrideMap).map(({ team, resolved }, index) => ({
    ...team,
    position: index + 1,
    resolved,
    qualified: index < 8
  }));
}

export function thirdPlaceAssignment(qualifiedGroups: string[]) {
  const key = [...qualifiedGroups].sort().join("");
  const assignments = THIRD_PLACE_MATRIX[key];
  if (!assignments) return null;
  return Object.fromEntries(
    THIRD_PLACE_WINNER_GROUPS.map((winnerGroup, index) => [winnerGroup, assignments[index]])
  ) as Record<string, string>;
}

export const ROUND_OF_32_SLOTS = [
  { matchNumber: 73, home: "2A", away: "2B" },
  { matchNumber: 74, home: "1E", away: "3:E" },
  { matchNumber: 75, home: "1F", away: "2C" },
  { matchNumber: 76, home: "1C", away: "2F" },
  { matchNumber: 77, home: "1I", away: "3:I" },
  { matchNumber: 78, home: "2E", away: "2I" },
  { matchNumber: 79, home: "1A", away: "3:A" },
  { matchNumber: 80, home: "1L", away: "3:L" },
  { matchNumber: 81, home: "1D", away: "3:D" },
  { matchNumber: 82, home: "1G", away: "3:G" },
  { matchNumber: 83, home: "2K", away: "2L" },
  { matchNumber: 84, home: "1H", away: "2J" },
  { matchNumber: 85, home: "1B", away: "3:B" },
  { matchNumber: 86, home: "1J", away: "2H" },
  { matchNumber: 87, home: "1K", away: "3:K" },
  { matchNumber: 88, home: "2D", away: "2G" }
] as const;

export const KNOCKOUT_TOPOLOGY = [
  { matchNumber: 89, round: "ROUND_OF_16", homeFrom: 73, awayFrom: 75 },
  { matchNumber: 90, round: "ROUND_OF_16", homeFrom: 74, awayFrom: 77 },
  { matchNumber: 91, round: "ROUND_OF_16", homeFrom: 76, awayFrom: 78 },
  { matchNumber: 92, round: "ROUND_OF_16", homeFrom: 79, awayFrom: 80 },
  { matchNumber: 93, round: "ROUND_OF_16", homeFrom: 83, awayFrom: 84 },
  { matchNumber: 94, round: "ROUND_OF_16", homeFrom: 81, awayFrom: 82 },
  { matchNumber: 95, round: "ROUND_OF_16", homeFrom: 86, awayFrom: 88 },
  { matchNumber: 96, round: "ROUND_OF_16", homeFrom: 85, awayFrom: 87 },
  { matchNumber: 97, round: "QUARTERFINAL", homeFrom: 89, awayFrom: 90 },
  { matchNumber: 98, round: "QUARTERFINAL", homeFrom: 93, awayFrom: 94 },
  { matchNumber: 99, round: "QUARTERFINAL", homeFrom: 91, awayFrom: 92 },
  { matchNumber: 100, round: "QUARTERFINAL", homeFrom: 95, awayFrom: 96 },
  { matchNumber: 101, round: "SEMIFINAL", homeFrom: 97, awayFrom: 98 },
  { matchNumber: 102, round: "SEMIFINAL", homeFrom: 99, awayFrom: 100 },
  { matchNumber: 103, round: "THIRD_PLACE", homeFrom: 101, awayFrom: 102, useLosers: true },
  { matchNumber: 104, round: "FINAL", homeFrom: 101, awayFrom: 102 }
] as const;

export function resolveKnockoutWinner(match: TournamentMatch) {
  if (match.homeGoals === null || match.awayGoals === null) return null;
  if (match.homeGoals > match.awayGoals) return match.homeTeam;
  if (match.awayGoals > match.homeGoals) return match.awayTeam;
  if (match.homePenalties === null || match.homePenalties === undefined) return null;
  if (match.awayPenalties === null || match.awayPenalties === undefined) return null;
  if (match.homePenalties === match.awayPenalties) return null;
  return match.homePenalties > match.awayPenalties ? match.homeTeam : match.awayTeam;
}

export function resolveKnockoutLoser(match: TournamentMatch) {
  const winner = match.winnerTeam ?? resolveKnockoutWinner(match);
  if (!winner) return null;
  return winner === match.homeTeam ? match.awayTeam : match.homeTeam;
}

export function buildRoundOf32Preview(
  standings: Map<string, TeamStanding[]>,
  thirds: Array<TeamStanding & { qualified: boolean }>
) {
  const qualifiedThirds = thirds.filter((team) => team.qualified);
  const assignment = thirdPlaceAssignment(qualifiedThirds.map((team) => team.group));
  const thirdByGroup = new Map(qualifiedThirds.map((team) => [team.group, team.team]));
  const position = (slot: string) => standings.get(slot.slice(1))?.[Number(slot[0]) - 1]?.team ?? null;

  return ROUND_OF_32_SLOTS.map((slot) => {
    const resolveSlot = (value: string) => {
      if (!value.startsWith("3:")) return position(value);
      const winnerGroup = value.slice(2);
      const thirdGroup = assignment?.[winnerGroup];
      return thirdGroup ? thirdByGroup.get(thirdGroup) ?? null : null;
    };
    return {
      matchNumber: slot.matchNumber,
      homeTeam: resolveSlot(slot.home),
      awayTeam: resolveSlot(slot.away)
    };
  });
}

export function groupStageComplete(matches: TournamentMatch[]) {
  const groupMatches = matches.filter((match) => (match.round ?? "GROUP") === "GROUP");
  return (
    groupMatches.length === 72 &&
    groupMatches.every((match) => match.homeGoals !== null && match.awayGoals !== null)
  );
}
