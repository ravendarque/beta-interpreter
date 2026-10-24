import { describe, expect, it } from "vitest";
import { createInterpreter, parse, say, vocabulary } from "../src/index.js";

describe("parse", () => {
  it("applies a resolution to an ambiguous word", () => {
    const r = parse("jam in the crack", { resolutions: new Map([["jam#0", 1]]) });
    expect(r.amb).toEqual([]);
    expect(r.beats[0].pos.map(t => t.id)).toEqual(["jam-wedge"]);
  });

  it("narrows an ambiguous word by the named limb", () => {
    const r = parse("left foot jam in the crack");
    expect(r.amb).toEqual([]);
    expect(r.beats[0].pos.map(t => t.id)).toEqual(["jam-wedge"]);
  });

  it("stops asking about an ignored word", () => {
    expect(parse("bump to the horn", { ignored: new Set(["bump"]) }).unknown).toEqual([]);
  });

  it("does not read object property names as vocabulary", () => {
    const r = parse("constructor toString hasOwnProperty");
    expect(r.unknown.map(u => u.raw)).toEqual(["constructor", "toString", "hasOwnProperty"]);
    expect(r.beats.map(b => b.unread)).toEqual([true]);
  });

  it("splits on 'and' before a transition", () => {
    expect(parse("match and rock over").beats.map(say)).toEqual(["Match.", "Rockover."]);
  });

  it("splits on 'then'", () => {
    expect(parse("heel hook then toe hook").beats.map(say)).toEqual(["Heel hook.", "Toe hook."]);
  });

  it("traces every token with how it was read", () => {
    expect(parse("lh on the sloppr jugg, then fire up").trace.map(t => [t.text, t.kind, t.key ?? null])).toEqual([
      ["lh", "limb", null],
      ["on", "prep", null],
      ["the", "filler", null],
      ["sloppr", "term", "sloper"],
      ["jugg", "unknown", null],
      [",", "split", null],
      ["then", "split", null],
      ["fire up", "term", "fire up"],
    ]);
  });

  it("tags tokens and steps with their clause", () => {
    const r = parse("lh on the jug, then fire up");
    expect(r.trace.map(t => t.clause)).toEqual([0, 0, 0, 0, 1, 2, 2]);
    expect(r.beats.map(b => b.clause)).toEqual([0, 2]);
  });

  it("keeps a word with a curly apostrophe together", () => {
    expect(parse("I don’t think it’s hard").unknown.map(u => u.raw)).toEqual(["don’t", "think", "hard"]);
  });

  it("only suggests a correction that is plausibly a typo", () => {
    const guesses = parse("did hok sloppers").unknown.map(u => [u.raw, u.guess]);
    expect(guesses).toEqual([
      ["did", undefined],
      ["hok", "hook"],
    ]);
  });

  it("marks the crux only when the beta says crux", () => {
    expect(parse("heel hook, crux! then dyno to the jug!").beats.map(b => b.crux)).toEqual([true, false]);
  });

  it("reads plural limbs as both sides", () => {
    expect(parse("hands on the jug, feet on the edge, knees on the rail").beats.map(b => b.side)).toEqual([
      "both",
      "both",
      "both",
    ]);
  });

  it("reads reach, catch and grab as an unnamed hand move", () => {
    const r = parse("reach the jug, catch the sloper, grab the crimp");
    expect(r.beats.map(b => [b.part, b.move, b.holds[0].role, say(b)])).toEqual([
      ["hand", "upper", "target", "Hand move to a jug."],
      ["hand", "upper", "target", "Hand move to a sloper."],
      ["hand", "upper", "target", "Hand move to a crimp."],
    ]);
  });

  it("reads taught move words for the foot and the full body", () => {
    const { parse: read } = createInterpreter({
      ...vocabulary,
      words: { ...vocabulary.words, moves: { ...vocabulary.words.moves, stomp: "lower", explode: "full" } },
    });
    const r = read("stomp the edge, then explode up");
    expect(r.beats.map(b => [b.part, b.move, say(b)])).toEqual([
      ["foot", "lower", "Foot move to an edge."],
      ["body", "full", "Full-body move."],
    ]);
  });

  it("starts a new step at 'and' when a hand move follows a named foot", () => {
    expect(parse("stomp the left foot on the rail and push hard to reach the lip").beats.length).toBe(2);
  });

  it("reads stand as a transition and sit as a position", () => {
    const r = parse("sit on the ledge, then stand up");
    expect(r.beats.map(b => [...b.pos, ...b.moves].map(t => t.id))).toEqual([["sit"], ["stand-up"]]);
  });

  it("attaches qualifiers to the hold that follows them", () => {
    const r = parse("feet on the small dishes, then reach the sharp shallow crimp");
    expect(r.beats.map(b => b.holds.map(h => h.qualifiers))).toEqual([[["small"]], [["sharp", "shallow"]]]);
    expect(r.beats.map(say)).toEqual(["Both feet: on small dishes.", "Hand move to a sharp shallow crimp."]);
  });

  it("keeps a qualifier on the step when a role word or move comes before the hold", () => {
    const { parse: read } = createInterpreter({
      ...vocabulary,
      words: { ...vocabulary.words, qualifiers: [...vocabulary.words.qualifiers, "hard"] },
    });
    const [b] = read("push hard to reach the lip").beats;
    expect([b.qualifiers, b.holds[0].qualifiers, say(b)]).toEqual([["hard"], [], "Hand move to a lip."]);
  });

  it("keeps a qualifier with no hold after it on the step", () => {
    expect(parse("massive dyno").beats[0].qualifiers).toEqual(["massive"]);
  });

  it("keeps plural holds plural", () => {
    const r = parse(
      "feet on the small dishes, hands on the crimps, left hand on the jug, then reach the two finger pockets",
    );
    expect(r.beats.map(b => b.holds.map(h => h.plural))).toEqual([
      [["dish"]],
      [["crimp"]],
      [[]],
      [["two-finger-pocket"]],
    ]);
    expect(r.beats.map(say)).toEqual([
      "Both feet: on small dishes.",
      "Both hands: on crimps.",
      "Left hand: on a jug.",
      "Hand move to two finger pockets.",
    ]);
  });

  it("keeps a plural hold plural when it merges with a singular one", () => {
    const [b] = parse("hands on the crimps at the back of the slopey rail").beats;
    expect([b.holds[0].plural, say(b)]).toEqual([["crimp"], "Both hands: on crimps sloper rail."]);
  });

  it("returns nothing for empty text", () => {
    expect(parse("")).toMatchObject({ beats: [], unknown: [], amb: [] });
  });
});
