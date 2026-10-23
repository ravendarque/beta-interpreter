import { createInterpreter, facetOf, norm } from "../src/interpreter.js";
import { toMovements } from "../src/movements.js";
import { say, who } from "../src/say.js";
import { METRICS, TAGS } from "./ratings.js";

/**
 * @typedef {import("../src/interpreter.js").Term} Term
 * @typedef {import("../src/interpreter.js").Vocabulary} Vocabulary
 * @typedef {import("../src/interpreter.js").Reading} Reading
 * @typedef {import("../src/interpreter.js").Trace} Trace
 * @typedef {import("../src/movements.js").State} State
 * @typedef {import("../src/movements.js").Contact} Contact
 * @typedef {import("../src/movements.js").Movement} Movement
 * @typedef {ReturnType<typeof toMovements>} MovementRecord
 */

const SAMPLES = {
  "Establish, then fire": "get the left hand securely on the slopey crimp, then fire up for the hero jug",
  "Establish, then bump": "get the left hand securely on the slopey crimp, then big bump to the hero jug",
  "Steep boulder":
    "Steep cave. Both hands matched on the jug, right heel hook on the lip, cross left hand to a sidepull crimp, then deadpoint to the slopey pinch, crux! Match and rock over to finish.",
  Slab: "Slab. Smear the left foot, palm down on the dish, rockover onto the right foot inside edge and lock off to the crimp.",
  Crack: "Offwidth corner: arm bar and heel-toe cam, chicken wing up to the hand jam in the crack.",
  "Typed in a rush": "rh slopper undercut, lf toe hok, campus to the jugg, bump to the horn",
  Ambiguous: "Overhanging arête. Squeeze it with compression, jam in the crack, flag and paddle up the rail.",
  Contradiction: "Left hand heel hook on the ledge, then mantle.",
};

const FACETS = ["terrain", "feature", "hold", "orientation", "position", "transition"];
/** @type {Record<string, string>} */
const KIND_LABEL = {
  term: "term",
  limb: "limb",
  prep: "role",
  crux: "crux",
  break: "join",
  stop: "stop",
  unknown: "unknown",
  split: "split",
};
const LIMBS = /** @type {const} */ (["lh", "rh", "lf", "rf"]);
/** @type {Record<string, string>} */
const LIMB_NAME = { lh: "Left hand", rh: "Right hand", lf: "Left foot", rf: "Right foot" };
/** @type {Record<string, string>} */
const ROLE_WORD = { start: "from", target: "to", on: "on" };

const $ = /** @param {string} id */ id => /** @type {HTMLElement} */ (document.getElementById(id));
const beta = /** @type {HTMLTextAreaElement} */ ($("beta"));

const state = {
  /** @type {Vocabulary | null} */ vocabulary: null,
  /** @type {ReturnType<typeof createInterpreter> | null} */ interpreter: null,
  /** @type {Map<string, number>} */ resolutions: new Map(),
  /** @type {Set<string>} */ ignored: new Set(),
  /** @type {Reading | null} */ reading: null,
  /** @type {MovementRecord | null} */ record: null,
  /** @type {number | null} */ selected: null,
  /** @type {number | null} */ score: null,
  /** @type {Set<string>} */ tags: new Set(),
  corrections: 0,
  parseMs: 0,
  /** @type {{ sha: string, diff: string, changed: number } | null} */ status: null,
  /** @type {{ score: number }[]} */ ratings: [],
};

/** @param {string} s */
const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
/** @param {string} tag @param {Record<string, string | boolean | undefined>} [attrs] @param {(Node | string)[]} [kids] */
function h(tag, attrs = {}, kids = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids);
  return el;
}

