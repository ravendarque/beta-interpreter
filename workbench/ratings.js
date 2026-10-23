export const TAGS = /** @type {const} */ ({
  "wrong-limb": "Wrong limb",
  "wrong-role": "Wrong role",
  "bad-step-split": "Bad step split",
  "missed-term": "Missed term",
  "false-match": "False match",
  "nonsense-output": "Nonsense output",
});

export const METRICS = [
  "tokens",
  "steps",
  "movements",
  "unknown",
  "ambiguous",
  "fuzzy",
  "inferred",
  "unplaced",
  "corrections",
];

// Only the score, known tags and numeric metrics are kept, so no text from the beta can reach the file.
/**
 * @param {any} body
 * @param {{ at: string, sha: string }} context
 */
export function ratingRecord(body, { at, sha }) {
  const score = body?.score;
  if (!Number.isInteger(score) || score < 1 || score > 5)
    throw new Error("The score must be a whole number from 1 to 5.");
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const unknown = tags.filter((/** @type {unknown} */ t) => typeof t !== "string" || !(t in TAGS));
  if (unknown.length) throw new Error(`Unknown error tag: ${unknown.join(", ")}.`);
  /** @type {Record<string, number>} */
  const metrics = {};
  for (const m of METRICS) {
    const v = body.metrics?.[m];
    if (Number.isFinite(v)) metrics[m] = v;
  }
  return { at, sha, score, tags: [...new Set(tags)], metrics };
}
