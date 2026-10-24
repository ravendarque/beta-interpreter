import { s } from "./dom.js";

/**
 * @typedef {{ i: number, kind: string, facet: string, clause: number, text: string }} ScopeToken
 * @typedef {{ clause: number, crux: boolean }} ScopeStep
 * @typedef {{ clauses: number[], crux: boolean }} ScopeMovement
 * @typedef {{
 *   tokens: ScopeToken[],
 *   steps: ScopeStep[],
 *   movements: ScopeMovement[],
 *   coverage: number,
 *   parseMs: number,
 *   selected: number | null,
 * }} ScopeData
 */

const C = 200;
const TOKEN_GAP = 0.7;
const SPLIT_GAP = 4;

/** @param {number} r @param {number} deg */
const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};

/** @param {number} r1 @param {number} r2 @param {number} a0 @param {number} a1 */
function sector(r1, r2, a0, a1) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = polar(r2, a0);
  const [x1, y1] = polar(r2, a1);
  const [x2, y2] = polar(r1, a1);
  const [x3, y3] = polar(r1, a0);
  const f = (/** @type {number} */ n) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)} A${r2} ${r2} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r1} ${r1} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}

function bezel() {
  const g = s("g", { class: "bezel", "aria-hidden": "true" });
  g.append(
    s("circle", { cx: C, cy: C, r: 194, class: "rim" }),
    s("circle", { cx: C, cy: C, r: 176, class: "rim faint" }),
  );
  for (let d = 0; d < 360; d += 2.5) {
    const len = d % 30 === 0 ? 12 : d % 10 === 0 ? 7 : 3.5;
    const [x1, y1] = polar(194, d);
    const [x2, y2] = polar(194 - len, d);
    g.append(s("line", { x1, y1, x2, y2, class: d % 30 === 0 ? "tick major" : "tick" }));
  }
  for (let d = 0; d < 360; d += 30) {
    const [x, y] = polar(183, d);
    g.append(s("text", { x, y, class: "deg", "text-anchor": "middle", "dominant-baseline": "central", text: d }));
  }
  for (const r of [100, 64]) g.append(s("circle", { cx: C, cy: C, r, class: "grid" }));
  g.append(
    s("line", { x1: C, y1: 74, x2: C, y2: 326, class: "grid" }),
    s("line", { x1: 74, y1: C, x2: 326, y2: C, class: "grid" }),
  );
  return g;
}

function sweep() {
  const defs = s("defs", {}, [
    s("linearGradient", { id: "sweep-fade", x1: "0", y1: "0", x2: "1", y2: "0" }, [
      s("stop", { offset: "0", class: "sweep-a" }),
      s("stop", { offset: "1", class: "sweep-b" }),
    ]),
  ]);
  const g = s("g", { class: "sweep", "aria-hidden": "true" }, [
    s("path", { d: sector(0.01, 168, 0, 42), fill: "url(#sweep-fade)" }),
    s("line", { x1: C, y1: C, x2: C, y2: 32, class: "sweep-edge" }),
  ]);
  return [defs, g];
}

/** @param {SVGSVGElement} svg @param {ScopeData} data */
export function renderScope(svg, data) {
  const title = svg.querySelector("title");
  svg.replaceChildren(...(title ? [title] : []), bezel(), ...sweep());

  const words = data.tokens.filter(t => t.kind !== "split");
  const splits = data.tokens.length - words.length;
  const span = Math.max(0, 360 - words.length * TOKEN_GAP - splits * SPLIT_GAP);
  const each = words.length ? span / words.length : 0;
  /** @type {Map<number, [number, number]>} */
  const angles = new Map();
  /** @type {Map<number, [number, number]>} */
  const clauses = new Map();
  let at = 0;
  for (const t of data.tokens) {
    if (t.kind === "split") {
      at += SPLIT_GAP;
      continue;
    }
    const a0 = at;
    const a1 = at + each;
    angles.set(t.i, [a0, a1]);
    const c = clauses.get(t.clause);
    clauses.set(t.clause, c ? [c[0], a1] : [a0, a1]);
    at = a1 + TOKEN_GAP;
  }

  const ring = s("g", { class: "tokens" });
  if (!words.length) ring.append(s("circle", { cx: C, cy: C, r: 159, class: "empty-ring" }));
  for (const t of words) {
    const [a0, a1] = /** @type {[number, number]} */ (angles.get(t.i));
    ring.append(
      s(
        "path",
        {
          d: sector(150, 168, a0, a1),
          class: `arc k-${t.kind} f-${t.facet}${data.selected === t.i ? " sel" : ""}`,
          "data-i": t.i,
        },
        [s("title", { text: `${t.text}: ${t.facet}` })],
      ),
    );
  }

  const stepRing = s("g", { class: "steps-ring", "aria-hidden": "true" });
  for (const step of data.steps) {
    const c = clauses.get(step.clause);
    if (c)
      stepRing.append(s("path", { d: sector(139, 144, c[0], c[1]), class: `step-arc${step.crux ? " crux" : ""}` }));
  }

  const moveRing = s("g", { class: "moves-ring", "aria-hidden": "true" });
  data.movements.forEach((m, n) => {
    const ranges = m.clauses.flatMap(c => clauses.get(c) ?? []);
    if (!ranges.length) return;
    const a0 = Math.min(...ranges);
    const a1 = Math.max(...ranges);
    moveRing.append(s("path", { d: sector(124, 130, a0, a1), class: `move-arc${m.crux ? " crux" : ""}` }));
    const [x, y] = polar(113, (a0 + a1) / 2);
    moveRing.append(
      s("text", { x, y, class: "move-n", "text-anchor": "middle", "dominant-baseline": "central", text: n + 1 }),
    );
  });

  const pct = Math.round(data.coverage * 100);
  const centre = s("g", { class: "centre" }, [
    s("circle", { cx: C, cy: C, r: 56, class: "centre-disc" }),
    s("text", { x: C, y: C - 4, class: "big", "text-anchor": "middle", text: `${pct}%` }),
    s("text", { x: C, y: C + 18, class: "small", "text-anchor": "middle", text: "recognised" }),
    s("text", {
      x: C,
      y: C + 34,
      class: "small mono",
      "text-anchor": "middle",
      text: data.parseMs < 1 ? `${Math.round(data.parseMs * 1000)} µs` : `${data.parseMs.toFixed(2)} ms`,
    }),
  ]);

  svg.append(moveRing, stepRing, ring, centre);
}
