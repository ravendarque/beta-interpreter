/** @typedef {import("./interpreter.js").Beat} Beat @typedef {import("./interpreter.js").Hold} Hold */

/** @param {string} w */
const art = w => (/^[aeiou]/i.test(w) ? "an" : "a");
/** @type {Record<string, string>} */
const ROLE = { start: "from", target: "to", on: "on" };
/** @param {string} s */
const cap = s => s[0].toUpperCase() + s.slice(1);

/** @param {Beat} b */
export function who(b) {
  const part = b.part;
  if (b.side === "both") return part ? `Both ${part}s` : "Both";
  if (b.side && part) return `${cap(b.side)} ${part}`;
  if (b.side) return cap(b.side);
  return "";
}

/** @param {Hold} h */
function holdPhrase(h) {
  const words = [h.ori, ...h.kinds].filter(x => x !== null).map(x => x.name.toLowerCase());
  return words.length && h.role ? `${ROLE[h.role]} ${art(words[0])} ${words.join(" ")}` : "";
}

/** @param {Beat} b */
export function say(b) {
  const actions = [...b.moves, ...b.pos].map(x => x.name.toLowerCase()).join(", ");
  const body = [actions, ...b.holds.map(holdPhrase)].filter(Boolean).join(" ");
  const w = who(b);
  if (w) return `${w}: ${body}.`;
  return body ? `${cap(body)}.` : "";
}
