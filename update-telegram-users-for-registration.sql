-- Update telegram_users table to allow NULL telegram_user_id for initial registration
-- This allows users to be added during registration, and telegram_user_id can be linked later

-- Make telegram_user_id nullable
ALTER TABLE telegram_users ALTER COLUMN telegram_user_id DROP NOT NULL;

-- Update the unique constraint to handle NULLs (PostgreSQL allows multiple NULLs in UNIQUE columns)
-- The existing UNIQUE constraint should work fine, but we can add a partial unique index for non-NULL values
DROP INDEX IF EXISTS idx_telegram_users_telegram_id;
CREATE UNIQUE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

-- Create a function to insert or update telegram user record during registration
CREATE OR REPLACE FUNCTION create_telegram_user_record(
  app_user_id UUID,
  user_first_name VARCHAR DEFAULT NULL,
  user_last_name VARCHAR DEFAULT NULL,
  telegram_id BIGINT DEFAULT NULL,
  telegram_username VARCHAR DEFAULT NULL,
  language_code VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO telegram_users (
    user_id,
    telegram_user_id,
    telegram_username,
    first_name,
    last_name,
    language_code
  ) VALUES (
    app_user_id,
    telegram_id,
    telegram_username,
    user_first_name,
    user_last_name,
    language_code
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET
    first_name = COALESCE(EXCLUDED.first_name, telegram_users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, telegram_users.last_name),
    telegram_user_id = COALESCE(EXCLUDED.telegram_user_id, telegram_users.telegram_user_id),
    telegram_username = COALESCE(EXCLUDED.telegram_username, telegram_users.telegram_username),
    language_code = COALESCE(EXCLUDED.language_code, telegram_users.language_code),
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a unique constraint on user_id to ensure one record per user
-- First check if it exists, then add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_users_user_id_unique'
  ) THEN
    ALTER TABLE telegram_users ADD CONSTRAINT telegram_users_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

