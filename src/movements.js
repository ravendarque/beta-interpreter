import { facetOf } from "./interpreter.js";

/**
 * @typedef {import("./interpreter.js").Term} Term
 * @typedef {import("./interpreter.js").Hold} Hold
 * @typedef {import("./interpreter.js").Beat} Beat
 * @typedef {import("./interpreter.js").Reading} Reading
 * @typedef {"lh" | "rh" | "lf" | "rf"} LimbKey
 * @typedef {"stated" | "implied" | "inferred"} SideSource
 * @typedef {{ side: SideSource | null, hold: Hold | null, techniques: Term[] }} Contact
 * @typedef {Contact & { part: string | null }} Unplaced
 * @typedef {{ limbs: Partial<Record<LimbKey, Contact>>, body: Term[], unplaced: Unplaced[] }} State
 * @typedef {{ terms: Term[], limbs: LimbKey[], side: SideSource | null }} Transition
 * @typedef {{
 *   start: State,
 *   transition: Transition | null,
 *   end: State,
 *   crux: boolean,
 *   steps: number[],
 *   issues: string[],
 * }} Movement
 * @typedef {{ terrain: Term[], features: Term[], movements: Movement[] }} MovementRecord
 * @typedef {{ keys: LimbKey[], side: SideSource | null }} Placement
 */

/** @type {Record<string, { left: LimbKey, right: LimbKey }>} */
const KEYS = { hand: { left: "lh", right: "rh" }, foot: { left: "lf", right: "rf" } };
/** @type {Record<LimbKey, LimbKey>} */
const OTHER = { lh: "rh", rh: "lh", lf: "rf", rf: "lf" };
/** @type {Record<string, string>} */
const REGION_PART = { upper: "hand", lower: "foot", full: "body" };
const RANK = { stated: 3, implied: 2, inferred: 1 };

/** @param {string | null | undefined} part */
const limbPart = part => (part === "leg" ? "foot" : (part ?? null));
/** @param {LimbKey} key */
const partOf = key => (key[1] === "h" ? "hand" : "foot");

/** @param {string | null} side @param {string | null | undefined} part @returns {LimbKey[]} */
function keysFor(side, part) {
  const keys = KEYS[limbPart(part) ?? ""];
  if (!keys) return [];
  if (side === "both") return [keys.left, keys.right];
  if (side === "left" || side === "right") return [keys[side]];
  return [];
}

/** @returns {State} */
const emptyState = () => ({ limbs: {}, body: [], unplaced: [] });

/**
 * @param {State} state
 * @param {Placement} at
 * @param {string | null} part
 * @param {{ hold?: Hold, technique?: Term }} what
 */
function place(state, at, part, { hold, technique }) {
  if (!at.keys.length && limbPart(part) === "body" && technique) {
    state.body.push(technique);
    return;
  }
  /** @type {Contact[]} */
  const contacts = [];
  if (at.keys.length)
    for (const key of at.keys) {
      const c = state.limbs[key] ?? { side: at.side, hold: null, techniques: [] };
      state.limbs[key] = c;
      if (at.side && (!c.side || RANK[at.side] > RANK[c.side])) c.side = at.side;
      contacts.push(c);
    }
  else {
    const p = limbPart(part);
    const found = state.unplaced.find(x => x.part === p);
    const u = found ?? { part: p, side: null, hold: null, techniques: [] };
    if (!found) state.unplaced.push(u);
    contacts.push(u);
  }
  for (const c of contacts) {
    if (hold) c.hold = hold;
    if (technique && !c.techniques.includes(technique)) c.techniques.push(technique);
  }
}

/** @param {Beat} beat */
const closes = beat =>
  beat.moves.length > 0 ||
  beat.order.some(p => (p.kind === "hold" ? p.hold.role === "target" : p.kind === "position" && p.role === "target"));

