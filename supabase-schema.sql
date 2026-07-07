-- Sumplus Arsenal Database Schema
-- Run this in your Supabase SQL editor to create all tables
-- NOTE: All API routes use service_role key which bypasses RLS.
--       RLS policies here are minimal safeguards for direct client access only.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'official', 'user', 'agent')),
  api_key TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skills table
CREATE TABLE IF NOT EXISTS public.skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_type TEXT NOT NULL DEFAULT 'community' CHECK (author_type IN ('official', 'community')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  schema JSONB NOT NULL DEFAULT '{}',
  code TEXT NOT NULL DEFAULT '',
  usage_examples JSONB DEFAULT '[]',
  is_paid BOOLEAN DEFAULT FALSE,
  price DECIMAL(10, 2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rating_avg DECIMAL(3, 2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ratings table
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(skill_id, user_id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT NOT NULL DEFAULT 'x402' CHECK (payment_method IN ('x402', 'other')),
  transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skill executions log
CREATE TABLE IF NOT EXISTS public.skill_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  execution_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_skills_category ON public.skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_status ON public.skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_author_type ON public.skills(author_type);
CREATE INDEX IF NOT EXISTS idx_skills_rating_avg ON public.skills(rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_skills_created_at ON public.skills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_skill_id ON public.ratings(skill_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON public.ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_skill_id ON public.payments(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill_id ON public.skill_executions(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_created_at ON public.skill_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skills_search ON public.skills
  USING GIN (to_tsvector('english', name || ' ' || description));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update skill rating avg when a rating is inserted/updated
CREATE OR REPLACE FUNCTION public.update_skill_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.skills
  SET
    rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM public.ratings WHERE skill_id = NEW.skill_id),
    rating_count = (SELECT COUNT(*) FROM public.ratings WHERE skill_id = NEW.skill_id),
    updated_at = NOW()
  WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_skill_rating ON public.ratings;
CREATE TRIGGER trigger_update_skill_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_skill_rating();

-- Auto-increment skill usage count on execution log
CREATE OR REPLACE FUNCTION public.increment_skill_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.skills
  SET usage_count = usage_count + 1, updated_at = NOW()
  WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_increment_skill_usage ON public.skill_executions;
CREATE TRIGGER trigger_increment_skill_usage
  AFTER INSERT ON public.skill_executions
  FOR EACH ROW EXECUTE FUNCTION public.increment_skill_usage();

-- Auto-create public.users row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- NOTE: service_role key (used by all API routes) bypasses RLS.
--       These policies only apply to direct anon/user client connections.
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_executions ENABLE ROW LEVEL SECURITY;

-- Users: can read and update own row
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Skills: anyone can read approved skills; authors can manage their own
CREATE POLICY "skills_select_approved" ON public.skills
  FOR SELECT USING (status = 'approved');

CREATE POLICY "skills_select_own" ON public.skills
  FOR SELECT USING (auth.uid() = author_id);

CREATE POLICY "skills_insert_own" ON public.skills
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "skills_update_own" ON public.skills
  FOR UPDATE USING (auth.uid() = author_id);

-- Ratings: anyone can read; authenticated users manage their own
CREATE POLICY "ratings_select_all" ON public.ratings
  FOR SELECT USING (true);

CREATE POLICY "ratings_insert_own" ON public.ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ratings_update_own" ON public.ratings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ratings_delete_own" ON public.ratings
  FOR DELETE USING (auth.uid() = user_id);

-- Payments: users can see and create their own
CREATE POLICY "payments_select_own" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "payments_insert_own" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Skill executions: users can see their own; anyone can insert (for logging)
CREATE POLICY "executions_select_own" ON public.skill_executions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "executions_insert_any" ON public.skill_executions
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- TABLE COMMENTS
-- ============================================================

COMMENT ON TABLE public.skills IS 'Stores all available skills for agents';
COMMENT ON TABLE public.ratings IS 'User ratings and reviews for skills';
COMMENT ON TABLE public.payments IS 'Payment transactions for paid skills';
COMMENT ON TABLE public.skill_executions IS 'Log of skill executions for analytics';
