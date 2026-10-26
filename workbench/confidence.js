/**
 * @typedef {import("../src/interpreter.js").Reading} Reading
 * @typedef {ReturnType<typeof import("../src/movements.js").toMovements>} MovementRecord
 */

/** @type {Record<string, number>} */
const WEIGHT = { stated: 1, implied: 1, inferred: 0.5 };

/**
 * Scores each fact in the record: stated or implied 1, inferred ½, and an unplaced limb, an unread step, an
 * unrecognised word elsewhere, an unresolved ambiguity or a contradiction 0.
 * @param {Reading} reading @param {MovementRecord} record
 */
export function confidence(reading, record) {
  let score = 0;
  let facts = 0;
  /** @param {string | null | undefined} source */
  const add = source => {
    facts++;
    score += source ? (WEIGHT[source] ?? 0) : 0;
  };
  for (const m of record.movements) {
    for (const st of [m.start, m.end]) {
      for (const c of Object.values(st.limbs)) {
        if (!c) continue;
        add(c.side);
        if (c.hold) add(c.holdSource);
      }
      for (const _ of st.unplaced) add(null);
    }
    if (m.transition?.limbs.length) add(m.transition.side);
  }
  const unread = new Set(reading.beats.filter(b => b.unread).map(b => b.clause));
  for (const _ of unread) add(null);
  for (const t of reading.trace) if (t.kind === "unknown" && !unread.has(t.clause)) add(null);
  for (const _ of reading.amb) add(null);
  for (const b of reading.beats) for (const _ of b.issues) add(null);
  return { score: facts ? score / facts : null, facts };
}
