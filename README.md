# Recall Quiz

**Recall Quiz** is an AI-assisted study workspace for turning course material into revision resources, practising questions, tracking progress, and studying with other learners.

The project is a React 19 + TypeScript + Vite application. It uses Supabase for authentication, account data and realtime social features, and Vercel for hosting and server-side AI endpoints.

> **Integration status (26 November 2026):** The current development work is on `recall-quiz-redesign-integration`. Supabase account/cloud-sync and the new social/multiplayer database functions have been connected. The latest Vercel preview attempts are failing during resource provisioning, before build logs are produced. The multiplayer and messaging experience therefore still needs a successful preview deployment and end-to-end testing. The production site and `main` branch have not been changed by this work.

## What Recall Quiz includes

### Study workspace
- Import and organise study materials.
- PDF reading tools including page navigation, zoom, text search, bookmarks, highlights, notes and saved reading position.
- Extract and work with document text.
- Create summaries, revision notes, key terms, study guides, flashcards and practice questions.
- Basic Mode creates study material from extracted document content without calling an AI model. It is designed to remain useful when AI is unavailable.

### Quizzes and learning
- Practice questions with explanations and answer review.
- Multiple-choice, true/false, fill-in-the-blank and short-answer question formats where supported by the selected activity.
- Timed Exam Mode, question navigation, flags, review and results.
- Flashcards with FSRS spaced-repetition scheduling.
- Study progress, weak-topic insights, recommendations, achievements, streaks and daily challenges.
- Study planning and revision goals.

### Recall AI
Recall AI is the in-app study tutor and AI generation service.

- The server-side AI integration currently uses Google Gemini.
- Chat supports tutor-style explanations and document-aware context with page references.
- Generation supports summaries, notes, key terms, study guides, flashcards, questions and study plans.
- API keys stay on the server; do not put provider secrets in `VITE_*` variables or commit them.
- AI requests can be limited by provider quotas or billing settings. When AI is unavailable, Basic Mode remains available and is clearly separate from AI-generated output.

See [AI and environment setup](docs/INTEGRATION.md#1-environment-variables) for configuration.

### Friends and live multiplayer
The integration branch adds:
- Student search using profile display names and handles.
- Friend requests and private direct messages.
- Live study rooms that use a saved deck and a six-character room code.
- A live-competition format: all players see the same question in the same round, answer independently before the shared timer expires, and earn points for correct answers with a speed bonus.
- A room leaderboard and host-controlled progression between questions.

The multiplayer backend uses Supabase RPC functions for authoritative room state and scoring, plus private Supabase Realtime channels. Treat these features as **in development until the preview deployment and multi-account tests pass**.

## Technology

| Area | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7 |
| Styling and motion | Tailwind CSS 4, Motion |
| Routing | React Router 7 |
| Study files | PDF.js, Mammoth, JSZip, SheetJS, Tesseract.js |
| Spaced repetition | ts-fsrs |
| Authentication and database | Supabase Auth, Postgres, Row Level Security |
| Live updates | Supabase Realtime |
| AI | Google Gemini, called from server-side API handlers |
| Hosting | Vercel |

## Repository structure

```text
api/ai/                 Server-side AI status, chat and generation endpoints
server/ai/              Gemini provider, prompts, schemas and request handling
src/app/                App root, routing, account context
src/pages/              Route-level screens, including Multiplayer and Messages
src/components/         Shared UI, navigation, study and quiz components
src/data/               Local data models, repositories and cloud sync
src/lib/                Study ingestion, quiz logic, learning and spaced repetition
src/services/           Supabase authentication and data access
supabase/migrations/    Additive database migrations
docs/                   Integration notes and proposed schema reference
tests/                  Browser and service-level tests
```

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Useful checks:

```bash
npm run typecheck
npm run build
npm run test:e2e
npm run test:e2e:mobile
npm run test:cloud-sync
```

The browser tests use Playwright. If Chromium is not installed in the environment, install it with:

```bash
npx playwright install chromium
```

## Environment configuration

Create a local `.env.local` file. Never commit it.

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser build | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser build | Supabase publishable/anon key; never use the service-role key |
| `GEMINI_API_KEY` | Server only | Enables Recall AI |
| `AI_MODEL` | Server, optional | Gemini model override |
| `AI_REQUIRE_AUTH` | Server, optional | Require a valid signed-in user for AI routes |
| `SUPABASE_URL` | Server, when auth verification is enabled | Supabase URL used by server auth checks |
| `SUPABASE_PUBLISHABLE_KEY` | Server, when auth verification is enabled | Public key used by server auth checks |

Vercel environment variables must be set separately for Preview and Production as appropriate. Only public Supabase configuration belongs in `VITE_*` variables.

## Supabase and data

- Authentication uses the existing Supabase Auth integration.
- Row Level Security protects user-owned records.
- The cloud-sync layer keeps IndexedDB as the local working store and syncs account data to Supabase.
- Uploaded private documents use the configured Supabase Storage bucket.
- Social and multiplayer migrations are additive; they extend the existing project rather than replacing its tables.

Read [docs/INTEGRATION.md](docs/INTEGRATION.md) before changing backend configuration. The SQL in [docs/SUPABASE_SCHEMA.sql](docs/SUPABASE_SCHEMA.sql) is a reference/proposal and is **not** a migration to run wholesale against the existing project.

## Development and release workflow

- Continue work on `recall-quiz-redesign-integration`.
- Do not push experimental work directly to `main`.
- Verify typecheck, build and browser tests before promoting a release.
- Test multiplayer with at least two separate signed-in accounts.
- Do not promote a failed or unverified preview to the production domain.

The production website is managed separately from this development branch. A successful preview and explicit release verification are required before changing production.
