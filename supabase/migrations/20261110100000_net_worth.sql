-- Issue #25: owner-scoped balance sheet, append-only revisions and frozen snapshots.
-- Rollback: export the three wealth tables, then drop the wealth views, RPCs,
-- tables and wealth_entries_guard function. No existing ledger data is changed.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.wealth_entries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  kind text NOT NULL CHECK (kind IN ('asset', 'liability')),
  category text NOT NULL CHECK (category IN ('property', 'land', 'cash', 'deposit', 'stocks', 'fund', 'bond', 'mortgage', 'loan', 'credit_card', 'other')),
  classification text NOT NULL CHECK (classification IN ('investable', 'emergency_reserve', 'primary_residence', 'other')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  account_id uuid,
  goal_id uuid,
  notes text CHECK (length(notes) <= 500),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (account_id, user_id) REFERENCES public.accounts(id, user_id),
  FOREIGN KEY (goal_id, user_id) REFERENCES public.goals(id, user_id),
  CHECK (kind = 'asset' OR (classification = 'other' AND goal_id IS NULL))
);
CREATE UNIQUE INDEX wealth_entries_name_key ON public.wealth_entries(user_id, lower(btrim(name))) WHERE NOT archived;
CREATE UNIQUE INDEX wealth_entries_account_key ON public.wealth_entries(user_id, account_id) WHERE NOT archived AND account_id IS NOT NULL;

CREATE TABLE public.wealth_valuations (
  id uuid PRIMARY KEY,
  entry_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  amount numeric(18,2) CHECK (amount >= 0 AND amount < 10000000000000),
  valued_on date,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request jsonb NOT NULL,
  FOREIGN KEY (entry_id, user_id) REFERENCES public.wealth_entries(id, user_id) ON DELETE CASCADE,
  CHECK ((amount IS NULL) = (valued_on IS NULL)),
  CHECK (valued_on IS NULL OR valued_on <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date)
);
CREATE INDEX wealth_valuations_entry_idx ON public.wealth_valuations(entry_id, recorded_at DESC);

CREATE TABLE public.wealth_snapshots (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  totals jsonb NOT NULL,
  entries jsonb NOT NULL
);
CREATE INDEX wealth_snapshots_owner_date_idx ON public.wealth_snapshots(user_id, captured_at DESC);

ALTER TABLE public.wealth_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wealth_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wealth_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY wealth_entries_read ON public.wealth_entries FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY wealth_valuations_read ON public.wealth_valuations FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY wealth_snapshots_read ON public.wealth_snapshots FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.wealth_entries, public.wealth_valuations, public.wealth_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wealth_entries, public.wealth_valuations, public.wealth_snapshots TO authenticated;

CREATE FUNCTION public.wealth_entries_guard() RETURNS trigger LANGUAGE plpgsql
  SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.user_id, NEW.kind, NEW.currency, NEW.account_id)
    IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.kind, OLD.currency, OLD.account_id) THEN
    RAISE EXCEPTION 'Type, currency and account source cannot change. Archive this entry and create another.' USING ERRCODE = '22023';
  END IF;
  IF NEW.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND user_id = NEW.user_id AND btrim(currency) = NEW.currency
  ) THEN
    RAISE EXCEPTION 'Choose your own account in the same currency.' USING ERRCODE = '22023';
  END IF;
  IF NEW.goal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.goals WHERE id = NEW.goal_id AND user_id = NEW.user_id AND btrim(currency) = NEW.currency
  ) THEN
    RAISE EXCEPTION 'Choose your own goal in the same currency.' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER wealth_entries_validate BEFORE INSERT OR UPDATE ON public.wealth_entries
  FOR EACH ROW EXECUTE FUNCTION public.wealth_entries_guard();

