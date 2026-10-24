import { createInterpreter, facetOf, norm } from "../src/interpreter.js";
import { toMovements } from "../src/movements.js";
import { say, who } from "../src/say.js";
import { $, h } from "./dom.js";
import { groupQuestions } from "./questions.js";
import { METRICS, TAGS } from "./ratings.js";
import { renderScope } from "./scope.js";

/**
 * @typedef {import("../src/interpreter.js").Term} Term
 * @typedef {import("../src/interpreter.js").Vocabulary} Vocabulary
 * @typedef {import("../src/interpreter.js").Reading} Reading
 * @typedef {import("../src/interpreter.js").Trace} Trace
 * @typedef {import("../src/movements.js").State} State
 * @typedef {import("../src/movements.js").Contact} Contact
 * @typedef {ReturnType<typeof toMovements>} MovementRecord
 * @typedef {ReturnType<typeof groupQuestions>} Questions
 * @typedef {"reading" | "questions" | "movements" | "steps" | "json" | "vocabulary"} View
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

/** @type {[View, string][]} */
const VIEWS = [
  ["reading", "Reading"],
  ["questions", "Questions"],
  ["movements", "Movements"],
  ["steps", "Steps"],
  ["json", "JSON"],
  ["vocabulary", "Vocabulary"],
];
const SPECTRUM = ["terrain", "feature", "hold", "orientation", "position", "transition", "limb", "stop", "unknown"];
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

const beta = /** @type {HTMLTextAreaElement} */ ($("beta"));

const state = {
  /** @type {Vocabulary | null} */ vocabulary: null,
  /** @type {ReturnType<typeof createInterpreter> | null} */ interpreter: null,
  /** @type {Map<string, number>} */ resolutions: new Map(),
  /** @type {Set<string>} */ ignored: new Set(),
  /** @type {Reading | null} */ reading: null,
  /** @type {MovementRecord | null} */ record: null,
  /** @type {Questions | null} */ questions: null,
  /** @type {number | null} */ selected: null,
  /** @type {Set<string>} */ picked: new Set(),
  /** @type {number | null} */ score: null,
  /** @type {Set<string>} */ tags: new Set(),
  corrections: 0,
  parseMs: 0,
  /** @type {string[]} */ log: [],
  /** @type {{ sha: string, diff: string, changed: number } | null} */ status: null,
  /** @type {{ score: number, tags: string[] }[]} */ ratings: [],
  /** @type {View | null} */ view: null,
  /** @type {HTMLElement | null} */ opener: null,
};

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
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 4200);
}

async function loadVocabulary() {
  state.vocabulary = await api("/api/vocabulary");
  state.interpreter = createInterpreter(/** @type {Vocabulary} */ (state.vocabulary));
}

async function loadStatus() {
  state.status = await api("/api/status");
  state.ratings = await api("/api/ratings");
}

/** @param {string} path @param {unknown} body @param {(result: any) => string} done */
async function correct(path, body, done) {
  try {
    const result = await api(path, body);
    const message = done(result);
    state.corrections++;
    state.log.unshift(message);
    await loadVocabulary();
    await loadStatus();
    run();
    toast(message);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), true);
  }
}

/** @param {Trace} t */
const spanOf = t => state.reading?.spans.find(sp => sp.s === t.s && sp.term);
/** @param {Trace} t */
function facetOfTrace(t) {
  if (t.kind === "term") return spanOf(t)?.facet ?? "term";
  if (t.kind === "prep" || t.kind === "crux") return "limb";
  if (t.kind === "break") return "stop";
  return t.kind;
}
/** @param {import("../src/interpreter.js").Hold | null} hold */
const holdText = hold =>
  hold ? [hold.ori, ...hold.kinds].flatMap(t => (t ? [t.name.toLowerCase()] : [])).join(" ") : "";

function metrics() {
  const r = state.reading;
  const rec = state.record;
  const q = state.questions;
  if (!r || !rec || !q) return null;
  const words = r.trace.filter(t => t.kind !== "split");
  const contacts = rec.movements.flatMap(m => [m.start, m.end]).flatMap(st => Object.values(st.limbs));
  return {
    tokens: words.length,
    recognised: words.length ? (words.length - r.unknown.length) / words.length : 1,
    steps: r.beats.length,
    movements: rec.movements.length,
    unknown: q.words.length,
    ambiguous: r.amb.length,
    fuzzy: r.fuzzy.length,
    inferred:
      contacts.filter(c => c?.side === "inferred" || c?.holdSource === "inferred").length +
      rec.movements.filter(m => m.transition?.side === "inferred").length,
    unplaced: rec.movements.flatMap(m => [...m.start.unplaced, ...m.end.unplaced]).length,
    corrections: state.corrections,
  };
}

