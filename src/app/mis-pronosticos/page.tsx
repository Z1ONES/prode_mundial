import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { TeamName } from "@/components/team-name";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scorePrediction } from "@/lib/scoring";
import { teamDisplayName } from "@/lib/world-cup";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(date);
}

function roundLabel(round: string, phase: string) {
  const labels: Record<string, string> = {
    GROUP: phase,
    ROUND_OF_32: "Dieciseisavos",
    ROUND_OF_16: "Octavos",
    QUARTERFINAL: "Cuartos",
    SEMIFINAL: "Semifinal",
    THIRD_PLACE: "Tercer puesto",
    FINAL: "Final"
  };

  return labels[round] ?? phase;
}

export default async function MyPredictionsPage() {
  const user = await requireUser();
  const predictions = await prisma.prediction.findMany({
    where: { userId: user.id },
    orderBy: { match: { startsAt: "asc" } },
    include: { match: true }
  });

  const rows = predictions.map((prediction) => {
    const isKnockout = prediction.match.round !== "GROUP";
    const finished =
      prediction.match.homeGoals !== null && prediction.match.awayGoals !== null;
    const points = scorePrediction({
      predictedHome: prediction.homeGoals,
      predictedAway: prediction.awayGoals,
      predictedWinner: prediction.advancingTeam,
      actualHome: prediction.match.homeGoals,
      actualAway: prediction.match.awayGoals,
      actualWinner: prediction.match.winnerTeam,
      isKnockout
    });

    return { prediction, isKnockout, finished, points };
  });

  const finished = rows.filter((row) => row.finished);
  const totalPoints = finished.reduce((total, row) => total + row.points, 0);
  const exacts = finished.filter((row) => row.points === 3).length;
  const pending = rows.length - finished.length;

  return (
    <main className="shell predictions-page">
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
            <span className="eyebrow">Tu historial</span>
            <h1>Mis pronosticos</h1>
            <p>{user.name}</p>
          </div>
          <nav className="nav">
            <Link className="button secondary" href="/">
              Prode
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

      <section className="prediction-summary" aria-label="Resumen de pronosticos">
        <article className="prediction-stat">
          <span>Pronosticos</span>
          <strong>{rows.length}</strong>
        </article>
        <article className="prediction-stat">
          <span>Puntos obtenidos</span>
          <strong>{totalPoints}</strong>
        </article>
        <article className="prediction-stat">
          <span>Exactos</span>
          <strong>{exacts}</strong>
        </article>
        <article className="prediction-stat">
          <span>Pendientes</span>
          <strong>{pending}</strong>
        </article>
      </section>

      <section className="panel predictions-history">
        <div className="section-head">
          <div>
            <span className="eyebrow">Detalle</span>
            <h2>Todos tus partidos</h2>
            <p className="muted">Los puntos aparecen cuando el admin carga el resultado.</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-predictions">
            <h3>Todavia no cargaste pronosticos</h3>
            <p className="muted">Elegí un partido abierto y guardá tu primer resultado.</p>
            <Link className="button" href="/#fixture">
              Ver partidos
            </Link>
          </div>
        ) : (
          <div className="prediction-list">
            {rows.map(({ prediction, isKnockout, finished: hasResult, points }) => (
              <article className="prediction-row" key={prediction.id}>
                <div className="prediction-meta">
                  <span className="badge">
                    {roundLabel(prediction.match.round, prediction.match.phase)}
                  </span>
                  <time dateTime={prediction.match.startsAt.toISOString()}>
                    {formatDate(prediction.match.startsAt)}
                  </time>
                </div>

                <div className="prediction-teams">
                  <TeamName team={prediction.match.homeTeam} />
                  <span className="prediction-score">
                    {prediction.homeGoals} - {prediction.awayGoals}
                  </span>
                  <TeamName team={prediction.match.awayTeam} />
                </div>

                {isKnockout && prediction.advancingTeam ? (
                  <p className="prediction-advancer">
                    Pronosticaste que clasifica{" "}
                    <strong>{teamDisplayName(prediction.advancingTeam)}</strong>
                  </p>
                ) : null}

                <div className="prediction-result">
                  <div>
                    <span className="muted">Resultado oficial</span>
                    <strong>
                      {hasResult
                        ? `${prediction.match.homeGoals} - ${prediction.match.awayGoals}`
                        : "Pendiente"}
                    </strong>
                    {hasResult &&
                    prediction.match.homePenalties !== null &&
                    prediction.match.awayPenalties !== null ? (
                      <small>
                        Penales: {prediction.match.homePenalties} -{" "}
                        {prediction.match.awayPenalties}
                      </small>
                    ) : null}
                  </div>
                  <span
                    className={`prediction-points ${
                      hasResult ? `points-${points}` : "is-pending"
                    }`}
                  >
                    {hasResult ? `${points} pts` : "En juego"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
