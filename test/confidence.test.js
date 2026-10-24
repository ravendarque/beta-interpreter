import { describe, expect, it } from "vitest";
import { parse, toMovements } from "../src/index.js";
import { confidence } from "../workbench/confidence.js";

/** @param {string} text */
const of = text => {
  const r = parse(text);
  return confidence(r, toMovements(r));
};

describe("confidence", () => {
  it("is full when every fact is stated", () => {
    expect(of("left hand on the jug, then left hand crossover to the crimp")).toEqual({ score: 1, facts: 5 });
  });

  it("counts inferred facts as half", () => {
    expect(of("get the left hand on the crimp, then fire up for the jug")).toEqual({ score: 4 / 5, facts: 5 });
  });

  it("counts unplaced limbs, ambiguities and contradictions as nothing", () => {
    expect(of("jam in the crack, then left hand heel hook")).toEqual({ score: 0.25, facts: 4 });
  });

  it("has no score when there is nothing to judge", () => {
    expect(of("")).toEqual({ score: null, facts: 0 });
  });
});