function run() {
  if (!state.interpreter) return;
  const t0 = performance.now();
  const reading = state.interpreter.parse(beta.value, { resolutions: state.resolutions, ignored: state.ignored });
  state.record = toMovements(reading);
  state.parseMs = performance.now() - t0;
  state.reading = reading;
  state.questions = groupQuestions(reading);
  if (state.selected !== null && !reading.trace[state.selected]) state.selected = null;
  renderDashboard();
  if (state.view) renderDetail();
  updateRatingButton();
}

/* Dashboard */

function renderDashboard() {
  renderSysline();
  renderCore();
  renderReadingCard();
  renderQuestionsCard();
  renderMovementsCard();
  renderVocabCard();
  renderRatingHistory();
  renderTape();
}

function renderSysline() {
  const s = state.status;
  const v = state.vocabulary;
  if (!s || !v) return;
  const phrases = v.terms.reduce((n, t) => n + t.match.length, 0);
  $("sysline").replaceChildren(
    h("span", { class: "sys", title: "Commit the workbench is running against" }, [h("b", { text: "Build" }), s.sha]),
    h("span", { class: "sys" }, [h("b", { text: "Terms" }), String(v.terms.length)]),
    h("span", { class: "sys" }, [h("b", { text: "Phrases" }), String(phrases)]),
    h("span", { class: `sys${s.changed ? " warn" : " ok"}` }, [
      h("b", { text: "Vocabulary" }),
      s.changed ? "uncommitted changes" : "clean",
    ]),
  );
}

