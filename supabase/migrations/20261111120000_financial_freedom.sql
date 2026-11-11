CREATE TABLE public.financial_freedom_plans (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  revision uuid NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  annual_spending numeric NOT NULL CHECK (annual_spending BETWEEN 0.01 AND 9999999999999.99 AND scale(annual_spending) <= 2),
  withdrawal_rate numeric NOT NULL CHECK (withdrawal_rate BETWEEN 0.01 AND 100 AND scale(withdrawal_rate) <= 2),
  investable_assets numeric NOT NULL CHECK (investable_assets BETWEEN 0 AND 9999999999999.99 AND scale(investable_assets) <= 2),
  calculation_date date NOT NULL CHECK (calculation_date BETWEEN '1900-01-01' AND '9999-12-31'),
  spending_period_start date,
  scenarios jsonb NOT NULL,
  CONSTRAINT financial_freedom_completed_period CHECK (
    spending_period_start IS NULL OR (
      extract(day FROM spending_period_start) = 1
      AND spending_period_start + interval '12 months' <= calculation_date
    )
  ),
  CONSTRAINT financial_freedom_valid_scenarios CHECK (
    CASE WHEN jsonb_typeof(scenarios) = 'array' THEN
      jsonb_array_length(scenarios) = 2
      AND jsonb_array_length(jsonb_path_query_array(scenarios, 'strict $[*] ? (
        @.monthly_contribution >= 0 && @.monthly_contribution <= 9999999999999.99
        && @.investment_return >= -100 && @.investment_return <= 100
        && @.inflation >= -99.99 && @.inflation <= 100
        && @.costs >= 0 && @.costs <= 100
        && @.contribution_growth >= -99.99 && @.contribution_growth <= 100
        && @.investment_return - @.costs >= -100
        && (@.monthly_contribution * 100).floor() == @.monthly_contribution * 100
        && (@.investment_return * 100).floor() == @.investment_return * 100
        && (@.inflation * 100).floor() == @.inflation * 100
        && (@.costs * 100).floor() == @.costs * 100
        && (@.contribution_growth * 100).floor() == @.contribution_growth * 100
      )', '{}', true)) = 2
    ELSE false END
  )
);

ALTER TABLE public.financial_freedom_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_freedom_plans_own ON public.financial_freedom_plans FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.financial_freedom_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_freedom_plans TO authenticated;
