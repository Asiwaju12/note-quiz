# Recall Quiz — Stage 6 PDF storage integration

## Implemented in this source package

- PDF ingestion stores the original PDF and extracted page text in browser IndexedDB first. This keeps the Study Centre usable offline and gives cloud sync a local source to retry from.
- For authenticated accounts, `src/data/cloud-sync.ts` uploads the original PDF to the private `study-documents` bucket at `<user_id>/<document_id>.pdf` using the signed-in user's access token.
- Extracted page text is synchronized to `public.recall_document_texts`, scoped by `user_id` and `document_id`.
- On another browser, the account snapshot is hydrated first, extracted text is restored, and missing PDF blobs are downloaded from the authenticated Storage endpoint.
- Document deletion is represented by a cloud tombstone. After the tombstone is acknowledged, the sync service removes that document's extracted text row and private PDF object. The owner-scoped Storage policies remain the authorization boundary.
- Guest uploads remain local. The Study Centre upload dialog now explains the distinction between guest-local storage and signed-in private cloud backup.

## Storage contract

- Bucket: `study-documents` (private)
- Object key: `<auth.uid()>/<document_id>.pdf`
- Browser upload limit: 50 MiB per PDF (`MAX_PDF_BYTES`)
- Storage requests use the active user's bearer token. No service-role key is used in browser code.
- The `recall_document_texts` table is protected by owner-scoped RLS policies.

## Verification performed for Stage 6

- Existing cloud-sync merge suite: 5 tests passed.
- ZIP archive integrity: passed after packaging.
- TypeScript syntax transpilation: run across the full source tree (see release handover).
- Full `tsc --noEmit` and `vite build` could not run because the dependency installation was incomplete; `npm ci --prefer-offline` timed out and the local install lacks Vite and `@types/node`.

## Required live acceptance tests (not claimed as passed)

1. Sign in as Account A, upload a PDF, wait for cloud sync, then verify the object exists under Account A's UUID prefix and is not publicly readable.
2. Sign in as Account A in a clean browser profile; verify the document row, extracted text, and PDF restore and the PDF viewer opens.
3. Sign in as Account B; verify Account A's document metadata, text, and Storage object are not visible or downloadable.
4. Delete a document as Account A; verify its metadata is absent after sync and its `recall_document_texts` row and Storage object are removed.
5. Upload while offline, reconnect, and verify a later sync retries the pending PDF and extracted text.
6. Repeat with a near-limit 50 MiB PDF and a scanned PDF with little/no selectable text.

Do not deploy until the production build and the account-isolation acceptance tests pass.
