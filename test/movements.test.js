import { describe, expect, it } from "vitest";
import { parse, toMovements } from "../src/index.js";

/** @typedef {import("../src/movements.js").State} State @typedef {import("../src/movements.js").Contact} Contact */

/** @param {Contact} c */
const contact = c => ({
  side: c.side,
  hold: c.hold ? [c.hold.ori, ...c.hold.kinds].flatMap(t => (t ? [t.id] : [])) : [],
  techniques: c.techniques.map(t => t.id),
});

/** @param {State} s */
const state = s => ({
  limbs: Object.fromEntries(Object.entries(s.limbs).map(([k, c]) => [k, contact(c)])),
  body: s.body.map(t => t.id),
  unplaced: s.unplaced.map(u => ({ part: u.part, ...contact(u) })),
});

/** @param {string} text */
const read = text =>
  toMovements(parse(text)).movements.map(m => ({
    start: state(m.start),
    transition: m.transition && {
      terms: m.transition.terms.map(t => t.id),
      limbs: m.transition.limbs,
      side: m.transition.side,
    },
    end: state(m.end),
    crux: m.crux,
  }));

const empty = { limbs: {}, body: [], unplaced: [] };

describe("toMovements", () => {
  it("moves the other hand after one hand establishes", () => {
    expect(read("get the left hand securely on the slopey crimp, then fire up for the hero jug")).toEqual([
      {
        start: { ...empty, limbs: { lh: { side: "stated", hold: ["sloper", "crimp"], techniques: [] } } },
        transition: { terms: ["fire-up"], limbs: ["rh"], side: "inferred" },
        end: { ...empty, limbs: { rh: { side: "inferred", hold: ["jug"], techniques: [] } } },
        crux: false,
      },
    ]);
  });

  it("bumps with the same limb as the previous move", () => {
    expect(read("get the left hand securely on the slopey crimp, then big bump to the hero jug")).toEqual([
      {
        start: { ...empty, limbs: { lh: { side: "stated", hold: ["sloper", "crimp"], techniques: [] } } },
        transition: { terms: ["bump"], limbs: ["lh"], side: "inferred" },
        end: { ...empty, limbs: { lh: { side: "inferred", hold: ["jug"], techniques: [] } } },
        crux: false,
      },
    ]);
  });

  it("builds start states from set-up steps and carries the crux", () => {
    expect(
      read(
        "Steep cave. Both hands matched on the jug, right heel hook on the lip, cross left hand to a sidepull crimp, then deadpoint to the slopey pinch, crux! Match and rock over to finish.",
      ),
    ).toEqual([
      {
        start: {
          ...empty,
          limbs: {
            lh: { side: "stated", hold: ["jug"], techniques: ["match"] },
            rh: { side: "stated", hold: ["jug"], techniques: ["match"] },
            rf: { side: "stated", hold: ["lip"], techniques: ["heel-hook"] },
          },
        },
        transition: { terms: ["crossover"], limbs: ["lh"], side: "stated" },
        end: { ...empty, limbs: { lh: { side: "stated", hold: ["sidepull", "crimp"], techniques: [] } } },
        crux: false,
      },
      {
        start: empty,
        transition: { terms: ["deadpoint"], limbs: ["rh"], side: "inferred" },
        end: { ...empty, limbs: { rh: { side: "inferred", hold: ["sloper", "pinch"], techniques: [] } } },
        crux: true,
      },
      {
        start: { ...empty, unplaced: [{ part: "hand", side: null, hold: [], techniques: ["match"] }] },
        transition: { terms: ["rockover"], limbs: [], side: null },
        end: empty,
        crux: false,
      },
    ]);
  });

  it("puts a double knee bar on both legs", () => {
    expect(read("double knee bar then dyno to the jug")).toEqual([
      {
        start: {
          ...empty,
          limbs: {
            lf: { side: "stated", hold: [], techniques: ["knee-bar"] },
            rf: { side: "stated", hold: [], techniques: ["knee-bar"] },
          },
        },
        transition: { terms: ["dyno"], limbs: [], side: null },
        end: { ...empty, unplaced: [{ part: "hand", side: null, hold: ["jug"], techniques: [] }] },
        crux: false,
      },
    ]);
  });

  it("puts compression on both hands, with its hold", () => {
    expect(read("compression on the arete then paddle up the rail")[0].start).toEqual({
      ...empty,
      limbs: {
        lh: { side: "implied", hold: ["arete"], techniques: ["compression-hands"] },
        rh: { side: "implied", hold: ["arete"], techniques: ["compression-hands"] },
      },
    });
  });

  it("records a movement to a target hold with no named transition", () => {
    expect(read("lock off to the crimp")).toEqual([
      {
        start: { ...empty, unplaced: [{ part: "hand", side: null, hold: [], techniques: ["lock-off"] }] },
        transition: { terms: [], limbs: [], side: null },
        end: { ...empty, unplaced: [{ part: "hand", side: null, hold: ["crimp"], techniques: [] }] },
        crux: false,
      },
    ]);
  });

  it("keeps body positions at body level and ends on a state with no transition", () => {
    expect(read("overhead press then body jam")).toEqual([
      { start: { ...empty, body: ["overhead-press", "body-jam"] }, transition: null, end: empty, crux: false },
    ]);
  });

  it("leaves a bump unplaced when nothing has moved before it", () => {
    expect(read("bump to the jug")[0].transition).toEqual({ terms: ["bump"], limbs: [], side: null });
  });

  it("keeps terrain and features at climb level", () => {
    const r = toMovements(parse("Overhanging arête. Squeeze it with compression, flag and paddle up the rail."));
    expect([r.terrain.map(t => t.id), r.features.map(t => t.id)]).toEqual([["overhang"], ["arete"]]);
  });
});
