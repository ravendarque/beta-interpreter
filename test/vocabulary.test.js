import { describe, expect, it } from "vitest";
import { norm, vocabulary } from "../src/index.js";

const { terms, words } = vocabulary;
const FACETS = ["terrain", "feature", "hold", "orientation", "position", "transition"];
const REGIONS = ["upper", "lower", "full"];
const PARTS = ["hand", "foot", "leg", "body"];
const ids = new Set(terms.map(t => t.id));

describe("vocabulary", () => {
  it("has unique ids", () => {
    expect(ids.size).toBe(terms.length);
  });

  it.each(terms)("$id is well formed", t => {
    expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(t.facets.length).toBeGreaterThan(0);
    for (const f of t.facets) expect(FACETS).toContain(f);
    if (t.parent) expect(ids).toContain(t.parent);
    if (t.region) expect(REGIONS).toContain(t.region);
    if (t.part) expect(PARTS).toContain(t.part);
    const eitherLimb = t.side === "both" && !t.part;
    if (t.facets.includes("position") && !eitherLimb)
      expect([t.part, t.region]).toEqual([expect.any(String), expect.any(String)]);
    if (t.facets.includes("transition") && !t.sameLimb) expect(t.region).toBeDefined();
    if (t.side) expect(t.side).toBe("both");
    for (const m of t.match) expect(norm(m)).not.toBe("");
  });

  it("only leaves the Stand group term unmatched", () => {
    expect(terms.filter(t => !t.match.length).map(t => t.id)).toEqual(["stand"]);
  });

  it("does not repeat a phrase within a term", () => {
    for (const t of terms) expect([t.id, new Set(t.match.map(norm)).size]).toEqual([t.id, t.match.length]);
  });

  it("keeps each grammar word in one list only, and filler apart from term phrases", () => {
    const lists = {
      limbs: Object.keys(words.limbs),
      prepositions: Object.keys(words.prepositions),
      crux: words.crux,
      moves: Object.keys(words.moves),
      qualifiers: words.qualifiers,
      filler: words.filler,
    };
    const seen = new Map();
    for (const [list, entries] of Object.entries(lists))
      for (const w of entries) {
        expect([w, seen.get(w)]).toEqual([w, undefined]);
        seen.set(w, list);
      }
    const phrases = new Set(terms.flatMap(t => t.match.map(norm)));
    expect(words.filler.filter(w => phrases.has(w))).toEqual([]);
  });

  it("gives every move word a taxonomy region", () => {
    for (const [w, region] of Object.entries(words.moves))
      expect([w, REGIONS]).toEqual([w, expect.arrayContaining([region])]);
  });
});
