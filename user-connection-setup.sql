-- Add user_id column to transactions table to connect with registered users
ALTER TABLE transactions 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to accounts table to connect with registered users  
ALTER TABLE accounts 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update existing Row Level Security policies to include user_id filtering
-- Drop existing policies first
DROP POLICY IF EXISTS "Allow authenticated users to view all data" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to insert data" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to update data" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated users to delete data" ON transactions;

-- Create new policies for transactions table with user_id filtering
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- Update accounts table policies
DROP POLICY IF EXISTS "Allow authenticated users to view all data" ON accounts;
DROP POLICY IF EXISTS "Allow authenticated users to insert data" ON accounts;
DROP POLICY IF EXISTS "Allow authenticated users to update data" ON accounts;
DROP POLICY IF EXISTS "Allow authenticated users to delete data" ON accounts;

-- Create new policies for accounts table with user_id filtering
CREATE POLICY "Users can view own accounts" ON accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts" ON accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts" ON accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts" ON accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Optional: Update existing records to assign them to a specific user
-- Replace 'your-user-id-here' with an actual user ID from auth.users
-- UPDATE transactions SET user_id = 'your-user-id-here' WHERE user_id IS NULL;
-- UPDATE accounts SET user_id = 'your-user-id-here' WHERE user_id IS NULL;
