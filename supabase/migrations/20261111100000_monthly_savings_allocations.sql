ALTER TABLE public.goals ADD COLUMN priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3);

CREATE TABLE public.monthly_savings_plans (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  baseline_amount numeric(18,2) NOT NULL CHECK (baseline_amount <> 'NaN'::numeric),
  baseline_month date,
  PRIMARY KEY (user_id, currency),
  CHECK (
    (baseline_month IS NULL AND baseline_amount >= 0) OR
    (baseline_month IS NOT NULL AND extract(day FROM baseline_month) = 1)
  )
);

ALTER TABLE public.monthly_savings_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY monthly_savings_plans_read_own ON public.monthly_savings_plans FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.monthly_savings_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.monthly_savings_plans TO authenticated;

CREATE FUNCTION public.save_monthly_savings_plan(
  p_currency text,
  p_expected_revision uuid,
  p_baseline_amount numeric,
  p_baseline_month date,
  p_allocations jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_revision uuid;
  v_active_count integer;
  v_rows integer;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in to save a monthly savings plan' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The browser can enter a new calendar month before the database does.
  IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array'
     OR p_baseline_amount IS NULL OR p_baseline_amount <> round(p_baseline_amount, 2)
     OR (p_baseline_month IS NOT NULL AND p_baseline_month >= date_trunc('month', CURRENT_DATE + 1)::date) THEN
    RAISE EXCEPTION 'Invalid monthly savings plan' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.monthly_savings_plans (user_id, currency, baseline_amount, baseline_month)
    VALUES (v_owner, p_currency, p_baseline_amount, p_baseline_month)
    ON CONFLICT (user_id, currency) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT revision INTO v_revision FROM public.monthly_savings_plans
    WHERE user_id = v_owner AND currency = p_currency FOR UPDATE;
  IF (v_rows = 0 AND v_revision IS DISTINCT FROM p_expected_revision)
     OR (v_rows = 1 AND p_expected_revision IS NOT NULL) THEN
    RAISE EXCEPTION 'The monthly plan changed. Reload goals and try again.' USING ERRCODE = 'serialization_failure';
  END IF;

  -- Lock and validate the exact set of active goals in the preview. A stale
  -- status, goal edit, or extra/missing allocation invalidates the entire save.
  PERFORM 1 FROM public.goals
    WHERE user_id = v_owner AND currency = p_currency AND status = 'active'
    ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_active_count = ROW_COUNT;
  IF v_active_count = 0 OR v_active_count <> jsonb_array_length(p_allocations) OR
    (SELECT count(DISTINCT a.goal_id) FROM jsonb_to_recordset(p_allocations)
      AS a(goal_id uuid)) <> v_active_count THEN
    RAISE EXCEPTION 'The active goals changed. Reload goals and try again.' USING ERRCODE = 'serialization_failure';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_allocations) AS a(goal_id uuid, expected_updated_at timestamptz, amount numeric, priority smallint)
    LEFT JOIN public.goals g ON g.id = a.goal_id AND g.user_id = v_owner AND g.currency = p_currency AND g.status = 'active'
    WHERE g.id IS NULL OR g.updated_at IS DISTINCT FROM a.expected_updated_at
  ) THEN
    RAISE EXCEPTION 'A goal changed. Reload goals and try again.' USING ERRCODE = 'serialization_failure';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_allocations) AS a(amount numeric, priority smallint)
    WHERE a.amount IS NULL OR a.amount < 0 OR a.amount >= 10000000000000000
      OR a.amount <> round(a.amount, 2) OR a.priority IS NULL OR a.priority NOT BETWEEN 1 AND 3
  ) THEN
    RAISE EXCEPTION 'Invalid goal amount or priority' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.goals g SET planned_monthly_amount = a.amount, priority = a.priority
    FROM jsonb_to_recordset(p_allocations) AS a(goal_id uuid, amount numeric, priority smallint)
    WHERE g.id = a.goal_id AND g.user_id = v_owner;

  UPDATE public.monthly_savings_plans
    SET baseline_amount = p_baseline_amount, baseline_month = p_baseline_month, revision = gen_random_uuid()
    WHERE user_id = v_owner AND currency = p_currency;
END;
$$;

REVOKE ALL ON FUNCTION public.save_monthly_savings_plan(text, uuid, numeric, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_monthly_savings_plan(text, uuid, numeric, date, jsonb) TO authenticated;

CREATE TABLE public.goal_transaction_locks (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id) ON DELETE CASCADE
);
ALTER TABLE public.goal_transaction_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.goal_transaction_locks FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.goal_contributions_validate_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_currency char(3);
  v_linked numeric;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND (auth.uid() IS NOT NULL OR current_setting('role', true) IN ('anon', 'authenticated')) THEN
    RAISE EXCEPTION 'Linked cash-flow transaction unavailable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_tx FROM public.transactions
    WHERE id = NEW.transaction_id AND user_id = NEW.user_id
      AND deleted_at IS NULL AND transfer_id IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linked cash-flow transaction unavailable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT currency INTO v_currency FROM public.goals WHERE id = NEW.goal_id AND user_id = NEW.user_id;
  IF v_currency IS DISTINCT FROM v_tx.currency THEN
    RAISE EXCEPTION 'Linked transaction currency must match the goal' USING ERRCODE = 'check_violation';
  END IF;
  -- Write a lock row after locking the transaction. Concurrent splits or edits
  -- serialize under read committed and raise a conflict under repeatable read.
  INSERT INTO public.goal_transaction_locks VALUES (NEW.transaction_id)
    ON CONFLICT (transaction_id) DO UPDATE SET transaction_id = EXCLUDED.transaction_id;
  SELECT COALESCE(sum(abs(amount)), 0) INTO v_linked FROM public.goal_contributions
    WHERE transaction_id = NEW.transaction_id;
  IF v_linked + abs(NEW.amount) > v_tx.amount THEN
    RAISE EXCEPTION 'Linked contributions exceed the transaction amount' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.transactions_preserve_goal_links() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_linked numeric;
BEGIN
  INSERT INTO public.goal_transaction_locks VALUES (OLD.id)
    ON CONFLICT (transaction_id) DO UPDATE SET transaction_id = EXCLUDED.transaction_id;
  SELECT sum(abs(amount)) INTO v_linked FROM public.goal_contributions WHERE transaction_id = OLD.id;
  IF v_linked IS NOT NULL AND (NEW.amount < v_linked OR NEW.currency <> OLD.currency
      OR (OLD.transfer_id IS NULL AND NEW.transfer_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Remove the linked goal contributions before changing this transaction amount, currency, or transfer status'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.transactions_preserve_goal_links() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER transactions_preserve_goal_links BEFORE UPDATE OF amount, currency, transfer_id
  ON public.transactions FOR EACH ROW
  WHEN (OLD.amount IS DISTINCT FROM NEW.amount OR OLD.currency IS DISTINCT FROM NEW.currency
    OR OLD.transfer_id IS DISTINCT FROM NEW.transfer_id)
  EXECUTE FUNCTION public.transactions_preserve_goal_links();
