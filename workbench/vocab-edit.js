import { norm } from "../src/interpreter.js";

/** @typedef {import("../src/interpreter.js").Term} Term @typedef {import("../src/interpreter.js").Words} Words */

/** @param {string} phrase */
function key(phrase) {
  const k = norm(phrase);
  if (!k) throw new Error("The phrase has no letters or numbers.");
  return k;
}

/** @param {Term[]} terms @param {string} id */
function find(terms, id) {
  const term = terms.find(t => t.id === id);
  if (!term) throw new Error(`No term has the id “${id}”.`);
  return term;
}

/** @param {Term[]} terms @param {string} phrase */
export const owners = (terms, phrase) => terms.filter(t => t.match.some(m => norm(m) === norm(phrase)));

/** @param {Term[]} terms @param {string} id @param {string} phrase @returns {Term[]} */
export function addPhrase(terms, id, phrase) {
  const k = key(phrase);
  const term = find(terms, id);
  if (term.match.some(m => norm(m) === k)) throw new Error(`${term.name} already matches “${k}”.`);
  return terms.map(t => (t === term ? { ...t, match: [...t.match, k] } : t));
}

/** @param {Term[]} terms @param {string} id @param {string} phrase @returns {Term[]} */
export function removePhrase(terms, id, phrase) {
  const k = key(phrase);
  const term = find(terms, id);
  if (!term.match.some(m => norm(m) === k)) throw new Error(`${term.name} does not match “${k}”.`);
  return terms.map(t => (t === term ? { ...t, match: t.match.filter(m => norm(m) !== k) } : t));
}

/** @param {Term[]} terms @param {string} fromId @param {string} toId @param {string} phrase */
export const movePhrase = (terms, fromId, toId, phrase) => addPhrase(removePhrase(terms, fromId, phrase), toId, phrase);

export const TEACHABLE = /** @type {const} */ ({ filler: "filler word", qualifiers: "qualifier", moves: "move word" });
const REGIONS = ["upper", "lower", "full"];

/** @param {Words} words @returns {[string, string[]][]} */
const grammar = words => [
  ["limb word", Object.keys(words.limbs)],
  ["role word", Object.keys(words.prepositions)],
  ["crux marker", words.crux],
  ["move word", Object.keys(words.moves)],
  ["qualifier", words.qualifiers],
  ["filler word", words.filler],
];

/**
 * @param {Words} words @param {string} list @param {string} word @param {Term[]} [terms]
 * @param {string} [region] the taxonomy region a move word moves: upper, lower or full
 * @returns {Words}
 */
export function addWord(words, list, word, terms = [], region) {
  if (!Object.hasOwn(TEACHABLE, list)) throw new Error(`No word list called “${list}” can be taught.`);
  const k = key(word);
  if (k.includes(" ")) throw new Error("A word list takes single words.");
  const taken = grammar(words).find(([, entries]) => entries.includes(k));
  if (taken) throw new Error(`“${k}” is already a ${taken[0]}.`);
  const used = owners(terms, k);
  if (used.length) throw new Error(`“${k}” is a vocabulary phrase (${used.map(t => t.name).join(", ")}).`);
  if (list === "moves") {
    if (!region || !REGIONS.includes(region)) throw new Error("A move word needs a region: upper, lower or full.");
    return { ...words, moves: { ...words.moves, [k]: region } };
  }
  const name = /** @type {"filler" | "qualifiers"} */ (list);
  return { ...words, [name]: [...words[name], k] };
}

/**
 * @param {Words} words @param {string} list @param {string[]} items @param {Term[]} [terms]
 * @param {string} [region]
 */
export function addWords(words, list, items, terms = [], region) {
  let next = words;
  /** @type {string[]} */
  const added = [];
  /** @type {{ word: string, reason: string }[]} */
  const skipped = [];
  for (const word of items)
    try {
      next = addWord(next, list, word, terms, region);
      added.push(norm(word));
    } catch (e) {
      skipped.push({ word: norm(word) || word, reason: e instanceof Error ? e.message : String(e) });
    }
  return { words: next, added, skipped };
}
