import { norm } from "../src/interpreter.js";

/** @typedef {import("../src/interpreter.js").Reading} Reading */
/** @typedef {{ word: string, raw: string, guess?: string, count: number, s: number }} WordQuestion */

/** @param {Reading} reading */
export function groupQuestions(reading) {
  /** @type {Map<string, WordQuestion>} */
  const words = new Map();
  for (const u of reading.unknown) {
    const word = norm(u.raw);
    const seen = words.get(word);
    if (seen) seen.count++;
    else words.set(word, { word, raw: u.raw, guess: u.guess, count: 1, s: u.s });
  }
  const byCount = (/** @type {WordQuestion} */ a, /** @type {WordQuestion} */ b) => b.count - a.count || a.s - b.s;
  const all = [...words.values()].sort(byCount);
  const typos = all.filter(w => w.guess);
  const unknown = all.filter(w => !w.guess);
  const issues = reading.beats.flatMap(b => b.issues);
  return {
    ambiguous: reading.amb,
    issues,
    typos,
    unknown,
    words: all,
    fuzzy: reading.fuzzy,
    total: reading.amb.length + issues.length + typos.length,
  };
}
