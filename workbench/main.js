import { createInterpreter, facetOf, norm } from "../src/interpreter.js";
import { toMovements } from "../src/movements.js";
import { holdName, say, who } from "../src/say.js";
import { $, h } from "./dom.js";
import { groupQuestions } from "./questions.js";
import { confidence } from "./confidence.js";
import { drawLinks, renderGauge } from "./gauge.js";

/**
 * @typedef {import("../src/interpreter.js").Term} Term
 * @typedef {import("../src/interpreter.js").Vocabulary} Vocabulary
 * @typedef {import("../src/interpreter.js").Reading} Reading
 * @typedef {import("../src/interpreter.js").Trace} Trace
 * @typedef {import("../src/movements.js").State} State
 * @typedef {import("../src/movements.js").Contact} Contact
 * @typedef {ReturnType<typeof toMovements>} MovementRecord
 * @typedef {ReturnType<typeof groupQuestions>} Questions
 * @typedef {"dashboard" | "reading" | "questions" | "movements" | "steps" | "json" | "vocabulary"} View
 */

/** @type {[View, string][]} */
const VIEWS = [
  ["dashboard", "Dashboard"],
  ["reading", "Reading"],
  ["questions", "Questions"],
  ["movements", "Movements"],
  ["steps", "Steps"],
  ["json", "JSON"],
  ["vocabulary", "Vocabulary"],
];
const SPECTRUM = [
  "terrain",
  "feature",
  "hold",
  "orientation",
  "qualifier",
  "position",
  "transition",
  "limb",
  "filler",
  "unknown",
];
/** @type {Record<string, string>} */
const KIND_LABEL = {
  term: "term",
  limb: "limb",
  prep: "role",
  crux: "crux",
  break: "join",
  move: "move",
  qualifier: "qualifier",
  filler: "filler",
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
  /** @type {string[]} */ log: [],
  /** @type {{ sha: string, diff: string, changed: number } | null} */ status: null,
  /** @type {View} */ view: "dashboard",
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
}

/** @param {string} path @param {unknown} body @param {(result: any) => string} done */
async function correct(path, body, done) {
  try {
    const result = await api(path, body);
    const message = done(result);
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
  if (t.kind === "break") return "filler";
  if (t.kind === "move") return "transition";
  return t.kind;
}
/** @param {import("../src/interpreter.js").Hold | null} hold */
const holdText = hold => (hold ? holdName(hold) : "");

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
    inferred:
      contacts.filter(c => c?.side === "inferred" || c?.holdSource === "inferred").length +
      rec.movements.filter(m => m.transition?.side === "inferred").length,
  };
}

function run() {
  if (!state.interpreter) return;
  const reading = state.interpreter.parse(beta.value, { resolutions: state.resolutions, ignored: state.ignored });
  state.record = toMovements(reading);
  state.reading = reading;
  state.questions = groupQuestions(reading);
  if (state.selected !== null && !reading.trace[state.selected]) state.selected = null;
  renderDashboard();
  if (state.view !== "dashboard") renderDetail();
}

/* Dashboard */

function renderDashboard() {
  renderSysline();
  renderCore();
  renderStepsCard();
  renderSpectrum();
  renderQuestionsCard();
  renderMovementsCard();
  renderVocabCard();
  renderTape();
  linkCards();
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
  const q = state.questions;
  const m = metrics();
  if (!r || !rec || !q || !m) return;
  renderGauge(/** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("gauge"))), {
    recognised: m.tokens ? m.recognised : null,
    confidence: confidence(r, rec).score,
  });
  const lines = (state.status?.diff ?? "").split("\n");
  const changes = lines.filter(l => /^[+-](?![+-]{2})/.test(l)).length;
  const questions = q.total + q.unknown.length;
  /** @type {[string, number, boolean][]} */
  const stats = [
    ["s-movements", m.movements, false],
    ["s-steps", m.steps, false],
    ["s-tokens", m.tokens, false],
    ["s-questions", questions, questions > 0],
    ["s-vocab", changes, changes > 0],
  ];
  for (const [id, value, warn] of stats) {
    const el = $(id);
    el.textContent = String(value);
    el.parentElement?.classList.toggle("warn", warn);
  }
}

function linkCards() {
  if (state.view !== "dashboard") return;
  drawLinks(
    $("dash"),
    /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("links"))),
    /** @type {SVGSVGElement} */ (/** @type {unknown} */ ($("gauge"))),
  );
}

