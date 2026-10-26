import { describe, expect, it } from "vitest";
import { parse, say, toMovements } from "../src/index.js";
import { confidence } from "../workbench/confidence.js";

const BETA =
  "Left heel on the nose, right leg flag and squeeze under roof, left hand guppie on the rising arete, right hand on side pull jug. Bump right hand to side pull crimp.";

describe("the crux of Conan, written by the maintainer", () => {
  const r = parse(BETA);
  const record = toMovements(r);

  it("reads the nose as a feature", () => {
    expect(r.beats[0].holds.map(h => h.kinds.map(k => k.id))).toEqual([["nose"]]);
    expect(r.unknown.map(u => u.raw)).not.toContain("nose");
  });

  it("reads leg as a limb word and squeeze after it as leg compression", () => {
    expect([r.beats[1].side, r.beats[1].part]).toEqual(["right", "leg"]);
    expect(r.beats[1].pos.map(t => t.id)).toEqual(["flag", "compression-legs"]);
    expect(say(r.beats[1])).toBe("Right leg: flag, compression (legs).");
  });

  it("infers the crux when the beta has only one move", () => {
    expect(record.movements.map(m => [m.crux, m.cruxSource])).toEqual([[true, "inferred"]]);
  });

  it("does not claim full confidence while words are unrecognised", () => {
    expect(confidence(r, record).score).toBeLessThan(1);
  });
});
