-- Table to stage transactions before Telegram confirmation
CREATE TABLE public.transaction_staging (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    telegram_chat_id BIGINT, -- Optional: to verify who clicked
    amount NUMERIC NOT NULL,
    currency CHAR(3) DEFAULT 'IDR',
    description TEXT,
    category_id UUID, -- Optional: if we can guess it
    account_id UUID, -- Optional: default account
    occurred_at TIMESTAMPTZ DEFAULT now(),
    
    -- Metadata from email
    email_sender VARCHAR(255),
    email_subject TEXT,
    raw_body TEXT,
    
    status TEXT CHECK (status IN ('pending', 'confirmed', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transaction_staging ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service_role (Edge Function) to do everything
CREATE POLICY "Enable all for service_role" ON public.transaction_staging
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Allow authenticated users to view/insert (e.g. n8n via specific user or service role)
-- Assuming n8n uses service_role, this is covered.
