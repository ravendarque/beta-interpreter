import { describe, expect, it } from "vitest";
import { parse, toMovements, who } from "../src/index.js";
import { confidence } from "../workbench/confidence.js";

const BETA =
  "Start with hands on the crimps at the back of the slopey rail, feet on the small dishes. Explode upwards, stomp the left foot on the rail and push hard to reach the lip.";

describe("a full beta written by the maintainer", () => {
  const r = parse(BETA);

  it("keeps the set-up steps that name only a limb part, on both sides", () => {
    expect(r.beats.slice(0, 2).map(b => [who(b), b.holds.flatMap(h => h.kinds.map(k => k.id))[0]])).toEqual([
      ["Both hands", "crimp"],
      ["Both feet", "dish"],
    ]);
    expect(r.features.map(t => t.id)).toEqual([]);
  });

  it("reads every step once its words are taught", () => {
    expect(r.beats.map(b => !!b.unread)).toEqual([false, false, false, false, false]);
    expect(r.beats[2].moves.map(t => t.id)).toEqual(["dyno"]);
  });

  it("gives the lip to a hand, not the left foot", () => {
    const last = r.beats[r.beats.length - 1];
    expect([last.part, last.holds.map(h => h.kinds.map(k => k.id))]).toEqual(["hand", [["lip"]]]);
  });

  it("does not take effort words for the crux", () => {
    expect(r.beats.some(b => b.crux)).toBe(false);
  });

  it("does not claim full confidence while a limb is unplaced", () => {
    const c = confidence(r, toMovements(r));
    expect(c.score).toBeLessThan(1);
  });
});
