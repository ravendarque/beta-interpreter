# Beta interpreter

Turns climbing beta written as free text into a structured record, using a finite movement taxonomy. It is rule-based: no language model, no network, no download.

The text is the source of truth. Corrections edit the text, and the record is always rebuilt from it.

Status: early research and development. See `PLAN.md`.

## Using it

Each release is published to GitHub Packages as `@ravendarque/beta-interpreter`, and its packed tarball is attached to the GitHub Release.

```js
import { parse, say, toMovements } from "@ravendarque/beta-interpreter";

const reading = parse("left hand on the crimp, then fire up for the hero jug");
reading.beats.map(say); // ["Left hand: on a crimp.", "Fire up to a jug."]
toMovements(reading).movements; // start state, transition and end state for each movement
```

Installing from GitHub Packages needs a token with `read:packages`, even though the package is public. The release tarball's URL needs no token, but pins one version.

## Releasing

Every PR carries one release label, checked in CI:

- `release: major`: a breaking change to the API or the record. Before 1.0, breaking changes go in a minor.
- `release: minor`: new capability, or a parser change that alters readings.
- `release: patch`: vocabulary additions and bug fixes.
- `release: none`: workbench, tests, docs and CI only. Every changed file must be on the allowlist in `.github/workflows/require-release-label.yml`.

Merging a PR with a release label tags the merge commit with the next version, creates a GitHub Release with the packed package attached, and publishes it to GitHub Packages. The version lives in the tag; `package.json` keeps the placeholder `0.0.0`.

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

`pnpm workbench` starts the local R&D workbench at http://localhost:5174. Paste a beta to see how it reads and correct the vocabulary in place. Corrections are written to `vocabulary/`, so review them with `git diff` before committing.

The vocabulary lives in `vocabulary/terms.json` (taxonomy terms) and `vocabulary/words.json` (limbs, prepositions, crux markers, stop words and step breaks). Changing the interpreter's vocabulary means changing those files, not the code.
