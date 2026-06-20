import { resolveKnockoutWinner } from "./tournament";

const API_BASE_URL = "https://v3.football.api-sports.io";
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

type ApiTeam = {
  id: number;
  name: string;
  winner?: boolean | null;
};

export type ApiFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: {
    round?: string;
  };
  teams: {
    home: ApiTeam;
    away: ApiTeam;
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  score: {
    penalty?: {
      home: number | null;
      away: number | null;
    } | null;
  };
};

export type ApiCardEvent = {
  team: { id: number };
  player?: {
    id?: number | null;
    name?: string | null;
  } | null;
  type: string;
  detail: string;
};

type ApiResponse<T> = {
  response: T[];
  errors?: Record<string, string> | string[];
};

export type DisciplineCounts = {
  yellowCards: number;
  secondYellowReds: number;
  directReds: number;
  yellowDirectReds: number;
};

export type MatchForExternalSync = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
  round: string;
  externalFixtureId: number | null;
  disciplineSyncedAt: Date | null;
};

const TEAM_ALIASES: Record<string, string> = {
  "bosnia herzegovina": "bosnia and herzegovina",
  "cabo verde": "cape verde",
  "cape verde islands": "cape verde",
  "congo dr": "dr congo",
  "cote d ivoire": "ivory coast",
  "curaa ao": "curacao",
  czechia: "czech republic",
  "iran islamic republic": "iran",
  "ir iran": "iran",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  usa: "united states",
  "united states of america": "united states"
};

export function normalizeTeamName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

  return TEAM_ALIASES[normalized] ?? normalized;
}

function sameTeams(match: MatchForExternalSync, fixture: ApiFixture) {
  return (
    normalizeTeamName(match.homeTeam) === normalizeTeamName(fixture.teams.home.name) &&
    normalizeTeamName(match.awayTeam) === normalizeTeamName(fixture.teams.away.name)
  );
}

export function findExternalFixture(
  match: MatchForExternalSync,
  fixtures: ApiFixture[]
) {
  if (match.externalFixtureId !== null) {
    const byId = fixtures.find((fixture) => fixture.fixture.id === match.externalFixtureId);
    if (byId) return byId;
  }

  const candidates = fixtures.filter((fixture) => sameTeams(match, fixture));
  if (candidates.length === 0) return null;

  return candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.fixture.date).getTime() - match.startsAt.getTime()) -
      Math.abs(new Date(b.fixture.date).getTime() - match.startsAt.getTime())
  )[0];
}

function playerKey(event: ApiCardEvent, index: number) {
  return event.player?.id
    ? String(event.player.id)
    : event.player?.name?.trim().toLowerCase() || `unknown-${index}`;
}

export function countDiscipline(
  events: ApiCardEvent[],
  teamId: number
): DisciplineCounts {
  const playerCards = new Map<string, { yellow: number; secondYellow: boolean; red: boolean }>();

  events
    .filter((event) => event.type === "Card" && event.team.id === teamId)
    .forEach((event, index) => {
      const key = playerKey(event, index);
      const cards = playerCards.get(key) ?? {
        yellow: 0,
        secondYellow: false,
        red: false
      };
      const detail = event.detail.toLowerCase();

      if (detail.includes("second yellow")) {
        cards.secondYellow = true;
      } else if (detail.includes("red")) {
        cards.red = true;
      } else if (detail.includes("yellow")) {
        cards.yellow += 1;
      }

      playerCards.set(key, cards);
    });

  const totals: DisciplineCounts = {
    yellowCards: 0,
    secondYellowReds: 0,
    directReds: 0,
    yellowDirectReds: 0
  };

  for (const cards of playerCards.values()) {
    if (cards.secondYellow) {
      totals.secondYellowReds += 1;
      totals.yellowCards += Math.max(0, cards.yellow - 1);
    } else if (cards.red && cards.yellow > 0) {
      totals.yellowDirectReds += 1;
      totals.yellowCards += Math.max(0, cards.yellow - 1);
    } else {
      totals.yellowCards += cards.yellow;
      totals.directReds += cards.red ? 1 : 0;
    }
  }

  return totals;
}

export function isFinishedFixture(fixture: ApiFixture) {
  return FINISHED_STATUSES.has(fixture.fixture.status.short);
}

export function resultFromFixture(
  fixture: ApiFixture,
  match: MatchForExternalSync
) {
  const homeGoals = fixture.goals.home;
  const awayGoals = fixture.goals.away;
  const homePenalties = fixture.score.penalty?.home ?? null;
  const awayPenalties = fixture.score.penalty?.away ?? null;
  const winnerTeam =
    match.round === "GROUP"
      ? null
      : resolveKnockoutWinner({
          phase: fixture.league.round ?? "",
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

function apiErrorMessage<T>(body: ApiResponse<T>) {
  if (Array.isArray(body.errors)) return body.errors.join(", ");
  if (body.errors && Object.keys(body.errors).length > 0) {
    return Object.values(body.errors).join(", ");
  }
  return null;
}

async function apiGet<T>(path: string, apiKey: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API-Football respondio ${response.status}`);
  }

  const body = (await response.json()) as ApiResponse<T>;
  const apiError = apiErrorMessage(body);
  if (apiError) throw new Error(apiError);
  return body.response;
}

export function getWorldCupFixtures(apiKey: string) {
  const league = process.env.API_FOOTBALL_LEAGUE_ID ?? "1";
  const season = process.env.API_FOOTBALL_SEASON ?? "2026";
  return apiGet<ApiFixture>(`/fixtures?league=${league}&season=${season}`, apiKey);
}

export function getFixtureEvents(fixtureId: number, apiKey: string) {
  return apiGet<ApiCardEvent>(`/fixtures/events?fixture=${fixtureId}`, apiKey);
}