function renderSpectrum() {
  const r = state.reading;
  if (!r) return;
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(SPECTRUM.map(f => [f, 0]));
  for (const t of r.trace) if (t.kind !== "split") counts[legendKey(t)]++;
  $("c-spectrum").replaceChildren(
    h(
      "dl",
      { class: "facet-metrics" },
      SPECTRUM.map(f =>
        h("div", { class: `fm f-${f} k-${f}${counts[f] ? "" : " zero"}`, "data-facet": f }, [
          h("dd", { text: String(counts[f]) }),
          h("dt", {}, [h("i", { class: "sw" }), f]),
        ]),
      ),
    ),
  );
}

/** @param {Trace} t */
function legendKey(t) {
  const f = facetOfTrace(t);
  return SPECTRUM.includes(f) ? f : "filler";
}

/** @param {string | null} facet */
function lightFacet(facet) {
  for (const el of document.querySelectorAll("#c-spectrum .fm")) {
    const on = /** @type {HTMLElement} */ (el).dataset.facet === facet;
    el.classList.toggle("lit", on);
    el.classList.toggle("dim", facet !== null && !on);
  }
}

/** @param {import("../src/interpreter.js").Beat} b */
const unreadText = b => state.questions?.unread.find(u => u.clause === b.clause)?.text ?? "";

