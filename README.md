# Beta interpreter

Turns climbing beta written as free text into a structured record, using a finite movement taxonomy. It is rule-based: no language model, no network, no download.

The text is the source of truth. Corrections edit the text, and the record is always rebuilt from it.

Status: early research and development. See `PLAN.md`.

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
