-- Migration: add username to users table
-- Run this in Supabase SQL editor

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Optional: create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);
