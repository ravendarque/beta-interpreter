/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   facets: string[],
 *   region?: string,
 *   part?: string,
 *   side?: string,
 *   sameLimb?: boolean,
 *   sameHold?: boolean,
 *   parent?: string,
 *   match: string[],
 * }} Term
 * @typedef {{ side?: string, part?: string }} Limb
 * @typedef {{
 *   limbs: Record<string, Limb>,
 *   prepositions: Record<string, string>,
 *   crux: string[],
 *   stop: string[],
 *   splitAlways: string[],
 *   splitBeforeMove: string[],
 * }} Words
 * @typedef {{ terms: Term[], words: Words }} Vocabulary
 * @typedef {{ role: string | null, ori: Term | null, kinds: Term[] }} Hold
 * @typedef {{ kind: "hold", hold: Hold } | { kind: "position", term: Term, role: string | null } | { kind: "transition", term: Term }} Part
 * @typedef {{
 *   side: string | null,
 *   part: string | null,
 *   moves: Term[],
 *   pos: Term[],
 *   holds: Hold[],
 *   order: Part[],
 *   crux: boolean,
 *   issues: string[],
 *   clause: number,
 *   unread?: boolean,
 * }} Beat
 * @typedef {{ s: number, e: number, facet: string, term?: Term, ambiguous?: boolean, fuzzy?: boolean }} Span
 * @typedef {{ occ: string, word: string, options: Term[], s: number }} Ambiguity
 * @typedef {{ raw: string, guess?: string, s: number, e: number }} Unknown
 * @typedef {{ from: string, to: string }} Fuzzy
 * @typedef {{
 *   terrain: Term[],
 *   features: Term[],
 *   beats: Beat[],
 *   spans: Span[],
 *   amb: Ambiguity[],
 *   unknown: Unknown[],
 *   fuzzy: Fuzzy[],
 *   trace: Trace[],
 * }} Reading
 * @typedef {{ s: number, e: number, text: string, kind: string, clause: number, key?: string, fuzzy?: string[], guess?: string }} Trace
 * @typedef {{ resolutions?: Map<string, number>, ignored?: Set<string> }} ParseOptions
 * @typedef {{ n: number, s: number, e: number }} Extent
 * @typedef {Extent & (
 *   | { kind: "term", key: string, senses: Term[], fz: string[] }
 *   | { kind: "limb", side?: string, part?: string }
 *   | { kind: "prep", role: string }
 *   | { kind: "crux" | "break" | "stop" }
 *   | { kind: "unknown", raw: string, guess?: string }
 * )} Item
 */

