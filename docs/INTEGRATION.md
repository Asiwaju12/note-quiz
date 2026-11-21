# Integration guide — what's connected and what isn't

This source package includes the Supabase authentication client and an initial account-scoped cloud-sync layer. The sync layer is not live until the additive SQL migration is applied and this source is deployed with the existing Supabase environment variables. The existing live deployment is not changed by this package.

## 1. Environment variables

| Variable | Where | Required for |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Accounts, cloud sync, shared Daily Drop |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | same — publishable/anon key only, **never** the service-role key |
| `ANTHROPIC_API_KEY` | server only | Recall AI chat + AI generation |
| `AI_MODEL` | server, optional | defaults to `claude-opus-5-5` |
| `AI_CHAT_EFFORT` / `AI_GENERATE_EFFORT` | server, optional | defaults `medium` / `high` |
| `AI_FALLBACKS` | server, optional | `on` (default) sends Anthropic's server-side refusal fallback (`fallbacks: "default"`); `off` disables it |
| `AI_REQUIRE_AUTH` | server, optional | `true` = AI routes require a valid Supabase session. **Turn on before any public deployment** |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server, optional | used to verify sessions when `AI_REQUIRE_AUTH=true` |

Variables prefixed `VITE_` are embedded in the browser bundle; everything else stays on the server.

## 2. AI provider requirements

- Provider: Anthropic Claude API via the official `@anthropic-ai/sdk` (server-side only, `server/ai/provider.ts`).
- Model: `claude-opus-5-5` by default. Adaptive thinking is on by default for this model; depth is controlled with `output_config.effort`.
- Chat streams over NDJSON from `/api/ai/chat`; generation uses structured outputs (`output_config.format` with a JSON schema) from `/api/ai/generate`, streamed with keep-alive pings to avoid proxy timeouts.
- Long generations can take minutes on large PDFs. `vercel.json` sets `maxDuration: 300` for `api/**`; your plan must allow it.
- Document text sent for whole-document generation is capped at 240,000 characters (`MAX_GENERATE_CHARS`). Longer PDFs are marked "AI read the first part only" in the UI — nothing is silently dropped. A map-reduce pass per study-guide topic is the natural next step for very long textbooks.
- Cost control: `server/http.ts` has a per-instance rate limiter (best-effort on serverless). Use a shared store (e.g. a Supabase table or Redis) for real per-user quotas.

## 3. RAG (document-aware answers)

Implemented now, fully in the browser:
1. Text extraction per page (pdf.js) → `document_pages`
2. Chunking (~1,100 chars on sentence boundaries, 1-sentence overlap) → `src/lib/study/retrieval.ts`
3. Retrieval with BM25 lexical search (blends the previous question for follow-ups, adds the page being read)
4. Passages + page numbers sent with the question; the system prompt requires page citations, and requires saying when the document doesn't cover something (labelled **General knowledge**)
5. The UI shows which pages were searched, or that no passages matched

