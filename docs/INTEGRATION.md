# Integration guide — what's connected and what isn't

This source package includes the Supabase authentication client and an initial account-scoped cloud-sync layer. The sync layer is not live until the additive SQL migration is applied and this source is deployed with the existing Supabase environment variables. The existing live deployment is not changed by this package.

## 1. Environment variables

| Variable | Where | Required for |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | Accounts, cloud sync, shared Daily Drop |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | same — publishable/anon key only, **never** the service-role key |
| `GEMINI_API_KEY` | server only | Google Gemini chat + AI generation |
| `AI_MODEL` | server, optional | defaults to `gemini-3.5-flash-lite` |
| `AI_CHAT_EFFORT` / `AI_GENERATE_EFFORT` | server, optional | reserved tuning settings; Gemini uses provider generation defaults |

| `AI_REQUIRE_AUTH` | server, optional | `true` = AI routes require a valid Supabase session. **Keep enabled for preview and production** |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server, optional | used to verify sessions when `AI_REQUIRE_AUTH=true` |

Variables prefixed `VITE_` are embedded in the browser bundle; everything else stays on the server.

## 2. AI provider requirements

Recall AI is a server-side feature. The active provider code is `server/ai/provider.ts`; request handlers are `api/ai/status.ts`, `api/ai/chat.ts`, and `api/ai/generate.ts`.

### Active provider: Google Gemini

- Set `GEMINI_API_KEY` as a Vercel server environment variable. Never expose it through a `VITE_*` variable or commit it.
- The current default model in source is `gemini-3.5-flash-lite`. Override it with `AI_MODEL` only if the chosen model is enabled for the connected Google AI project.
- Chat streams tutor responses over NDJSON from `/api/ai/chat`.
- Structured generation uses `/api/ai/generate` for summaries, notes, key terms, guides, flashcards, questions and study plans.
- `/api/ai/status` reports whether a Gemini key is configured and which model is selected. It never returns the key.
- A configured API key does not guarantee model access or available quota; Google AI project limits and billing still apply.

### Claude and Basic Mode

The repository includes an Anthropic SDK dependency and some legacy Claude configuration fields, but the active chat and generation handlers call Gemini only. Claude is **not** currently an automatic fallback. An `ANTHROPIC_API_KEY` by itself does not enable Recall AI.

Basic Mode is a separate local extraction-based path. It does not call an AI provider and should remain available if Gemini is unconfigured, rate-limited or unavailable. Do not label Basic Mode output as AI-generated.

### AI troubleshooting

1. Open `/api/ai/status` on the deployed site.
2. Confirm `GEMINI_API_KEY` exists in the correct Vercel environment (Preview or Production).
3. Confirm the Google AI project allows the configured `AI_MODEL` and has available quota/billing capacity.
4. Inspect Vercel function logs for `/api/ai/chat` or `/api/ai/generate`.
5. If AI is unavailable, continue using Basic Mode while the provider configuration is repaired.

The AI endpoints validate requests and use per-instance rate limiting. Per-instance limits are best-effort on serverless; use a shared store for robust account-level quotas.

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

Guests and signed-out users keep study data in this browser's IndexedDB; preferences and "continue studying" state remain in localStorage. Signed-in users additionally sync the new study workspace to the per-user Supabase snapshot after the additive migration is applied. PDF binaries use private Supabase Storage; extracted text uses the dedicated page-text table. AI content only appears when a real provider responds. AI responses are never mocked in the deployed app; integration tests should stub the Gemini REST boundary when testing provider behavior.

## 6. Friends, direct messages and live multiplayer (integration branch)

The `recall-quiz-redesign-integration` branch adds the social and multiplayer interface. Its database migrations are applied to the connected Supabase project.

- `friend_requests` and `direct_messages` store friend relationships and private messages with row-level access rules.
- `study_rooms`, `study_room_members`, `study_room_questions`, and `study_room_answers` store live match state and results.
- Room creation, joining by room code, question start, answer scoring, state retrieval and host progression use authenticated Postgres RPC functions.
- Correct-answer scoring is calculated server-side; clients cannot directly set room scores or question state.
- Private Realtime topics are authorized against room membership or accepted friendship.
- Live competition gives all room members the same active question and shared round timer. Players submit independently; the host advances after the round timer ends.

Current client routes: `/messages`, `/multiplayer`, and `/multiplayer/:roomId`. Saved deck pages include a Study Together entry point. Live rooms currently accept multiple-choice and true/false choice questions only, with a maximum of 60 questions per match.

**Release gate:** This feature is not considered production-ready until a successful Vercel preview is available and two or more separate signed-in accounts have passed friend request, messaging, room join, synchronized question, scoring, reconnect and final-results tests.

## 7. Remaining backend work

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


## 10. Deployment status and safe release process

- Vercel project: `recall-quiz`; framework: Vite; build command: `npm run build`; output directory: `dist`; Node.js runtime: `22.x`.
- The integration branch is a development/preview branch. Do not promote it to the production domain until preview build and functional tests pass.
- The most recent Vercel attempts returned `BUILD_FAILED: Resource provisioning failed` before any build events were emitted. This is a Vercel provisioning failure, not yet evidence of a TypeScript or application build error.
- When the Vercel platform begins emitting build logs, inspect install/build output before changing dependencies or application code to address an assumed error.
- Never delete or replace the existing production deployment as a troubleshooting step.