/** @param {string} s */
export const norm = s =>
  s
    .toLowerCase()
    .replace(/[’ʼ‘]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();

/** @param {Term} term */
export const facetOf = term => term.facets[0];

/** @param {string} a @param {string} b */
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** @param {string | null} named @param {string | undefined} part */
const fits = (named, part) => !named || !part || part === named || (named === "foot" && part === "leg");

/** @param {Vocabulary} vocabulary */
export function createInterpreter({ terms, words }) {
  /** @type {Map<string, Term[]>} */
  const lexicon = new Map();
  for (const term of terms)
    for (const phrase of term.match) {
      const key = norm(phrase);
      const senses = lexicon.get(key) ?? [];
      if (!senses.includes(term)) senses.push(term);
      lexicon.set(key, senses);
    }
  const vocabWords = [...new Set([...lexicon.keys()].flatMap(k => k.split(" ")))];
  const limbs = new Map(Object.entries(words.limbs));
  const preps = new Map(Object.entries(words.prepositions));
  const crux = new Set(words.crux);
  const stop = new Set(words.stop);
  const splitAlways = new Set(words.splitAlways);
  const splitBeforeMove = new Set(words.splitBeforeMove);

  /** @param {string} w */
  function nearest(w) {
    /** @type {{ w: string, d: number } | null} */
    let best = null;
    for (const c of vocabWords) {
      if (Math.abs(c.length - w.length) > 2) continue;
      const d = lev(w, c);
      const better =
        !best ||
        d < best.d ||
        (d === best.d && c[0] === w[0] && best.w[0] !== w[0]) ||
        (d === best.d && c.length > best.w.length && c[0] === w[0]);
      if (better) best = { w: c, d };
    }
    return best && best.d <= 2 ? best : null;
  }

  /** @param {string} key */
  function lookup(key) {
    for (const k of [
      key,
      key.replace(/es$/, ""),
      key.replace(/s$/, ""),
      key.replace(/ed$/, ""),
      key.replace(/ed$/, "e"),
      key.replace(/ing$/, ""),
      key.replace(/ing$/, "e"),
    ]) {
      const senses = lexicon.get(k);
      if (senses) return { key: k, senses };
    }
    return null;
  }

  /** @param {string} w */
  const known = w =>
    limbs.has(w) ||
    preps.has(w) ||
    stop.has(w) ||
    crux.has(w) ||
    splitBeforeMove.has(w) ||
    vocabWords.includes(w) ||
    !!lookup(w);

  /** @param {string} key @param {string | null} named */
  const startsStep = (key, named) =>
    (lookup(key)?.senses ?? []).some(
      s => facetOf(s) === "transition" || (facetOf(s) === "position" && !fits(named, s.part)),
    );

  /**
   * @param {string} text
   * @param {ParseOptions} [options]
   * @returns {Reading}
   */
  function parse(text, { resolutions = new Map(), ignored = new Set() } = {}) {
    /** @type {{ raw: string, n: string, s: number, e: number, sep: boolean, fz?: string, guess?: string }[]} */
    const toks = [];
    for (const m of text.matchAll(/[\p{L}\p{N}'’ʼ]+|[.;!,:\n—–]|->|→/gu)) {
      const raw = m[0];
      const n = norm(raw);
      const s = m.index ?? 0;
      /** @type {(typeof toks)[number]} */
      const tok = { raw, n, s, e: s + raw.length, sep: !n || splitAlways.has(n) };
      if (!tok.sep && !known(n) && !ignored.has(n)) {
        const near = n.length >= 3 ? nearest(n) : null;
        if (near && ((n.length >= 5 && near.d === 1) || (n.length >= 8 && near.d === 2))) {
          tok.fz = raw;
          tok.n = near.w;
        } else if (near && (near.d === 1 || n.length >= 6)) tok.guess = near.w;
      }
      toks.push(tok);
    }

    /** @type {string | null} */
    let named = null;
    toks.forEach((tok, i) => {
      if (tok.sep) {
        named = null;
        return;
      }
      named = limbs.get(tok.n)?.part ?? named;
      if (!splitBeforeMove.has(tok.n)) return;
      const next = toks[i + 1]?.n;
      if (next && (startsStep(next, named) || startsStep(`${next} ${toks[i + 2]?.n}`, named))) {
        tok.sep = true;
        named = null;
      }
    });

    /** @type {(typeof toks)[number][][]} */
    const clauses = [[]];
    for (const tok of toks) {
      if (tok.sep) clauses.push([]);
      else clauses[clauses.length - 1].push(tok);
    }

    /** @type {Reading} */
    const out = { terrain: [], features: [], beats: [], spans: [], amb: [], unknown: [], fuzzy: [], trace: [] };
    for (const tok of toks)
      if (tok.sep) out.trace.push({ s: tok.s, e: tok.e, text: tok.raw, kind: "split", clause: 0 });
    /** @type {Record<string, number>} */
    const seen = {};
    for (const [ci, clause] of clauses.entries()) {
      /** @type {Item[]} */
      const items = [];
      for (let i = 0; i < clause.length; ) {
        /** @type {Item | null} */
        let m = null;
        for (let n = Math.min(4, clause.length - i); n >= 1 && !m; n--) {
          const run = clause.slice(i, i + n);
          const hit = lookup(run.map(x => x.n).join(" "));
          if (hit)
            m = {
              kind: "term",
              ...hit,
              n,
              s: run[0].s,
              e: run[run.length - 1].e,
              fz: run.flatMap(x => (x.fz ? [x.fz] : [])),
            };
        }
        if (!m) {
          const tok = clause[i];
          const w = tok.n;
          const at = { n: 1, s: tok.s, e: tok.e };
          const limb = limbs.get(w);
          const role = preps.get(w);
          m = limb
            ? { kind: "limb", ...limb, ...at }
            : role
              ? { kind: "prep", role, ...at }
              : crux.has(w)
                ? { kind: "crux", ...at }
                : splitBeforeMove.has(w)
                  ? { kind: "break", ...at }
                  : stop.has(w) || ignored.has(w)
                    ? { kind: "stop", ...at }
                    : { kind: "unknown", raw: tok.raw, guess: tok.guess, ...at };
        }
        items.push(m);
        out.trace.push({
          s: m.s,
          e: m.e,
          text: text.slice(m.s, m.e),
          kind: m.kind,
          clause: 0,
          ...(m.kind === "term" ? { key: m.key, fuzzy: m.fz } : {}),
          ...(m.kind === "unknown" && m.guess ? { guess: m.guess } : {}),
        });
        i += m.n;
      }

      /** @type {Beat} */
      const beat = {
        side: null,
        part: null,
        moves: [],
        pos: [],
        holds: [],
        order: [],
        crux: false,
        clause: ci,
        issues: [],
      };
      for (const m of items)
        if (m.kind === "limb") {
          beat.side = m.side || beat.side;
          beat.part = m.part || beat.part;
        }
      /** @type {string | null} */
      let role = null;
      /** @type {Term | null} */
      let pendingOri = null;
      /** @type {Hold | null} */
      let last = null;
      let rockRun = false;
      for (const m of items) {
        if (m.kind === "limb") {
          out.spans.push({ s: m.s, e: m.e, facet: "limb" });
          continue;
        }
        if (m.kind === "prep") {
          role = m.role;
          rockRun = false;
          continue;
        }
        if (m.kind === "crux") {
          beat.crux = true;
          continue;
        }
        if (m.kind === "break") {
          rockRun = false;
          continue;
        }
        if (m.kind === "unknown") {
          out.unknown.push({ raw: m.raw, guess: m.guess, s: m.s, e: m.e });
          out.spans.push({ s: m.s, e: m.e, facet: "unknown" });
          continue;
        }
        if (m.kind !== "term") continue;
        seen[m.key] = (seen[m.key] ?? -1) + 1;
        const occ = `${m.key}#${seen[m.key]}`;
        /** @type {Term[]} */
        let senses = m.senses;
        if (senses.length > 1 && beat.part) {
          const fit = senses.filter(s => facetOf(s) !== "position" || s.part === beat.part);
          if (fit.length) senses = fit;
        }
        let term = senses[0];
        let ambiguous = false;
        const chosen = resolutions.get(occ);
        if (chosen !== undefined && m.senses[chosen]) term = m.senses[chosen];
        else if (senses.length > 1) {
          ambiguous = true;
          out.amb.push({ occ, word: text.slice(m.s, m.e), options: m.senses, s: m.s });
        }
        if (m.fz.length) out.fuzzy.push({ from: m.fz.join(" "), to: term.name });
        const facet = facetOf(term);
        out.spans.push({ s: m.s, e: m.e, facet, term, ambiguous, fuzzy: m.fz.length > 0 });
        if (facet === "terrain") {
          if (!out.terrain.includes(term)) out.terrain.push(term);
          continue;
        }
        if (facet === "orientation") {
          if (rockRun && last && !last.ori) last.ori = term;
          else pendingOri = term;
          continue;
        }
        if (facet === "hold" || facet === "feature") {
          if (rockRun && last) last.kinds.push(term);
          else {
            last = { role, ori: pendingOri, kinds: [term] };
            beat.holds.push(last);
            beat.order.push({ kind: "hold", hold: last });
            pendingOri = null;
          }
          rockRun = true;
          continue;
        }
        rockRun = false;
        if (beat.pos.includes(term) || beat.moves.includes(term)) continue;
        if (facet === "position") {
          beat.pos.push(term);
          beat.order.push({ kind: "position", term, role });
          if (!fits(beat.part, term.part))
            beat.issues.push(`${term.name} is a ${term.part} position, but this step names a ${beat.part}.`);
        } else {
          beat.moves.push(term);
          beat.order.push({ kind: "transition", term });
        }
      }
      if (pendingOri) {
        const hold = { role, ori: pendingOri, kinds: [] };
        beat.holds.push(hold);
        beat.order.push({ kind: "hold", hold });
      }
      for (const h of beat.holds) h.role ||= beat.moves.length ? "target" : "on";
      if (!beat.part && beat.pos.length) beat.part = beat.pos[0].part ?? null;
      if (!beat.part && beat.moves.some(m => m.region === "upper")) beat.part = "hand";
      if (!beat.moves.length && !beat.pos.length && !beat.side && !beat.part) {
        if (items.some(m => m.kind === "unknown")) {
          beat.unread = true;
          out.beats.push(beat);
          continue;
        }
        for (const h of beat.holds) for (const k of h.kinds) if (!out.features.includes(k)) out.features.push(k);
        if (beat.crux && out.beats.length) out.beats[out.beats.length - 1].crux = true;
        continue;
      }
      out.beats.push(beat);
    }
    out.trace.sort((a, b) => a.s - b.s);
    let clauseAt = 0;
    for (const t of out.trace) {
      if (t.kind === "split") clauseAt++;
      t.clause = clauseAt;
    }
    return out;
  }

  return { parse, lexicon };
}
