import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TeamName } from "@/components/team-name";
import { KNOCKOUT_TOPOLOGY, ROUND_OF_32_SLOTS } from "@/lib/tournament";
import { getTournamentSnapshot } from "@/lib/tournament-service";

const ROUND_TITLES: Record<string, string> = {
  ROUND_OF_32: "Dieciseisavos",
  ROUND_OF_16: "Octavos",
  QUARTERFINAL: "Cuartos",
  SEMIFINAL: "Semifinales",
  THIRD_PLACE: "Tercer puesto",
  FINAL: "Final"
};

function BracketTeam({ team, fallback }: { team?: string | null; fallback: string }) {
  return team ? <TeamName team={team} /> : <span className="muted">{fallback}</span>;
}

export default async function TournamentPage({
  searchParams
}: {
  searchParams?: { vista?: string };
}) {
  const user = await requireUser();
  const snapshot = await getTournamentSnapshot();
  const view = ["grupos", "terceros", "cuadro"].includes(searchParams?.vista ?? "")
    ? searchParams!.vista!
    : "grupos";
  const matchByNumber = new Map(
    snapshot.matches
      .filter((match) => match.matchNumber)
      .map((match) => [match.matchNumber!, match])
  );
  const previewByNumber = new Map<number, (typeof snapshot.preview)[number]>(
    snapshot.preview.map((match) => [match.matchNumber, match])
  );
  const bracketRounds = [
    {
      round: "ROUND_OF_32",
      matches: ROUND_OF_32_SLOTS.map((slot) => ({
        matchNumber: slot.matchNumber,
        homeFrom: slot.home,
        awayFrom: slot.away
      }))
    },
    ...["ROUND_OF_16", "QUARTERFINAL", "SEMIFINAL", "THIRD_PLACE", "FINAL"].map((round) => ({
      round,
      matches: KNOCKOUT_TOPOLOGY.filter((slot) => slot.round === round).map((slot) => ({
        matchNumber: slot.matchNumber,
        homeFrom: `${"useLosers" in slot && slot.useLosers ? "Perdedor" : "Ganador"} ${slot.homeFrom}`,
        awayFrom: `${"useLosers" in slot && slot.useLosers ? "Perdedor" : "Ganador"} ${slot.awayFrom}`
      }))
    }))
  ];

  return (
    <main className="shell tournament-page">
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
            <span className="eyebrow">Mundial FIFA 2026</span>
            <h1>Torneo</h1>
            <p>Posiciones, mejores terceros y cuadro eliminatorio.</p>
          </div>
          <nav className="nav">
            <Link className="button secondary" href="/">
              Volver al prode
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="button secondary" href="/admin">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <nav className="tournament-tabs" aria-label="Vistas del torneo">
        <Link className={view === "grupos" ? "is-active" : ""} href="/torneo?vista=grupos">
          Grupos
        </Link>
        <Link className={view === "terceros" ? "is-active" : ""} href="/torneo?vista=terceros">
          Mejores terceros
        </Link>
        <Link className={view === "cuadro" ? "is-active" : ""} href="/torneo?vista=cuadro">
          Cuadro
        </Link>
      </nav>

      {view === "grupos" ? (
        <section className="standings-grid">
          {[...snapshot.standings.entries()].map(([group, teams]) => (
            <article className="panel group-table-panel" key={group}>
              <div className="section-head compact-head">
                <h2>Grupo {group}</h2>
                <span className="badge">{teams.filter((team) => team.played === 3).length}/4 final</span>
              </div>
              <div className="table-scroll">
                <table className="football-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Equipo</th>
                      <th>PJ</th>
                      <th>DG</th>
                      <th>GF</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => (
                      <tr
                        className={
                          team.position <= 2
                            ? "qualified-row"
                            : team.position === 3
                              ? "third-row"
                              : ""
                        }
                        key={team.team}
                      >
                        <td>{team.position}</td>
                        <td>
                          <TeamName team={team.team} />
                          {!team.resolved ? <span className="unresolved-mark">!</span> : null}
                        </td>
                        <td>{team.played}</td>
                        <td>{team.goalDifference}</td>
                        <td>{team.goalsFor}</td>
                        <td>
                          <strong>{team.points}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {view === "terceros" ? (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Ranking de terceros</h2>
              <p className="muted">Los ocho primeros avanzan a dieciseisavos.</p>
            </div>
            <span className="badge">{snapshot.thirds.filter((team) => team.qualified).length}/8</span>
          </div>
          <div className="table-scroll">
            <table className="football-table thirds-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Grupo</th>
                  <th>Equipo</th>
                  <th>Pts</th>
                  <th>DG</th>
                  <th>GF</th>
                  <th>Conducta</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.thirds.map((team) => (
                  <tr className={team.qualified ? "qualified-row" : ""} key={team.team}>
                    <td>{team.position}</td>
                    <td>{team.group}</td>
                    <td>
                      <TeamName team={team.team} />
                    </td>
                    <td>{team.points}</td>
                    <td>{team.goalDifference}</td>
                    <td>{team.goalsFor}</td>
                    <td>{team.conduct}</td>
                    <td>
                      {team.qualified ? "Clasifica" : "Eliminado"}
                      {!team.resolved ? " (pendiente)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "cuadro" ? (
        <section className="panel bracket-panel">
          <div className="section-head">
            <div>
              <h2>Cuadro eliminatorio</h2>
              <p className="muted">
                {snapshot.state?.bracketLockedAt
                  ? "Cuadro oficial fijado."
                  : "Vista provisional: se fija al completar los 72 resultados."}
              </p>
            </div>
            <span className="badge">
              {snapshot.state?.bracketLockedAt ? "Oficial" : "Provisional"}
            </span>
          </div>
          <div className="bracket-scroll">
            <div className="bracket-grid">
              {bracketRounds.map(({ round, matches }) => (
                <section className="bracket-round" key={round}>
                  <h3>{ROUND_TITLES[round]}</h3>
                  <div className="bracket-match-list">
                    {matches.map((slot) => {
                      const saved = matchByNumber.get(slot.matchNumber);
                      const preview = previewByNumber.get(slot.matchNumber);
                      return (
                        <article className="bracket-match" key={slot.matchNumber}>
                          <span className="match-number">Partido {slot.matchNumber}</span>
                          <div>
                            <BracketTeam
                              team={saved?.homeTeam ?? preview?.homeTeam}
                              fallback={slot.homeFrom}
                            />
                            <strong>{saved?.homeGoals ?? "-"}</strong>
                          </div>
                          <div>
                            <BracketTeam
                              team={saved?.awayTeam ?? preview?.awayTeam}
                              fallback={slot.awayFrom}
                            />
                            <strong>{saved?.awayGoals ?? "-"}</strong>
                          </div>
                          {saved?.winnerTeam ? (
                            <span className="winner-line">
                              Avanza: <TeamName team={saved.winnerTeam} />
                            </span>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
