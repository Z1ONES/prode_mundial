import { prisma } from "@/lib/prisma";
import { scorePrediction } from "@/lib/scoring";

export async function getLeaderboard() {
  const users = await prisma.user.findMany({
    where: { email: { not: "admin@prode.local" } },
    orderBy: { name: "asc" },
    include: {
      predictions: {
        include: {
          match: true
        }
      }
    }
  });

  return users
    .map((user) => {
      const points = user.predictions.reduce(
        (total, prediction) =>
          total +
          scorePrediction({
            predictedHome: prediction.homeGoals,
            predictedAway: prediction.awayGoals,
            actualHome: prediction.match.homeGoals,
            actualAway: prediction.match.awayGoals
          }),
        0
      );

      const exacts = user.predictions.filter(
        (prediction) =>
          prediction.match.homeGoals !== null &&
          prediction.match.awayGoals !== null &&
          scorePrediction({
            predictedHome: prediction.homeGoals,
            predictedAway: prediction.awayGoals,
            actualHome: prediction.match.homeGoals,
            actualAway: prediction.match.awayGoals
          }) === 3
      ).length;

      return {
        id: user.id,
        name: user.name,
        points,
        exacts,
        predictions: user.predictions.length
      };
    })
    .sort((a, b) => b.points - a.points || b.exacts - a.exacts || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, position: index + 1 }));
}
