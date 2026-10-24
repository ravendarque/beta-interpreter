import { describe, expect, it } from "vitest";
import { parse, say } from "../src/index.js";

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
      ["the", "stop", null],
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

  it("returns nothing for empty text", () => {
    expect(parse("")).toMatchObject({ beats: [], unknown: [], amb: [] });
  });
});
