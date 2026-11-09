# Aviva's Crafts: project notes for Claude

The global Spec Kit coordinator workflow (`~/.claude/CLAUDE.md`) applies. This file adds what is
specific to this project. The binding rules are in `.specify/memory/constitution.md`.

## Where things are

- Vision: `PRODUCT.md`. Order of work: `docs/roadmap.md`.
- Living design docs, updated by the feature that changes them: `docs/data-model.md`,
  `docs/contracts/`, `docs/design/storefront.md`.
- `specs/001-online-crafts-shop/` is frozen (the MVP record). Read it for decisions already made
  (spec FRs, `plan.md`, `research.md`); never edit it. Exception: tick T087 once CI passes the
  bundle-size E2E test.

## Branches and git

- `main` = production, `dev` = integration. Feature branches `NNN-short-name` come from `dev`.
- Before `/speckit-specify`: switch to `dev` and `git pull --ff-only`. If the working tree has
  uncommitted changes, stop and ask me first. Spec Kit creates the feature branch from the current
  branch.
- I do all commits, pushes, pull requests and merges. Never commit, push, open or merge a pull
  request, create other branches, or tag. Never force-push or rewrite `dev` or `main`.
- At the Phase D gate, also suggest a commit message (conventional, e.g. `feat: …`, with no
  Co-Authored-By lines) and a short pull request description for me to use.
- Merges: feature → `dev` is a squash merge; `dev` → `main` is a merge commit plus a version tag
  (`v0.x.y` until launch).
- At the end of a feature, update the item's status in `docs/roadmap.md` in the same branch.

## CI

- `.github/workflows/ci.yml` runs on pull requests into `dev` and `main`, on pushes to `main`, and
  by hand. Its jobs run in parallel and must all pass before a merge: `checks` (types, lint, CSS,
  unit + integration tests, audit), `test-pg` (real PostgreSQL), and `e2e` split per Playwright
  project (`chromium-desktop` + `consent`, `chromium-mobile` in two shards, `webkit-mobile`). A new
  Playwright project needs a matrix entry there. Specs choose their projects with `test.skip`
  (e.g. cart, checkout and admin screens run on the phone projects only).
- `pnpm verify` locally runs the same checks as `checks` + `test-pg`. Use `pnpm run audit`, not
  `pnpm audit`: the built-in command ignores the script's `--audit-level=high`.
- Long E2E runs often hang on this machine (16 GB RAM, full swap). Run single spec files locally;
  leave the full E2E run to CI.

## Local ports

- Dev server 3001 (3000 belongs to another project), E2E 3100/3101 (`E2E_PORT`/`CONSENT_PORT`),
  mock OIDC 4011.
