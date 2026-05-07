-- Extends callrail_calls with AI Reporting fields:
-- AssemblyAI transcription + OpenAI classification/summary.

alter table callrail_calls
  add column if not exists recording_url        text,
  add column if not exists assemblyai_id        text,
  add column if not exists transcription_status text default 'pending',  -- pending | transcribing | transcribed | classified | error
  add column if not exists transcript           text,
  add column if not exists category             text,                    -- sales | support | other
  add column if not exists summary              text,
  add column if not exists sentiment            text,                    -- positive | neutral | negative
  add column if not exists key_points           jsonb,
  add column if not exists follow_up_needed     boolean,
  add column if not exists processed_at         timestamptz,
  add column if not exists error_message        text;

create index if not exists callrail_calls_status_idx   on callrail_calls (transcription_status, call_started_at desc);
create index if not exists callrail_calls_category_idx on callrail_calls (category, call_started_at desc);
create index if not exists callrail_calls_assemblyai_idx on callrail_calls (assemblyai_id);
