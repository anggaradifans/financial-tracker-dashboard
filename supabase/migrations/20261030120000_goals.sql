-- Financial goals with transparent emergency-fund recommendations (issue #18).
--
-- Adds five owner-scoped tables, one view and three browser-callable RPCs.
-- The only change to an existing table is a UNIQUE (id, user_id) constraint on
-- transactions, which lets a contribution link to a transaction of the same owner.
--
-- Design notes
--   * Browser roles can only read the recommendation snapshot tables. Snapshots
--     are written by SECURITY DEFINER RPCs that take the owner from auth.uid(),
--     recompute the basis in SQL numeric and refuse a stale preview.
--   * Invariants that must hold on every write path (balance never negative, a
--     linked transaction is never over-allocated, an emergency-fund target always
--     equals its current accepted recommendation) live in triggers.
--   * Nothing here stores a mutable balance; saved amounts are always SUM(amount).
--
-- Rollback (only new objects plus one constraint; data in the goal tables is lost):
--   DROP VIEW public.goal_progress;
--   DROP FUNCTION public.create_emergency_fund_goal, public.accept_emergency_fund_recommendation,
--     public.preview_emergency_fund_basis, public.goals_store_recommendation,
--     public.goals_accepted_target, public.goals_basis;
--   DROP TABLE public.goal_recommendation_categories, public.goal_recommendation_months,
--     public.goal_recommendations, public.goal_contributions, public.goals;
--   DROP FUNCTION public.goal_contributions_check_balance, public.goal_contributions_validate_link,
--     public.goals_guard;
--   ALTER TABLE public.transactions DROP CONSTRAINT transactions_id_user_id_key;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Anchor for the composite (transaction_id, user_id) foreign key below.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_id_user_id_key UNIQUE (id, user_id);

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('emergency_fund', 'custom')),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  description text CHECK (char_length(description) <= 500),
  currency char(3) NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  target_amount numeric(18,2) NOT NULL CHECK (target_amount > 0),
  target_date date,
  planned_monthly_amount numeric(18,2) CHECK (planned_monthly_amount >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goals_completed_at_check CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT goals_id_user_id_key UNIQUE (id, user_id)
);

COMMENT ON TABLE public.goals IS 'Savings goals tracked separately from monthly spending budgets';
COMMENT ON COLUMN public.goals.kind IS 'Fixed at creation; emergency_fund goals are created only through create_emergency_fund_goal';
COMMENT ON COLUMN public.goals.currency IS 'Fixed at creation; contributions inherit it';

CREATE UNIQUE INDEX goals_one_active_emergency_fund
  ON public.goals (user_id) WHERE kind = 'emergency_fund' AND status = 'active';
CREATE INDEX idx_goals_user_id_status ON public.goals (user_id, status);

CREATE TABLE public.goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  contributed_on date NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount <> 0),
  description text CHECK (char_length(description) <= 200),
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_contributions_goal_fkey FOREIGN KEY (goal_id, user_id)
    REFERENCES public.goals (id, user_id) ON DELETE CASCADE,
  -- Same-owner link. A hard-deleted transaction only clears the link, so the
  -- contribution (an explicit allocation) keeps counting toward the goal.
  CONSTRAINT goal_contributions_transaction_fkey FOREIGN KEY (transaction_id, user_id)
    REFERENCES public.transactions (id, user_id) ON DELETE SET NULL (transaction_id)
);

COMMENT ON COLUMN public.goal_contributions.amount IS 'Positive = deposit, negative = withdrawal; saved = SUM(amount)';
COMMENT ON COLUMN public.goal_contributions.transaction_id IS 'Optional, explicit link; soft-deleting the transaction does not change the contribution';

