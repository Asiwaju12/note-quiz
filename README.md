# Recall Quiz

An AI-powered study companion: upload lecture PDFs, get summaries and revision notes, practise with flashcards (spaced repetition) and quizzes, sit timed exams, plan revision, and ask **Recall AI** when you're stuck.

> **Status:** the app runs fully in the browser in **Local mode**. It is **not** connected to Supabase, Vercel or GitHub, and Recall AI needs an API key on the server. See [docs/INTEGRATION.md](docs/INTEGRATION.md) for exactly what remains to be connected.

## Run locally

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The `/api/*` serverless functions run inside the Vite dev server, so AI works locally too once a key is set.

To enable Recall AI locally, create `.env.local`:

```bash
cp .env.example .env.local
```

Then set `ANTHROPIC_API_KEY` in `.env.local` and restart `npm run dev`.

Other scripts:

```bash
npm run typecheck
```

```bash
npm run build
```

## What works today (no backend needed)

| Area | Status |
|---|---|
| Redesigned UI, light/dark theme, mobile bottom nav, animations, reduced-motion | ✅ |
| Study Centre: PDF upload, validation (PDF ≤ 50 MB), subjects/folders, search, rename, move, delete | ✅ stored in this browser (IndexedDB) |
| PDF viewer: page nav, zoom, text search, bookmarks, highlights, page notes, saved position | ✅ |
| Summary / notes / key terms / study guide / flashcards / practice questions | ✅ **Basic mode** (offline extraction); ✅ **AI mode** when a key is set |
| Practice quizzes (MCQ, true/false, fill-the-blank, short answer), explanations, review, resume | ✅ |
| Original arcade game, Daily Drop, high scores, notes→quiz parser, file import (PDF/DOCX/photo OCR) | ✅ preserved |
| Flashcards with FSRS spaced repetition, swipe & 3D flip | ✅ |
| Exam Mode (timer, flags, navigation, review, results, history) | ✅ |
| Weak-topic detection, recommendations, analytics, achievements, streaks, daily challenges | ✅ from real activity only |
| Study planner (goals, rule-based schedule, editable) | ✅; AI schedule when key is set |
| Recall AI chat (streaming, learning modes, document-aware with page citations) | ⚠️ built; needs `ANTHROPIC_API_KEY` |
| Accounts, cloud sync, shared Daily Drop board | ⚠️ original Supabase code kept; needs Supabase env vars + schema |

"Basic mode" never pretends to be AI: it only extracts sentences, definitions and headings already in your document, and is labelled as such everywhere.

## Architecture

```
api/ai/               Serverless functions (Vercel-style Web handlers)
  status.ts             GET  — is AI configured? (no secrets)
  chat.ts               POST — streams tutor replies (NDJSON)
  generate.ts           POST — structured JSON study material
server/               Server-only code (never bundled for the browser)
  ai/provider.ts        Anthropic client, model/effort config, error mapping
  ai/prompts.ts         System prompts + JSON schemas
  http.ts               body limits, optional auth check, rate limiting, streaming
src/
  app/                  App root, routing, account context, background watchers
  pages/                One file per route (lazy-loaded)
  components/
    ui/                 Design-system primitives (Button, Modal/sheet, Tabs, Toast…)
    layout/             App shell (sidebar / bottom nav), auth, onboarding
    study/              Document workspace panels, PDF viewer, generation jobs
    quiz/               Arcade game (original), practice runner, results, boards
    flashcards/         Flashcard study + card management
    ai/                 Recall AI chat
  data/                 models.ts, db.ts (local store), repos.ts (all reads/writes), settings.ts
  lib/
    game/               Original game logic (types, parser, deck, daily, storage, sound, files)
    study/              PDF (pdf.js), ingestion, chunking + BM25 retrieval, basic-mode generators
    learning/           Grading, insights, achievements, challenges, planner
    srs/                FSRS wrapper (ts-fsrs)
    ai/contract.ts      Shared client/server request & stream types
  services/             Supabase (original), cloud sync (original), AI client
docs/                   SUPABASE_SCHEMA.sql, INTEGRATION.md
tests/                  e2e walkthrough, Anthropic API mock, test PDF
legacy/                 Superseded original UI components, kept for reference (not built)
```

Data flows **UI → `src/data/repos.ts` → `src/data/db.ts`**. Replacing `db.ts`-backed repos with Supabase calls is the integration seam; pages never touch storage directly.

## Testing

The e2e suite drives the real app with Playwright (onboarding, PDF upload, every workspace tab, practice, arcade, Daily Drop, exam, review, planner, progress, theme, persistence) and checks for console errors and horizontal overflow.

```bash
npm run dev
```

In a second terminal:

```bash
npm run test:e2e
```

```bash
npm run test:e2e:mobile
```

To test the AI pipeline without a real key, start the mock and a second dev server pointed at it:

```bash
node tests/mock-anthropic.mjs
```

```bash
ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npx vite --port 5174
```

```bash
BASE=http://localhost:5174 AI=1 LABEL=ai node tests/e2e.cjs
```

The mock verifies plumbing (streaming, structured output, citations), not answer quality. If Playwright can't find a browser, run `npx playwright install chromium`.
