import { describe, expect, it } from "vitest";
import { vocabulary } from "../src/index.js";
import { addPhrase, addStopWord, movePhrase, owners, removePhrase } from "../workbench/vocab-edit.js";

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
    expect([matchOf(terms, "dyno"), matchOf(terms, "jump")]).toEqual([["dyno"], ["jump", "dynoed"]]);
  });

  it("lists every term a phrase belongs to", () => {
    expect(owners(fresh().terms, "jam").map(t => t.id)).toEqual(["jam-hand", "jam-wedge"]);
  });

  it("adds a stop word", () => {
    expect(addStopWord(fresh().words, "Securely").stop).toContain("securely");
  });

  it("refuses a stop word that is already a stop word, a term phrase, or more than one word", () => {
    expect(() => addStopWord(fresh().words, "the")).toThrow("“the” is already a stop word.");
    expect(() => addStopWord(fresh().words, "very good")).toThrow("A stop word is a single word.");
    expect(() => addStopWord(fresh().words, "jug", fresh().terms)).toThrow("“jug” is a vocabulary phrase (Jug).");
  });
});
