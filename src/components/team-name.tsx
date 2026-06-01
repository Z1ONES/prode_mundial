import Image from "next/image";
import { teamDisplayName, teamFlagUrl } from "@/lib/world-cup";

type TeamNameProps = {
  team: string;
};

export function TeamName({ team }: TeamNameProps) {
  const flagUrl = teamFlagUrl(team);
  const displayName = teamDisplayName(team);

  return (
    <span className="team-name">
      {flagUrl ? (
        <Image
          className="flag-img"
          src={flagUrl}
          alt={`Bandera de ${displayName}`}
          width={40}
          height={30}
          unoptimized
        />
      ) : null}
      <span>{displayName}</span>
    </span>
  );
}
