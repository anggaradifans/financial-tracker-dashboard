-- Based on the supplied September 15 audit. Apply once, before deploying the
-- browser client that uses the anon key and a signed-in user's access token.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Existing categories become shared defaults (NULL owner). Set the default
-- separately so PostgreSQL does not assign existing rows to the SQL Editor user.
ALTER TABLE public.categories
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.categories ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.categories DROP CONSTRAINT categories_name_key;
CREATE UNIQUE INDEX categories_shared_name_key
  ON public.categories (name) WHERE user_id IS NULL;
CREATE UNIQUE INDEX categories_owner_name_key
  ON public.categories (user_id, name) WHERE user_id IS NOT NULL;

-- Abort the transaction rather than silently hide newly introduced unowned data.
ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.budgets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.budgets ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions (user_id);

-- TRUNCATE is not governed by RLS. Replace broad browser grants with only the
-- operations used by this app. Telegram tables remain accessible to service_role.
REVOKE ALL PRIVILEGES ON TABLE public.accounts, public.categories,
  public.transactions, public.budgets, public.telegram_users,
  public.transaction_staging FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories,
  public.transactions, public.budgets TO authenticated;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- Remove policies on these four tables so an older permissive policy cannot
-- accidentally allow access in addition to the policies below.
DO $$
DECLARE existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('accounts', 'categories', 'transactions', 'budgets')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',
      existing_policy.policyname, existing_policy.tablename);
  END LOOP;
END $$;

CREATE POLICY accounts_read_shared ON public.accounts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY accounts_add_shared ON public.accounts
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY accounts_delete_shared ON public.accounts
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY categories_read_visible ON public.categories
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = (SELECT auth.uid()));
CREATE POLICY categories_insert_own ON public.categories
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY categories_update_own ON public.categories
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY categories_delete_own ON public.categories
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY transactions_read_own ON public.transactions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY transactions_insert_own ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = transactions.category_id
        AND (c.user_id IS NULL OR c.user_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY transactions_update_own ON public.transactions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = transactions.category_id
        AND (c.user_id IS NULL OR c.user_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY transactions_delete_own ON public.transactions
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY budgets_read_own ON public.budgets
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY budgets_insert_own ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = budgets.category_id
        AND (c.user_id IS NULL OR c.user_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY budgets_update_own ON public.budgets
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = budgets.category_id
        AND (c.user_id IS NULL OR c.user_id = (SELECT auth.uid()))
    )
  );
CREATE POLICY budgets_delete_own ON public.budgets
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- The live audit contains no Telegram registration RPC. Preserve the actual
-- telegram_users schema and backend grants; do not run the old setup SQL files.
NOTIFY pgrst, 'reload schema';
COMMIT;