CREATE UNIQUE INDEX goal_contributions_goal_transaction_key
  ON public.goal_contributions (goal_id, transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_goal_contributions_goal_date
  ON public.goal_contributions (goal_id, contributed_on DESC, created_at DESC);
CREATE INDEX idx_goal_contributions_transaction
  ON public.goal_contributions (transaction_id) WHERE transaction_id IS NOT NULL;

CREATE TABLE public.goal_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  calc_version smallint NOT NULL DEFAULT 1,
  timezone text NOT NULL,
  basis_months smallint NOT NULL CHECK (basis_months BETWEEN 1 AND 12),
  multiplier numeric(4,1) NOT NULL CHECK (multiplier > 0),
  period_start date NOT NULL CHECK (period_start = date_trunc('month', period_start::timestamp)::date),
  period_end date NOT NULL,
  computed_at timestamptz NOT NULL,
  included_month_count smallint NOT NULL CHECK (included_month_count >= 0),
  average_monthly_essential numeric(18,2) NOT NULL CHECK (average_monthly_essential > 0),
  suggested_target numeric(18,2) NOT NULL CHECK (suggested_target > 0),
  accepted_target numeric(18,2) NOT NULL CHECK (accepted_target > 0),
  skipped_other_currency_count integer NOT NULL DEFAULT 0 CHECK (skipped_other_currency_count >= 0),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  CONSTRAINT goal_recommendations_period_check CHECK (period_end > period_start),
  CONSTRAINT goal_recommendations_superseded_check CHECK (superseded_at IS NULL OR superseded_at >= accepted_at),
  CONSTRAINT goal_recommendations_goal_fkey FOREIGN KEY (goal_id, user_id)
    REFERENCES public.goals (id, user_id) ON DELETE CASCADE,
  CONSTRAINT goal_recommendations_id_user_id_key UNIQUE (id, user_id)
);

COMMENT ON TABLE public.goal_recommendations IS 'Accepted emergency-fund calculations, frozen at acceptance; a refresh supersedes the row and adds a new one';

CREATE UNIQUE INDEX goal_recommendations_one_current
  ON public.goal_recommendations (goal_id) WHERE superseded_at IS NULL;

CREATE TABLE public.goal_recommendation_months (
  recommendation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  month date NOT NULL CHECK (month = date_trunc('month', month::timestamp)::date),
  included boolean NOT NULL,
  exclusion_reason text CHECK (exclusion_reason IN ('no_data', 'incomplete_history')),
  included_spend numeric(18,2) NOT NULL,
  excluded_spend numeric(18,2) NOT NULL,
  refunds numeric(18,2) NOT NULL,
  basis_amount numeric(18,2) NOT NULL,
  PRIMARY KEY (recommendation_id, month),
  CONSTRAINT goal_recommendation_months_recommendation_fkey FOREIGN KEY (recommendation_id, user_id)
    REFERENCES public.goal_recommendations (id, user_id) ON DELETE CASCADE,
  CONSTRAINT goal_recommendation_months_included_check CHECK (included = (exclusion_reason IS NULL)),
  CONSTRAINT goal_recommendation_months_basis_check CHECK (basis_amount = included_spend - refunds)
);