function renderStepsCard() {
  const r = state.reading;
  if (!r) return;
  const cruxAt = r.beats.findIndex(b => b.crux);
  const issues = r.beats.reduce((n, b) => n + b.issues.length, 0);
  $("c-steps").replaceChildren(
    h("dl", { class: "figures" }, [
      figure("Steps", r.beats.length),
      figure("Crux", cruxAt >= 0 ? `#${cruxAt + 1}` : "none"),
      figure("Contradictions", issues, issues > 0),
    ]),
    r.beats.length
      ? h(
          "ol",
          { class: "step-list" },
          r.beats.map((b, i) =>
            h("li", { class: `${b.crux ? "crux" : ""}${b.issues.length ? " has-issue" : ""}` }, [
              h("span", { class: "n", text: String(i + 1) }),
              b.unread
                ? h("span", { class: "say unread", text: `Unread: ${unreadText(b)}` })
                : h("span", { class: "say", text: say(b) }),
            ]),
          ),
        )
      : h("p", { class: "empty", text: "Steps appear here as the beta is read." }),
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
  for (const u of q.unread.slice(0, 2)) top.push(h("li", { class: "issue" }, ["Unread: ", h("b", { text: u.text })]));
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
      figure(
        rec.movements[cruxAt]?.cruxSource === "inferred" ? "Crux (inferred)" : "Crux",
        cruxAt >= 0 ? `#${cruxAt + 1}` : "none",
      ),
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

function readback() {
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
    if (t.kind === "split" || t.kind === "filler" || t.kind === "break") {
      frag.append(h("span", { class: `tok k-${t.kind}${sel}`, text: t.text }));
      return;
    }
    const span = spanOf(t);
    const cls = `tok k-${t.kind} f-${facetOfTrace(t)}${span?.ambiguous ? " amb" : ""}${t.fuzzy?.length ? " fz" : ""}${sel}`;
    const label = `${KIND_LABEL[t.kind]}${span?.term ? `: ${span.term.name}` : ""}`;
    frag.append(
      h("button", {
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

/** @param {View} view */
function setView(view) {
  const tabFocused = !!document.activeElement?.closest("#tabs");
  state.view = view;
  const dash = view === "dashboard";
  $("dash").hidden = !dash;
  $("detail").hidden = dash;
  renderTabs();
  if (dash) renderDashboard();
  else renderDetail();
  if (tabFocused) /** @type {HTMLElement | null} */ (document.querySelector(`#tabs [data-view="${view}"]`))?.focus();
}

function renderTabs() {
  $("tabs").replaceChildren(
    ...VIEWS.map(([id, label]) =>
      h("button", {
        type: "button",
        class: "dtab",
        "data-view": id,
        "aria-current": id === state.view ? "page" : undefined,
        text: label,
      }),
    ),
  );
}

function renderDetail() {
  const view = state.view;
  if (view === "dashboard") return;
  const body = $("detail-body");
  body.dataset.pane = view;
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
    ...["terrain", "feature", "hold", "orientation", "qualifier", "position", "transition", "limb"].map(f =>
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
      `Unread steps (${q.unread.length})`,
      q.unread.length
        ? q.unread.map(u =>
            h("p", {
              class: "q",
              text: `“${u.text}” has no words the interpreter knows. Teach them below or in the Reading tab.`,
            }),
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
  const teachButtons = TEACH.map((option, i) => {
    const b = h("button", {
      type: "button",
      class: i === 0 ? "primary" : "ghost",
      disabled: !picked.length,
      text: picked.length ? `Mark ${picked.length} as ${option.label}` : `Mark as ${option.label}`,
    });
    b.addEventListener("click", () => {
      state.picked.clear();
      teachWords(option, picked);
    });
    return b;
  });
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
              text: "Select words that carry no meaning for the record, then mark them as filler. Filler becomes filler words in vocabulary/words.json.",
            }),
            cloud,
            h("div", { class: "bulk" }, [...teachButtons, ignore, teach, all]),
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

/** @typedef {{ list: string, region?: string, label: string }} TeachOption */
/** @type {TeachOption[]} */
const TEACH = [
  { list: "filler", label: "filler" },
  { list: "qualifiers", label: "qualifier" },
  { list: "moves", region: "upper", label: "hand move" },
  { list: "moves", region: "lower", label: "foot move" },
  { list: "moves", region: "full", label: "full-body move" },
];

/** @param {TeachOption} option @param {string[]} items */
function teachWords(option, items) {
  return correct("/api/vocabulary/words", { list: option.list, region: option.region, words: items }, result => {
    const added = /** @type {string[]} */ (result.added ?? []);
    const skipped = /** @type {{ word: string, reason: string }[]} */ (result.skipped ?? []);
    const done = added.length
      ? added.length === 1
        ? `“${added[0]}” is now a ${option.label}.`
        : `Added ${added.length} words as ${option.label}.`
      : "Nothing added.";
    return skipped.length ? `${done} Skipped: ${skipped.map(x => x.reason).join(" ")}` : done;
  });
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
  setView("reading");
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
          m.crux ? h("span", { class: "crux-tag", text: m.cruxSource === "inferred" ? "Crux, inferred" : "Crux" }) : "",
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
          b.unread
            ? h("p", { class: "say unread", text: `Not read: “${unreadText(b)}”. Teach its words in the Reading tab.` })
            : h("p", { class: "say", text: say(b) }),
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
    const teachButtons = TEACH.map(option => {
      const b = h("button", { type: "button", class: "ghost", text: `Mark as ${option.label}` });
      b.addEventListener("click", () => teachWords(option, [t.text]));
      return b;
    });
    const ignore = h("button", { type: "button", class: "ghost", text: "Ignore in this session" });
    ignore.addEventListener("click", () => {
      state.ignored.add(norm(t.text));
      run();
    });
    row.append(...teachButtons, ignore);
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
      move: "A move word with no named technique. It says which part of the body moves; the holds after it are where it goes.",
      qualifier: "A qualifier. It describes the hold that follows it.",
      prep: `A role word. Holds after it are read as “${t.text}” holds until the next role word.`,
      crux: "Marks this step as the crux.",
      break: "Joins two things in one step, unless a move or a conflicting position follows, which starts a new step.",
      filler: "A filler word. It carries no meaning for the record.",
      split: "A step break.",
    };
    kids.push(h("p", { class: "note", text: explain[t.kind] ?? "" }));
  }
  return kids;
}

/* Wiring */

function wire() {
  beta.addEventListener("input", () => {
    state.resolutions.clear();
    run();
  });
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
    } else if (d.open) setView(/** @type {View} */ (d.open));
    else if (d.view) setView(/** @type {View} */ (d.view));
    else if (d.pick) {
      const word = d.pick;
      if (state.picked.has(word)) state.picked.delete(word);
      else state.picked.add(word);
      renderDetail();
      /** @type {HTMLElement | null} */ (document.querySelector(`[data-pick="${CSS.escape(word)}"]`))?.focus();
    } else if (d.inspect) inspectAt(Number(d.inspect));
    else if (d.i) {
      state.selected = Number(d.i);
      if (state.view !== "reading") setView("reading");
      else renderDetail();
    }
  });
  /** @param {Event} e */
  const hover = e => {
    const el = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest?.("[data-i]") ?? null);
    const t = el ? state.reading?.trace[Number(el.dataset.i)] : undefined;
    lightFacet(t && t.kind !== "split" ? legendKey(t) : null);
  };
  for (const type of ["mouseover", "focusin"]) document.addEventListener(type, hover);
  for (const type of ["mouseleave", "focusout"]) $("tape").addEventListener(type, () => lightFacet(null));
}

async function start() {
  renderTabs();
  new ResizeObserver(linkCards).observe($("dash"));
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
  run();
}

start();
