import { describe, expect, it } from "vitest";
import { vocabulary } from "../src/index.js";
import { addPhrase, addWord, addWords, movePhrase, owners, removePhrase } from "../workbench/vocab-edit.js";

const fresh = () => structuredClone(vocabulary);
/** @param {import("../src/interpreter.js").Term[]} terms @param {string} id */
const matchOf = (terms, id) => terms.find(t => t.id === id)?.match;

describe("vocabulary edits", () => {
  it("adds a phrase to a term", () => {
    const { terms } = fresh();
    expect(matchOf(addPhrase(terms, "jug", "Thank God hold"), "jug")).toContain("thank god hold");
  });

  it("does not change the input", () => {
    const { terms } = fresh();
    addPhrase(terms, "jug", "thank god hold");
    expect(matchOf(terms, "jug")).not.toContain("thank god hold");
  });

  it("refuses a phrase the term already matches, however it is written", () => {
    expect(() => addPhrase(fresh().terms, "jug", "  JUG ")).toThrow("Jug already matches “jug”.");
  });

  it("refuses an unknown term or an empty phrase", () => {
    expect(() => addPhrase(fresh().terms, "nope", "x")).toThrow("No term has the id “nope”.");
    expect(() => addPhrase(fresh().terms, "jug", " ?! ")).toThrow("The phrase has no letters or numbers.");
  });

  it("removes a phrase by its normalised form", () => {
    expect(matchOf(removePhrase(fresh().terms, "jug", "Bucket"), "jug")).toEqual(["jug", "hero jug"]);
  });

  it("refuses to remove a phrase the term does not match", () => {
    expect(() => removePhrase(fresh().terms, "jug", "crimp")).toThrow("Jug does not match “crimp”.");
  });

  it("moves a phrase from one term to another", () => {
    const terms = movePhrase(fresh().terms, "dyno", "jump", "dynoed");
    expect([matchOf(terms, "dyno"), matchOf(terms, "jump")]).toEqual([
      ["dyno", "explode"],
      ["jump", "dynoed"],
    ]);
  });

  it("lists every term a phrase belongs to", () => {
    expect(owners(fresh().terms, "jam").map(t => t.id)).toEqual(["jam-hand", "jam-wedge"]);
  });

  it("adds a word to a grammar list", () => {
    expect(addWord(fresh().words, "filler", "Securely").filler).toContain("securely");
    expect(addWord(fresh().words, "qualifiers", "rough").qualifiers).toContain("rough");
    expect(addWord(fresh().words, "moves", "slap", [], "upper").moves.slap).toBe("upper");
    expect(addWord(fresh().words, "moves", "stamp", [], "lower").moves.stamp).toBe("lower");
  });

  it("refuses a word already in any grammar list, a term phrase, more than one word, or an unknown list", () => {
    expect(() => addWord(fresh().words, "filler", "the")).toThrow("“the” is already a filler word.");
    expect(() => addWord(fresh().words, "qualifiers", "the")).toThrow("“the” is already a filler word.");
    expect(() => addWord(fresh().words, "filler", "tiny")).toThrow("“tiny” is already a qualifier.");
    expect(() => addWord(fresh().words, "filler", "reach")).toThrow("“reach” is already a move word.");
    expect(() => addWord(fresh().words, "moves", "slap")).toThrow("A move word needs a region: upper, lower or full.");
    expect(() => addWord(fresh().words, "filler", "left")).toThrow("“left” is already a limb word.");
    expect(() => addWord(fresh().words, "filler", "very good")).toThrow("A word list takes single words.");
    expect(() => addWord(fresh().words, "filler", "jug", fresh().terms)).toThrow("“jug” is a vocabulary phrase (Jug).");
    expect(() => addWord(fresh().words, "limbs", "paw")).toThrow("No word list called “limbs” can be taught.");
  });

  it("adds several words at once and reports the ones it skipped", () => {
    const r = addWords(fresh().words, "filler", ["Think", "the", "jug", "think", "pretty"], fresh().terms);
    expect(r.added).toEqual(["think", "pretty"]);
    expect(r.skipped).toEqual([
      { word: "the", reason: "“the” is already a filler word." },
      { word: "jug", reason: "“jug” is a vocabulary phrase (Jug)." },
      { word: "think", reason: "“think” is already a filler word." },
    ]);
    expect(r.words.filler.slice(-2)).toEqual(["think", "pretty"]);
  });
});
