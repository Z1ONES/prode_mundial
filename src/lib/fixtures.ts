import { prisma } from "@/lib/prisma";
import { groupStageFixtures } from "@/lib/world-cup";

export async function seedGroupStageFixtures() {
  let created = 0;
  let updated = 0;

  for (const fixture of groupStageFixtures) {
    const startsAt = new Date(fixture.startsAt);
    const existing = await prisma.match.findUnique({
      where: {
        homeTeam_awayTeam_startsAt: {
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          startsAt
        }
      }
    });

    if (existing) {
      await prisma.match.update({
        where: { id: existing.id },
        data: { phase: fixture.phase }
      });
      updated += 1;
    } else {
      await prisma.match.create({
        data: {
          ...fixture,
          startsAt
        }
      });
      created += 1;
    }
  }

  return { created, updated, total: groupStageFixtures.length };
}
