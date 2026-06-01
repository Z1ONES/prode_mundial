import Image from "next/image";
import { teamFlagUrl } from "@/lib/world-cup";

type TeamNameProps = {
  team: string;
};

export function TeamName({ team }: TeamNameProps) {
  const flagUrl = teamFlagUrl(team);

  return (
    <span className="team-name">
      {flagUrl ? (
        <Image
          className="flag-img"
          src={flagUrl}
          alt={`Bandera de ${team}`}
          width={40}
          height={30}
          unoptimized
        />
      ) : null}
      <span>{team}</span>
    </span>
  );
}
