-- Data-free baseline captured from production on 2026-09-17.
-- Production already contains this schema. Its migration version is registered
-- as applied; do not execute this file manually against the existing project.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."cat_allowed_type" AS ENUM (
    'income',
    'outcome',
    'both'
);


ALTER TYPE "public"."cat_allowed_type" OWNER TO "postgres";


CREATE TYPE "public"."tx_type" AS ENUM (
    'income',
    'outcome'
);


ALTER TYPE "public"."tx_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_check_category_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE category_owner uuid;
BEGIN
  SELECT user_id INTO category_owner FROM public.categories WHERE id = NEW.category_id;
  IF NOT FOUND OR NEW.user_id IS NULL OR (category_owner IS NOT NULL AND category_owner <> NEW.user_id) THEN
    RAISE EXCEPTION 'Category unavailable for transaction or budget owner';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."backend_check_category_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_process_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  owner_id uuid;
  staged public.transaction_staging%ROWTYPE;
  txn public.transactions%ROWTYPE;
  category_owner uuid;
BEGIN
  IF p_action NOT IN ('confirm', 'reject') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;
  SELECT supabase_user_id INTO owner_id FROM public.telegram_users
    WHERE telegram_user_id = p_telegram_user_id AND is_active = true FOR SHARE;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Active Telegram link required'; END IF;
  SELECT * INTO staged FROM public.transaction_staging
    WHERE id = p_staging_id AND user_id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction unavailable'; END IF;
  IF staged.status = 'confirmed' AND p_action = 'confirm' THEN
    SELECT * INTO txn FROM public.transactions
      WHERE id = (staged.metadata->>'transaction_id')::uuid AND user_id = owner_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Previously confirmed row requires reconciliation'; END IF;
    RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'txn', to_jsonb(txn));
  END IF;
  IF staged.status = 'rejected' AND p_action = 'reject' THEN
    RETURN jsonb_build_object('stagingData', to_jsonb(staged));
  END IF;
  IF staged.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;
  IF p_action = 'reject' THEN
    UPDATE public.transaction_staging SET status = 'rejected', rejected_at = now() WHERE id = staged.id;
    RETURN jsonb_build_object('stagingData', to_jsonb(staged));
  END IF;
  IF staged.category_id IS NULL THEN
    staged.category_id := public.backend_resolve_category(owner_id, 'Uncategorized');
  END IF;
  SELECT user_id INTO category_owner FROM public.categories WHERE id = staged.category_id FOR SHARE;
  IF NOT FOUND OR (category_owner IS NOT NULL AND category_owner <> owner_id) THEN
    RAISE EXCEPTION 'Category unavailable';
  END IF;
  IF staged.account_id IS NULL THEN
    INSERT INTO public.accounts (name) VALUES ('Bank')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO staged.account_id;
  END IF;
  -- Populate against the actual transaction enum/column types.
  SELECT * INTO txn FROM jsonb_populate_record(NULL::public.transactions,
    jsonb_build_object('type', staged.type, 'currency', staged.currency));
  INSERT INTO public.transactions (amount, description, occurred_at, type, category_id, account_id, user_id, currency)
    VALUES (staged.amount, staged.description, staged.occurred_at, txn.type,
      staged.category_id, staged.account_id, owner_id, txn.currency) RETURNING * INTO txn;
  UPDATE public.transaction_staging SET status = 'confirmed', confirmed_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('transaction_id', txn.id)
    WHERE id = staged.id;
  RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'txn', to_jsonb(txn));
END;
$$;


ALTER FUNCTION "public"."backend_process_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_resolve_category"("p_user_id" "uuid", "p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  category_id uuid;
  matches uuid[];
  owner_scope uuid;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.telegram_users WHERE supabase_user_id = p_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Valid category owner required';
  END IF;
  p_name := btrim(p_name);
  IF p_name IS NULL OR p_name = '' THEN RAISE EXCEPTION 'Category name required'; END IF;
  -- Serialize backend spelling variants; browser uniqueness remains case-sensitive.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || lower(p_name), 0));
  FOREACH owner_scope IN ARRAY ARRAY[p_user_id, NULL::uuid] LOOP
    SELECT id INTO category_id FROM public.categories
      WHERE user_id IS NOT DISTINCT FROM owner_scope AND name = p_name;
    IF FOUND THEN RETURN category_id; END IF;
    SELECT array_agg(id) INTO matches FROM public.categories
      WHERE user_id IS NOT DISTINCT FROM owner_scope AND lower(name) = lower(p_name);
    IF cardinality(matches) > 1 THEN RAISE EXCEPTION 'Ambiguous category spelling; use exact name'; END IF;
    IF cardinality(matches) = 1 THEN RETURN matches[1]; END IF;
  END LOOP;
  INSERT INTO public.categories (name, allowed_type, user_id)
    VALUES (p_name, 'both', p_user_id)
    ON CONFLICT (user_id, name) WHERE user_id IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO category_id;
  RETURN category_id;
