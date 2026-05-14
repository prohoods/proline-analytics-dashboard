-- Add dedupe + retry support to conversion_uploads.
--
-- dedupe_key = {source}-{source_id}-{conversion_action}
--   We never want to count the same logical event twice. Before inserting a
--   new attempt, we check whether a row with the same dedupe_key already
--   succeeded — if so, we skip the upload entirely.
--
-- attempt    = which retry this row represents (1, 2, 3, ...)
--   Retries write new rows so we keep the full history; this column makes
--   it easy to enforce a max-attempts cap.

alter table conversion_uploads
  add column if not exists dedupe_key text,
  add column if not exists attempt    int  not null default 1;

-- Backfill dedupe_key for existing rows.
update conversion_uploads
   set dedupe_key = source || '-' || source_id || '-' || conversion_action
 where dedupe_key is null;

-- Fast lookup for "has this dedupe_key already succeeded?"
create index if not exists conversion_uploads_dedupe_success_idx
  on conversion_uploads (dedupe_key)
  where status = 'success';

-- Lookup for "newest attempt per dedupe_key" used by the retry job.
create index if not exists conversion_uploads_dedupe_attempt_idx
  on conversion_uploads (dedupe_key, attempt desc);
