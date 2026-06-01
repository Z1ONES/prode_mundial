type ScoreInput = {
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;
  actualAway: number | null;
};

export function outcome(homeGoals: number, awayGoals: number) {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

export function scorePrediction(input: ScoreInput) {
  if (input.actualHome === null || input.actualAway === null) {
    return 0;
  }

  const exact =
    input.predictedHome === input.actualHome &&
    input.predictedAway === input.actualAway;

  if (exact) {
    return 3;
  }

  return outcome(input.predictedHome, input.predictedAway) ===
    outcome(input.actualHome, input.actualAway)
    ? 1
    : 0;
}