END;
$$;


ALTER FUNCTION "public"."backend_resolve_category"("p_user_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_revise_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text", "p_choice_id" "uuid" DEFAULT NULL::"uuid", "p_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  owner_id uuid;
  staged public.transaction_staging%ROWTYPE;
  choices jsonb := '[]'::jsonb;
  category_name text;
  account_name text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('view', 'categories', 'accounts', 'category', 'account') THEN
    RAISE EXCEPTION 'Invalid revision action';
  END IF;
  IF p_page IS NULL OR p_page < 0 OR p_page > 10000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
  SELECT supabase_user_id INTO owner_id FROM public.telegram_users
    WHERE telegram_user_id = p_telegram_user_id AND is_active = true FOR SHARE;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Active Telegram link required'; END IF;
  -- Use the same row lock as confirmation so an edit cannot change a saved receipt.
  SELECT * INTO staged FROM public.transaction_staging
    WHERE id = p_staging_id AND user_id = owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction unavailable'; END IF;
  IF staged.status <> 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

  IF p_action = 'category' THEN
    PERFORM 1 FROM public.categories WHERE id = p_choice_id
      AND (user_id IS NULL OR user_id = owner_id)
      AND allowed_type::text IN ('both', staged.type) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Category unavailable for this transaction'; END IF;
    UPDATE public.transaction_staging SET category_id = p_choice_id
      WHERE id = staged.id RETURNING * INTO staged;
  ELSIF p_action = 'account' THEN
    -- Accounts are shared in the existing application schema.
    PERFORM 1 FROM public.accounts WHERE id = p_choice_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
    UPDATE public.transaction_staging SET account_id = p_choice_id
      WHERE id = staged.id RETURNING * INTO staged;
  ELSIF p_action = 'categories' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.name, c.id), '[]'::jsonb) INTO choices
    FROM (SELECT id, name FROM public.categories
      WHERE (user_id IS NULL OR user_id = owner_id) AND allowed_type::text IN ('both', staged.type)
      ORDER BY name, id LIMIT 9 OFFSET p_page * 8) c;
  ELSIF p_action = 'accounts' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.name, a.id), '[]'::jsonb) INTO choices
    FROM (SELECT id, name FROM public.accounts ORDER BY name, id LIMIT 9 OFFSET p_page * 8) a;
  END IF;
  SELECT name INTO category_name FROM public.categories WHERE id = staged.category_id
    AND (user_id IS NULL OR user_id = owner_id);
  SELECT name INTO account_name FROM public.accounts WHERE id = staged.account_id;
  RETURN jsonb_build_object('stagingData', to_jsonb(staged), 'categoryName', category_name,
    'accountName', account_name, 'choices', choices, 'page', p_page);
END;
$$;


ALTER FUNCTION "public"."backend_revise_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text", "p_choice_id" "uuid", "p_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backend_save_telegram_transaction"("p_user_id" "uuid", "p_update_id" bigint, "p_transaction" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  txn public.transactions%ROWTYPE;
  category_id uuid;
  account_id uuid;
  transaction_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_update_id IS NULL OR p_update_id < 0 THEN RAISE EXCEPTION 'Owner and update required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram-update:' || p_update_id::text, 0));
  SELECT u.transaction_id INTO transaction_id FROM public.telegram_processed_updates u
    WHERE u.update_id = p_update_id AND u.user_id = p_user_id;
  IF FOUND THEN
    IF transaction_id IS NULL THEN RAISE EXCEPTION 'Previously processed transaction was deleted'; END IF;
    RETURN transaction_id;
  END IF;
  category_id := public.backend_resolve_category(p_user_id, p_transaction->>'categoryName');
  IF nullif(btrim(p_transaction->>'accountName'), '') IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
  INSERT INTO public.accounts (name) VALUES (btrim(p_transaction->>'accountName'))
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO account_id;
  SELECT * INTO txn FROM jsonb_populate_record(NULL::public.transactions, p_transaction);
  INSERT INTO public.transactions (user_id, category_id, account_id, type, amount, occurred_at, description, currency, metadata)
    VALUES (p_user_id, category_id, account_id, txn.type, txn.amount, txn.occurred_at, txn.description, 'IDR',
      jsonb_build_object('telegram_update_id', p_update_id::text)) RETURNING id INTO transaction_id;
  INSERT INTO public.telegram_processed_updates (update_id, user_id, transaction_id)
    VALUES (p_update_id, p_user_id, transaction_id);
  RETURN transaction_id;