-- Account links replace the manual valuation. Goals are only labels/earmarks;
-- goal contributions are deliberately never added to this balance sheet.
CREATE VIEW public.wealth_current WITH (security_invoker = true) AS
SELECT e.*, v.id AS revision_id,
  CASE WHEN e.account_id IS NULL THEN v.amount ELSE abs(coalesce(b.balance, 0)) END AS amount,
  CASE WHEN e.account_id IS NOT NULL AND coalesce(b.balance, 0) < 0 THEN 'liability' ELSE e.kind END AS effective_kind,
  CASE WHEN e.account_id IS NULL THEN v.valued_on ELSE (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date END AS valued_on,
  CASE WHEN e.account_id IS NULL THEN 'manual' ELSE 'account' END AS source,
  CASE WHEN e.account_id IS NULL THEN v.amount IS NULL ELSE false END AS missing_value,
  CASE WHEN e.account_id IS NULL THEN coalesce(v.valued_on < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date - 90, false) ELSE false END AS stale,
  a.name AS account_name,
  g.name AS goal_name
FROM public.wealth_entries e
LEFT JOIN LATERAL (
  SELECT id, amount, valued_on FROM public.wealth_valuations
  WHERE entry_id = e.id AND user_id = e.user_id ORDER BY recorded_at DESC, id DESC LIMIT 1
) v ON true
LEFT JOIN public.accounts a ON a.id = e.account_id AND a.user_id = e.user_id
LEFT JOIN public.goals g ON g.id = e.goal_id AND g.user_id = e.user_id
LEFT JOIN LATERAL (
  SELECT sum(CASE WHEN t.type IN ('income', 'transfer_in') THEN t.amount ELSE -t.amount END) AS balance
  FROM public.transactions t WHERE t.user_id = e.user_id AND t.account_id = e.account_id
    AND btrim(t.currency) = e.currency AND t.deleted_at IS NULL AND t.occurred_at <= now()
) b ON e.account_id IS NOT NULL
WHERE NOT e.archived;
REVOKE ALL ON public.wealth_current FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wealth_current TO authenticated;

CREATE FUNCTION public.save_wealth_entry(p_entry jsonb, p_revision_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner_id uuid := auth.uid();
  entry_id uuid := (p_entry->>'id')::uuid;
  previous public.wealth_entries;
  revision public.wealth_valuations;
  account_id uuid := nullif(p_entry->>'account_id', '')::uuid;
  value numeric := nullif(p_entry->>'amount', '')::numeric;
  value_date date := nullif(p_entry->>'valued_on', '')::date;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Sign in to save an entry.' USING ERRCODE = '42501'; END IF;
  -- Serializes same-owner saves and retries, including the first insert.
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text, 25));
  SELECT * INTO revision FROM public.wealth_valuations WHERE id = p_revision_id;
  IF FOUND THEN
    IF revision.user_id <> owner_id OR revision.request IS DISTINCT FROM p_entry THEN
      RAISE EXCEPTION 'This save request has already been used.' USING ERRCODE = '22023';
    END IF;
    RETURN revision.entry_id;
  END IF;
  SELECT * INTO previous FROM public.wealth_entries WHERE id = entry_id FOR UPDATE;
  IF FOUND THEN
    IF previous.user_id <> owner_id THEN RAISE EXCEPTION 'Entry unavailable.' USING ERRCODE = '42501'; END IF;
    IF previous.archived THEN RAISE EXCEPTION 'Restore the entry before editing it.' USING ERRCODE = '22023'; END IF;
    IF (p_entry->>'expected_updated_at')::timestamptz IS DISTINCT FROM previous.updated_at THEN
      RAISE EXCEPTION 'This entry changed. Refresh before editing it again.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF account_id IS NOT NULL AND (value IS NOT NULL OR value_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Linked accounts use their tracked balance. Leave the manual valuation empty.' USING ERRCODE = '22023';
  END IF;
  IF value IS NOT NULL AND (value <> round(value, 2) OR value = 'NaN'::numeric) THEN
    RAISE EXCEPTION 'Use an amount with at most two decimal places.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.wealth_entries AS e (id, user_id, name, kind, category, classification, currency, account_id, goal_id, notes)
  VALUES (entry_id, owner_id, btrim(p_entry->>'name'), p_entry->>'kind', p_entry->>'category',
    p_entry->>'classification', p_entry->>'currency', account_id, nullif(p_entry->>'goal_id', '')::uuid, nullif(btrim(p_entry->>'notes'), ''))
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind,
    category = EXCLUDED.category, classification = EXCLUDED.classification, currency = EXCLUDED.currency,
    account_id = EXCLUDED.account_id, goal_id = EXCLUDED.goal_id, notes = EXCLUDED.notes;
  INSERT INTO public.wealth_valuations(id, entry_id, user_id, amount, valued_on, request)
  VALUES (p_revision_id, entry_id, owner_id, value, value_date, p_entry);
  RETURN entry_id;
END;
$$;

CREATE FUNCTION public.archive_wealth_entry(p_entry_id uuid, p_archived boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR p_archived IS NULL THEN RAISE EXCEPTION 'Entry unavailable.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 25));
  UPDATE public.wealth_entries SET archived = p_archived WHERE id = p_entry_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry unavailable.' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE FUNCTION public.capture_wealth_snapshot(p_snapshot_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner_id uuid := auth.uid(); existing_owner uuid;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Sign in to save a snapshot.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text, 25));
  SELECT user_id INTO existing_owner FROM public.wealth_snapshots WHERE id = p_snapshot_id;
  IF FOUND THEN
    IF existing_owner <> owner_id THEN RAISE EXCEPTION 'Snapshot unavailable.' USING ERRCODE = '42501'; END IF;
    RETURN p_snapshot_id;
  END IF;
  -- One statement freezes totals and their supporting rows at the same MVCC snapshot.
  WITH entries AS MATERIALIZED (SELECT * FROM public.wealth_current WHERE user_id = owner_id),
  totals AS (
    SELECT currency,
      coalesce(sum(amount) FILTER (WHERE effective_kind = 'asset'), 0) AS assets,
      coalesce(sum(amount) FILTER (WHERE effective_kind = 'liability'), 0) AS liabilities,
      coalesce(sum(CASE WHEN effective_kind = 'asset' THEN amount ELSE -amount END), 0) AS net_worth,
      coalesce(sum(amount) FILTER (WHERE effective_kind = 'asset' AND classification = 'investable'), 0) AS investable,
      count(*) FILTER (WHERE missing_value) AS missing_count,
      count(*) FILTER (WHERE stale) AS stale_count
    FROM entries GROUP BY currency
  )
  INSERT INTO public.wealth_snapshots(id, user_id, totals, entries)
  SELECT p_snapshot_id, owner_id,
    coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY currency) FROM totals t), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY name, id) FROM entries e), '[]'::jsonb);
  RETURN p_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wealth_entries_guard(), public.save_wealth_entry(jsonb, uuid),
  public.archive_wealth_entry(uuid, boolean), public.capture_wealth_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_wealth_entry(jsonb, uuid), public.archive_wealth_entry(uuid, boolean),
  public.capture_wealth_snapshot(uuid) TO authenticated;
