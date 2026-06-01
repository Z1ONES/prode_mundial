import Link from "next/link";
import Image from "next/image";
import { createMatchAction, logoutAction, saveResultAction } from "@/app/actions";
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

export default async function AdminPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const user = await requireAdmin();
  const matches = await prisma.match.findMany({
    orderBy: { startsAt: "asc" },
    include: { _count: { select: { predictions: true } } }
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(16, 0, 0, 0);

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
            <h1>Panel admin</h1>
            <p>Sesion de {user.name}. Carga partidos y resultados oficiales.</p>
          </div>
          <nav className="nav">
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
        <div className="error">Revisa los datos del formulario. Hay campos invalidos.</div>
      ) : null}

      <section className="admin-grid">
        <aside className="panel">
          <h2>Nuevo partido</h2>
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
        </aside>

        <section className="panel">
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
                  <form action={saveResultAction} className="compact-row" style={{ marginTop: 14 }}>
                    <input type="hidden" name="matchId" value={match.id} />
                    <div className="field">
                      <label>Resultado oficial</label>
                      <span className="muted">Deja ambos vacios para borrar resultado</span>
                    </div>
                    <div className="field">
                      <label htmlFor={`home-result-${match.id}`}>
                        <TeamName team={match.homeTeam} />
                      </label>
                      <input
                        id={`home-result-${match.id}`}
                        name="homeGoals"
                        type="number"
                        min="0"
                        max="99"
                        defaultValue={match.homeGoals ?? ""}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`away-result-${match.id}`}>
                        <TeamName team={match.awayTeam} />
                      </label>
                      <input
                        id={`away-result-${match.id}`}
                        name="awayGoals"
                        type="number"
                        min="0"
                        max="99"
                        defaultValue={match.awayGoals ?? ""}
                      />
                    </div>
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
    </main>
  );
}
