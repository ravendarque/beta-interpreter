import { s } from "./dom.js";

const C = 100;
const RINGS = [
  { key: "recognised", r: 86, label: "recognised" },
  { key: "confidence", r: 68, label: "confidence" },
];

/** @param {number | null} v */
const pct = v => (v === null ? "–" : `${Math.round(v * 100)}%`);

/** @param {number | null} v */
const band = v => (v === null ? "none" : v >= 0.8 ? "good" : v >= 0.5 ? "fair" : "poor");

/** @param {SVGSVGElement} svg @param {{ recognised: number | null, confidence: number | null }} data */
export function renderGauge(svg, data) {
  const title = svg.querySelector("title");
  const ticks = s("g", { class: "g-ticks", "aria-hidden": "true" });
  for (let i = 0; i < 100; i += 2.5) {
    const a = (i / 100) * 2 * Math.PI;
    const len = i % 25 === 0 ? 7 : i % 10 === 0 ? 4.5 : 2.5;
    const [r1, r2] = [98, 98 - len];
    ticks.append(
      s("line", {
        x1: C + r1 * Math.sin(a),
        y1: C - r1 * Math.cos(a),
        x2: C + r2 * Math.sin(a),
        y2: C - r2 * Math.cos(a),
        class: i % 25 === 0 ? "major" : "",
      }),
    );
  }
  const rings = RINGS.map(({ key, r }) => {
    const v = data[/** @type {"recognised" | "confidence"} */ (key)];
    const len = 2 * Math.PI * r;
    return s("g", { class: `g-ring ${key} b-${band(v)}` }, [
      s("circle", { cx: C, cy: C, r, class: "track" }),
      s("circle", {
        cx: C,
        cy: C,
        r,
        class: "value",
        "stroke-dasharray": `${len} ${len}`,
        "stroke-dashoffset": `${len * (1 - (v ?? 0))}`,
        transform: `rotate(-90 ${C} ${C})`,
      }),
    ]);
  });
  const centre = s("g", { class: "g-centre" }, [
    s("text", { x: C, y: C - 10, "text-anchor": "middle", class: "fig recognised", text: pct(data.recognised) }),
    s("text", { x: C, y: C - 1, "text-anchor": "middle", class: "lab", text: "recognised" }),
    s("line", { x1: C - 26, y1: C + 6, x2: C + 26, y2: C + 6, class: "divider" }),
    s("text", {
      x: C,
      y: C + 25,
      "text-anchor": "middle",
      class: `fig confidence b-${band(data.confidence)}`,
      text: pct(data.confidence),
    }),
    s("text", { x: C, y: C + 34, "text-anchor": "middle", class: "lab", text: "confidence" }),
  ]);
  svg.replaceChildren(...(title ? [title] : []), ticks, ...rings, centre);
}

/**
 * Draws a leader from the gauge to each stat, and from each stat to the card it summarises.
 * @param {HTMLElement} dash @param {SVGSVGElement} layer @param {SVGSVGElement} gauge
 */
export function drawLinks(dash, layer, gauge) {
  const box = dash.getBoundingClientRect();
  layer.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  layer.replaceChildren();
  if (getComputedStyle(dash).gridTemplateAreas === "none" || dash.hidden) return;
  /** @param {DOMRect} r */
  const rel = r => ({ l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top });
  const g = rel(gauge.getBoundingClientRect());
  const cx = (g.l + g.r) / 2;
  const cy = (g.t + g.b) / 2;
  const R = ((g.r - g.l) / 2) * (98 / 100);
  const core = rel(/** @type {HTMLElement} */ (dash.querySelector(".a-core")).getBoundingClientRect());
  for (const stat of /** @type {NodeListOf<HTMLElement>} */ (dash.querySelectorAll(".stat[data-link]"))) {
    const card = dash.querySelector(`.${stat.dataset.link}`);
    if (!card) continue;
    const st = rel(stat.getBoundingClientRect());
    const c = rel(card.getBoundingClientRect());
    const left = st.r <= cx;
    const sy = (st.t + st.b) / 2;
    const inner = left ? st.r + 6 : st.l - 6;
    const a = Math.atan2(sy - cy, inner - cx);
    const gx = cx + R * Math.cos(a);
    const gy = cy + R * Math.sin(a);
    const outer = left ? st.l - 6 : st.r + 6;
    const gap = left ? core.l - 6 : core.r + 6;
    /** @type {[number, number][]} */
    let route;
    if (c.t >= core.b - 1)
      route = [
        [outer, sy],
        [gap, sy],
        [gap, c.t],
      ];
    else {
      const ty = Math.min(Math.max(sy, c.t + 20), c.b - 20);
      const edge = left ? c.r : c.l;
      route =
        ty === sy
          ? [
              [outer, sy],
              [edge, sy],
            ]
          : [
              [outer, sy],
              [gap, sy],
              [gap, ty],
              [edge, ty],
            ];
    }
    const end = route[route.length - 1];
    layer.append(
      s("line", { x1: gx, y1: gy, x2: inner, y2: sy, class: "leader" }),
      s("circle", { cx: gx, cy: gy, r: 2, class: "node" }),
      s("polyline", { points: route.map(p => p.join(",")).join(" "), class: "wire" }),
      s("circle", { cx: end[0], cy: end[1], r: 2.5, class: "node end" }),
    );
  }
}