function renderCore() {
  const r = state.reading;
  const rec = state.record;
  const m = metrics();
  if (!r || !rec || !m) return;
  renderScope(/** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("scope"))), {
    tokens: r.trace.map((t, i) => ({ i, kind: t.kind, facet: facetOfTrace(t), clause: t.clause, text: t.text })),
    steps: r.beats.map(b => ({ clause: b.clause, crux: b.crux })),
    movements: rec.movements.map(mv => ({ clauses: mv.steps.map(i => r.beats[i].clause), crux: mv.crux })),
    coverage: m.recognised,
    parseMs: state.parseMs,
    selected: state.selected,
  });
  const open = (state.questions?.total ?? 0) + (state.questions?.unknown.length ?? 0);
  /** @type {[string, string, string?][]} */
  const items = [
    ["Tokens", String(m.tokens)],
    ["Steps", String(m.steps)],
    ["Movements", String(m.movements)],
    ["Inferred", String(m.inferred)],
    ["Unplaced", String(m.unplaced), m.unplaced ? "warn" : ""],
    ["Open", String(open), open ? "warn" : ""],
  ];
  $("readouts").replaceChildren(
    ...items.map(([label, value, cls]) =>
      h("div", { class: `readout ${cls ?? ""}` }, [h("dt", { text: label }), h("dd", { text: value })]),
    ),
  );
}

function renderReadingCard() {
  const r = state.reading;
  if (!r) return;
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(SPECTRUM.map(f => [f, 0]));
  for (const t of r.trace) {
    if (t.kind === "split") continue;
    const f = facetOfTrace(t);
    counts[f in counts ? f : "stop"]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  $("c-reading").replaceChildren(
    h(
      "div",
      { class: "spectrum", role: "img", "aria-label": SPECTRUM.map(f => `${counts[f]} ${f}`).join(", ") },
      SPECTRUM.filter(f => counts[f]).map(f =>
        h("span", { class: `seg f-${f} k-${f}`, style: `flex-grow:${counts[f] / total}` }),
      ),
    ),
    h(
      "dl",
      { class: "spec-key" },
      SPECTRUM.map(f =>
        h("div", { class: counts[f] ? "" : "zero" }, [
          h("dt", {}, [h("i", { class: `sw f-${f} k-${f}` }), f]),
          h("dd", { text: String(counts[f]) }),
        ]),
      ),
    ),
    h("p", { class: "mini-read" }, [readback({ compact: true })]),
  );
}

function renderQuestionsCard() {
  const q = state.questions;
  if (!q) return;
  const uses = q.words.reduce((n, u) => n + u.count, 0);
  /** @type {(Node | string)[]} */
  const top = [];
  for (const a of q.ambiguous.slice(0, 2)) top.push(h("li", {}, ["Which ", h("b", { text: a.word }), "?"]));
  for (const i of q.issues.slice(0, 2)) top.push(h("li", { class: "issue", text: i }));
  for (const t of q.typos.slice(0, 3))
    top.push(h("li", {}, [h("b", { text: t.raw }), ` might be ${t.guess}`, t.count > 1 ? ` (${t.count}×)` : ""]));
  $("c-questions").replaceChildren(
    h("dl", { class: "figures" }, [
      figure("Ambiguous", q.ambiguous.length, q.ambiguous.length > 0),
      figure("Contradictions", q.issues.length, q.issues.length > 0),
      figure("Typos?", q.typos.length, q.typos.length > 0),
    ]),
    h("p", { class: "unrec" }, [
      h("b", { text: String(q.words.length) }),
      ` unrecognised word${q.words.length === 1 ? "" : "s"}`,
      uses > q.words.length ? `, used ${uses} times` : "",
    ]),
    top.length ? h("ul", { class: "toplist" }, top) : h("p", { class: "empty", text: "Nothing to settle." }),
  );
}

/** @param {string} label @param {number | string} value @param {boolean} [warn] */
const figure = (label, value, warn = false) =>
  h("div", { class: `figure${warn ? " warn" : ""}` }, [h("dt", { text: label }), h("dd", { text: String(value) })]);

function renderMovementsCard() {
  const rec = state.record;
  const m = metrics();
  if (!rec || !m) return;
  const cruxAt = rec.movements.findIndex(mv => mv.crux);
  $("c-movements").replaceChildren(
    h("dl", { class: "figures" }, [
      figure("Movements", m.movements),
      figure("Crux", cruxAt >= 0 ? `#${cruxAt + 1}` : "none"),
      figure("Inferred", m.inferred),
    ]),
    rec.movements.length
      ? h(
          "ol",
          { class: "mv-list" },
          rec.movements.map((mv, i) => {
            const t = mv.transition;
            const ends = LIMBS.flatMap(k =>
              mv.end.limbs[k]?.hold ? [`${k.toUpperCase()} ${holdText(mv.end.limbs[k]?.hold ?? null)}`] : [],
            );
            return h("li", { class: mv.crux ? "crux" : "" }, [
              h("span", { class: "n", text: String(i + 1) }),
              h("span", {
                class: "mv",
                text: t ? (t.terms.length ? t.terms.map(x => x.name).join(" + ") : "unnamed move") : "set-up only",
              }),
              h("span", { class: "limbs", text: t?.limbs.length ? t.limbs.map(k => k.toUpperCase()).join(" ") : "" }),
              h("span", { class: "to", text: ends.join(", ") }),
            ]);
          }),
        )
      : h("p", { class: "empty", text: "A step with a move or a target hold closes a movement." }),
  );
}

function renderVocabCard() {
  const s = state.status;
  if (!s) return;
  const lines = s.diff.split("\n");
  const adds = lines.filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
  const dels = lines.filter(l => l.startsWith("-") && !l.startsWith("---")).length;
  $("c-vocab").replaceChildren(
    h("dl", { class: "figures" }, [
      figure("Files changed", s.changed, s.changed > 0),
      figure("Lines +", adds),
      figure("Lines −", dels),
    ]),
    state.log.length
      ? h(
          "ul",
          { class: "toplist" },
          state.log.slice(0, 3).map(l => h("li", { text: l })),
        )
      : h("p", {
          class: "empty",
          text: s.changed
            ? "Uncommitted changes from earlier. Review them with git diff."
            : "No corrections yet this session.",
        }),
  );
}

function renderTape() {
  const r = state.reading;
  if (!r) return;
  $("tape").replaceChildren(
    ...r.trace.map((t, i) => {
      const span = spanOf(t);
      const read = span?.term
        ? span.term.id
        : t.kind === "unknown"
          ? t.guess
            ? `? ${t.guess}`
            : "?"
          : KIND_LABEL[t.kind];
      return h("li", { class: `cell k-${t.kind} f-${facetOfTrace(t)}${state.selected === i ? " sel" : ""}` }, [
        h("button", { type: "button", "data-i": i, "aria-label": `${t.text}, read as ${read}` }, [
          h("span", { class: "band" }),
          h("span", { class: "raw", text: t.kind === "split" ? t.text.trim() || "¶" : t.text }),
          h("span", { class: "read", text: read }),
        ]),
      ]);
    }),
  );
}

/** @param {{ compact?: boolean }} [opts] */
function readback({ compact = false } = {}) {
  const r = state.reading;
  const text = beta.value;
  const frag = document.createDocumentFragment();
  if (!r || !text.trim()) {
    frag.append(h("span", { class: "empty", text: "Paste or type some beta to see how it reads." }));
    return frag;
  }
  let at = 0;
  r.trace.forEach((t, i) => {
    if (t.s > at) frag.append(text.slice(at, t.s));
    at = t.e;
    const sel = state.selected === i ? " sel" : "";
    if (t.kind === "split" || t.kind === "stop" || t.kind === "break") {
      frag.append(h("span", { class: `tok k-${t.kind}${sel}`, text: t.text }));
      return;
    }
    const span = spanOf(t);
    const cls = `tok k-${t.kind} f-${facetOfTrace(t)}${span?.ambiguous ? " amb" : ""}${t.fuzzy?.length ? " fz" : ""}${sel}`;
    const label = `${KIND_LABEL[t.kind]}${span?.term ? `: ${span.term.name}` : ""}`;
    frag.append(
      compact
        ? h("span", { class: cls, text: t.text })
        : h("button", {
            type: "button",
            class: cls,
            "data-i": i,
            title: label,
            "aria-label": `${t.text}, ${label}`,
            text: t.text,
          }),
    );
  });
  frag.append(text.slice(at));
  return frag;
}

/* Detail views */

/** @param {View} view @param {HTMLElement | null} [opener] */
function openDetail(view, opener = null) {
  const wasOpen = state.view !== null;
  state.view = view;
  if (!wasOpen) state.opener = opener ?? /** @type {HTMLElement | null} */ (document.activeElement);
  $("detail").hidden = false;
  $("dash").inert = true;
  renderDetail();
  if (!wasOpen)
    /** @type {HTMLElement | null} */ (document.querySelector(`#detail-tabs [data-view="${view}"]`))?.focus();
}

function closeDetail() {
  state.view = null;
  $("detail").hidden = true;
  $("dash").inert = false;
  state.opener?.focus();
}

function renderDetail() {
  const view = state.view;
  if (!view) return;
  $("detail-tabs").replaceChildren(
    ...VIEWS.map(([id, label]) =>
      h("button", {
        type: "button",
        class: "dtab",
        "data-view": id,
        "aria-current": id === view ? "page" : undefined,
        text: label,
      }),
    ),
  );
  $("detail-title").textContent = VIEWS.find(([id]) => id === view)?.[1] ?? "Details";
  const body = $("detail-body");
  body.dataset.view = view;
  const views = {
    reading: detailReading,
    questions: detailQuestions,
    movements: detailMovements,
    steps: detailSteps,
    json: detailJson,
    vocabulary: detailVocabulary,
  };
  body.replaceChildren(...views[view]());
}

/** @param {string} title @param {(Node | string)[]} kids @param {string} [cls] */
const panel = (title, kids, cls = "") => h("section", { class: `pane ${cls}` }, [h("h3", { text: title }), ...kids]);

function detailReading() {
  const tape = /** @type {HTMLElement} */ ($("tape").cloneNode(true));
  tape.removeAttribute("id");
  return [
    h("div", { class: "split" }, [
      h("div", { class: "split-main" }, [
        panel("Annotated reading", [h("p", { class: "readback" }, [readback()]), legend()]),
        panel("Token trace", [h("div", { class: "tape-wrap" }, [tape])]),
      ]),
      panel("Inspector", inspector(), "inspector"),
    ]),
  ];
}

function legend() {
  return h("div", { class: "legend" }, [
    ...["terrain", "feature", "hold", "orientation", "position", "transition", "limb"].map(f =>
      h("span", { class: `key-chip f-${f}`, text: f }),
    ),
    h("span", { class: "key-chip k-unknown", text: "unknown" }),
    h("span", { class: "key-chip amb-key", text: "ambiguous" }),
    h("span", { class: "key-chip fz-key", text: "typo corrected" }),
  ]);
}

function detailQuestions() {
  const q = state.questions;
  if (!q) return [];
  /** @type {HTMLElement[]} */
  const out = [];
  out.push(
    panel(
      `Ambiguous (${q.ambiguous.length})`,
      q.ambiguous.length
        ? q.ambiguous.map(a =>
            h("div", { class: "q" }, [
              h("p", {}, ["Which ", h("b", { text: a.word }), " is meant here?"]),
              h(
                "div",
                { class: "actions" },
                a.options.map((o, i) =>
                  h("button", {
                    type: "button",
                    class: `pill f-${facetOf(o)}`,
                    "data-resolve": a.occ,
                    "data-option": i,
                    text: o.name,
                  }),
                ),
              ),
            ]),
          )
        : [h("p", { class: "empty", text: "None." })],
    ),
  );
  out.push(
    panel(
      `Contradictions (${q.issues.length})`,
      q.issues.length
        ? q.issues.map(i => h("p", { class: "q issue", text: i }))
        : [h("p", { class: "empty", text: "None." })],
    ),
  );
  out.push(
    panel(
      `Possible typos (${q.typos.length})`,
      q.typos.length
        ? q.typos.map(t => {
            const row = h("div", { class: "q typo" }, [
              h("p", {}, [h("b", { text: t.raw }), ` looks like ${t.guess}`, t.count > 1 ? `, ${t.count} times` : ""]),
            ]);
            const fix = h("button", { type: "button", class: "ghost", text: `Replace with “${t.guess}” in the text` });
            fix.addEventListener("click", () => replaceWord(t.word, /** @type {string} */ (t.guess)));
            const inspect = h("button", { type: "button", class: "ghost", "data-inspect": t.s, text: "Inspect" });
            row.append(h("div", { class: "actions" }, [fix, inspect]));
            return row;
          })
        : [h("p", { class: "empty", text: "None." })],
    ),
  );
  const picked = [...state.picked].filter(w => q.words.some(u => u.word === w));
  const cloud = h(
    "div",
    { class: "cloud", role: "group", "aria-label": "Unrecognised words" },
    q.words.map(u =>
      h(
        "button",
        {
          type: "button",
          class: "word",
          "aria-pressed": state.picked.has(u.word) ? "true" : "false",
          "data-pick": u.word,
        },
        [
          u.raw,
          u.guess ? h("span", { class: "guess", title: `Possible typo for ${u.guess}`, text: `${u.guess}?` }) : "",
          u.count > 1 ? h("span", { class: "times", text: `×${u.count}` }) : "",
        ],
      ),
    ),
  );
  const filler = h("button", {
    type: "button",
    class: "primary",
    disabled: !picked.length,
    text: picked.length ? `Mark ${picked.length} as filler` : "Mark as filler",
  });
  filler.addEventListener("click", () =>
    correct("/api/vocabulary/stop", { words: picked }, result => {
      state.picked.clear();
      const skipped = result.skipped?.length
        ? ` Skipped ${result.skipped.map((/** @type {{word: string}} */ x) => x.word).join(", ")}.`
        : "";
      return `Added ${result.added.length} stop word${result.added.length === 1 ? "" : "s"}.${skipped}`;
    }),
  );
  const ignore = h("button", {
    type: "button",
    class: "ghost",
    disabled: !picked.length,
    text: "Ignore in this session",
  });
  ignore.addEventListener("click", () => {
    for (const w of picked) state.ignored.add(w);
    state.picked.clear();
    run();
  });
  const allPicked = picked.length > 0 && picked.length === q.words.length;
  const all = h("button", { type: "button", class: "ghost", text: allPicked ? "Select none" : "Select all" });
  all.addEventListener("click", () => {
    if (allPicked) state.picked.clear();
    else for (const u of q.words) state.picked.add(u.word);
    renderDetail();
  });
  const teach = h("button", {
    type: "button",
    class: "ghost",
    disabled: picked.length !== 1,
    text: "Teach as a term…",
  });
  teach.addEventListener("click", () => {
    const u = q.words.find(x => x.word === picked[0]);
    if (u) inspectAt(u.s);
  });
  out.push(
    panel(
      `Unrecognised words (${q.words.length})`,
      q.words.length
        ? [
            h("p", {
              class: "note",
              text: "Select words that carry no meaning for the record, then mark them as filler. Filler becomes stop words in vocabulary/words.json.",
            }),
            cloud,
            h("div", { class: "bulk" }, [filler, ignore, teach, all]),
          ]
        : [h("p", { class: "empty", text: "None." })],
      "wide",
    ),
  );
  if (q.fuzzy.length)
    out.push(
      panel(
        `Typos corrected (${q.fuzzy.length})`,
        q.fuzzy.map(f => h("p", { class: "q info" }, ["Read ", h("b", { text: f.from }), ` as ${f.to}.`])),
      ),
    );
  return [h("div", { class: "pane-grid" }, out)];
}

/** @param {string} word @param {string} to */
function replaceWord(word, to) {
  const r = state.reading;
  if (!r) return;
  let text = beta.value;
  for (const u of [...r.unknown].reverse()) if (norm(u.raw) === word) text = text.slice(0, u.s) + to + text.slice(u.e);
  beta.value = text;
  run();
}

/** @param {number} s */
function inspectAt(s) {
  const i = state.reading?.trace.findIndex(t => t.s === s) ?? -1;
  state.selected = i >= 0 ? i : null;
  openDetail("reading");
  renderDashboard();
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
  const hold = holdText(c.hold);
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

/** @param {State} st @param {string} label */
function stateBlock(st, label) {
  const extras = [
    ...st.body.map(t => h("span", { class: "pill f-position", title: "Body level", text: t.name })),
    ...st.unplaced.map(u =>
      h("span", { class: "pill unplaced", title: "Side not settled" }, [
        `${u.part ?? "limb"}?`,
        u.hold ? ` ${holdText(u.hold)}` : "",
        u.techniques.length ? `, ${u.techniques.map(t => t.name.toLowerCase()).join(", ")}` : "",
      ]),
    ),
  ];
  return h("div", { class: "state" }, [
    h("span", { class: "state-label", text: label }),
    h(
      "div",
      { class: "limbs" },
      LIMBS.map(k => limbCell(k, st.limbs[k])),
    ),
    extras.length ? h("div", { class: "extras" }, extras) : "",
  ]);
}

/** @param {Term} t */
const pill = t => h("span", { class: `pill f-${facetOf(t)}`, title: `${t.id}: ${t.facets.join(", ")}`, text: t.name });

function detailMovements() {
  const rec = state.record;
  if (!rec) return [];
  const key = h("div", { class: "key" }, [
    h("span", {}, [prov("stated"), "stated"]),
    h("span", {}, [prov("implied"), "implied by the term"]),
    h("span", {}, [prov("inferred"), "inferred"]),
    h("span", {}, [h("span", { class: "hold inferred", text: "hold" }), "inferred hold"]),
  ]);
  const climb = h("div", { class: "climb" }, [
    h("span", { class: "state-label", text: "Terrain" }),
    ...(rec.terrain.length ? rec.terrain.map(pill) : [h("span", { class: "empty", text: "none" })]),
    h("span", { class: "state-label", text: "Features" }),
    ...(rec.features.length ? rec.features.map(pill) : [h("span", { class: "empty", text: "none" })]),
  ]);
  if (!rec.movements.length) return [climb, h("p", { class: "empty", text: "No movements yet." })];
  const list = h(
    "ol",
    { class: "movements" },
    rec.movements.map((m, i) => {
      const t = m.transition;
      const steps = m.steps.map(x => x + 1);
      const tr = t
        ? h("div", { class: "transition" }, [
            h("span", { class: "arrow", "aria-hidden": "true" }),
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
          h("span", { class: "mv-n", text: String(i + 1).padStart(2, "0") }),
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
  );
  return [climb, key, list];
}

function detailSteps() {
  const r = state.reading;
  if (!r) return [];
  if (!r.beats.length) return [h("p", { class: "empty", text: "No steps yet." })];
  return [
    h(
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
                    holdText(p.hold),
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
    ),
  ];
}

function detailJson() {
  const rec = state.record;
  if (!rec) return [];
  const json = JSON.stringify(
    rec,
    (_, v) => (v && typeof v === "object" && "facets" in v && "match" in v ? v.id : v),
    2,
  );
  const pre = h("pre", { class: "json" });
  for (const line of json.split("\n")) {
    const m = line.match(/^(\s*)("[^"]*")(:\s?)?(.*)$/);
    if (!m) {
      pre.append(`${line}\n`);
      continue;
    }
    const [, indent, first, colon, rest] = m;
    if (colon) {
      const comma = rest.endsWith(",");
      const lit = comma ? rest.slice(0, -1) : rest;
      const cls = /^"/.test(lit)
        ? "j-str"
        : /^-?\d/.test(lit)
          ? "j-num"
          : /^(true|false|null)$/.test(lit)
            ? "j-lit"
            : "";
      pre.append(
        indent,
        h("span", { class: "j-key", text: first }),
        colon,
        cls ? h("span", { class: cls, text: lit }) : lit,
        comma ? "," : "",
        "\n",
      );
    } else pre.append(indent, h("span", { class: "j-str", text: first }), rest, "\n");
  }
  return [pre];
}

function detailVocabulary() {
  const s = state.status;
  if (!s) return [];
  const lines = s.diff.split("\n").filter(l => l && !l.startsWith("index ") && !l.startsWith("diff --git"));
  const diff = h(
    "pre",
    { class: "diff" },
    lines.length
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
      : [h("span", { class: "d-ctx", text: "No uncommitted changes." })],
  );
  const n = state.ratings.length;
  /** @type {Record<string, number>} */
  const tagCounts = {};
  for (const r of state.ratings) for (const t of r.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const hist = [1, 2, 3, 4, 5].map(v => state.ratings.filter(r => r.score === v).length);
  const max = Math.max(1, ...hist);
  return [
    h("div", { class: "pane-grid" }, [
      panel(
        "Uncommitted vocabulary changes",
        [
          h("p", { class: "note", text: "Corrections are written to vocabulary/. Review and commit them with git." }),
          diff,
        ],
        "wide",
      ),
      panel(
        "This session",
        state.log.length
          ? [
              h(
                "ul",
                { class: "toplist" },
                state.log.map(l => h("li", { text: l })),
              ),
            ]
          : [h("p", { class: "empty", text: "No corrections yet." })],
      ),
      panel(`Ratings (${n})`, [
        h(
          "div",
          { class: "hist", role: "img", "aria-label": hist.map((c, i) => `${c} rated ${i + 1}`).join(", ") },
          hist.map((c, i) =>
            h("div", { class: "bar" }, [
              h("span", { style: `block-size:${(c / max) * 100}%` }),
              h("b", { text: String(i + 1) }),
              h("i", { text: String(c) }),
            ]),
          ),
        ),
        h(
          "dl",
          { class: "tag-counts" },
          Object.entries(TAGS).flatMap(([id, label]) => [
            h("dt", { text: label }),
            h("dd", { text: String(tagCounts[id] ?? 0) }),
          ]),
        ),
      ]),
    ]),
  ];
}

/** @param {Term} t */
function termCard(t) {
  const parent = t.parent ? state.vocabulary?.terms.find(x => x.id === t.parent) : null;
  /** @type {[string, string][]} */
  const rows = [
    ["id", t.id],
    ["facets", t.facets.join(", ")],
    ["region", t.region ?? "–"],
    ["part", t.part ?? "–"],
  ];
  if (t.side) rows.push(["side", t.side]);
  if (t.sameLimb) rows.push(["rule", "same limb as the previous move"]);
  if (t.sameHold) rows.push(["rule", "same hold as the other limb"]);
  if (parent) rows.push(["parent", parent.name]);
  return h("div", { class: `term-card f-${facetOf(t)}` }, [
    h("p", { class: "term-name", text: t.name }),
    h(
      "dl",
      { class: "props" },
      rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]),
    ),
    h("p", { class: "state-label", text: "Matches" }),
    h(
      "div",
      { class: "phrases" },
      t.match.length
        ? t.match.map(p => h("code", { text: p }))
        : [h("span", { class: "empty", text: "nothing (group term)" })],
    ),
  ]);
}

/** @param {(t: Term) => void} onPick @param {string} placeholder */
function termPicker(onPick, placeholder) {
  const input = /** @type {HTMLInputElement} */ (
    h("input", { type: "search", placeholder, "aria-label": placeholder, class: "search" })
  );
  const list = h("ul", { class: "results", role: "listbox", "aria-label": "Matching terms" });
  input.addEventListener("input", () => {
    const q = norm(input.value);
    const terms = state.vocabulary?.terms ?? [];
    const rank = (/** @type {Term} */ t) =>
      norm(t.name).startsWith(q)
        ? 0
        : t.id.startsWith(q)
          ? 1
          : t.match.some(m => norm(m).startsWith(q))
            ? 2
            : norm(t.name).includes(q)
              ? 3
              : 9;
    const hits = q
      ? terms
          .map(t => ({ t, r: rank(t) }))
          .filter(x => x.r < 9)
          .sort((a, b) => a.r - b.r)
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
          [h("span", { text: t.name }), h("span", { class: "mono dim", text: t.facets.join(", ") })],
        );
        b.addEventListener("click", () => onPick(t));
        return h("li", {}, [b]);
      }),
    );
  });
  return h("div", { class: "picker" }, [input, list]);
}

function inspector() {
  const r = state.reading;
  const i = state.selected;
  if (!r || i === null || !r.trace[i])
    return [
      h("p", {
        class: "empty",
        text: "Select a word in the reading or the token trace to see how it was read and correct it.",
      }),
    ];
  const t = r.trace[i];
  const span = spanOf(t);
  /** @type {(Node | string)[]} */
  const kids = [
    h("div", { class: "insp-head" }, [
      h("span", { class: `pill big k-${t.kind} f-${facetOfTrace(t)}`, text: t.text }),
      h("span", {
        class: "mono dim",
        text: `${KIND_LABEL[t.kind]}, characters ${t.s}–${t.e}, clause ${t.clause + 1}${t.key ? `, key “${t.key}”` : ""}`,
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
    const actions = h("div", { class: "insp-actions" });
    if (amb)
      actions.append(
        h("p", { class: "state-label", text: "Read it differently here" }),
        h(
          "div",
          { class: "actions" },
          amb.options.map((o, oi) =>
            h("button", {
              type: "button",
              class: `pill f-${facetOf(o)}`,
              "data-resolve": amb.occ,
              "data-option": oi,
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
          () => `${term.name} now matches “${raw}”.`,
        ),
      );
      actions.append(teach);
    }
    if (state.vocabulary?.terms.find(x => x.id === term.id)?.match.some(m => norm(m) === phrase)) {
      actions.append(
        h("p", { class: "state-label", text: `Move “${phrase}” to another term` }),
        termPicker(
          to =>
            correct(
              "/api/vocabulary/phrase",
              { action: "move", fromTermId: term.id, termId: to.id, phrase },
              () => `Moved “${phrase}” from ${term.name} to ${to.name}.`,
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
          () => `${term.name} no longer matches “${phrase}”.`,
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
    const row = h("div", { class: "actions" });
    if (t.guess) {
      const guess = t.guess;
      const use = h("button", { type: "button", class: "ghost", text: `Replace with “${guess}” in the text` });
      use.addEventListener("click", () => replaceWord(norm(t.text), guess));
      row.append(use);
    }
    const stop = h("button", { type: "button", class: "ghost", text: "Filler: add as a stop word" });
    stop.addEventListener("click", () =>
      correct("/api/vocabulary/stop", { words: [t.text] }, () => `“${norm(t.text)}” is now a stop word.`),
    );
    const ignore = h("button", { type: "button", class: "ghost", text: "Ignore in this session" });
    ignore.addEventListener("click", () => {
      state.ignored.add(norm(t.text));
      run();
    });
    row.append(stop, ignore);
    kids.push(
      h("div", { class: "insp-actions" }, [
        h("p", { class: "state-label", text: "This means…" }),
        h("label", { class: "field" }, [h("span", { text: "Phrase" }), phraseInput]),
        termPicker(
          to =>
            correct(
              "/api/vocabulary/phrase",
              { action: "add", termId: to.id, phrase: phraseInput.value },
              () => `${to.name} now matches “${norm(phraseInput.value)}”.`,
            ),
          "Search terms",
        ),
        row,
      ]),
    );
  } else {
    /** @type {Record<string, string>} */
    const explain = {
      limb: "A limb word. It sets the side or part for its step.",
      prep: `A role word. Holds after it are read as “${t.text}” holds until the next role word.`,
      crux: "Marks this step as the crux.",
      break: "Joins two things in one step, unless a move or a conflicting position follows, which starts a new step.",
      stop: "A stop word. It carries no meaning for the record.",
      split: "A step break.",
    };
    kids.push(h("p", { class: "note", text: explain[t.kind] ?? "" }));
  }
  return kids;
}

/* Rating */

function renderRatingForm() {
  $("score").replaceChildren(
    ...[1, 2, 3, 4, 5].map(n =>
      h("label", { class: "score-opt" }, [
        h("input", { type: "radio", name: "score", value: n, "aria-label": `Score ${n}` }),
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

function renderRatingHistory() {
  const n = state.ratings.length;
  $("rating-history").textContent = n
    ? `${n} saved, mean ${(state.ratings.reduce((a, r) => a + r.score, 0) / n).toFixed(1)}`
    : "none saved";
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

/* Wiring */

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
        state.picked.clear();
        state.selected = null;
        resetRating();
        run();
      });
      return b;
    }),
  );
  document.addEventListener("click", e => {
    const el = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (e.target).closest(
        "[data-i],[data-resolve],[data-open],[data-view],[data-pick],[data-inspect]",
      )
    );
    if (!el) return;
    const d = el.dataset;
    if (d.resolve) {
      state.resolutions.set(d.resolve, Number(d.option));
      run();
    } else if (d.open) openDetail(/** @type {View} */ (d.open), el);
    else if (d.view) {
      state.view = /** @type {View} */ (d.view);
      renderDetail();
      /** @type {HTMLElement | null} */ (document.querySelector(`#detail-tabs [data-view="${d.view}"]`))?.focus();
    } else if (d.pick) {
      const word = d.pick;
      if (state.picked.has(word)) state.picked.delete(word);
      else state.picked.add(word);
      renderDetail();
      /** @type {HTMLElement | null} */ (document.querySelector(`[data-pick="${CSS.escape(word)}"]`))?.focus();
    } else if (d.inspect) inspectAt(Number(d.inspect));
    else if (d.i) {
      state.selected = Number(d.i);
      if (state.view !== "reading") openDetail("reading", el);
      else renderDetail();
      renderDashboard();
    }
  });
  $("detail-close").addEventListener("click", closeDetail);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && state.view) closeDetail();
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
      renderRatingHistory();
      window.setTimeout(() => {
        $("rating-status").textContent = "";
      }, 2500);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), true);
    }
  });
}

async function start() {
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
