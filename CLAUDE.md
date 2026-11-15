# Aviva's Crafts: project notes for Claude

The global Spec Kit coordinator workflow (`~/.claude/CLAUDE.md`) applies. This file adds what is
specific to this project. The binding rules are in `.specify/memory/constitution.md`.

## Where things are

- Vision: `PRODUCT.md`. Order of work: `docs/roadmap.md`.
- Each feature's plan writes its own `data-model.md` and `contracts/` (Spec Kit's convention) for
  what it adds or changes. The whole data model's source of truth is the Drizzle schema in
  `src/server/db/schema/`.
- Design system, binding for every feature: `docs/design/storefront.md`. Plans and tasks cite its
  sections; a feature that changes the design updates it.
- `specs/001-online-crafts-shop/` is frozen (the MVP record). Read it for decisions already made
  (spec FRs, `plan.md`, `research.md`); never edit it.
- Launch and operations (feature 006): `docs/launch-checklist.md` (account-side steps, in order),
  `docs/owner-guide-he.md` (Hebrew guide for the owner), `docs/security/threat-model.md`,
  `ops/backup/README.md` (backups and restore), `render.yaml` (the Render Blueprint). Production
  runs with `PAYMENT_PROVIDER=none` (offline payment only); card payment comes later.

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
  mock OIDC 4011 for dev and 4012 for E2E (`OIDC_PORT`). E2E uses its own mock-user file
  (`tests/fixtures/oidc/user.e2e.json`), so E2E runs no longer clash with a running `pnpm dev`.
