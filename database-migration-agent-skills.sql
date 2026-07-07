-- Arsenal Agent Skill Taxonomy Migration
-- Maria proposal (2026-05-01): skill kind + execution protocol metadata
--
-- Run once in Supabase SQL editor.

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'protocol',
  ADD COLUMN IF NOT EXISTS execution_protocol TEXT NOT NULL DEFAULT 'rest_json',
  ADD COLUMN IF NOT EXISTS input_style TEXT NOT NULL DEFAULT 'structured',
  ADD COLUMN IF NOT EXISTS deterministic BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS multi_step BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supports_streaming_events TEXT[],
  ADD COLUMN IF NOT EXISTS requires_user_session BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimated_duration_seconds JSONB;
