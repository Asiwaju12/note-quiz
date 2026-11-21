# Recall Quiz — Stage 4 cloud sync groundwork

## Included
- `src/data/cloud-sync.ts`: account-scoped snapshot sync, IndexedDB hydration, debounced writes, page-text persistence, private PDF upload/download, and explicit sign-out flush.
- `src/services/supabase.ts`: private Storage download helper.
- `src/app/account.tsx`: starts sync only after a real authenticated account is loaded.
- `supabase/migrations/20261120202559_recall_user_data_sync.sql`: additive, RLS-protected snapshot and document-text tables.

## Database status
The migration `recall_user_data_sync` was applied to Supabase project `note-quiz` (`genyzkzukvtdcpvkfuxh`). The tables were confirmed present with RLS enabled, and all six owner-scoped policies were inspected. Existing application tables and their records were not modified.

## Verification
- TypeScript transpile/syntax pass: 91 `.ts`/`.tsx` source files, zero syntax errors after the follow-up fixes.
- Full `tsc --noEmit` and Vite production build remain unverified: `npm ci` timed out while contacting the npm registry, and the local TypeScript/Vite project binaries are unavailable.
- Supabase security advisor reported the existing warning that leaked-password protection is disabled. Performance advisor also reported existing duplicate/permissive policies on legacy tables and an unindexed legacy FK; these were not changed as part of this migration.

## Known limitations before production
- Snapshot sync is initial groundwork, not a fully conflict-safe sync engine.
- Delete tombstones and robust simultaneous-edit conflict resolution are not implemented yet.
- End-to-end tests with two separate accounts/browsers and real PDF uploads/downloads are still required.
- The new source has not been committed to GitHub or deployed to Vercel.

## Follow-up fixes during review
- Matched the local migration filename to the already-applied Supabase migration version (`20261120202559`) to avoid a second, duplicate migration being proposed.
- Cloud hydration now replaces the IndexedDB collection contents as well as the in-memory cache, so restored data survives a reload and stale rows are not resurrected.
- First sign-in on a browser now merges guest rows with an existing cloud snapshot; switching from a previously linked account still avoids mixing that account's records into another account.