/** @param {Reading} reading @returns {MovementRecord} */
export function toMovements(reading) {
  /** @type {Movement[]} */
  const movements = [];
  /** @type {Partial<Record<string, LimbKey>>} */
  const lastByPart = {};
  /** @type {LimbKey | null} */
  let lastKey = null;
  /** @type {Partial<Record<LimbKey, Hold>>} */
  const lastHold = {};
  let start = emptyState();
  /** @type {number[]} */
  let steps = [];
  let crux = false;
  /** @type {string[]} */
  let issues = [];

  /** @param {Placement} at */
  const establish = at => {
    if (at.keys.length !== 1) return;
    lastKey = at.keys[0];
    lastByPart[partOf(lastKey)] = lastKey;
  };

  /** @param {Beat} beat @returns {{ transition: Transition, part: string | null, at: Placement }} */
  function transitionOf(beat) {
    const terms = beat.moves.filter(t => facetOf(t) === "transition");
    const sameLimb = terms.some(t => t.sameLimb);
    const region = terms.find(t => t.region)?.region;
    let part = region ? REGION_PART[region] : limbPart(beat.part);
    if (!part && sameLimb && lastKey) part = partOf(lastKey);
    /** @type {Placement} */
    let at = { keys: keysFor(beat.side, part), side: beat.side ? "stated" : null };
    if (!at.keys.length && part !== "body") {
      const prev = sameLimb ? lastKey : part ? lastByPart[part] : undefined;
      if (prev) at = { keys: [sameLimb ? prev : OTHER[prev]], side: "inferred" };
    }
    if (!at.keys.length) at.side = null;
    return { transition: { terms, limbs: at.keys, side: at.side }, part, at };
  }

  reading.beats.forEach((beat, i) => {
    steps.push(i);
    crux ||= beat.crux;
    issues.push(...beat.issues);
    /** @type {Placement} */
    const stated = { keys: keysFor(beat.side, beat.part), side: "stated" };
    const closing = closes(beat);
    const moved = closing ? transitionOf(beat) : null;
    const end = emptyState();
    /** @type {Placement[]} */
    const positionKeys = [];
    let phase = "start";
    /** @type {{ state: State, keys: LimbKey[], hold: Hold | undefined }[]} */
    const sameHold = [];

    for (const p of beat.order) {
      if (p.kind === "transition") continue;
      const role = p.kind === "hold" ? p.hold.role : p.role;
      if (closing && role === "target") phase = "end";
      else if (role === "start") phase = "start";
      const state = phase === "end" ? end : start;

      if (p.kind === "position") {
        const part = p.term.part ?? limbPart(beat.part) ?? (lastKey ? partOf(lastKey) : null);
        /** @type {Placement} */
        const at = p.term.side
          ? { keys: keysFor(p.term.side, part), side: beat.side === "both" ? "stated" : "implied" }
          : beat.side
            ? { keys: keysFor(beat.side, part), side: "stated" }
            : { keys: [], side: null };
        if (at.keys.length) positionKeys.push(at);
        place(state, at, part, { technique: p.term });
        const prev = part ? lastByPart[part] : undefined;
        if (p.term.sameHold && at.keys.length) sameHold.push({ state, keys: at.keys, hold: prev && lastHold[prev] });
        if (phase === "start") establish(at);
        continue;
      }

      /** @type {Placement} */
      let at = stated;
      if (!at.keys.length && phase === "start" && positionKeys.length) at = positionKeys[positionKeys.length - 1];
      if (!at.keys.length && moved) at = moved.at;
      const part = moved?.part ?? limbPart(beat.part);
      place(state, at, part, { hold: p.hold });
      for (const key of at.keys) lastHold[key] = p.hold;
      if (phase === "start" || !moved) establish(at);
    }

    for (const s of sameHold)
      for (const key of s.keys) {
        const c = s.state.limbs[key];
        if (c && !c.hold && s.hold) c.hold = s.hold;
      }

    if (!moved) return;
    establish(moved.at);
    for (const key of moved.at.keys) if (end.limbs[key]) lastByPart[partOf(key)] = key;
    movements.push({ start, transition: moved.transition, end, crux, steps, issues });
    start = emptyState();
    steps = [];
    crux = false;
    issues = [];
  });

  if (steps.length) movements.push({ start, transition: null, end: emptyState(), crux, steps, issues });
  return { terrain: reading.terrain, features: reading.features, movements };
}
