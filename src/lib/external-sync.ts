import { prisma } from "@/lib/prisma";
import {
  countDiscipline,
  findExternalFixture,
  getFixtureEvents,
  getWorldCupFixtures,
  isFinishedFixture,
  resultFromFixture
} from "@/lib/api-football";
import { syncTournamentBracket } from "@/lib/tournament-service";

const STATE_ID = "world-cup-2026";
const COOLDOWN_MS = 60_000;

export class ExternalSyncError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function syncResultsFromApiFootball() {
  const apiKey = process.env.API_FOOTBALL_KEY?.trim();
  if (!apiKey) {
    throw new ExternalSyncError("api-key", "Falta configurar API_FOOTBALL_KEY.");
  }

  const state = await prisma.tournamentState.findUnique({ where: { id: STATE_ID } });
  if (
    state?.lastExternalSyncAt &&
    Date.now() - state.lastExternalSyncAt.getTime() < COOLDOWN_MS
  ) {
    throw new ExternalSyncError("cooldown", "Espera un minuto antes de actualizar otra vez.");
  }

  const eventLimit = Math.min(
    90,
    Math.max(0, Number(process.env.API_FOOTBALL_EVENT_LIMIT ?? "20") || 20)
  );
  let requests = 1;

  try {
    const [fixtures, matches] = await Promise.all([
      getWorldCupFixtures(apiKey),
      prisma.match.findMany({
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          homeTeam: true,
          awayTeam: true,
          startsAt: true,
          round: true,
          externalFixtureId: true,
          disciplineSyncedAt: true
        }
      })
    ]);

    if (fixtures.length === 0) {
      throw new ExternalSyncError(
        "no-fixtures",
        "La API no devolvio partidos del Mundial 2026."
      );
    }

    let matched = 0;
    let resultsUpdated = 0;
    let disciplineUpdated = 0;
    let pendingDiscipline = 0;

    for (const match of matches) {
      const fixture = findExternalFixture(match, fixtures);
      if (!fixture) continue;
      matched += 1;

      const finished = isFinishedFixture(fixture);
      const result = finished ? resultFromFixture(fixture, match) : null;
      const needsDiscipline = finished && match.disciplineSyncedAt === null;
      const shouldSyncDiscipline = needsDiscipline && disciplineUpdated < eventLimit;
      let disciplineData = {};

      if (shouldSyncDiscipline) {
        const events = await getFixtureEvents(fixture.fixture.id, apiKey);
        requests += 1;
        const home = countDiscipline(events, fixture.teams.home.id);
        const away = countDiscipline(events, fixture.teams.away.id);
        disciplineData = {
          homeYellowCards: home.yellowCards,
          awayYellowCards: away.yellowCards,
          homeSecondYellowReds: home.secondYellowReds,
          awaySecondYellowReds: away.secondYellowReds,
          homeDirectReds: home.directReds,
          awayDirectReds: away.directReds,
          homeYellowDirectReds: home.yellowDirectReds,
          awayYellowDirectReds: away.yellowDirectReds,
          disciplineSyncedAt: new Date()
        };
        disciplineUpdated += 1;
      } else if (needsDiscipline) {
        pendingDiscipline += 1;
      }

      await prisma.match.update({
        where: { id: match.id },
        data: {
          externalFixtureId: fixture.fixture.id,
          externalSyncedAt: new Date(),
          ...(result ?? {}),
          ...disciplineData
        }
      });

      if (result) resultsUpdated += 1;
    }

    await syncTournamentBracket();

    const status = JSON.stringify({
      matched,
      resultsUpdated,
      disciplineUpdated,
      pendingDiscipline
    });

    await prisma.tournamentState.upsert({
      where: { id: STATE_ID },
      create: {
        id: STATE_ID,
        lastExternalSyncAt: new Date(),
        lastExternalSyncStatus: status,
        lastExternalSyncRequests: requests
      },
      update: {
        lastExternalSyncAt: new Date(),
        lastExternalSyncStatus: status,
        lastExternalSyncRequests: requests
      }
    });

    return {
      matched,
      resultsUpdated,
      disciplineUpdated,
      pendingDiscipline,
      requests
    };
  } catch (error) {
    await prisma.tournamentState.upsert({
      where: { id: STATE_ID },
      create: {
        id: STATE_ID,
        lastExternalSyncAt: new Date(),
        lastExternalSyncStatus: JSON.stringify({
          error: error instanceof Error ? error.message : "Error desconocido"
        }),
        lastExternalSyncRequests: requests
      },
      update: {
        lastExternalSyncAt: new Date(),
        lastExternalSyncStatus: JSON.stringify({
          error: error instanceof Error ? error.message : "Error desconocido"
        }),
        lastExternalSyncRequests: requests
      }
    });
    throw error;
  }
}