CREATE TABLE public.goal_recommendation_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  included boolean NOT NULL,
  avg_monthly_amount numeric(18,2) NOT NULL,
  CONSTRAINT goal_recommendation_categories_recommendation_fkey FOREIGN KEY (recommendation_id, user_id)
    REFERENCES public.goal_recommendations (id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX goal_recommendation_categories_key
  ON public.goal_recommendation_categories (recommendation_id, category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_goal_recommendation_categories_category
  ON public.goal_recommendation_categories (category_id) WHERE category_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Invariant triggers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.goals_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Goal owner, kind and currency cannot change' USING ERRCODE = 'check_violation';
    END IF;
    -- An emergency-fund target only moves together with a newly accepted recommendation.
    IF NEW.kind = 'emergency_fund'
       AND NEW.target_amount IS DISTINCT FROM OLD.target_amount
       AND NOT EXISTS (
         SELECT 1 FROM public.goal_recommendations r
         WHERE r.goal_id = NEW.id AND r.superseded_at IS NULL AND r.accepted_target = NEW.target_amount
       ) THEN
      RAISE EXCEPTION 'An emergency fund target follows its accepted recommendation' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.status = 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER goals_guard BEFORE INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.goals_guard();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.goal_contributions_validate_link() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_currency char(3);
  v_linked numeric;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  -- Lock the transaction so two concurrent links cannot both fit the same remainder.
  SELECT * INTO v_tx FROM public.transactions
    WHERE id = NEW.transaction_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND OR v_tx.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Linked transaction unavailable' USING ERRCODE = 'check_violation';
  END IF;
  SELECT currency INTO v_currency FROM public.goals WHERE id = NEW.goal_id AND user_id = NEW.user_id;
  IF v_currency IS DISTINCT FROM v_tx.currency THEN
    RAISE EXCEPTION 'Linked transaction currency must match the goal' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(sum(abs(amount)), 0) INTO v_linked FROM public.goal_contributions
    WHERE transaction_id = NEW.transaction_id;
  IF v_linked + abs(NEW.amount) > v_tx.amount THEN
    RAISE EXCEPTION 'Linked contributions exceed the transaction amount' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER goal_contributions_validate_link BEFORE INSERT ON public.goal_contributions
  FOR EACH ROW EXECUTE FUNCTION public.goal_contributions_validate_link();

CREATE FUNCTION public.goal_contributions_check_balance() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_goal_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.goal_id ELSE NEW.goal_id END;
BEGIN
  -- Only a withdrawal or the removal of a deposit can push the balance below zero.
  IF (TG_OP = 'INSERT' AND NEW.amount > 0) OR (TG_OP = 'DELETE' AND OLD.amount < 0) THEN
    RETURN NULL;
  END IF;
  -- The goal row lock serialises concurrent withdrawals on one goal.
  PERFORM 1 FROM public.goals WHERE id = v_goal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF; -- the goal itself is being deleted
  IF (SELECT COALESCE(sum(amount), 0) FROM public.goal_contributions WHERE goal_id = v_goal_id) < 0 THEN
    RAISE EXCEPTION 'Goal balance cannot go below zero' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER goal_contributions_check_balance AFTER INSERT OR DELETE ON public.goal_contributions
  FOR EACH ROW EXECUTE FUNCTION public.goal_contributions_check_balance();

-- ---------------------------------------------------------------------------
-- Calculation and recommendation RPCs
-- ---------------------------------------------------------------------------

-- Internal: the single implementation of the emergency-fund calculation.
-- Averages net essential spend (outcome minus income, so refunds land in the
-- month they arrive) over the last completed calendar months in the timezone.
-- Only transactions in the goal currency count; others are tallied and skipped.
-- A month is left out when it has no outcome, or when the user's history starts
-- after the month began. Returns amounts as exact numerics inside jsonb.
CREATE FUNCTION public.goals_basis(
  p_user_id uuid,
  p_currency text,
  p_basis_months integer,
  p_multiplier numeric,
  p_category_ids uuid[],
  p_period_start date DEFAULT NULL,
  p_as_of timestamptz DEFAULT now(),
  p_timezone text DEFAULT 'Asia/Jakarta'
) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  c_calc_version constant integer := 1;
  c_min_months constant integer := 3;
  v_ids uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(p_category_ids) AS x);
  v_multiplier numeric := round(p_multiplier, 1);
  v_current_month date := date_trunc('month', p_as_of AT TIME ZONE p_timezone)::date;
  v_start date;
  v_end_excl date;
  v_lo timestamptz;
  v_hi timestamptz;
  v_first_tx timestamptz;
  v_months jsonb;
  v_count integer;
  v_sum numeric;
  v_categories jsonb;
  v_skipped integer;
  v_average numeric;
  v_suggested numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Owner required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid currency' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_basis_months IS NULL OR p_basis_months NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Basis must cover 1 to 12 months' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_multiplier IS NULL OR v_multiplier <= 0 OR v_multiplier > 99.9 THEN
    RAISE EXCEPTION 'Invalid multiplier' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS u(category_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = u.category_id
        AND (c.user_id IS NULL OR c.user_id = p_user_id)
        AND c.allowed_type IN ('outcome', 'both')
    )
  ) THEN
    RAISE EXCEPTION 'Category unavailable for this calculation' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_start := COALESCE(p_period_start, (v_current_month - make_interval(months => p_basis_months))::date);
  IF v_start <> date_trunc('month', v_start::timestamp)::date THEN
    RAISE EXCEPTION 'Period must start on the first day of a month' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_end_excl := (v_start + make_interval(months => p_basis_months))::date;
  IF v_end_excl > v_current_month THEN
    RAISE EXCEPTION 'Only completed calendar months can be used' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_lo := v_start::timestamp AT TIME ZONE p_timezone;
  v_hi := v_end_excl::timestamp AT TIME ZONE p_timezone;

  SELECT min(occurred_at) INTO v_first_tx FROM public.transactions
    WHERE user_id = p_user_id AND deleted_at IS NULL;

  WITH tx AS (
    SELECT date_trunc('month', t.occurred_at AT TIME ZONE p_timezone)::date AS month,
           t.type, t.amount, t.category_id
    FROM public.transactions t
    WHERE t.user_id = p_user_id AND t.deleted_at IS NULL AND t.currency = p_currency
      AND t.occurred_at >= v_lo AND t.occurred_at < v_hi
  ), month_series AS (
    SELECT (v_start + make_interval(months => n))::date AS month
    FROM generate_series(0, p_basis_months - 1) AS n
  ), agg AS (
    SELECT m.month,
      count(*) FILTER (WHERE tx.type = 'outcome') AS outcome_count,
      COALESCE(sum(tx.amount) FILTER (WHERE tx.type = 'outcome' AND tx.category_id = ANY (v_ids)), 0) AS included_spend,
      COALESCE(sum(tx.amount) FILTER (WHERE tx.type = 'outcome' AND NOT (tx.category_id = ANY (v_ids))), 0) AS excluded_spend,
      COALESCE(sum(tx.amount) FILTER (WHERE tx.type = 'income' AND tx.category_id = ANY (v_ids)), 0) AS refunds
    FROM month_series m
    LEFT JOIN tx ON tx.month = m.month
    GROUP BY m.month
  ), rated AS (
    SELECT a.month, a.included_spend, a.excluded_spend, a.refunds,
      a.included_spend - a.refunds AS basis_amount,
      CASE
        WHEN a.outcome_count = 0 THEN 'no_data'
        WHEN v_first_tx > (a.month::timestamp AT TIME ZONE p_timezone) THEN 'incomplete_history'
      END AS exclusion_reason
    FROM agg a
  ), tx_flagged AS (
    SELECT tx.*, (r.exclusion_reason IS NULL) AS month_included
    FROM tx JOIN rated r ON r.month = tx.month
  )
  SELECT
    (SELECT jsonb_agg(jsonb_build_object(
        'month', r.month,
        'included', r.exclusion_reason IS NULL,
        'exclusion_reason', r.exclusion_reason,
        'included_spend', r.included_spend,
        'excluded_spend', r.excluded_spend,
        'refunds', r.refunds,
        'basis_amount', r.basis_amount) ORDER BY r.month)
     FROM rated r),
    (SELECT count(*) FROM rated r WHERE r.exclusion_reason IS NULL),
    (SELECT sum(r.basis_amount) FROM rated r WHERE r.exclusion_reason IS NULL),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', c.id,
        'category_name', c.name,
        'included', c.id = ANY (v_ids),
        'avg_monthly_amount', COALESCE(round(a.net_amount / NULLIF((SELECT count(*) FROM rated r WHERE r.exclusion_reason IS NULL), 0), 2), 0)
      ) ORDER BY c.name, c.id), '[]'::jsonb)
     FROM public.categories c
     LEFT JOIN LATERAL (
       SELECT count(*) AS tx_count,
              sum(CASE WHEN f.type = 'outcome' THEN f.amount ELSE -f.amount END) FILTER (WHERE f.month_included) AS net_amount
       FROM tx_flagged f WHERE f.category_id = c.id
     ) a ON true
     WHERE (c.user_id IS NULL OR c.user_id = p_user_id)
       AND c.allowed_type IN ('outcome', 'both')
       AND (c.id = ANY (v_ids) OR a.tx_count > 0))
  INTO v_months, v_count, v_sum, v_categories;

  SELECT count(*) INTO v_skipped FROM public.transactions t
    WHERE t.user_id = p_user_id AND t.deleted_at IS NULL AND t.currency <> p_currency
      AND t.occurred_at >= v_lo AND t.occurred_at < v_hi;

  IF v_count >= c_min_months AND v_sum > 0 THEN
    v_average := round(v_sum / v_count, 2);
    v_suggested := round(v_sum * v_multiplier / v_count, 2);
  END IF;

  RETURN jsonb_build_object(
    'calc_version', c_calc_version,
    'currency', p_currency,
    'timezone', p_timezone,
    'basis_months', p_basis_months,
    'multiplier', v_multiplier,
    'period_start', v_start,
    'period_end', v_end_excl - 1,
    'computed_at', p_as_of,
    'min_months_required', c_min_months,
    'included_month_count', v_count,
    'average_monthly_essential', v_average,
    'suggested_target', v_suggested,
    'skipped_other_currency_count', v_skipped,
    'months', v_months,
    'categories', v_categories
  );
