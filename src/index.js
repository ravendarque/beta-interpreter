import terms from "../vocabulary/terms.json" with { type: "json" };
import words from "../vocabulary/words.json" with { type: "json" };
import { createInterpreter } from "./interpreter.js";

/**
 * @typedef {import("./interpreter.js").Term} Term
 * @typedef {import("./interpreter.js").Words} Words
 * @typedef {import("./interpreter.js").Vocabulary} Vocabulary
 * @typedef {import("./interpreter.js").Reading} Reading
 * @typedef {import("./interpreter.js").Beat} Beat
 * @typedef {import("./interpreter.js").Hold} Hold
 * @typedef {import("./interpreter.js").ParseOptions} ParseOptions
 * @typedef {import("./movements.js").MovementRecord} MovementRecord
 * @typedef {import("./movements.js").Movement} Movement
 * @typedef {import("./movements.js").State} State
 * @typedef {import("./movements.js").Contact} Contact
 * @typedef {import("./movements.js").Transition} Transition
 */

export { createInterpreter, facetOf, norm } from "./interpreter.js";
export { toMovements } from "./movements.js";
export { holdName, say, who } from "./say.js";

/** @type {Vocabulary} */
export const vocabulary = { terms: terms.terms, words };
export const { parse, lexicon } = createInterpreter(vocabulary);
