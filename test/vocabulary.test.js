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
    if (t.facets.includes("position")) expect(t.part).toBeDefined();
    if (t.facets.includes("position") || (t.facets.includes("transition") && !t.sameLimb))
      expect(t.region).toBeDefined();
    if (t.side) expect(t.side).toBe("both");
    for (const m of t.match) expect(norm(m)).not.toBe("");
  });

  it("only leaves unmatched the group terms that clash with stop words", () => {
    expect(terms.filter(t => !t.match.length).map(t => t.id)).toEqual(["sit", "stand"]);
    expect(words.stop).toEqual(expect.arrayContaining(["sit", "stand"]));
  });

  it("does not repeat a phrase within a term", () => {
    for (const t of terms) expect([t.id, new Set(t.match.map(norm)).size]).toEqual([t.id, t.match.length]);
  });
});