END;
$$;

-- Internal: validates a previewed basis and returns the target to store.
CREATE FUNCTION public.goals_accepted_target(
  p_basis jsonb,
  p_expected_average numeric,
  p_override numeric
) RETURNS numeric
  LANGUAGE plpgsql IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $$
BEGIN
  IF p_basis->>'suggested_target' IS NULL THEN
    RAISE EXCEPTION 'Not enough history for a recommendation' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- The user must be accepting the figure they were shown, not one that moved since.
  IF p_expected_average IS NULL
     OR abs(p_expected_average - (p_basis->>'average_monthly_essential')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'The calculation changed since it was previewed' USING ERRCODE = 'serialization_failure';
  END IF;
  IF p_override IS NOT NULL AND round(p_override, 2) <= 0 THEN
    RAISE EXCEPTION 'Target must be positive' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN COALESCE(round(p_override, 2), (p_basis->>'suggested_target')::numeric);
END;
$$;

-- Internal: supersedes the current snapshot and writes the new one.
CREATE FUNCTION public.goals_store_recommendation(
  p_goal_id uuid,
  p_user_id uuid,
  p_basis jsonb,
  p_accepted_target numeric
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.goal_recommendations SET superseded_at = now()
    WHERE goal_id = p_goal_id AND user_id = p_user_id AND superseded_at IS NULL;

  INSERT INTO public.goal_recommendations (
    goal_id, user_id, calc_version, timezone, basis_months, multiplier, period_start, period_end,
    computed_at, included_month_count, average_monthly_essential, suggested_target, accepted_target,
    skipped_other_currency_count)
  VALUES (
    p_goal_id, p_user_id, (p_basis->>'calc_version')::smallint, p_basis->>'timezone',
    (p_basis->>'basis_months')::smallint, (p_basis->>'multiplier')::numeric,
    (p_basis->>'period_start')::date, (p_basis->>'period_end')::date,
    (p_basis->>'computed_at')::timestamptz, (p_basis->>'included_month_count')::smallint,
    (p_basis->>'average_monthly_essential')::numeric, (p_basis->>'suggested_target')::numeric,
    p_accepted_target, (p_basis->>'skipped_other_currency_count')::integer)
  RETURNING id INTO v_id;

  INSERT INTO public.goal_recommendation_months (
    recommendation_id, user_id, month, included, exclusion_reason,
    included_spend, excluded_spend, refunds, basis_amount)
  SELECT v_id, p_user_id, m.month, m.included, m.exclusion_reason,
         m.included_spend, m.excluded_spend, m.refunds, m.basis_amount
  FROM jsonb_to_recordset(p_basis->'months') AS m(
    month date, included boolean, exclusion_reason text,
    included_spend numeric, excluded_spend numeric, refunds numeric, basis_amount numeric);

  INSERT INTO public.goal_recommendation_categories (
    recommendation_id, user_id, category_id, category_name, included, avg_monthly_amount)
  SELECT v_id, p_user_id, c.category_id, c.category_name, c.included, c.avg_monthly_amount
  FROM jsonb_to_recordset(p_basis->'categories') AS c(
    category_id uuid, category_name text, included boolean, avg_monthly_amount numeric);

  UPDATE public.goals SET target_amount = p_accepted_target
    WHERE id = p_goal_id AND user_id = p_user_id;
  RETURN v_id;
END;
$$;

-- Browser-callable: recalculate without saving anything.
CREATE FUNCTION public.preview_emergency_fund_basis(
  p_basis_months integer DEFAULT 6,
  p_category_ids uuid[] DEFAULT NULL,
  p_multiplier numeric DEFAULT 6,
  p_currency text DEFAULT 'IDR',
  p_period_start date DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.goals_basis(v_owner, p_currency, p_basis_months, p_multiplier, p_category_ids, p_period_start);
END;
$$;

-- Browser-callable: create the emergency-fund goal together with its first snapshot.
CREATE FUNCTION public.create_emergency_fund_goal(
  p_name text,
  p_currency text,
  p_target_date date,
  p_planned_monthly_amount numeric,
  p_basis_months integer,
  p_category_ids uuid[],
  p_multiplier numeric,
  p_expected_average numeric,
  p_target_override numeric DEFAULT NULL,
  p_period_start date DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_basis jsonb;
  v_target numeric;
  v_goal_id uuid;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_basis := public.goals_basis(v_owner, p_currency, p_basis_months, p_multiplier, p_category_ids, p_period_start);
  v_target := public.goals_accepted_target(v_basis, p_expected_average, p_target_override);
  INSERT INTO public.goals (user_id, kind, name, currency, target_amount, target_date, planned_monthly_amount)
    VALUES (v_owner, 'emergency_fund', p_name, p_currency, v_target, p_target_date, p_planned_monthly_amount)
    RETURNING id INTO v_goal_id;
  PERFORM public.goals_store_recommendation(v_goal_id, v_owner, v_basis, v_target);
  RETURN v_goal_id;
END;
$$;

-- Browser-callable: accept a refreshed recommendation for an existing goal.
-- Pass the stored period_start to re-run the same frozen window.
CREATE FUNCTION public.accept_emergency_fund_recommendation(
  p_goal_id uuid,
  p_basis_months integer,
  p_category_ids uuid[],
  p_multiplier numeric,
  p_expected_average numeric,
  p_target_override numeric DEFAULT NULL,
  p_period_start date DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_currency text;
  v_basis jsonb;
  v_target numeric;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Missing and not-yours are deliberately indistinguishable.
  SELECT currency INTO v_currency FROM public.goals
    WHERE id = p_goal_id AND user_id = v_owner AND kind = 'emergency_fund' AND status = 'active'
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal unavailable' USING ERRCODE = 'no_data_found';
  END IF;
  v_basis := public.goals_basis(v_owner, v_currency, p_basis_months, p_multiplier, p_category_ids, p_period_start);
  v_target := public.goals_accepted_target(v_basis, p_expected_average, p_target_override);
  RETURN public.goals_store_recommendation(p_goal_id, v_owner, v_basis, v_target);
END;
$$;

-- ---------------------------------------------------------------------------
-- Progress view
-- ---------------------------------------------------------------------------

CREATE VIEW public.goal_progress WITH (security_invoker = true) AS
SELECT
  g.id AS goal_id,
  g.user_id,
  g.currency,
  g.target_amount,
  COALESCE(c.saved_amount, 0) AS saved_amount,
  GREATEST(g.target_amount - COALESCE(c.saved_amount, 0), 0) AS remaining_amount,
  round(COALESCE(c.saved_amount, 0) / g.target_amount * 100, 1) AS progress_percent,
  COALESCE(c.contribution_count, 0) AS contribution_count,
  c.last_contributed_on,
  r.id AS recommendation_id,
  r.average_monthly_essential,
  CASE WHEN r.average_monthly_essential > 0
    THEN round(COALESCE(c.saved_amount, 0) / r.average_monthly_essential, 1)
  END AS months_of_coverage
FROM public.goals g
LEFT JOIN LATERAL (
  SELECT sum(gc.amount) AS saved_amount, count(*) AS contribution_count, max(gc.contributed_on) AS last_contributed_on
  FROM public.goal_contributions gc WHERE gc.goal_id = g.id
) c ON true
LEFT JOIN public.goal_recommendations r ON r.goal_id = g.id AND r.superseded_at IS NULL;

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_recommendation_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_recommendation_categories ENABLE ROW LEVEL SECURITY;

-- Emergency-fund goals come only from create_emergency_fund_goal, so a direct insert must be custom.
CREATE POLICY "goals_read_own" ON public.goals FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "goals_insert_own_custom" ON public.goals FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND kind = 'custom');
CREATE POLICY "goals_update_own" ON public.goals FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "goals_delete_own" ON public.goals FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "goal_contributions_read_own" ON public.goal_contributions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "goal_contributions_insert_own" ON public.goal_contributions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "goal_contributions_update_own" ON public.goal_contributions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "goal_contributions_delete_own" ON public.goal_contributions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "goal_recommendations_read_own" ON public.goal_recommendations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "goal_recommendation_months_read_own" ON public.goal_recommendation_months FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "goal_recommendation_categories_read_own" ON public.goal_recommendation_categories FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Default privileges give anon and authenticated ALL on new relations and functions
-- (including TRUNCATE, which RLS does not govern), so revoke first and grant narrowly.
REVOKE ALL ON TABLE public.goals, public.goal_contributions, public.goal_recommendations,
  public.goal_recommendation_months, public.goal_recommendation_categories, public.goal_progress
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE ON public.goals TO authenticated;
GRANT UPDATE (name, description, target_amount, target_date, planned_monthly_amount, status)
  ON public.goals TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.goal_contributions TO authenticated;
GRANT UPDATE (contributed_on, description) ON public.goal_contributions TO authenticated;
GRANT SELECT ON public.goal_recommendations, public.goal_recommendation_months,
  public.goal_recommendation_categories, public.goal_progress TO authenticated;

REVOKE ALL ON FUNCTION public.goals_guard(), public.goal_contributions_validate_link(),
  public.goal_contributions_check_balance(),
  public.goals_basis(uuid, text, integer, numeric, uuid[], date, timestamptz, text),
  public.goals_accepted_target(jsonb, numeric, numeric),
  public.goals_store_recommendation(uuid, uuid, jsonb, numeric),
  public.preview_emergency_fund_basis(integer, uuid[], numeric, text, date),
  public.create_emergency_fund_goal(text, text, date, numeric, integer, uuid[], numeric, numeric, numeric, date),
  public.accept_emergency_fund_recommendation(uuid, integer, uuid[], numeric, numeric, numeric, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.preview_emergency_fund_basis(integer, uuid[], numeric, text, date),
  public.create_emergency_fund_goal(text, text, date, numeric, integer, uuid[], numeric, numeric, numeric, date),
  public.accept_emergency_fund_recommendation(uuid, integer, uuid[], numeric, numeric, numeric, date)
  TO authenticated;
