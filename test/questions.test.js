import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";
import { groupQuestions } from "../workbench/questions.js";

describe("groupQuestions", () => {
  it("groups unrecognised words by distinct word, most frequent first, with typos apart", () => {
    const q = groupQuestions(parse("Honestly hok, honestly hok. Honestly the crux was hok, frankly."));
    expect(q.typos.map(t => [t.word, t.guess, t.count])).toEqual([["hok", "hook", 3]]);
    expect(q.unknown.map(u => [u.word, u.count])).toEqual([
      ["honestly", 3],
      ["frankly", 1],
    ]);
    expect(q.words.map(w => w.word)).toEqual(["honestly", "hok", "frankly"]);
    expect([q.unread.length, q.total]).toEqual([4, 5]);
  });

  it("lists steps it could not read, with their words", () => {
    const q = groupQuestions(parse("left hand on the jug. Explode upwards, then dyno to the lip"));
    expect([q.unread, q.total]).toEqual([[{ clause: 1, text: "Explode upwards" }], 1]);
  });

  it("counts ambiguities and contradictions as open questions", () => {
    const q = groupQuestions(parse("jam in the crack, then left hand heel hook"));
    expect([q.ambiguous.length, q.issues.length, q.total]).toEqual([1, 1, 2]);
  });
});
