-- Add settings in place so goal IDs, accepted recommendations, plans, and
-- contribution history survive. Roll back the app first if necessary. Keep
-- the expanded schema while any new goal types exist.
ALTER TABLE public.goals
  DROP CONSTRAINT goals_kind_check,
  ADD CONSTRAINT goals_kind_check CHECK (
    kind IN ('emergency_fund', 'custom', 'sinking_fund', 'investment', 'debt_payoff')
  ),
  ADD COLUMN investment_market_value numeric(18,2),
  ADD COLUMN debt_balance numeric(18,2),
  ADD COLUMN debt_apr numeric(5,2),
  ADD COLUMN debt_monthly_fee numeric(18,2),
  ADD COLUMN debt_monthly_payment numeric(18,2),
  ADD CONSTRAINT goals_investment_settings_check CHECK (
    investment_market_value IS NULL OR
    (kind = 'investment' AND investment_market_value BETWEEN 0 AND 9999999999999.99)
  ),
  ADD CONSTRAINT goals_debt_settings_check CHECK (
    CASE WHEN kind = 'debt_payoff' THEN
      debt_balance IS NOT NULL AND debt_balance BETWEEN 0 AND 9999999999999.99
      AND debt_apr IS NOT NULL AND debt_apr BETWEEN 0 AND 100
      AND debt_monthly_fee IS NOT NULL AND debt_monthly_fee BETWEEN 0 AND 9999999999999.99
      AND debt_monthly_payment IS NOT NULL AND debt_monthly_payment BETWEEN 0 AND 9999999999999.99
    ELSE
      debt_balance IS NULL AND debt_apr IS NULL AND debt_monthly_fee IS NULL AND debt_monthly_payment IS NULL
    END
  ),
  ADD CONSTRAINT goals_extended_target_check CHECK (
    kind IN ('emergency_fund', 'custom') OR target_amount <= 9999999999999.99
  );

ALTER POLICY goals_insert_own_custom ON public.goals
  WITH CHECK (user_id = (SELECT auth.uid()) AND kind IN ('custom', 'sinking_fund', 'investment', 'debt_payoff'));
ALTER POLICY goals_insert_own_custom ON public.goals RENAME TO goals_insert_own_manual;

GRANT UPDATE (investment_market_value, debt_balance, debt_apr, debt_monthly_fee, debt_monthly_payment)
  ON public.goals TO authenticated;

COMMENT ON COLUMN public.goals.debt_balance IS 'Latest lender balance entered by the owner. For debt goals, target_amount is the opening balance and goal contributions record gross repayments.';

CREATE FUNCTION public.goal_contributions_check_goal_type() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  goal_kind text;
BEGIN
  SELECT kind INTO goal_kind FROM public.goals WHERE id = NEW.goal_id AND user_id = NEW.user_id;
  IF goal_kind IN ('sinking_fund', 'investment', 'debt_payoff') AND abs(NEW.amount) > 9999999999999.99 THEN
    RAISE EXCEPTION 'Goal activity amount exceeds the supported range' USING ERRCODE = 'check_violation';
  END IF;
  IF goal_kind = 'debt_payoff' AND (NEW.amount <= 0 OR NEW.transaction_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Record a positive manual repayment for a debt goal' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.goal_contributions_check_goal_type() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER goal_contributions_check_goal_type
  BEFORE INSERT ON public.goal_contributions FOR EACH ROW
  EXECUTE FUNCTION public.goal_contributions_check_goal_type();

CREATE OR REPLACE VIEW public.goal_progress WITH (security_invoker = true) AS
SELECT
  g.id AS goal_id,
  g.user_id,
  g.currency,
  g.target_amount,
  actual.progress_amount AS saved_amount,
  CASE WHEN g.kind = 'debt_payoff' THEN g.debt_balance
    ELSE GREATEST(g.target_amount - actual.progress_amount, 0)
  END AS remaining_amount,
  round(actual.progress_amount / g.target_amount * 100, 1) AS progress_percent,
  COALESCE(c.contribution_count, 0) AS contribution_count,
  c.last_contributed_on,
  r.id AS recommendation_id,
  r.average_monthly_essential,
  CASE WHEN r.average_monthly_essential > 0
    THEN round(actual.progress_amount / r.average_monthly_essential, 1)
  END AS months_of_coverage,
  CASE WHEN g.kind = 'debt_payoff' THEN COALESCE(c.net_amount, 0) END AS repayment_amount
FROM public.goals g
LEFT JOIN LATERAL (
  SELECT sum(gc.amount) AS net_amount, count(*) AS contribution_count, max(gc.contributed_on) AS last_contributed_on
  FROM public.goal_contributions gc WHERE gc.goal_id = g.id
) c ON true
CROSS JOIN LATERAL (
  SELECT CASE WHEN g.kind = 'debt_payoff' THEN GREATEST(g.target_amount - g.debt_balance, 0)
    ELSE COALESCE(c.net_amount, 0)
  END AS progress_amount
) actual
LEFT JOIN public.goal_recommendations r ON r.goal_id = g.id AND r.superseded_at IS NULL;
