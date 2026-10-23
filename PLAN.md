# Beta interpreter: plan

Status: parked on 2026-10-23, to be picked up later. This is an R&D side project that spun out of Climbing Logbook's (CL) movement taxonomy discussion. Nothing in this folder is a git repo yet.

## What it is

A beta interpreter takes climbing beta written as free text and turns it into a structured record using a finite movement taxonomy. The text is the source of truth: corrections edit the text, and the record is always rebuilt from it.

- **Live prototype:** https://claude.ai/artifact/CtHoQbQXZgS4czAYMRVWid. The source is `prototype/beta-interpreter.html`.
- **Earlier mockups (rejected):** https://claude.ai/artifact/3qN145tH1ooHK2z2gxy7mm. These were a sentence builder and a body map. The sentence builder produced nonsense because it forced one grammar onto every move. The body map may be reused for the visualiser.
- **Taxonomy source:** Raven's xmind mind map, whose top-level groups are Terrain, Features, Holds, Hold Orientation, Positions (upper, lower and full body) and Transitions (upper, lower and full body). Ask Raven for the file; the copy isn't saved here.
- **Test harness:** `prototype/harness.mjs` runs the parser over the sample betas in Node. First extract the script into `bi.js` with: `sed -n '/<script>/,/<\/script>/p' beta-interpreter.html | sed '1d;$d' > bi.js`.

### How the prototype works

- It's a rule-based parser of about 200 lines, with no LLM.
- It reads phrases by longest match against a lexicon of terms with synonyms, and copes with plurals and -ed/-ing endings.
- It corrects clear typos automatically (edit distance 1 for words of 5 or more letters, 2 for 8 or more). Anything less certain gets a "did you mean" question.
- It recognises limb words (`lh`, `right foot` and so on), prepositions that set a hold's role (from/off → start, to/onto → target, on/in/with → on) and crux markers.
- It splits the beta into steps on punctuation, on "then", and on "and" when a move follows it.
- When a word has more than one meaning (compression, jam, chimney), it narrows it down by limb. If it still can't decide, it asks a one-tap question.
- It flags contradictions, such as "left hand heel hook".
- It reads each step back as a tidy sentence.

### Known weaknesses in the prototype

- The synonyms are Claude's guesses. Real betas are needed to check them.
- Treating "and" as a step break when a move follows it has only been checked against the six samples.
- It doesn't work out which hand is on which hold unless the beta says so.
- Steps are flat lists, not Movements yet (see the data model below).
- The suggestion links between terms and the usage counts in the mockups were invented.

### What the six sample betas produced

Output from `harness.mjs`:

| Sample | Result |
|---|---|
| Steep | Correct. The crux was marked, and "slopey pinch" was combined into a single hold. |
| Slab | Correct. |
| Crack | Correct. "heel-toe" was read as cam. |
| Messy | Read "slopper" as sloper automatically. Asked about hok→hook, jugg→jug and bump→jump. |
| Ambiguous | Asked about compression and jam. |
| Contradiction | Flagged "left hand heel hook". |

### Taxonomy notes

- The clusters overlap and aren't a tree. Sidepull, Undercling and Gaston are both orientations and hand uses. Crimp is both a hold and a grip. Slot and Pebble are both features and holds. Compression and Jam apply to hands and legs. Chimney is terrain, a feature and a move.
- The model is a flat set of terms. Each term has facets, a body part, synonyms and "often with" links.
- **Gaps added as "new" terms:** deadpoint, lock-off, match and drop knee. Still undecided: dyno versus jump, and layaway versus layback.
- **Typos in the mind map:** "Ouside edge", "Guppie", "Arete".

## Decisions so far

- **Own repo,** used by CL as a versioned **package, not a submodule**. Still open (decision 26): the repo name and whether it's private (Claude suggested a private `beta-interpreter`), plus a licence if it goes public.
- **Rules first, no LLM.** The vocabulary is finite. Rules are instant, work offline, can be explained and need no download, and CL users are often on slow connections at the crag. A small model can be added later as a fallback, but only where real betas show the rules falling short.
- **The vocabulary is a data file, not code.** "Training" means reviewed changes to that file.

