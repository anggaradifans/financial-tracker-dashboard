-- Create a table to link Telegram users with your app users
CREATE TABLE telegram_users (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL UNIQUE, -- Telegram user ID
  telegram_username VARCHAR(255), -- @username
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  is_bot BOOLEAN DEFAULT FALSE,
  language_code VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;

-- Users can only see their own telegram connection
CREATE POLICY "Users can view own telegram connection" ON telegram_users
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own telegram connection
CREATE POLICY "Users can insert own telegram connection" ON telegram_users
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own telegram connection
CREATE POLICY "Users can update own telegram connection" ON telegram_users
  FOR UPDATE USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_user_id);
CREATE INDEX idx_telegram_users_user_id ON telegram_users(user_id);

-- Function to get user by telegram ID
CREATE OR REPLACE FUNCTION get_user_by_telegram_id(telegram_id BIGINT)
RETURNS TABLE (
  user_id UUID,
  telegram_username VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tu.user_id,
    tu.telegram_username,
    tu.first_name,
    tu.last_name
  FROM telegram_users tu
  WHERE tu.telegram_user_id = telegram_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to link telegram user to app user
CREATE OR REPLACE FUNCTION link_telegram_user(
  app_user_id UUID,
  telegram_id BIGINT,
  telegram_username VARCHAR DEFAULT NULL,
  first_name VARCHAR DEFAULT NULL,
  last_name VARCHAR DEFAULT NULL,
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
    first_name,
    last_name,
    language_code
  )
  ON CONFLICT (telegram_user_id) 
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    telegram_username = EXCLUDED.telegram_username,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    language_code = EXCLUDED.language_code,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
