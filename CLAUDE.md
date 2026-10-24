# Beta interpreter

Outstanding work, open questions and decisions live in the GitHub issues, not in a plan file. The design decisions are in `README.md`.

## Where this came from

This project branched off from a Climbing Logbook (CL) session on 2026-10-23. CL is at `/home/raven/git/ravendarque/climbing-logbook`. CL's own `CLAUDE.md`, `docs/coding-standards.md` and memory don't load here. Read them only when working on CL integration.

## Working rules carried over from CL

- **Decision IDs:** give every question or decision for Raven a numbered ID. Never reuse an ID. CL used up to 37, so start at 38.
- **Spelling:** British English in copy, docs and replies. Code identifiers stay as they are.
- **Comments:** none in code by default. Allow one line only for a rare "why".
- **Scope:** change only what Raven asks. Ask before widening the scope or rewording approved text.
- **Verification:** verify before claiming something works, and report failures and skipped steps plainly. Never call a failing test "flaky".
- **Claude-written docs:** treat their claims as unverified, including this file.
- **Public or irreversible actions:** ask before anything public, costly or irreversible.
- **Git:** never force-push without asking. Use issues and PRs, with no direct commits to `main`.
- **Dependencies:** latest stable by default. New releases are only usable after three days.
- **Data:** never scrape sites that block bots.
- **Brands:** never name or recommend BDS-listed brands.
