-- Run: psql -U dbtc_user -d dbtc_db -f 001_init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 'boolean' | 'counter' | 'gauge'
CREATE TYPE habit_type AS ENUM ('boolean', 'counter', 'gauge');

-- 'gte' = fulfilled when value >= goal (e.g. drink 8 glasses)
-- 'lte' = fulfilled when value <= goal (e.g. smoke 0 cigarettes)
CREATE TYPE counter_direction AS ENUM ('gte', 'lte');

CREATE TABLE IF NOT EXISTS habits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  color       TEXT NOT NULL DEFAULT '#f59e0b' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  type        habit_type NOT NULL DEFAULT 'boolean',
  goal        NUMERIC,                -- NULL for boolean type
  direction   counter_direction,      -- only used when type = 'counter'
  unit        TEXT CHECK (char_length(unit) <= 20),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  -- Constraints
  CONSTRAINT  goal_required_for_non_boolean
    CHECK (type = 'boolean' OR goal IS NOT NULL),
  CONSTRAINT  direction_required_for_counter
    CHECK (type != 'counter' OR direction IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS habits_user_id_idx ON habits(user_id);

-- Replaces the old `completions` table.
-- For boolean: value is always 1 (present = done, absent = not done).
--              Only one row per habit per day; INSERT ... ON CONFLICT DO NOTHING to toggle on,
--              DELETE to toggle off.
-- For counter: value is the increment amount (always positive); rows accumulate (SUM).
-- For gauge:   value is the logged amount; rows accumulate (SUM).
-- completed_date is marked as a DATE so we can group by it for streaks.
CREATE TABLE IF NOT EXISTS habit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id       UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completed_date DATE NOT NULL,
  value          NUMERIC NOT NULL DEFAULT 1 CHECK (value != 0),
  logged_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS habit_logs_habit_id_idx  ON habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS habit_logs_date_idx       ON habit_logs(habit_id, completed_date);

-- View: one row per (habit, date) with the aggregated value and a
-- canonical completed_date string for streak calculations.
CREATE OR REPLACE VIEW habit_daily_totals AS
  SELECT
    habit_id,
    completed_date::text AS completed_date,
    SUM(value)           AS daily_total
  FROM habit_logs
  GROUP BY habit_id, completed_date;