/** @param {string} path @param {unknown} [body] */
async function api(path, body) {
  const res = await fetch(
    path,
    body === undefined
      ? undefined
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${path} returned ${res.status}.`);
  return data;
}

let toastTimer = 0;
/** @param {string} message @param {boolean} [error] */
function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 4200);
}

async function loadVocabulary() {
  state.vocabulary = await api("/api/vocabulary");
  state.interpreter = createInterpreter(/** @type {Vocabulary} */ (state.vocabulary));
}

async function loadStatus() {
  state.status = await api("/api/status");
  state.ratings = await api("/api/ratings");
  renderBuild();
  renderDiff();
  renderRatingHistory();
}

/** @param {string} path @param {unknown} body @param {string} done */
async function correct(path, body, done) {
  try {
    await api(path, body);
    state.corrections++;
    await loadVocabulary();
    await loadStatus();
    run();
    toast(done);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), true);
  }
}

function run() {
  if (!state.interpreter) return;
  const t0 = performance.now();
  const reading = state.interpreter.parse(beta.value, { resolutions: state.resolutions, ignored: state.ignored });
  const t1 = performance.now();
  state.record = toMovements(reading);
  state.parseMs = performance.now() - t0;
  state.reading = reading;
  if (state.selected !== null && state.selected >= reading.trace.length) state.selected = null;
  renderGauges(t1 - t0);
  renderReadback();
  renderTape();
  renderQuestions();
  renderClimb();
  renderMovements();
  renderSteps();
  renderJson();
  renderInspector();
  updateRatingButton();
}

/** @param {Trace} t */
function facetOfTrace(t) {
  if (!state.reading || t.kind !== "term") return t.kind;
  const span = state.reading.spans.find(s => s.s === t.s && s.term);
  return span?.facet ?? "term";
}
/** @param {Trace} t */
const spanOf = t => state.reading?.spans.find(s => s.s === t.s && s.term);

function metrics() {
  const r = state.reading;
  const rec = state.record;
  if (!r || !rec) return null;
  const words = r.trace.filter(t => t.kind !== "split");
  const contacts = rec.movements.flatMap(m => [m.start, m.end]).flatMap(s => Object.values(s.limbs));
  return {
    tokens: words.length,
    recognised: words.length ? (words.length - r.unknown.length) / words.length : 1,
    steps: r.beats.length,
    movements: rec.movements.length,
    unknown: r.unknown.length,
    ambiguous: r.amb.length,
    fuzzy: r.fuzzy.length,
    inferred:
      contacts.filter(c => c?.side === "inferred" || c?.holdSource === "inferred").length +
      rec.movements.filter(m => m.transition?.side === "inferred").length,
    unplaced: rec.movements.flatMap(m => [...m.start.unplaced, ...m.end.unplaced]).length,
    corrections: state.corrections,
  };
}

/** @param {number} parseOnly */
function renderGauges(parseOnly) {
  const m = metrics();
  if (!m) return;
  const g = $("gauges");
  const items = [
    [
      "Parse",
      parseOnly < 1 ? `${(parseOnly * 1000).toFixed(0)} µs` : `${parseOnly.toFixed(2)} ms`,
      `Record built in ${state.parseMs.toFixed(2)} ms`,
    ],
    ["Tokens", String(m.tokens), "Words read, excluding step breaks"],
    ["Recognised", `${Math.round(m.recognised * 100)}%`, "Share of words the vocabulary or grammar knows"],
    ["Steps", String(m.steps), "Steps after splitting"],
    ["Movements", String(m.movements), "Start, transition and end records"],
    ["Inferred", String(m.inferred), "Sides and holds filled in by inference"],
    ["Open", String(m.unknown + m.ambiguous), "Unknown or ambiguous words"],
  ];
  g.replaceChildren(
    ...items.map(([label, value, title]) =>
      h("div", { class: `gauge${label === "Open" && m.unknown + m.ambiguous ? " warn" : ""}`, title }, [
        h("dt", { text: label }),
        h("dd", { text: value }),
      ]),
    ),
  );
  const bar = h("div", { class: "gauge coverage", title: "Recognised words" }, [
    h("dt", { text: "Coverage" }),
    h("dd", {}, [
      h("span", { class: "meter" }, [h("span", { style: `inline-size:${(m.recognised * 100).toFixed(1)}%` })]),
    ]),
  ]);
  g.append(bar);
}

function renderBuild() {
  const s = state.status;
  const v = state.vocabulary;
  if (!s || !v) return;
  const phrases = v.terms.reduce((n, t) => n + t.match.length, 0);
  $("build").replaceChildren(
    h("span", { class: "chip mono", title: "Commit the workbench is running against", text: s.sha }),
    h("span", { class: "chip", title: `${phrases} match phrases`, text: `${v.terms.length} terms` }),
    h("span", {
      class: `chip${s.changed ? " dirty" : ""}`,
      title: "Uncommitted vocabulary changes",
      text: s.changed ? `${s.changed} file${s.changed > 1 ? "s" : ""} changed` : "Vocabulary clean",
    }),
  );
}

function renderReadback() {
  const r = state.reading;
  if (!r) return;
  const text = beta.value;
  const out = $("readback");
  if (!text.trim()) {
    out.replaceChildren(h("span", { class: "empty", text: "Paste or type some beta to see how it reads." }));
    return;
  }
  /** @type {(Node | string)[]} */
  const parts = [];
  let at = 0;
  r.trace.forEach((t, i) => {
    if (t.s > at) parts.push(text.slice(at, t.s));
    at = t.e;
    if (t.kind === "split" || t.kind === "stop" || t.kind === "break") {
      parts.push(
        h("span", { class: `tok k-${t.kind}${state.selected === i ? " sel" : ""}`, "data-i": String(i), text: t.text }),
      );
      return;
    }
    const span = spanOf(t);
    const facet = facetOfTrace(t);
    const cls = [
      "tok",
      `k-${t.kind}`,
      `f-${facet}`,
      span?.ambiguous ? "amb" : "",
      t.fuzzy?.length ? "fz" : "",
      state.selected === i ? "sel" : "",
    ];
    parts.push(
      h("button", {
        type: "button",
        class: cls.filter(Boolean).join(" "),
        "data-i": String(i),
        title: `${KIND_LABEL[t.kind]}${span?.term ? `: ${span.term.name}` : ""}`,
        "aria-label": `${t.text}, ${KIND_LABEL[t.kind]}${span?.term ? `: ${span.term.name}` : ""}`,
        text: t.text,
      }),
    );
  });
  parts.push(text.slice(at));
  out.replaceChildren(...parts);
}

function renderTape() {
  const r = state.reading;
  if (!r) return;
  $("tape").replaceChildren(
    ...r.trace.map((t, i) => {
      const facet = facetOfTrace(t);
      const span = spanOf(t);
      const read = span?.term
        ? span.term.id
        : t.kind === "unknown"
          ? t.guess
            ? `? ${t.guess}`
            : "?"
          : KIND_LABEL[t.kind];
      return h("li", { class: `cell k-${t.kind} f-${facet}${state.selected === i ? " sel" : ""}` }, [
        h("button", { type: "button", "data-i": String(i), title: `${t.text} (${t.s}–${t.e})` }, [
          h("span", { class: "band" }),
          h("span", { class: "raw", text: t.kind === "split" ? t.text.trim() || "¶" : t.text }),
          h("span", { class: "read", text: read }),
        ]),
      ]);
    }),
  );
}

function renderQuestions() {
  const r = state.reading;
  if (!r) return;
  /** @type {HTMLElement[]} */
  const qs = [];
  for (const a of r.amb)
    qs.push(
      h("div", { class: "q" }, [
        h("p", {}, ["Which ", h("strong", { text: a.word }), " is meant here?"]),
        h(
          "div",
          { class: "actions" },
          a.options.map((o, i) =>
            h("button", {
              type: "button",
              class: `pill f-${facetOf(o)}`,
              "data-resolve": a.occ,
              "data-option": String(i),
              text: o.name,
            }),
          ),
        ),
      ]),
    );
  for (const u of r.unknown) {
    const i = r.trace.findIndex(t => t.s === u.s);
    qs.push(
      h("div", { class: "q" }, [
        h("p", {}, [
          h("strong", { text: u.raw }),
          " isn’t in the vocabulary.",
          u.guess ? ` Closest word: ${u.guess}.` : "",
        ]),
        h("div", { class: "actions" }, [
          h("button", { type: "button", class: "ghost", "data-i": String(i), text: "Inspect and correct" }),
        ]),
      ]),
    );
  }
  for (const f of r.fuzzy)
    qs.push(h("div", { class: "q info" }, [h("p", {}, ["Read ", h("strong", { text: f.from }), ` as ${f.to}.`])]));
  for (const b of r.beats)
    for (const issue of b.issues) qs.push(h("div", { class: "q issue" }, [h("p", { text: issue })]));
  $("q-count").textContent = qs.length ? String(qs.length) : "";
  $("questions").replaceChildren(...(qs.length ? qs : [h("p", { class: "empty", text: "Nothing to settle." })]));
}

/** @param {Term} t */
const pill = t => h("span", { class: `pill f-${facetOf(t)}`, title: `${t.id} · ${t.facets.join(", ")}`, text: t.name });

function renderClimb() {
  const rec = state.record;
  if (!rec) return;
  const row = /** @param {string} label @param {Term[]} terms */ (label, terms) =>
    h("div", { class: "climb-row" }, [
      h("span", { class: "label", text: label }),
      ...(terms.length ? terms.map(pill) : [h("span", { class: "none", text: "none" })]),
    ]);
  $("climb").replaceChildren(row("Terrain", rec.terrain), row("Features", rec.features));
}

/** @param {string | null} source */
const prov = source =>
  h("span", {
    class: `prov p-${source ?? "none"}`,
    title: source ? `Side ${source}` : "No side",
    "aria-label": source ? `side ${source}` : "no side",
  });

/** @param {string} key @param {Contact | undefined} c */
function limbCell(key, c) {
  if (!c) return h("div", { class: "limb empty" }, [h("span", { class: "who", text: key.toUpperCase() })]);
  const hold = c.hold ? [c.hold.ori, ...c.hold.kinds].flatMap(t => (t ? [t.name.toLowerCase()] : [])).join(" ") : "";
  return h("div", { class: "limb", title: LIMB_NAME[key] }, [
    h("span", { class: "who" }, [key.toUpperCase(), prov(c.side)]),
    hold
      ? h("span", {
          class: `hold${c.holdSource === "inferred" ? " inferred" : ""}`,
          title: `Hold ${c.holdSource}`,
          text: hold,
        })
      : "",
    c.techniques.length
      ? h("span", { class: "tech", text: c.techniques.map(t => t.name.toLowerCase()).join(", ") })
      : "",
  ]);
}

/** @param {State} s @param {string} label */
function stateBlock(s, label) {
  const extras = [
    ...s.body.map(t => h("span", { class: "pill f-position", title: "Body level", text: t.name })),
    ...s.unplaced.map(u =>
      h("span", { class: "pill unplaced", title: "Side not settled" }, [
        `${u.part ?? "limb"}?`,
        u.hold ? ` ${[u.hold.ori, ...u.hold.kinds].flatMap(t => (t ? [t.name.toLowerCase()] : [])).join(" ")}` : "",
        u.techniques.length ? ` · ${u.techniques.map(t => t.name.toLowerCase()).join(", ")}` : "",
      ]),
    ),
  ];
  return h("div", { class: "state" }, [
    h("span", { class: "state-label", text: label }),
    h(
      "div",
      { class: "limbs" },
      LIMBS.map(k => limbCell(k, s.limbs[k])),
    ),
    extras.length ? h("div", { class: "extras" }, extras) : "",
  ]);
}

function renderMovements() {
  const rec = state.record;
  if (!rec) return;
  const view = $("view-movements");
  if (!rec.movements.length) {
    view.replaceChildren(
      h("p", { class: "empty", text: "No movements yet. A step with a move or a target hold closes one." }),
    );
    return;
  }
  view.replaceChildren(
    h(
      "ol",
      { class: "movements" },
      rec.movements.map((m, i) => {
        const t = m.transition;
        const steps = m.steps.map(s => s + 1);
        const tr = t
          ? h("div", { class: "transition" }, [
              h("svg", { class: "arrow", viewBox: "0 0 120 24", "aria-hidden": "true", preserveAspectRatio: "none" }),
              h("span", {
                class: "move-name",
                text: t.terms.length ? t.terms.map(x => x.name).join(" + ") : "Unnamed move",
              }),
              h("span", { class: "move-limbs" }, [
                t.limbs.length ? t.limbs.map(k => k.toUpperCase()).join(" ") : "limb not settled",
                t.side ? prov(t.side) : "",
              ]),
            ])
          : h("div", { class: "transition none" }, [h("span", { class: "move-name", text: "No transition" })]);
        return h("li", { class: `movement${m.crux ? " crux" : ""}` }, [
          h("div", { class: "mv-head" }, [
            h("span", { class: "mv-n", text: String(i + 1) }),
            h("span", {
              class: "mv-steps",
              text: steps.length > 1 ? `steps ${steps[0]}–${steps[steps.length - 1]}` : `step ${steps[0]}`,
            }),
            m.crux ? h("span", { class: "crux-tag", text: "Crux" }) : "",
          ]),
          h("div", { class: "mv-body" }, [stateBlock(m.start, "Start"), tr, stateBlock(m.end, "End")]),
          ...m.issues.map(x => h("p", { class: "issue", text: x })),
        ]);
      }),
    ),
  );
  for (const svg of view.querySelectorAll("svg.arrow"))
    svg.innerHTML = '<path d="M2 12 H112" /><path d="M104 5 L116 12 L104 19" class="head" />';
}

function renderSteps() {
  const r = state.reading;
  if (!r) return;
  $("view-steps").replaceChildren(
    r.beats.length
      ? h(
          "ol",
          { class: "steps" },
          r.beats.map(b =>
            h("li", { class: `step${b.crux ? " crux" : ""}` }, [
              h("p", { class: "say", text: say(b) }),
              h("div", { class: "order" }, [
                who(b) ? h("span", { class: "pill f-limb", text: who(b) }) : "",
                ...b.order.map(p =>
                  p.kind === "hold"
                    ? h("span", { class: "pill f-hold" }, [
                        p.hold.role ? h("em", { text: ROLE_WORD[p.hold.role] ?? p.hold.role }) : "",
                        [p.hold.ori, ...p.hold.kinds].flatMap(t => (t ? [t.name.toLowerCase()] : [])).join(" "),
                      ])
                    : h("span", { class: `pill f-${p.kind}` }, [
                        p.kind === "position" && p.role ? h("em", { text: ROLE_WORD[p.role] ?? p.role }) : "",
                        p.term.name,
                      ]),
                ),
              ]),
              ...b.issues.map(x => h("p", { class: "issue", text: x })),
            ]),
          ),
        )
      : h("p", { class: "empty", text: "No steps yet." }),
  );
}

function renderJson() {
  const rec = state.record;
  if (!rec) return;
  const json = JSON.stringify(
    rec,
    (_, v) => (v && typeof v === "object" && "facets" in v && "match" in v ? v.id : v),
    2,
  );
  $("json").innerHTML = esc(json)
    .replace(/(&#34;[^&]*?&#34;)(:)/g, '<span class="j-key">$1</span>$2')
    .replace(/: (&#34;.*?&#34;)/g, ': <span class="j-str">$1</span>')
    .replace(/: (null|true|false)/g, ': <span class="j-lit">$1</span>')
    .replace(/: (-?\d+(\.\d+)?)/g, ': <span class="j-num">$1</span>');
}

/** @param {Term} t */
function termCard(t) {
  const v = state.vocabulary;
  const parent = t.parent ? v?.terms.find(x => x.id === t.parent) : null;
  /** @type {[string, string][]} */
  const rows = [
    ["id", t.id],
    ["facets", t.facets.join(", ")],
    ["region", t.region ?? "—"],
    ["part", t.part ?? "—"],
    .../** @type {[string, string][]} */ (t.side ? [["side", t.side]] : []),
    .../** @type {[string, string][]} */ (t.sameLimb ? [["rule", "same limb as the previous move"]] : []),
    .../** @type {[string, string][]} */ (t.sameHold ? [["rule", "same hold as the other limb"]] : []),
    .../** @type {[string, string][]} */ (parent ? [["parent", parent.name]] : []),
  ];
  return h("div", { class: `term-card f-${facetOf(t)}` }, [
    h("p", { class: "term-name", text: t.name }),
    h(
      "dl",
      { class: "props" },
      rows.flatMap(([k, val]) => [h("dt", { text: k }), h("dd", { text: val })]),
    ),
    h("p", { class: "phr-label", text: "Matches" }),
    h(
      "div",
      { class: "phrases" },
      t.match.length
        ? t.match.map(p => h("code", { text: p }))
        : [h("span", { class: "none", text: "nothing (group term)" })],
    ),
  ]);
}

/** @param {(t: Term) => void} onPick @param {string} placeholder */
function termPicker(onPick, placeholder) {
  const input = /** @type {HTMLInputElement} */ (
    h("input", { type: "search", placeholder, "aria-label": placeholder, class: "search" })
  );
  const list = h("ul", { class: "results", role: "listbox" });
  const update = () => {
    const q = norm(input.value);
    const terms = state.vocabulary?.terms ?? [];
    const hits = q
      ? terms
          .map(t => ({
            t,
            score: norm(t.name).startsWith(q)
              ? 0
              : t.id.startsWith(q)
                ? 1
                : t.match.some(m => norm(m).startsWith(q))
                  ? 2
                  : norm(t.name).includes(q)
                    ? 3
                    : 9,
          }))
          .filter(x => x.score < 9)
          .sort((a, b) => a.score - b.score)
          .slice(0, 8)
      : [];
    list.replaceChildren(
      ...hits.map(({ t }) => {
        const b = h(
          "button",
          {
            type: "button",
            role: "option",
            "aria-label": `${t.name}, ${t.facets.join(", ")}`,
            class: `pick f-${facetOf(t)}`,
          },
          [h("span", { text: t.name }), h("span", { class: "mono dim", text: t.facets.join(" · ") })],
        );
        b.addEventListener("click", () => onPick(t));
        return h("li", {}, [b]);
      }),
    );
  };
  input.addEventListener("input", update);
  return h("div", { class: "picker" }, [input, list]);
}

function renderInspector() {
  const body = $("inspect-body");
  const r = state.reading;
  const i = state.selected;
  if (!r || i === null || !r.trace[i]) {
    body.replaceChildren(
      h("p", {
        class: "empty",
        text: "Select a word in the reading or the token trace to see how it was read and correct it.",
      }),
    );
    return;
  }
  const t = r.trace[i];
  const span = spanOf(t);
  /** @type {(Node | string)[]} */
  const kids = [
    h("div", { class: "insp-head" }, [
      h("span", { class: `pill k-${t.kind} f-${facetOfTrace(t)}`, text: t.text }),
      h("span", {
        class: "mono dim",
        text: `${KIND_LABEL[t.kind]}, characters ${t.s}–${t.e}${t.key ? `, key “${t.key}”` : ""}`,
      }),
    ]),
  ];

  if (t.kind === "term" && span?.term && t.key) {
    const term = span.term;
    const phrase = t.key;
    const amb = r.amb.find(a => a.s === t.s);
    if (t.fuzzy?.length)
      kids.push(h("p", { class: "callout", text: `Typo corrected: “${t.fuzzy.join(" ")}” was read as “${t.key}”.` }));
    kids.push(termCard(term));
    const owners = state.vocabulary?.terms.filter(x => x.match.some(m => norm(m) === phrase)) ?? [];
    const actions = h("div", { class: "insp-actions" });
    if (amb)
      actions.append(
        h("p", { class: "act-label", text: "Read it differently here" }),
        h(
          "div",
          { class: "actions" },
          amb.options.map((o, oi) =>
            h("button", {
              type: "button",
              class: `pill f-${facetOf(o)}`,
              "data-resolve": amb.occ,
              "data-option": String(oi),
              text: o.name,
            }),
          ),
        ),
      );
    if (t.fuzzy?.length) {
      const raw = norm(t.fuzzy.join(" "));
      const teach = h("button", { type: "button", class: "ghost", text: `Teach “${raw}” as ${term.name}` });
      teach.addEventListener("click", () =>
        correct(
          "/api/vocabulary/phrase",
          { action: "add", termId: term.id, phrase: raw },
          `${term.name} now matches “${raw}”.`,
        ),
      );
      actions.append(teach);
    }
    const owner = owners.find(o => o.id === term.id);
    if (owner) {
      actions.append(
        h("p", { class: "act-label", text: `Move “${phrase}” to another term` }),
        termPicker(
          to =>
            correct(
              "/api/vocabulary/phrase",
              { action: "move", fromTermId: term.id, termId: to.id, phrase },
              `Moved “${phrase}” from ${term.name} to ${to.name}.`,
            ),
          "Search terms",
        ),
      );
      const remove = h("button", {
        type: "button",
        class: "ghost danger",
        text: `Remove “${phrase}” from ${term.name}`,
      });
      remove.addEventListener("click", () =>
        correct(
          "/api/vocabulary/phrase",
          { action: "remove", termId: term.id, phrase },
          `${term.name} no longer matches “${phrase}”.`,
        ),
      );
      actions.append(remove);
    } else
      actions.append(
        h("p", {
          class: "note",
          text: `“${phrase}” reached ${term.name} through a word ending, not a phrase of its own.`,
        }),
      );
    kids.push(actions);
  } else if (t.kind === "unknown") {
    const phraseInput = /** @type {HTMLInputElement} */ (
      h("input", { type: "text", class: "search", value: norm(t.text), "aria-label": "Phrase to teach" })
    );
    const actions = h("div", { class: "insp-actions" }, [
      h("p", { class: "act-label", text: "This means…" }),
      h("label", { class: "field" }, [h("span", { text: "Phrase" }), phraseInput]),
      termPicker(
        to =>
          correct(
            "/api/vocabulary/phrase",
            { action: "add", termId: to.id, phrase: phraseInput.value },
            `${to.name} now matches “${norm(phraseInput.value)}”.`,
          ),
        "Search terms",
      ),
    ]);
    const row = h("div", { class: "actions" });
    if (t.guess) {
      const use = h("button", { type: "button", class: "ghost", text: `Replace with “${t.guess}” in the text` });
      use.addEventListener("click", () => {
        beta.value = beta.value.slice(0, t.s) + t.guess + beta.value.slice(t.e);
        run();
      });
      row.append(use);
    }
    const stop = h("button", { type: "button", class: "ghost", text: "It’s filler: add as a stop word" });
    stop.addEventListener("click", () =>
      correct("/api/vocabulary/stop", { word: t.text }, `“${norm(t.text)}” is now a stop word.`),
    );
    const ignore = h("button", { type: "button", class: "ghost", text: "Ignore in this session" });
    ignore.addEventListener("click", () => {
      state.ignored.add(norm(t.text));
      run();
    });
    row.append(stop, ignore);
    actions.append(row);
    kids.push(actions);
  } else {
    const explain = {
      limb: "A limb word. It sets the side or part for its step.",
      prep: `A role word. Holds after it are read as “${t.text}” holds until the next role word.`,
      crux: "Marks this step as the crux.",
      break: "Joins two things in one step, unless a move or a conflicting position follows, which starts a new step.",
      stop: "A stop word. It carries no meaning for the record.",
      split: "A step break.",
    }[t.kind];
    kids.push(h("p", { class: "note", text: explain ?? "" }));
  }
  body.replaceChildren(...kids);
}

function renderDiff() {
  const s = state.status;
  if (!s) return;
  $("diff-count").textContent = s.changed ? `${s.changed} file${s.changed > 1 ? "s" : ""}` : "";
  const lines = s.diff.split("\n").filter(l => l && !l.startsWith("index ") && !l.startsWith("diff --git"));
  $("diff").replaceChildren(
    ...(lines.length
      ? lines.map(l =>
          h("span", {
            class:
              l.startsWith("+++") || l.startsWith("---")
                ? "d-file"
                : l.startsWith("@@")
                  ? "d-hunk"
                  : l.startsWith("+")
                    ? "d-add"
                    : l.startsWith("-")
                      ? "d-del"
                      : "d-ctx",
            text: `${l}\n`,
          }),
        )
      : [h("span", { class: "d-ctx", text: "No uncommitted changes." })]),
  );
}

function renderRatingHistory() {
  const n = state.ratings.length;
  $("rating-history").textContent = n
    ? `${n} saved, mean ${(state.ratings.reduce((a, r) => a + r.score, 0) / n).toFixed(1)}`
    : "";
}

function renderLegend() {
  $("legend").replaceChildren(
    ...FACETS.map(f => h("span", { class: `key-chip f-${f}`, text: f })),
    h("span", { class: "key-chip f-limb", text: "limb" }),
    h("span", { class: "key-chip k-unknown", text: "unknown" }),
  );
  $("key").replaceChildren(
    h("span", {}, [prov("stated"), "stated"]),
    h("span", {}, [prov("implied"), "implied by the term"]),
    h("span", {}, [prov("inferred"), "inferred"]),
    h("span", {}, [h("span", { class: "hold inferred", text: "hold" }), "inferred hold"]),
  );
}

function renderRatingForm() {
  $("score").replaceChildren(
    ...[1, 2, 3, 4, 5].map(n =>
      h("label", { class: "score-opt" }, [
        h("input", { type: "radio", name: "score", value: String(n) }),
        h("span", { text: String(n) }),
      ]),
    ),
  );
  $("tags").replaceChildren(
    ...Object.entries(TAGS).map(([id, label]) =>
      h("label", { class: "tag-opt" }, [h("input", { type: "checkbox", value: id }), h("span", { text: label })]),
    ),
  );
}

function updateRatingButton() {
  /** @type {HTMLButtonElement} */ ($("save-rating")).disabled = state.score === null || !beta.value.trim();
}

function resetRating() {
  state.score = null;
  state.tags.clear();
  for (const el of /** @type {NodeListOf<HTMLInputElement>} */ ($("rating").querySelectorAll("input")))
    el.checked = false;
  updateRatingButton();
}

/** @param {number | null} i */
function select(i) {
  state.selected = i;
  renderReadback();
  renderTape();
  renderInspector();
  if (i !== null)
    document.querySelector(`#tape [data-i="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
}

function wire() {
  beta.addEventListener("input", () => {
    state.resolutions.clear();
    run();
  });
  $("samples").replaceChildren(
    ...Object.entries(SAMPLES).map(([name, text]) => {
      const b = h("button", { type: "button", class: "sample", text: name });
      b.addEventListener("click", () => {
        beta.value = text;
        state.resolutions.clear();
        state.ignored.clear();
        state.selected = null;
        resetRating();
        run();
      });
      return b;
    }),
  );
  document.addEventListener("click", e => {
    const el = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (e.target).closest("[data-i],[data-resolve]")
    );
    if (!el) return;
    if (el.dataset.resolve) {
      state.resolutions.set(el.dataset.resolve, Number(el.dataset.option));
      run();
      return;
    }
    if (el.closest("#readback, #tape, #questions")) select(Number(el.dataset.i));
  });
  for (const tab of document.querySelectorAll('[role="tab"]'))
    tab.addEventListener("click", () => {
      for (const t of document.querySelectorAll('[role="tab"]')) {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        $(/** @type {string} */ (t.getAttribute("aria-controls"))).hidden = !on;
      }
    });
  $("rating").addEventListener("change", e => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (input.name === "score") state.score = Number(input.value);
    else if (input.checked) state.tags.add(input.value);
    else state.tags.delete(input.value);
    updateRatingButton();
  });
  $("rating").addEventListener("submit", async e => {
    e.preventDefault();
    const m = metrics();
    if (!m || state.score === null) return;
    /** @type {Record<string, number>} */
    const numbers = {};
    for (const k of METRICS) numbers[k] = /** @type {Record<string, number>} */ (m)[k];
    try {
      await api("/api/ratings", { score: state.score, tags: [...state.tags], metrics: numbers });
      $("rating-status").textContent = "Saved";
      resetRating();
      await loadStatus();
      window.setTimeout(() => ($("rating-status").textContent = ""), 2500);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  });
}

async function start() {
  renderLegend();
  renderRatingForm();
  wire();
  try {
    await loadVocabulary();
    await loadStatus();
  } catch (e) {
    toast(
      `The workbench API isn’t answering. Start it with pnpm workbench. (${e instanceof Error ? e.message : e})`,
      true,
    );
    return;
  }
  beta.value = SAMPLES["Steep boulder"];
  run();
}

start();
