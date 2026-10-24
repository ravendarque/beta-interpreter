# Beta interpreter

Turns climbing beta written as free text into a structured record, using a finite movement taxonomy. It is rule-based: no language model, no network, no download.

The text is the source of truth. Corrections edit the text, and the record is always rebuilt from it.

Status: early research and development. Outstanding work and open questions are tracked in the [issues](https://github.com/ravendarque/beta-interpreter/issues).

## Design decisions

- **Rules first, no language model.** The vocabulary is finite. Rules are instant, work offline, can be explained and need no download, which matters at the crag. A small model could be added later as a fallback, but only where real beta shows the rules falling short.
- **The vocabulary is data, not code.** Teaching the interpreter means reviewed changes to `vocabulary/`.
- **A flat, faceted taxonomy.** Terms overlap rather than forming a tree: a crimp is both a hold and a grip, and compression applies to hands and legs. Each term has facets, a body region and part, and the phrases it matches.
- **Movements, not just steps.** Each movement has a start state, a transition and an end state, with each limb's side and hold marked as stated, implied or inferred.
- **A package for Climbing Logbook.** Climbing Logbook will use it as a versioned package, not a submodule.

## Licence

Source-available under the [Beta Interpreter Noncommercial Licence](LICENSE.md). It is not an open-source licence: commercial use is not permitted.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm workbench
```

`pnpm workbench` starts the local R&D workbench at http://localhost:5174. Paste a beta to see how it reads, rate the reading, and correct the vocabulary in place. Corrections are written to `vocabulary/`, so review them with `git diff` before committing. Ratings go to `workbench/data/`, which git ignores, and never include the beta's text.

The vocabulary lives in `vocabulary/terms.json` (taxonomy terms) and `vocabulary/words.json` (limbs, prepositions, crux markers, stop words and step breaks). Changing the interpreter's vocabulary means changing those files, not the code.
