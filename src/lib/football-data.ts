import { normalizeTeamName, type MatchForExternalSync } from "./api-football";
import { resolveKnockoutWinner } from "./tournament";

const API_BASE_URL = "https://api.football-data.org/v4";

type ScorePair = {
  home?: number | null;
  away?: number | null;
  homeTeam?: number | null;
  awayTeam?: number | null;
} | null;

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: {
    id: number;
    name: string;
    shortName?: string | null;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName?: string | null;
  };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    fullTime: ScorePair;
    regularTime?: ScorePair;
    extraTime?: ScorePair;
    penalties?: ScorePair;
  };
};

type FootballDataResponse = {
  matches?: FootballDataMatch[];
  message?: string;
  errorCode?: number;
};

export class FootballDataError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function scoreValue(pair: ScorePair, side: "home" | "away") {
  if (!pair) return null;
  return pair[side] ?? pair[side === "home" ? "homeTeam" : "awayTeam"] ?? null;
}

function teamNames(team: FootballDataMatch["homeTeam"]) {
  return [team.name, team.shortName].filter((value): value is string => Boolean(value));
}

function sameTeam(localTeam: string, externalTeam: FootballDataMatch["homeTeam"]) {
  const normalizedLocal = normalizeTeamName(localTeam);
  return teamNames(externalTeam).some(
    (name) => normalizeTeamName(name) === normalizedLocal
  );
}

export function findFootballDataMatch(
  match: MatchForExternalSync & { externalProvider?: string | null },
  fixtures: FootballDataMatch[]
) {
  if (match.externalProvider === "football-data" && match.externalFixtureId !== null) {
    const byId = fixtures.find((fixture) => fixture.id === match.externalFixtureId);
    if (byId) return byId;
  }

  const candidates = fixtures.filter(
    (fixture) =>
      sameTeam(match.homeTeam, fixture.homeTeam) &&
      sameTeam(match.awayTeam, fixture.awayTeam)
  );
  if (candidates.length === 0) return null;

  return candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.utcDate).getTime() - match.startsAt.getTime()) -
      Math.abs(new Date(b.utcDate).getTime() - match.startsAt.getTime())
  )[0];
}

export function resultFromFootballData(
  fixture: FootballDataMatch,
  match: MatchForExternalSync
) {
  const duration = fixture.score.duration;
  const regularHome = scoreValue(fixture.score.regularTime ?? null, "home");
  const regularAway = scoreValue(fixture.score.regularTime ?? null, "away");
  const extraHome = scoreValue(fixture.score.extraTime ?? null, "home") ?? 0;
  const extraAway = scoreValue(fixture.score.extraTime ?? null, "away") ?? 0;
  const fullHome = scoreValue(fixture.score.fullTime, "home");
  const fullAway = scoreValue(fixture.score.fullTime, "away");

  const homeGoals =
    duration === "PENALTY_SHOOTOUT" && regularHome !== null
      ? regularHome + extraHome
      : fullHome;
  const awayGoals =
    duration === "PENALTY_SHOOTOUT" && regularAway !== null
      ? regularAway + extraAway
      : fullAway;
  const homePenalties =
    duration === "PENALTY_SHOOTOUT"
      ? scoreValue(fixture.score.penalties ?? null, "home")
      : null;
  const awayPenalties =
    duration === "PENALTY_SHOOTOUT"
      ? scoreValue(fixture.score.penalties ?? null, "away")
      : null;
  const winnerTeam =
    match.round === "GROUP"
      ? null
      : resolveKnockoutWinner({
          phase: "",
          round: match.round,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeGoals,
          awayGoals,
          homePenalties,
          awayPenalties
        });

  return {
    homeGoals,
    awayGoals,
    homePenalties,
    awayPenalties,
    winnerTeam
  };
}

export function isFinishedFootballDataMatch(fixture: FootballDataMatch) {
  return fixture.status === "FINISHED";
}

export async function getFootballDataWorldCupMatches(apiKey: string) {
  const competition = process.env.FOOTBALL_DATA_COMPETITION ?? "WC";
  const season = process.env.FOOTBALL_DATA_SEASON ?? "2026";
  const response = await fetch(
    `${API_BASE_URL}/competitions/${competition}/matches?season=${season}`,
    {
      headers: { "X-Auth-Token": apiKey },
      cache: "no-store"
    }
  );

  let body: FootballDataResponse;
  try {
    body = (await response.json()) as FootballDataResponse;
  } catch {
    throw new FootballDataError(
      response.status,
      `football-data.org respondio ${response.status} sin JSON valido.`
    );
  }

  if (!response.ok) {
    throw new FootballDataError(
      response.status,
      body.message || `football-data.org respondio ${response.status}.`
    );
  }

  return body.matches ?? [];
}
