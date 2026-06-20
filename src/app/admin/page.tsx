import Link from "next/link";
import Image from "next/image";
import { ScorePicker } from "@/components/score-picker";
import {
  createMatchAction,
  logoutAction,
  resetBracketAction,
  saveResultAction,
  saveStandingOverrideAction,
  saveTeamRankingAction,
  syncExternalResultsAction,
  syncTournamentAction
} from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TeamName } from "@/components/team-name";

function toDatetimeLocal(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    timeZoneName: "shortOffset"
  }).format(date);
}

const ERROR_MESSAGES: Record<string, string> = {
  "api-key": "Falta configurar API_FOOTBALL_KEY en las variables de entorno de Vercel.",
  cooldown: "Espera un minuto antes de volver a consultar la API.",
  "no-fixtures":
    "API-Football no devolvio partidos. Revisa que el plan incluya la temporada 2026.",
  "external-api":
    "No se pudo consultar API-Football. Revisa la clave, el cupo diario y los logs.",
  default: "Revisa los datos del formulario. Hay campos invalidos."
};

export default async function AdminPage({
  searchParams
}: {
  searchParams?: {
    error?: string;
    seeded?: string;
    updated?: string;
    sync?: string;
    matched?: string;
    results?: string;
    cards?: string;
    pending?: string;
    requests?: string;
  };
}) {
  const user = await requireAdmin();
  const [matches, rankings, overrides, state] = await Promise.all([
    prisma.match.findMany({
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }, { startsAt: "asc" }],
      include: { _count: { select: { predictions: true } } }
    }),
    prisma.teamRanking.findMany({ orderBy: { team: "asc" } }),
    prisma.standingOverride.findMany({ orderBy: [{ group: "asc" }, { position: "asc" }] }),
    prisma.tournamentState.findUnique({ where: { id: "world-cup-2026" } })
  ]);
  const teams = [...new Set(matches.flatMap((match) => [match.homeTeam, match.awayTeam]))].sort();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(16, 0, 0, 0);

  return (
    <main className="shell">
      <header className="topbar">
        <Image
          className="hero-image"
          src="/Logo.png"
          alt="LT Training Center"
          width={200}
          height={200}
          priority
        />
        <div className="hero-copy">
          <div className="brand">
            <span className="eyebrow">LT Training Center</span>
            <h1>Panel admin</h1>
            <p>Sesion de {user.name}. Carga partidos y resultados oficiales.</p>
          </div>
          <nav className="nav">
            <Link className="button secondary" href="/torneo">
              Ver torneo
            </Link>
            <Link className="button secondary" href="/">
              Volver al prode
            </Link>
            <form action={logoutAction}>
              <button className="button ghost" type="submit">
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      {searchParams?.error ? (
        <div className="error">
          {ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.default}
        </div>
      ) : null}

      {searchParams?.seeded ? (
        <div className="success">
          Fixture cargado: {searchParams.seeded} partidos nuevos, {searchParams.updated ?? 0}{" "}
          actualizados.
        </div>
      ) : null}

      {searchParams?.sync === "success" ? (
        <div className="success">
          API actualizada: {searchParams.results ?? 0} resultados,{" "}
          {searchParams.cards ?? 0} partidos con tarjetas y{" "}
          {searchParams.matched ?? 0} partidos vinculados. Consultas usadas:{" "}
          {searchParams.requests ?? 0}.
          {Number(searchParams.pending ?? 0) > 0
            ? ` Quedan ${searchParams.pending} partidos con tarjetas pendientes para el proximo clic.`
            : ""}
        </div>
      ) : null}

      <section className="admin-grid">
        <aside className="panel">
          <h2>Nuevo partido</h2>
          <form action="/admin/seed-fixtures" method="post" style={{ marginBottom: 18 }}>
            <button className="button full secondary" type="submit">
              Cargar fixture de grupos
            </button>
          </form>
          <form action={createMatchAction} className="admin-form">
            <div className="field">
              <label htmlFor="phase">Fase</label>
              <input id="phase" name="phase" defaultValue="Grupo" required />
            </div>
            <div className="field">
              <label htmlFor="homeTeam">Local</label>
              <input id="homeTeam" name="homeTeam" required />
            </div>
            <div className="field">
              <label htmlFor="awayTeam">Visitante</label>
              <input id="awayTeam" name="awayTeam" required />
            </div>
            <div className="field">
              <label htmlFor="startsAt">Fecha y hora</label>
              <input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={toDatetimeLocal(tomorrow)}
                required
              />
            </div>
            <button className="button full" type="submit">
              Crear partido
            </button>
          </form>
          <hr className="admin-divider" />
          <h2>Resultados automaticos</h2>
          <p className="muted admin-helper">
            Consulta API-Football solo cuando presionas el boton. Actualiza marcadores,
            penales y tarjetas de partidos finalizados.
          </p>
          <form action={syncExternalResultsAction}>
            <button className="button full" type="submit">
              Actualizar resultados desde API
            </button>
          </form>
          <div className="external-sync-status">
            <span>
              Ultima consulta:{" "}
              {state?.lastExternalSyncAt ? formatDate(state.lastExternalSyncAt) : "Nunca"}
            </span>
            <span>Consultas usadas: {state?.lastExternalSyncRequests ?? 0}</span>
            <span>
              API configurada: {process.env.API_FOOTBALL_KEY ? "Si" : "No"}
            </span>
          </div>
          <hr className="admin-divider" />
          <h2>Control del cuadro</h2>
          <p className="muted admin-helper">
            {state?.bracketLockedAt
              ? "El cuadro de dieciseisavos ya esta fijado."
              : "Se fijara cuando esten completos y resueltos los 12 grupos."}
          </p>
          <form action={syncTournamentAction}>
            <button className="button full secondary" type="submit">
              Recalcular y avanzar cuadro
            </button>
          </form>
          <details className="danger-zone">
            <summary>Reiniciar cuadro eliminatorio</summary>
            <form action={resetBracketAction} className="admin-form">
              <p className="muted">
                Borra partidos, resultados y pronosticos eliminatorios. Escribi REINICIAR.
              </p>
              <input name="confirmation" required />
              <button className="button danger-button" type="submit">
                Reiniciar
              </button>
            </form>
          </details>
        </aside>

        <section className="panel admin-results-panel">
          <h2>Resultados</h2>
          <div className="stack">
            {matches.length === 0 ? (
              <p className="muted">Todavia no hay partidos cargados.</p>
            ) : (
              matches.map((match) => (
                <article className="card" key={match.id}>
                  <div className="match-head">
                    <div>
                      <p className="match-title">
                        <TeamName team={match.homeTeam} /> <span className="versus">vs</span>{" "}
                        <TeamName team={match.awayTeam} />
                      </p>
                      <p className="muted">
                        {match.phase} · {formatDate(match.startsAt)} ·{" "}
                        {match._count.predictions} pronosticos
                      </p>
                    </div>
                    <span className="badge">
                      {match.homeGoals !== null && match.awayGoals !== null
                        ? `${match.homeGoals}-${match.awayGoals}`
                        : "Sin resultado"}
                    </span>
                  </div>
                  <form action={saveResultAction} className="score-form admin-score-form">
                    <input type="hidden" name="matchId" value={match.id} />
                    <div className="field result-helper">
                      <label>Resultado oficial</label>
                      <span className="muted">Deja ambos vacios para borrar resultado</span>
                    </div>
                    <ScorePicker
                      allowEmpty
                      id={`home-result-${match.id}`}
                      name="homeGoals"
                      defaultValue={match.homeGoals}
                    >
                      <TeamName team={match.homeTeam} />
                    </ScorePicker>
                    <ScorePicker
                      allowEmpty
                      id={`away-result-${match.id}`}
                      name="awayGoals"
                      defaultValue={match.awayGoals}
                    >
                      <TeamName team={match.awayTeam} />
                    </ScorePicker>
                    {match.round !== "GROUP" ? (
                      <>
                        <ScorePicker
                          allowEmpty
                          id={`home-penalties-${match.id}`}
                          name="homePenalties"
                          defaultValue={match.homePenalties}
                        >
                          Penales {match.homeTeam}
                        </ScorePicker>
                        <ScorePicker
                          allowEmpty
                          id={`away-penalties-${match.id}`}
                          name="awayPenalties"
                          defaultValue={match.awayPenalties}
                        >
                          Penales {match.awayTeam}
                        </ScorePicker>
                      </>
                    ) : (
                      <>
                        <input type="hidden" name="homePenalties" value="" />
                        <input type="hidden" name="awayPenalties" value="" />
                      </>
                    )}
                    <details className="discipline-fields">
                      <summary>Conducta FIFA</summary>
                      <div className="discipline-grid">
                        {[
                          ["homeYellowCards", "Amarillas local", match.homeYellowCards],
                          ["awayYellowCards", "Amarillas visita", match.awayYellowCards],
                          [
                            "homeSecondYellowReds",
                            "Doble amarilla local",
                            match.homeSecondYellowReds
                          ],
                          [
                            "awaySecondYellowReds",
                            "Doble amarilla visita",
                            match.awaySecondYellowReds
                          ],
                          ["homeDirectReds", "Rojas local", match.homeDirectReds],
                          ["awayDirectReds", "Rojas visita", match.awayDirectReds],
                          [
                            "homeYellowDirectReds",
                            "Amarilla + roja local",
                            match.homeYellowDirectReds
                          ],
                          [
                            "awayYellowDirectReds",
                            "Amarilla + roja visita",
                            match.awayYellowDirectReds
                          ]
                        ].map(([name, label, value]) => (
                          <label key={String(name)}>
                            {label}
                            <input
                              name={String(name)}
                              type="number"
                              min="0"
                              defaultValue={Number(value)}
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                    <button className="button" type="submit">
                      Guardar
                    </button>
                  </form>
                </article>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="admin-tournament-grid">
        <section className="panel">
          <h2>Ranking FIFA</h2>
          <p className="muted admin-helper">
            Solo se usa si puntos, enfrentamientos, diferencia, goles y conducta siguen empatados.
          </p>
          <form action={saveTeamRankingAction} className="admin-form">
            <label>
              Seleccion
              <select name="team" required>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ranking actual
              <input name="currentRank" type="number" min="1" />
            </label>
            <label>
              Ranking anterior
              <input name="previousRank" type="number" min="1" />
            </label>
            <button className="button" type="submit">
              Guardar ranking
            </button>
          </form>
          <div className="admin-data-list">
            {rankings.map((ranking) => (
              <span key={ranking.team}>
                {ranking.team}: {ranking.currentRank ?? "-"} / {ranking.previousRank ?? "-"}
              </span>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Override de desempate</h2>
          <p className="muted admin-helper">
            Usalo solo cuando la tabla marque un empate pendiente.
          </p>
          <form action={saveStandingOverrideAction} className="admin-form">
            <label>
              Tabla
              <select name="group" required>
                {"ABCDEFGHIJKL".split("").map((group) => (
                  <option key={group} value={group}>
                    Grupo {group}
                  </option>
                ))}
                <option value="THIRD">Mejores terceros</option>
              </select>
            </label>
            <label>
              Seleccion
              <select name="team" required>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Posicion forzada
              <input name="position" type="number" min="1" max="12" required />
            </label>
            <label>
              Motivo
              <input name="note" />
            </label>
            <button className="button" type="submit">
              Guardar override
            </button>
          </form>
          <div className="admin-data-list">
            {overrides.map((override) => (
              <span key={override.id}>
                {override.group} #{override.position}: {override.team}
              </span>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