## Data model (CL movement trend analysis)

A movement has a start state, a transition and an end state. Sequences of movements come later.

```
Movement { start: State, transition: Transition, end: State }
State    { limbs: { lh|rh|lf|rf: { hold?, orientation?, technique? } }, body?: [drop knee, compression, …] }
```

- States will always be partial, because real beta names one or two limbs. Trend analysis has to work on whatever facets are present.
- The parser's start/target roles map to the start and end states.
- Carrying the limbs not mentioned over from the previous movement belongs to the sequence step, which comes later.
- **Open (decision 28):** Raven to list 3–5 trend questions for CL. They decide which facets must be captured reliably.

## Real beta for tuning: nothing is kept

Real beta is used only to tune vocabulary and check how accurately the interpreter reads it. Each beta is discarded once it has been processed.

- **Reddit (preferred):** use the official Data API, non-commercially, and keep nothing. Read the current Data API Terms and Developer Terms first, including any clause on machine-learning training. A rule-based parser probably doesn't count as ML training.
- **UKC:** its terms ban scraping and data mining, whatever happens to the data afterwards. Raven can paste the odd beta by hand while browsing; systematic or automated collection is not allowed. Another option is to email UKC asking for a research sample (decision 32).
- **OpenBeta:** checked by Raven. It has topo descriptions only, not beta.
- **Consented requests (decision 29):** ask the community openly ("describe your project's crux") for an open parser.
- **Keep two stores apart (decision 31):**
  - The vocabulary (terms and synonyms) can come from anything Raven may read.
  - Regression tests are **paraphrases Raven writes**, never source text.
- About 200–500 real betas should be enough (decision 30).

## Workbench (local R&D tool)

1. **Try:** paste a beta, or fetch one through the Reddit API, and see the read-back and record live.
2. **Rate:** an overall 1–5 score, plus error tags: wrong limb, wrong role, bad step split, missed term, false match, nonsense output.
3. **Correct in place:** tap a highlighted word to fix its reading, or an unhighlighted word to say "this means X". Each correction becomes a proposed change to the vocabulary file or the rules, which Raven reviews and commits.
4. **Save:** saving asks for a paraphrased test case, or uses the corrected record as the expected output. The source text is then discarded.
5. **Evolution loop:**
   - A regression suite scored by facet (limb, move, hold, role, step splitting).
   - A side-by-side comparison of the current and candidate versions.
   - A scoreboard of ratings and error tags over time.
   - A coverage map of taxonomy terms that never appear and unknown words that keep coming up.
   - Fuzzing with generated betas, including deliberately messy ones.
6. The feedback log (paraphrases only) is labelled data in case a model fallback is ever added.

## Visualiser (R&D, decision 27)

Draw the start and end states on the body map figure from the earlier mockup, and animate between them for the transition. The alternative is a wall view with holds drawn as glyphs.

## Build order

1. Create the repo. Move the lexicon into a data file. Turn the prototype parser into a module with tests, built from paraphrased versions of the six sample betas.
2. Change the record's output to the Movement shape: start, transition and end.
3. Workbench: try, rate and correct.
4. Regression suite and side-by-side comparison.
5. Reddit API fetching, scoreboard, coverage map and fuzzing.
6. Visualiser.
7. CL integration as a package. This needs a CL issue first and follows CL's normal workflow.

## Open questions for Raven

- 22: should the taxonomy become a faceted dataset first? (Raised in CL; the answer is probably yes, as part of build step 1.)
- 24: should CL's "hardest move" field become "what defined it"?
- 26: the repo name, whether it's private, and the licence.
- 28: CL's trend questions.
- 29 and 32: the community request and the email to UKC.
