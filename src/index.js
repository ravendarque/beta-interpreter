import terms from "../vocabulary/terms.json" with { type: "json" };
import words from "../vocabulary/words.json" with { type: "json" };
import { createInterpreter } from "./interpreter.js";

export { createInterpreter, facetOf, norm } from "./interpreter.js";
export { toMovements } from "./movements.js";
export { say, who } from "./say.js";

export const vocabulary = { terms: terms.terms, words };
export const { parse, lexicon } = createInterpreter(vocabulary);
