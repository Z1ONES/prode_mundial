import Image from "next/image";
import Link from "next/link";
import { ScorePicker } from "@/components/score-picker";
import { TeamName } from "@/components/team-name";
import { logoutAction, savePredictionAction } from "@/app/actions";
import { getLeaderboard } from "@/lib/leaderboard";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { scorePrediction } from "@/lib/scoring";
import { teamDisplayName } from "@/lib/world-cup";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

function teamMatchesSearch(team: string, search: string) {
  if (!search) return true;

  return [team, teamDisplayName(team)].some((name) =>
    normalizeSearch(name).includes(search)
  );
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    timeZoneName: "shortOffset"
  }).format(date);
}

function podiumLabel(position: number) {
  if (position === 1) return "1";
  if (position === 2) return "2";
  if (position === 3) return "3";
  return position.toString();
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: { error?: string; pais?: string };
}) {
  const user = await requireUser();
  const [matches, leaderboard] = await Promise.all([
    prisma.match.findMany({
      orderBy: { startsAt: "asc" },
      include: {
        predictions: {
          where: { userId: user.id }
        }
      }
    }),
    getLeaderboard()
  ]);

  const countryQuery = searchParams?.pais?.trim() ?? "";
  const normalizedCountryQuery = normalizeSearch(countryQuery);
  const filteredMatches = normalizedCountryQuery
    ? matches.filter(
        (match) =>
          teamMatchesSearch(match.homeTeam, normalizedCountryQuery) ||
          teamMatchesSearch(match.awayTeam, normalizedCountryQuery)
      )
    : matches;
  const filteredGroupMatches = filteredMatches.filter((match) => match.round === "GROUP");
  const filteredKnockoutMatches = filteredMatches.filter((match) => match.round !== "GROUP");

  const matchesByGroup = filteredGroupMatches.reduce<
    Array<{ group: string; days: Array<{ day: string; matches: typeof matches }> }>
  >((groups, match) => {
    const group = match.phase;
    const day = formatDay(match.startsAt);
    let currentGroup = groups.find((item) => item.group === group);

    if (!currentGroup) {
      currentGroup = { group, days: [] };
      groups.push(currentGroup);
    }

    const currentDay = currentGroup.days[currentGroup.days.length - 1];
    if (currentDay?.day === day) {
      currentDay.matches.push(match);
    } else {
      currentGroup.days.push({ day, matches: [match] });
    }

    return groups;
  }, []);

  matchesByGroup.sort((a, b) => a.group.localeCompare(b.group, "es-AR"));
  const now = new Date();
  const today = formatDay(now);
  const userRank = leaderboard.find((row) => row.id === user.id);
  const upcomingToday = matches.filter((match) => match.startsAt > now && formatDay(match.startsAt) === today);
  const upcomingMatches = upcomingToday.length
    ? upcomingToday.slice(0, 4)
    : matches.filter((match) => match.startsAt > now).slice(0, 4);
  const topFive = leaderboard.slice(0, 5);

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
            <h1>Prode Mundial</h1>
            <p>Hola, {user.name}</p>
          </div>
          <nav className="nav">
            <Link className="button secondary" href="/mis-pronosticos">
              Mis pronosticos
            </Link>
            <Link className="button secondary" href="/ranking">
              Ranking
            </Link>
            <Link className="button secondary" href="/torneo">
              Torneo
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="button secondary" href="/admin">
                Admin
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button className="button ghost" type="submit">
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      {searchParams?.error === "locked" ? (
        <div className="error">Ese partido ya empezo y el pronostico esta cerrado.</div>
      ) : null}

      <section className="mobile-stack">
        <section className="user-status-card">
          <div>
            <span className="eyebrow">Tu estado</span>
            <h2>#{userRank?.position ?? "-"} en el ranking</h2>
            <p className="muted">Movimiento: sin historial</p>
          </div>
          <div className="points-pill">
            <strong>{userRank?.points ?? 0}</strong>
            <span>pts</span>
          </div>
          <Link className="ranking-link" href="/ranking">
            Ver ranking completo
          </Link>
        </section>

        <section className="panel country-search-panel">
          <form className="country-search" method="get" action="/#fixture">
            <label htmlFor="country-search">Buscar partidos por pais</label>
            <div className="country-search-controls">
              <input
                id="country-search"
                name="pais"
                type="search"
                defaultValue={countryQuery}
                placeholder="Ej: Argentina, Brasil, Japon..."
                autoComplete="off"
              />
              <button className="button" type="submit">
                Buscar
              </button>
              {countryQuery ? (
                <Link className="button secondary" href="/#fixture">
                  Ver todos
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="panel priority-panel">
          <div className="section-head compact-head">
            <div>
              <span className="eyebrow">Ahora</span>
              <h2>Proximos partidos</h2>
              <p className="muted">
                {upcomingToday.length ? "Pendientes de hoy" : "Los proximos disponibles"}
              </p>
            </div>
          </div>
          {upcomingMatches.length === 0 ? (
            <p className="muted">No hay partidos abiertos por ahora.</p>
          ) : (
            <div className="match-list priority-list">
              {upcomingMatches.map((match) => {
                const prediction = match.predictions[0];

                return (
                  <article className="match-card priority-match" key={match.id}>
                    <div className="match-time">
                      <strong>{formatTime(match.startsAt)}</strong>
                      <span>{formatDay(match.startsAt)}</span>
                    </div>
                    <div className="match-main">
                      <div className="match-head">
                        <div>
                          <p className="match-title">
                            <TeamName team={match.homeTeam} /> <span className="versus">vs</span>{" "}
                            <TeamName team={match.awayTeam} />
                          </p>
                          <p className="muted">
                            Tu pronostico:{" "}
                            {prediction
                              ? `${prediction.homeGoals}-${prediction.awayGoals}`
                              : "sin cargar"}
                          </p>
                        </div>
                        <span className="badge badge-open">Abierto</span>
                      </div>
                      <form action={savePredictionAction} className="score-form">
                        <input type="hidden" name="matchId" value={match.id} />
                        <ScorePicker
                          id={`quick-home-${match.id}`}
                          name="homeGoals"
                          defaultValue={prediction?.homeGoals ?? 0}
                          required
                        >
                          <TeamName team={match.homeTeam} />
                        </ScorePicker>
                        <ScorePicker
                          id={`quick-away-${match.id}`}
                          name="awayGoals"
                          defaultValue={prediction?.awayGoals ?? 0}
                          required
                        >
                          <TeamName team={match.awayTeam} />
                        </ScorePicker>
                        {match.round !== "GROUP" ? (
                          <div className="field advancing-field">
                            <label htmlFor={`quick-advancing-${match.id}`}>Clasifica si empatan</label>
                            <select
                              id={`quick-advancing-${match.id}`}
                              name="advancingTeam"
                              defaultValue={prediction?.advancingTeam ?? match.homeTeam}
                            >
                              <option value={match.homeTeam}>{teamDisplayName(match.homeTeam)}</option>
                              <option value={match.awayTeam}>{teamDisplayName(match.awayTeam)}</option>
                            </select>
                          </div>
                        ) : null}
                        <button className="button full" type="submit">
                          Guardar pronostico
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="panel standings-panel" id="ranking">
          <div className="section-head compact-head">
            <div>
              <span className="eyebrow">Competencia</span>
              <h2>Top 5</h2>
              <p className="muted">Ranking en vivo</p>
            </div>
          </div>
          <div className="leaderboard-list">
            {topFive.map((row) => (
              <article
                className={`leaderboard-card ${row.id === user.id ? "is-current-user" : ""} ${
                  row.position <= 3 ? "is-podium" : ""
                }`}
                key={row.id}
              >
                <span className="rank-number">{podiumLabel(row.position)}</span>
                <div>
                  <strong>{row.name}</strong>
                  <p className="muted">
                    {row.exacts} exactos - {row.predictions} pronosticos
                  </p>
                </div>
                <span className="rank-points">{row.points}</span>
              </article>
            ))}
            {userRank && !topFive.some((row) => row.id === user.id) ? (
              <article className="leaderboard-card is-current-user">
                <span className="rank-number">{userRank.position}</span>
                <div>
                  <strong>{userRank.name}</strong>
                  <p className="muted">
                    {userRank.exacts} exactos - {userRank.predictions} pronosticos
                  </p>
                </div>
                <span className="rank-points">{userRank.points}</span>
              </article>
            ) : null}
          </div>
          <Link className="ranking-link compact-ranking-link" href="/ranking">
            Ver tabla completa
          </Link>
        </aside>

        <section className="panel full-schedule" id="fixture">
          <div className="section-head">
            <div>
              <span className="eyebrow">Fixture</span>
              <h2>{countryQuery ? `Partidos de ${countryQuery}` : "Todos los partidos"}</h2>
              <p className="muted">Horarios en Argentina (GMT-3)</p>
            </div>
            <span className="badge">{filteredMatches.length} partidos</span>
          </div>

          {matches.length === 0 ? (
            <p className="muted">Todavia no hay partidos cargados.</p>
          ) : filteredMatches.length === 0 ? (
            <div className="empty-search">
              <p>No encontramos partidos para &quot;{countryQuery}&quot;.</p>
              <span className="muted">Proba con el nombre completo del pais.</span>
            </div>
          ) : (
            <div className="schedule">
              {matchesByGroup.map((group) => (
                <section className="group-section" key={group.group}>
                  <div className="group-heading">
                    <h3>{group.group}</h3>
                    <span className="badge">
                      {group.days.reduce((total, day) => total + day.matches.length, 0)} partidos
                    </span>
                  </div>
                  <div className="group-days">
                    {group.days.map((day) => (
                      <section className="date-section" key={`${group.group}-${day.day}`}>
                        <h4>{day.day}</h4>
                        <div className="match-list">
                          {day.matches.map((match) => {
                            const prediction = match.predictions[0];
                            const locked = match.startsAt <= new Date();
                            const hasResult = match.homeGoals !== null && match.awayGoals !== null;
                            const points = prediction
                              ? scorePrediction({
                                  predictedHome: prediction.homeGoals,
                                  predictedAway: prediction.awayGoals,
                                  actualHome: match.homeGoals,
                                  actualAway: match.awayGoals
                                })
                              : 0;

                            return (
                              <article className="match-card" key={match.id}>
                                <div className="match-time">
                                  <strong>{formatTime(match.startsAt)}</strong>
                                  <span>{day.day}</span>
                                </div>
                                <div className="match-main">
                                  <div className="match-head">
                                    <div>
                                      <p className="match-title">
                                        <TeamName team={match.homeTeam} />{" "}
                                        <span className="versus">vs</span>{" "}
                                        <TeamName team={match.awayTeam} />
                                      </p>
                                      <p className="muted">
                                        Tu pronostico:{" "}
                                        {prediction
                                          ? `${prediction.homeGoals}-${prediction.awayGoals}`
                                          : "sin cargar"}
                                      </p>
                                    </div>
                                    <span
                                      className={`badge ${
                                        hasResult ? "badge-result" : locked ? "badge-locked" : "badge-open"
                                      }`}
                                    >
                                      {hasResult
                                        ? `${match.homeGoals}-${match.awayGoals} - ${points} pts`
                                        : locked
                                          ? "Cerrado"
                                          : "Abierto"}
                                    </span>
                                  </div>

                                  {!locked ? (
                                    <form action={savePredictionAction} className="score-form compact-score-form">
                                      <input type="hidden" name="matchId" value={match.id} />
                                      <ScorePicker
                                        id={`home-${match.id}`}
                                        name="homeGoals"
                                        defaultValue={prediction?.homeGoals ?? 0}
                                        required
                                      >
                                        <TeamName team={match.homeTeam} />
                                      </ScorePicker>
                                      <ScorePicker
                                        id={`away-${match.id}`}
                                        name="awayGoals"
                                        defaultValue={prediction?.awayGoals ?? 0}
                                        required
                                      >
                                        <TeamName team={match.awayTeam} />
                                      </ScorePicker>
                                      <button className="button" type="submit">
                                        Guardar
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {filteredKnockoutMatches.length > 0 ? (
            <section className="group-section knockout-fixture-section">
              <div className="group-heading">
                <h3>Eliminatorias</h3>
                <span className="badge">{filteredKnockoutMatches.length} partidos</span>
              </div>
              <div className="group-days">
                <div className="match-list">
                  {filteredKnockoutMatches.map((match) => {
                    const prediction = match.predictions[0];
                    const locked = match.startsAt <= now;
                    return (
                      <article className="match-card" key={match.id}>
                        <div className="match-time">
                          <strong>#{match.matchNumber}</strong>
                          <span>{match.phase}</span>
                        </div>
                        <div className="match-main">
                          <div className="match-head">
                            <p className="match-title">
                              <TeamName team={match.homeTeam} /> <span className="versus">vs</span>{" "}
                              <TeamName team={match.awayTeam} />
                            </p>
                            <span className="badge">{locked ? "Cerrado" : "Abierto"}</span>
                          </div>
                          {!locked ? (
                            <form action={savePredictionAction} className="score-form">
                              <input type="hidden" name="matchId" value={match.id} />
                              <ScorePicker
                                id={`ko-home-${match.id}`}
                                name="homeGoals"
                                defaultValue={prediction?.homeGoals ?? 0}
                                required
                              >
                                <TeamName team={match.homeTeam} />
                              </ScorePicker>
                              <ScorePicker
                                id={`ko-away-${match.id}`}
                                name="awayGoals"
                                defaultValue={prediction?.awayGoals ?? 0}
                                required
                              >
                                <TeamName team={match.awayTeam} />
                              </ScorePicker>
                              <div className="field advancing-field">
                                <label htmlFor={`advancing-${match.id}`}>Clasifica si empatan</label>
                                <select
                                  id={`advancing-${match.id}`}
                                  name="advancingTeam"
                                  defaultValue={prediction?.advancingTeam ?? match.homeTeam}
                                >
                                  <option value={match.homeTeam}>
                                    {teamDisplayName(match.homeTeam)}
                                  </option>
                                  <option value={match.awayTeam}>
                                    {teamDisplayName(match.awayTeam)}
                                  </option>
                                </select>
                              </div>
                              <button className="button full" type="submit">
                                Guardar pronostico
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
