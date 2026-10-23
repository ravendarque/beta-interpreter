import { describe, expect, it } from "vitest";
import { ratingRecord } from "../workbench/ratings.js";

const context = { at: "2026-10-23T20:00:00.000Z", sha: "abc1234" };

describe("ratingRecord", () => {
  it("keeps the score, tags and numeric metrics", () => {
    expect(
      ratingRecord({ score: 4, tags: ["wrong-limb", "wrong-limb"], metrics: { steps: 3, movements: 2 } }, context),
    ).toEqual({ ...context, score: 4, tags: ["wrong-limb"], metrics: { steps: 3, movements: 2 } });
  });

  it("drops anything that could carry the beta's text", () => {
    const r = ratingRecord(
      { score: 3, text: "lh on the jug", note: "lh on the jug", metrics: { steps: "lh on the jug", unknown: 1 } },
      context,
    );
    expect(JSON.stringify(r)).not.toContain("jug");
    expect(r.metrics).toEqual({ unknown: 1 });
  });

  it("refuses a score outside 1 to 5 or an unknown tag", () => {
    expect(() => ratingRecord({ score: 6 }, context)).toThrow("The score must be a whole number from 1 to 5.");
    expect(() => ratingRecord({ score: 2.5 }, context)).toThrow("The score must be a whole number from 1 to 5.");
    expect(() => ratingRecord({ score: 2, tags: ["lh on the jug"] }, context)).toThrow(
      "Unknown error tag: lh on the jug.",
    );
  });
});