To upgrade to vector search:
- Choose an embedding model (Anthropic doesn't offer embeddings; Voyage AI is the usual pairing — `document_chunks.embedding` is `vector(1024)` to match it; change the dimension for another model).
- On upload (server-side), embed each chunk and insert into `document_chunks`.
- Replace the body of `retrieve()` with: embed the query → `rpc('match_document_chunks', …)`. The return shape (`{ page, text }[]`) stays the same, so no UI changes are needed.

## 4. Supabase

`docs/SUPABASE_SCHEMA.sql` is a **proposal for a normalized future schema** — do not run it wholesale against an existing project. It includes:

- Tables: profiles, user_settings, folders, study_documents, document_pages, document_chunks (pgvector), document_artifacts, highlights, bookmarks, document_notes, study_notes, study_decks, flashcards (FSRS fields), review_logs, quiz_attempts (practice/exam/arcade history), quiz_scores, daily_scores, daily_stats, topic_progress, activity_events, ai_conversations, ai_messages, study_goals, plan_tasks, user_achievements, challenge_claims.
- Tables marked `[ORIGINAL]` match what the original app code already reads/writes.
- Row-level security on every table: users only see their own rows; `daily_scores` is publicly readable for the shared board.
- A sign-up trigger that creates `profiles` + `user_settings`.

### Relationships
`auth.users` 1—1 `profiles`/`user_settings`; user 1—n `folders` 1—n `study_documents` 1—n (`document_pages`, `document_chunks`, `document_artifacts`, `highlights`, `bookmarks`, `document_notes`, `topic_progress`); `study_documents` 1—1 document deck (`study_decks.document_id`); `study_decks` 1—n `flashcards` 1—n `review_logs`; `quiz_attempts` → optional deck/document; `ai_conversations` → optional document, 1—n `ai_messages`; `study_goals` 1—n `plan_tasks`.

### Storage
- Private bucket `study-documents`, 50 MB limit, PDF MIME type.
- Object path `<user_id>/<document_id>.pdf`; policies allow read/insert/delete only inside the caller's own folder.
- Upload flow: insert `study_documents` (status `uploading`) → upload file with progress → status `processing` → extract pages → insert `document_pages` (+ chunks/embeddings) → status `ready`. Today the same states are shown, driven by local processing (`src/lib/study/ingest.ts`).

### Current cloud-sync implementation
`src/data/cloud-sync.ts` keeps IndexedDB as the fast local working store, hydrates it after a real sign-in, and writes a versioned per-user snapshot. The additive migration at `supabase/migrations/20261120202559_recall_user_data_sync.sql` creates two owner-protected tables:

- `recall_user_data`: settings, resume state, and all metadata collections.
- `recall_document_texts`: extracted page text, separated to avoid oversized snapshot rows.

PDF binaries are uploaded to the existing private `study-documents` bucket under `<user_id>/<local_document_id>.pdf`. Guests remain local-only. The migration is additive and does not modify existing tables, policies, auth triggers, or bucket settings. Apply it only after reviewing the SQL and confirming the project backup is current.

This is an initial snapshot-sync implementation, not a normalized per-entity sync engine. Conflict handling merges records by ID and prefers the newest available timestamp; cross-device simultaneous editing and delete reconciliation still need dedicated tests before claiming production-grade conflict resolution.

The original Supabase code remains active for auth, classic/Daily Drop scores, and legacy cloud features:
- `services/supabase.ts` — auth REST client (sign-in/up, refresh, password reset, email callback)
- `services/auth.ts` — profiles
- `services/cloud.ts` — notes draft, arcade scores, deck history (`study_decks`), file uploads
- `lib/game/daily.ts` — Daily Drop board

## 5. Local and cloud data behavior

Guests and signed-out users keep study data in this browser's IndexedDB; preferences and "continue studying" state remain in localStorage. Signed-in users additionally sync the new study workspace to the per-user Supabase snapshot after the additive migration is applied. PDF binaries use private Supabase Storage; extracted text uses the dedicated page-text table. AI content only appears when a real provider responds. The only mock is `tests/mock-anthropic.mjs`, used by tests.

## 6. Remaining backend work

- Verify cloud sync end-to-end with two test accounts and two browsers, including deletes, interrupted uploads, and simultaneous edits
- Add progress UI/retry controls for large PDF uploads and text sync
- Server-side PDF processing
- Vector embeddings for RAG
- Shared Daily Drop board in production (works now via the original Supabase code once configured)
- Per-user AI quotas, authenticated AI routes (`AI_REQUIRE_AUTH`)
- Account deletion flow (the original code intentionally throws until a secure server flow exists)

### Sync safety notes
- A browser records the account that owns its current local workspace. Signing into a different account will hydrate that account's cloud records instead of merging the previous account's cached study records into it.
- First sign-in on a browser can migrate its guest workspace into the account snapshot.
- Current snapshot merge is ID/timestamp based and additive. Full delete tombstones, conflict resolution for concurrent edits, and account-switch acceptance testing are still required before production-grade cross-device sync can be claimed.
