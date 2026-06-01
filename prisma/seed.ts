import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { groupStageFixtures } from "../src/lib/world-cup";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@prode.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin1234";
  const adminName = process.env.ADMIN_NAME ?? "Admin";

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: { name: adminName, role: "ADMIN" },
    create: {
      name: adminName,
      email: adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN"
    }
  });

  for (const fixture of groupStageFixtures) {
    const startsAt = new Date(fixture.startsAt);
    await prisma.match.upsert({
      where: {
        homeTeam_awayTeam_startsAt: {
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          startsAt
        }
      },
      update: {
        phase: fixture.phase
      },
      create: {
        ...fixture,
        startsAt
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
