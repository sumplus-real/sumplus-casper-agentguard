-- Rating history: preserves every rating submission for audit/trend analysis.
-- The `ratings` table continues to hold the latest rating per (skill_id, user_id).
CREATE TABLE IF NOT EXISTS rating_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id     uuid        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  rating       int         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review       text,
  source       text        NOT NULL DEFAULT 'human',
  execution_id uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rating_history_skill_id ON rating_history (skill_id);
CREATE INDEX IF NOT EXISTS idx_rating_history_user_id  ON rating_history (user_id);
