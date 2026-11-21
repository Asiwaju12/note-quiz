# Stage 7 — Integration readiness review

Date: 2026-11-20

## Scope

This stage is a read-only integration preflight. It does not push commits, change Supabase, alter Vercel project settings, move aliases, or deploy code.

## GitHub repository findings

Repository: `Asiwaju12/note-quiz`

Target branch: `supabase-integration`

The branch exists, but its current tree is still the original root-level React application:

- `index.html` loads `/main.tsx`.
- `main.tsx` imports the root `App.tsx`.
- `App.tsx` imports the original root-level game/auth modules.
- The branch's `package.json` is named `react-vite-tailwind` and has a different dependency set from this Recall Quiz redesign package.
- The branch's `vite.config.ts` aliases historical imports to the repository root.

The Stage 6 package has a different entry point and layout:

- `index.html` loads `/src/main.tsx`.
- The redesigned app is under `src/` and includes the account, cloud-sync, study, quiz, and planner modules.
- The prior UI is retained in `legacy/`, while shared game logic is retained under `src/lib/game/`.
- Its package manifest and lockfile are named `recall-quiz` and include the redesigned app's dependencies.

**Integration implication:** do not copy only `src/` into the branch. A safe integration commit must move the app entry point and matching package manifest/lockfile together, preserve the legacy source, and inspect any root-level files that would be replaced. Do not overwrite `main`.

The current target-branch commit observed through Vercel metadata is `b1502b626e4ac50d2be1298b6a347c4a18bab2ed`.

## Vercel findings

Project: `recall-quiz`

Project ID: `prj_ItWBDC9MD9j8hvo4U4n7uyih7L8v`

The alias `recall-quiz-study.vercel.app` currently resolves to deployment `dpl_6kTHrqjSWwerpSbJgNB247uD935j`, which is READY and was built from branch `supabase-integration` at commit `b1502b626e4ac50d2be1298b6a347c4a18bab2ed`.

That deployment's `target` is null (it is not marked as a production deployment). The project metadata reports `live: false`; its listed production project domain is `note-quiz-beige.vercel.app`. Therefore the requested `recall-quiz-study.vercel.app` alias is currently attached to a READY preview deployment rather than a production-target deployment.

**Integration implication:** preserve the existing alias and project. Do not promote, detach, reassign, or replace it until a reviewed preview of the redesigned app has passed build and live acceptance tests.

## Local validation

| Check | Result |
|---|---|
| Cloud-sync merge tests | 5 passed |
| TypeScript/TSX syntax transpilation | 92 files, 0 syntax errors |
| Browser/server source secret scan | No service-role or Anthropic secret literals found |
| Full TypeScript typecheck | Not verified; local dependency installation is incomplete |
| Production Vite build | Not verified; Vite is missing locally |
| Playwright E2E | Not run; Playwright/Vite are missing locally |
| Two-account Supabase isolation and PDF restore | Not live-tested |

The package manifest and lockfile root metadata agree. The local `node_modules` directory is incomplete and the npm cache is empty; a prior `npm ci` attempt timed out. This is an environment/install limitation, not proof that the lockfile is invalid.

## Required next steps before any push or deployment

1. Restore dependencies with a successful clean `npm ci` in a network-enabled build environment.
2. Run `npm run typecheck`, `npm run build`, and the Playwright desktop/mobile suites.
3. Resolve all build, type, and browser failures before preparing the integration commit.
4. Create the integration commit on `supabase-integration` only, preserving the original source in `legacy/` and retaining the existing Supabase schema/storage contract.
5. Allow Vercel to create a preview for that commit; test the preview before touching the existing alias.
6. Run the Account A / Account B PDF, metadata, text, deletion, and offline-retry acceptance tests.
7. Only after acceptance should the existing `recall-quiz-study.vercel.app` alias be considered for reassignment to the tested deployment.

## Changes made in Stage 7

Documentation only. No GitHub, Supabase, or Vercel resources were modified.
