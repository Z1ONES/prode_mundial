import { describe, expect, it } from "vitest";
import { scorePrediction } from "./scoring";

describe("scorePrediction", () => {
  it("gives 3 points for an exact score", () => {
    expect(
      scorePrediction({
        predictedHome: 2,
        predictedAway: 1,
        actualHome: 2,
        actualAway: 1
      })
    ).toBe(3);
  });

  it("gives 1 point for the right outcome", () => {
    expect(
      scorePrediction({
        predictedHome: 3,
        predictedAway: 1,
        actualHome: 2,
        actualAway: 0
      })
    ).toBe(1);
  });

  it("gives 0 points for the wrong outcome or missing result", () => {
    expect(
      scorePrediction({
        predictedHome: 0,
        predictedAway: 1,
        actualHome: 2,
        actualAway: 0
      })
    ).toBe(0);

    expect(
      scorePrediction({
        predictedHome: 0,
        predictedAway: 1,
        actualHome: null,
        actualAway: null
      })
    ).toBe(0);
  });
});
