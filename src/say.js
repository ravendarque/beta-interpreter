/** @typedef {import("./interpreter.js").Beat} Beat @typedef {import("./interpreter.js").Hold} Hold */

/** @param {string} w */
const art = w => (/^[aeiou]/i.test(w) ? "an" : "a");
/** @type {Record<string, string>} */
const ROLE = { start: "from", target: "to", on: "on" };
/** @type {Record<string, string>} */
const PLURAL = { foot: "feet" };
/** @type {Record<string, string>} */
const MOVE_NAME = { upper: "hand move", lower: "foot move", full: "full-body move" };
/** @param {string} s */
const cap = s => s[0].toUpperCase() + s.slice(1);

/** @param {Beat} b */
export function who(b) {
  const part = b.part;
  if (b.side === "both") return part ? `Both ${PLURAL[part] ?? `${part}s`}` : "Both";
  if (b.side && part) return `${cap(b.side)} ${part}`;
  if (b.side) return cap(b.side);
  return "";
}

/** @param {string} w */
const pluralWord = w => (/(s|sh|ch|x|z)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
/** @param {string} name */
const pluralName = name => {
  const at = name.lastIndexOf(" ") + 1;
  return name.slice(0, at) + pluralWord(name.slice(at));
};

/** @param {Hold} h */
export function holdName(h) {
  const kinds = h.kinds.map(k => (h.plural.includes(k.id) ? pluralName(k.name.toLowerCase()) : k.name.toLowerCase()));
  return [...h.qualifiers, ...(h.ori ? [h.ori.name.toLowerCase()] : []), ...kinds].join(" ");
}

/** @param {Hold} h */
function holdPhrase(h) {
  const name = holdName(h);
  if (!name || !h.role) return "";
  return h.plural.length ? `${ROLE[h.role]} ${name}` : `${ROLE[h.role]} ${art(name)} ${name}`;
}

/** @param {Beat} b */
export function say(b) {
  const names = [...b.moves, ...b.pos].map(x => x.name.toLowerCase());
  if (b.move && !b.moves.length) names.unshift(MOVE_NAME[b.move] ?? "move");
  const actions = names.join(", ");
  const body = [actions, ...b.holds.map(holdPhrase)].filter(Boolean).join(" ");
  const w = who(b);
  if (w) return `${w}: ${body}.`;
  return body ? `${cap(body)}.` : "";
}
