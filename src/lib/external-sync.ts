import { prisma } from "@/lib/prisma";
import {
  ApiFootballError,
  countDiscipline,
  findExternalFixture,
  getFixtureEvents,
  getWorldCupFixtures,
  isFinishedFixture,
  resultFromFixture
} from "@/lib/api-football";
import {
  findFootballDataMatch,
  FootballDataError,
  getFootballDataWorldCupMatches,
  isFinishedFootballDataMatch,
  resultFromFootballData
} from "@/lib/football-data";
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

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  return message.replace(/(?:sk_|key=)[A-Za-z0-9_.-]+/gi, "[credencial oculta]").slice(0, 500);
}

export async function syncResultsFromApiFootball() {
  const footballDataKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  const apiFootballKey = process.env.API_FOOTBALL_KEY?.trim();
  if (!footballDataKey && !apiFootballKey) {
    throw new ExternalSyncError(
      "api-key",
      "Falta configurar FOOTBALL_DATA_API_KEY o API_FOOTBALL_KEY."
    );
  }

  const eventLimit = Math.min(
    90,
    Math.max(0, Number(process.env.API_FOOTBALL_EVENT_LIMIT ?? "20") || 20)
  );
  let requests = 1;

  try {
    const state = await prisma.tournamentState.findUnique({ where: { id: STATE_ID } });
    if (
      state?.lastExternalSyncAt &&
      Date.now() - state.lastExternalSyncAt.getTime() < COOLDOWN_MS
    ) {
      throw new ExternalSyncError("cooldown", "Espera un minuto antes de actualizar otra vez.");
    }

    const provider = footballDataKey ? "football-data" : "api-football";
    const [fixtures, matches] = await Promise.all([
      footballDataKey
        ? getFootballDataWorldCupMatches(footballDataKey)
        : getWorldCupFixtures(apiFootballKey!),
      prisma.match.findMany({
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          homeTeam: true,
          awayTeam: true,
          startsAt: true,
          round: true,
          externalFixtureId: true,
          externalProvider: true,
          disciplineSyncedAt: true
        }
      })
    ]);

    if (fixtures.length === 0) {
      throw new ExternalSyncError(
        "no-fixtures",
        `${provider} no devolvio partidos del Mundial 2026.`
      );
    }

    await prisma.match.updateMany({
      where: {
        externalFixtureId: { not: null },
        OR: [
          { externalProvider: { not: provider } },
          { externalProvider: null }
        ]
      },
      data: {
        externalFixtureId: null,
        externalProvider: null,
        externalSyncedAt: null
      }
    });

    let matched = 0;
    let resultsUpdated = 0;
    let disciplineUpdated = 0;
    let pendingDiscipline = 0;

    for (const match of matches) {
      if (footballDataKey) {
        const fixture = findFootballDataMatch(
          match,
          fixtures as Awaited<ReturnType<typeof getFootballDataWorldCupMatches>>
        );
        if (!fixture) continue;
        matched += 1;

        const result = isFinishedFootballDataMatch(fixture)
          ? resultFromFootballData(fixture, match)
          : null;

        await prisma.match.update({
          where: { id: match.id },
          data: {
            externalFixtureId: fixture.id,
            externalProvider: provider,
            externalSyncedAt: new Date(),
            ...(result ?? {})
          }
        });
        if (result) resultsUpdated += 1;
        continue;
      }

      const fixture = findExternalFixture(
        match,
        fixtures as Awaited<ReturnType<typeof getWorldCupFixtures>>
      );
      if (!fixture) continue;
      matched += 1;

      const finished = isFinishedFixture(fixture);
      const result = finished ? resultFromFixture(fixture, match) : null;
      const needsDiscipline = finished && match.disciplineSyncedAt === null;
      const shouldSyncDiscipline = needsDiscipline && disciplineUpdated < eventLimit;
      let disciplineData = {};

      if (shouldSyncDiscipline) {
        const events = await getFixtureEvents(fixture.fixture.id, apiFootballKey!);
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
          externalProvider: provider,
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
      provider,
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
      provider,
      resultsUpdated,
      disciplineUpdated,
      pendingDiscipline,
      requests
    };
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    await prisma.tournamentState.upsert({
      where: { id: STATE_ID },
      create: {
        id: STATE_ID,
        lastExternalSyncAt: new Date(),
        lastExternalSyncStatus: JSON.stringify({
          error: errorMessage
        }),
        lastExternalSyncRequests: requests
      },
      update: {
        lastExternalSyncAt: new Date(),
        lastExternalSyncStatus: JSON.stringify({
          error: errorMessage
        }),
        lastExternalSyncRequests: requests
      }
    });
    if (error instanceof ApiFootballError) {
      throw new ExternalSyncError(
        error.status === 401 || error.status === 403 ? "api-auth" : "api-response",
        errorMessage
      );
    }
    if (error instanceof FootballDataError) {
      throw new ExternalSyncError(
        error.status === 401 || error.status === 403 ? "api-auth" : "api-response",
        errorMessage
      );
    }
    throw error;
  }
}
