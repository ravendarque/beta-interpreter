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

/** @param {Words} words @param {string} word @param {Term[]} [terms] @returns {Words} */
export function addFillerWord(words, word, terms = []) {
  const k = key(word);
  if (k.includes(" ")) throw new Error("A filler word is a single word.");
  if (words.filler.includes(k)) throw new Error(`“${k}” is already a filler word.`);
  const used = owners(terms, k);
  if (used.length) throw new Error(`“${k}” is a vocabulary phrase (${used.map(t => t.name).join(", ")}).`);
  return { ...words, filler: [...words.filler, k] };
}

/** @param {Words} words @param {string[]} list @param {Term[]} [terms] */
export function addFillerWords(words, list, terms = []) {
  let next = words;
  /** @type {string[]} */
  const added = [];
  /** @type {{ word: string, reason: string }[]} */
  const skipped = [];
  for (const word of list)
    try {
      next = addFillerWord(next, word, terms);
      added.push(next.filler[next.filler.length - 1]);
    } catch (e) {
      skipped.push({ word: norm(word) || word, reason: e instanceof Error ? e.message : String(e) });
    }
  return { words: next, added, skipped };
}