END;
$$;


ALTER FUNCTION "public"."backend_save_telegram_transaction"("p_user_id" "uuid", "p_update_id" bigint, "p_transaction" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_category_type_alignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  cat_type cat_allowed_type;
begin
  select allowed_type into cat_type
  from public.categories
  where id = new.category_id;

  if cat_type = 'income' and new.type <> 'income' then
    raise exception 'Category % is income-only; got type=%', new.category_id, new.type;
  elsif cat_type = 'outcome' and new.type <> 'outcome' then
    raise exception 'Category % is outcome-only; got type=%', new.category_id, new.type;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_category_type_alignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "currency" character(3) DEFAULT 'IDR'::"bpchar" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "period" "text" NOT NULL,
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budgets_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "budgets_period_check" CHECK (("period" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text"])))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


COMMENT ON TABLE "public"."budgets" IS 'Budget tracking for categories with daily, weekly, monthly, or yearly periods';



COMMENT ON COLUMN "public"."budgets"."amount" IS 'Budget amount in the specified currency';



COMMENT ON COLUMN "public"."budgets"."period" IS 'Budget period: daily, weekly, monthly, or yearly';



COMMENT ON COLUMN "public"."budgets"."start_date" IS 'When the budget period starts';



COMMENT ON COLUMN "public"."budgets"."end_date" IS 'Optional end date for the budget (null means ongoing)';



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "allowed_type" "public"."cat_allowed_type" DEFAULT 'both'::"public"."cat_allowed_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."telegram_processed_updates" (
    "update_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "transaction_id" "uuid",
    CONSTRAINT "telegram_processed_updates_update_id_check" CHECK (("update_id" >= 0))
);


ALTER TABLE "public"."telegram_processed_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."telegram_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "telegram_user_id" bigint NOT NULL,
    "telegram_username" "text",
    "telegram_first_name" "text",
    "telegram_last_name" "text",
    "supabase_user_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telegram_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_staging" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "description" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "type" "text" DEFAULT 'outcome'::"text" NOT NULL,
    "category_id" "uuid",
    "account_id" "uuid",
    "user_id" "uuid",
    "currency" "text" DEFAULT 'IDR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    CONSTRAINT "transaction_staging_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "transaction_staging_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'rejected'::"text", 'expired'::"text"]))),
    CONSTRAINT "transaction_staging_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'outcome'::"text"])))
);


ALTER TABLE "public"."transaction_staging" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "category_id" "uuid" NOT NULL,
    "type" "public"."tx_type" NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "currency" character(3) DEFAULT 'IDR'::"bpchar" NOT NULL,
    "description" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "deleted_at" timestamp with time zone,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    CONSTRAINT "transactions_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_processed_updates"
    ADD CONSTRAINT "telegram_processed_updates_pkey" PRIMARY KEY ("update_id");



ALTER TABLE ONLY "public"."telegram_users"
    ADD CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_users"
    ADD CONSTRAINT "telegram_users_telegram_user_id_key" UNIQUE ("telegram_user_id");



ALTER TABLE ONLY "public"."transaction_staging"
    ADD CONSTRAINT "transaction_staging_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "unique_user_category_period" UNIQUE ("user_id", "category_id", "period", "start_date");



CREATE UNIQUE INDEX "categories_owner_name_key" ON "public"."categories" USING "btree" ("user_id", "name") WHERE ("user_id" IS NOT NULL);



CREATE UNIQUE INDEX "categories_shared_name_key" ON "public"."categories" USING "btree" ("name") WHERE ("user_id" IS NULL);



CREATE INDEX "idx_budgets_category_id" ON "public"."budgets" USING "btree" ("category_id");



CREATE INDEX "idx_budgets_period" ON "public"."budgets" USING "btree" ("period");



CREATE INDEX "idx_budgets_start_date" ON "public"."budgets" USING "btree" ("start_date");



CREATE INDEX "idx_budgets_user_id" ON "public"."budgets" USING "btree" ("user_id");



CREATE INDEX "idx_transaction_staging_created_at" ON "public"."transaction_staging" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_transaction_staging_status" ON "public"."transaction_staging" USING "btree" ("status");



CREATE INDEX "idx_transaction_staging_user_id" ON "public"."transaction_staging" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");



CREATE INDEX "idx_transactions_user_id_deleted_at" ON "public"."transactions" USING "btree" ("user_id", "deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_transactions_user_id_occurred_at" ON "public"."transactions" USING "btree" ("user_id", "occurred_at" DESC);



CREATE INDEX "idx_transactions_user_id_type_deleted_at" ON "public"."transactions" USING "btree" ("user_id", "type", "deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_transactions_user_id_type_occurred_at" ON "public"."transactions" USING "btree" ("user_id", "type", "occurred_at" DESC);



CREATE INDEX "ix_telegram_users_active" ON "public"."telegram_users" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "ix_telegram_users_supabase_id" ON "public"."telegram_users" USING "btree" ("supabase_user_id");



CREATE INDEX "ix_telegram_users_telegram_id" ON "public"."telegram_users" USING "btree" ("telegram_user_id");



CREATE INDEX "ix_tx_category_time" ON "public"."transactions" USING "btree" ("category_id", "occurred_at" DESC);



CREATE INDEX "ix_tx_occurred_at" ON "public"."transactions" USING "btree" ("occurred_at" DESC);



CREATE INDEX "transactions_user_id_idx" ON "public"."transactions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "backend_budget_category_owner" BEFORE INSERT OR UPDATE OF "category_id", "user_id" ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."backend_check_category_owner"();



CREATE OR REPLACE TRIGGER "backend_transaction_category_owner" BEFORE INSERT OR UPDATE OF "category_id", "user_id" ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."backend_check_category_owner"();



CREATE OR REPLACE TRIGGER "trg_tx_category_type_check" BEFORE INSERT OR UPDATE OF "category_id", "type" ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_category_type_alignment"();



CREATE OR REPLACE TRIGGER "update_budgets_updated_at" BEFORE UPDATE ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_processed_updates"
    ADD CONSTRAINT "telegram_processed_updates_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."telegram_processed_updates"
    ADD CONSTRAINT "telegram_processed_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_users"
    ADD CONSTRAINT "telegram_users_supabase_user_id_fkey" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_staging"
    ADD CONSTRAINT "transaction_staging_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_staging"
    ADD CONSTRAINT "transaction_staging_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transaction_staging"
    ADD CONSTRAINT "transaction_staging_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_add_shared" ON "public"."accounts" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "accounts_delete_shared" ON "public"."accounts" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "accounts_read_shared" ON "public"."accounts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budgets_delete_own" ON "public"."budgets" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "budgets_insert_own" ON "public"."budgets" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "budgets"."category_id") AND (("c"."user_id" IS NULL) OR ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "budgets_read_own" ON "public"."budgets" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "budgets_update_own" ON "public"."budgets" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "budgets"."category_id") AND (("c"."user_id" IS NULL) OR ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete_own" ON "public"."categories" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "categories_insert_own" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "categories_read_visible" ON "public"."categories" FOR SELECT TO "authenticated" USING ((("user_id" IS NULL) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "categories_update_own" ON "public"."categories" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."telegram_processed_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_staging" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_delete_own" ON "public"."transactions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transactions_insert_own" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "transactions"."category_id") AND (("c"."user_id" IS NULL) OR ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "transactions_read_own" ON "public"."transactions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "transactions_update_own" ON "public"."transactions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "transactions"."category_id") AND (("c"."user_id" IS NULL) OR ("c"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_check_category_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_check_category_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_process_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_process_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_resolve_category"("p_user_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_resolve_category"("p_user_id" "uuid", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_revise_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text", "p_choice_id" "uuid", "p_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_revise_staged_transaction"("p_staging_id" "uuid", "p_telegram_user_id" bigint, "p_action" "text", "p_choice_id" "uuid", "p_page" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."backend_save_telegram_transaction"("p_user_id" "uuid", "p_update_id" bigint, "p_transaction" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backend_save_telegram_transaction"("p_user_id" "uuid", "p_update_id" bigint, "p_transaction" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_category_type_alignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_category_type_alignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_category_type_alignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."accounts" TO "authenticated";



GRANT ALL ON TABLE "public"."budgets" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."budgets" TO "authenticated";



GRANT ALL ON TABLE "public"."categories" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categories" TO "authenticated";



GRANT ALL ON TABLE "public"."telegram_processed_updates" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_users" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_staging" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."transactions" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
