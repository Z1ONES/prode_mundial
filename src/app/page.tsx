import Image from "next/image";
import Link from "next/link";
import { TeamName } from "@/components/team-name";
import { logoutAction, savePredictionAction } from "@/app/actions";
import { getLeaderboard } from "@/lib/leaderboard";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { scorePrediction } from "@/lib/scoring";

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

export default async function HomePage({
  searchParams
}: {
  searchParams?: { error?: string };
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

  const matchesByGroup = matches.reduce<
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

  return (
    <main className="shell">
      <header className="topbar">
        <Image
          className="hero-image"
          src="/lt-entrenamiento.jpg"
          alt="LT Entrenamiento"
          width={200}
          height={200}
          priority
        />
        <div className="hero-copy">
          <div className="brand">
            <h1>Prode Mundial</h1>
            <p>Hola, {user.name}. Carga tus pronosticos antes de que arranque cada partido.</p>
          </div>
          <nav className="nav">
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

      <section className="grid">
        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Partidos</h2>
              <p className="muted">Horarios en Argentina (GMT-3)</p>
            </div>
            <span className="badge">{matches.length} partidos</span>
          </div>

          {matches.length === 0 ? (
            <p className="muted">Todavia no hay partidos cargados.</p>
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
                                    <span className="badge">
                                      {hasResult
                                        ? `${match.homeGoals}-${match.awayGoals} - ${points} pts`
                                        : locked
                                          ? "Cerrado"
                                          : "Abierto"}
                                    </span>
                                  </div>

                                  {!locked ? (
                                    <form action={savePredictionAction} className="form-row">
                                      <input type="hidden" name="matchId" value={match.id} />
                                      <div className="field score-field">
                                        <label htmlFor={`home-${match.id}`}>
                                          <TeamName team={match.homeTeam} />
                                        </label>
                                        <input
                                          id={`home-${match.id}`}
                                          name="homeGoals"
                                          type="number"
                                          min="0"
                                          max="99"
                                          defaultValue={prediction?.homeGoals ?? ""}
                                          required
                                        />
                                      </div>
                                      <div className="field score-field">
                                        <label htmlFor={`away-${match.id}`}>
                                          <TeamName team={match.awayTeam} />
                                        </label>
                                        <input
                                          id={`away-${match.id}`}
                                          name="awayGoals"
                                          type="number"
                                          min="0"
                                          max="99"
                                          defaultValue={prediction?.awayGoals ?? ""}
                                          required
                                        />
                                      </div>
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
        </div>

        <aside className="panel standings-panel">
          <h2>Tabla</h2>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>#</th>
                <th>Usuario</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr key={row.id}>
                  <td>{row.position}</td>
                  <td>
                    {row.name}
                    <br />
                    <span className="muted">
                      {row.exacts} exactos - {row.predictions} pronosticos
                    </span>
                  </td>
                  <td>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </section>
    </main>
  );
}
