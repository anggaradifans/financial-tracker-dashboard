-- Local disposable PostgreSQL database only. Never run this on Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TYPE public.cat_allowed_type AS ENUM ('income', 'outcome', 'both');
CREATE TYPE public.transaction_type AS ENUM ('income', 'outcome');
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  currency char(3) NOT NULL DEFAULT 'IDR', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
  allowed_type public.cat_allowed_type NOT NULL DEFAULT 'both',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id),
  category_id uuid NOT NULL REFERENCES public.categories(id),
  type public.transaction_type NOT NULL, amount numeric NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR', description text,
  occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}', deleted_at timestamptz,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  amount numeric(15,2) NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'IDR',
  period text NOT NULL CHECK (period IN ('daily','weekly','monthly','yearly')),
  start_date timestamptz NOT NULL, end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_category_period UNIQUE (user_id, category_id, period, start_date)
);
CREATE TABLE public.telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_user_id bigint NOT NULL UNIQUE,
  supabase_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
-- Staging columns are outside the supplied audit; only table grants are tested.
CREATE TABLE public.transaction_staging (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own budgets" ON public.budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets" ON public.budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets" ON public.budgets FOR DELETE USING (auth.uid() = user_id);

INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.accounts (id, name)
SELECT ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'Account ' || n FROM generate_series(1,8) n;
INSERT INTO public.categories (id, name)
SELECT ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, 'Default ' || n FROM generate_series(1,21) n;
INSERT INTO public.transactions (account_id, category_id, type, amount, occurred_at, user_id)
SELECT '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'outcome', 100, now(), CASE WHEN n <= 900 THEN '00000000-0000-0000-0000-000000000001'::uuid
  ELSE '00000000-0000-0000-0000-000000000002'::uuid END FROM generate_series(1,918) n;
INSERT INTO public.budgets (user_id, category_id, amount, period, start_date)
VALUES ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1000, 'monthly', now());
