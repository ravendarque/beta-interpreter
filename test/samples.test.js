import { describe, expect, it } from "vitest";
import { parse, say } from "../src/index.js";

/** @param {string} text */
function read(text) {
  const r = parse(text);
  return {
    terrain: r.terrain.map(t => t.name),
    features: r.features.map(t => t.name),
    steps: r.beats.map(b => say(b)),
    crux: r.beats.flatMap((b, i) => (b.crux ? [i] : [])),
    issues: r.beats.flatMap(b => b.issues),
    ambiguous: r.amb.map(a => [a.word, a.options.map(o => o.id)]),
    unknown: r.unknown.map(u => [u.raw, u.guess]),
    fuzzy: r.fuzzy.map(f => [f.from, f.to]),
  };
}

describe("paraphrased sample betas", () => {
  it("reads a steep boulder with a crux and a combined hold", () => {
    expect(
      read(
        "Overhung cave. Both hands matched on the jug, right heel hook over the lip, then cross the left hand to a sidepull crimp. Deadpoint to the slopey pinch, hardest move! Match and rock over to top out.",
      ),
    ).toEqual({
      terrain: ["Overhang"],
      features: [],
      steps: [
        "Both hands: match on a jug.",
        "Right foot: heel hook on a lip.",
        "Left hand: crossover to a sidepull crimp.",
        "Deadpoint to a sloper pinch.",
        "Match.",
        "Rockover.",
      ],
      crux: [3],
      issues: [],
      ambiguous: [],
      unknown: [],
      fuzzy: [],
    });
  });

  it("reads a slab and splits on 'and' before a hand position after a named foot", () => {
    expect(
      read(
        "Slabby. Left foot smearing, palm on the dish, rock over onto the right foot inside edge and lock off to a crimp.",
      ),
    ).toMatchObject({
      terrain: ["Slab"],
      steps: [
        "Left foot: smear.",
        "Palm down on a dish.",
        "Right foot: rockover, inside edge.",
        "Lock-off to a crimp.",
      ],
      issues: [],
      unknown: [],
    });
  });

  it("reads a crack and keeps simultaneous positions in one step", () => {
    expect(
      read("Off width in a corner: armbar and heel toe cam, chicken wing up to a hand jam in the crack."),
    ).toMatchObject({
      terrain: ["Chimney/Dihedral"],
      features: ["Offwidth"],
      steps: ["Arm bar, cam.", "Chicken wing, jam (hand) on a crack."],
      ambiguous: [],
      unknown: [],
    });
  });

  it("corrects a clear typo and asks about uncertain ones", () => {
    expect(read("rh sloppr undercut, lf toe hok, campus to jugg, bump to the horn")).toMatchObject({
      features: ["Horn"],
      steps: ["Right hand: on an undercling sloper.", "Left foot: toe hook.", "Campus."],
      unknown: [
        ["hok", "hook"],
        ["jugg", "jug"],
        ["bump", "jump"],
      ],
      fuzzy: [["sloppr", "Sloper"]],
    });
  });

  it("asks about words with more than one meaning", () => {
    expect(
      read("Overhanging arête. Squeeze it with compression, jam in the crack, flag and paddle up the rail."),
    ).toMatchObject({
      terrain: ["Overhang"],
      features: ["Arête"],
      steps: ["Compression (hands).", "Jam (hand) on a crack.", "Flag.", "Paddle to a rail."],
      ambiguous: [
        ["compression", ["compression-hands", "compression-legs"]],
        ["jam", ["jam-hand", "jam-wedge"]],
      ],
    });
  });

  it("flags a foot position on a named hand", () => {
    expect(read("Right hand heel hook on the edge, then mantel.")).toMatchObject({
      steps: ["Right hand: heel hook on an edge.", "Mantle."],
      issues: ["Heel hook is a foot position, but this step names a hand."],
    });
  });
});
