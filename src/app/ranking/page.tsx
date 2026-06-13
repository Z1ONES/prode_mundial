import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { getLeaderboard } from "@/lib/leaderboard";
import { requireUser } from "@/lib/auth";

function podiumLabel(position: number) {
  if (position === 1) return "1";
  if (position === 2) return "2";
  if (position === 3) return "3";
  return position.toString();
}

export default async function RankingPage() {
  const user = await requireUser();
  const leaderboard = await getLeaderboard();
  const userRank = leaderboard.find((row) => row.id === user.id);

  return (
    <main className="shell ranking-page">
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
            <span className="eyebrow">Competencia</span>
            <h1>Ranking</h1>
            <p>{leaderboard.length} participantes</p>
          </div>
          <nav className="nav">
            <Link className="button secondary" href="/">
              Prode
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

      <section className="user-status-card ranking-summary">
        <div>
          <span className="eyebrow">Tu posicion</span>
          <h2>#{userRank?.position ?? "-"}</h2>
          <p className="muted">
            {userRank
              ? `${userRank.exacts} exactos - ${userRank.predictions} pronosticos cargados`
              : "Todavia no apareces en el ranking"}
          </p>
        </div>
        <div className="points-pill">
          <strong>{userRank?.points ?? 0}</strong>
          <span>pts</span>
        </div>
      </section>

      <section className="panel leaderboard-panel">
        <div className="section-head compact-head">
          <div>
            <span className="eyebrow">Tabla completa</span>
            <h2>Todos los participantes</h2>
            <p className="muted">Ordenado por puntos, exactos y nombre</p>
          </div>
        </div>

        {leaderboard.length === 0 ? (
          <p className="muted">Todavia no hay participantes en el ranking.</p>
        ) : (
          <div className="leaderboard-list full-leaderboard-list">
            {leaderboard.map((row) => (
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
          </div>
        )}
      </section>
    </main>
  );
}