-- Committed synthetic history before the ownership migration.
INSERT INTO auth.users VALUES ('21000000-0000-0000-0000-000000000001'), ('21000000-0000-0000-0000-000000000002');
INSERT INTO public.telegram_users (telegram_user_id, supabase_user_id) VALUES
 (2101, '21000000-0000-0000-0000-000000000001'), (2102, '21000000-0000-0000-0000-000000000002');
INSERT INTO public.accounts (id, name) VALUES
 ('21a00000-0000-0000-0000-000000000001', 'Shared history'),
 ('21a00000-0000-0000-0000-000000000002', 'Single owner'),
 ('21a00000-0000-0000-0000-000000000003', 'Unreferenced'),
 ('21a00000-0000-0000-0000-000000000004', 'Sole owner');
INSERT INTO public.categories (id, name, allowed_type) VALUES ('21c00000-0000-0000-0000-000000000001', 'Security fixture', 'both');
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, occurred_at, description, deleted_at)
SELECT owner, '21a00000-0000-0000-0000-000000000001', '21c00000-0000-0000-0000-000000000001', 'income', 123.45, now(), 'kept history', now()
FROM (VALUES ('21000000-0000-0000-0000-000000000001'::uuid), ('21000000-0000-0000-0000-000000000002'::uuid)) u(owner);
INSERT INTO public.transactions (user_id, account_id, category_id, type, amount, occurred_at) VALUES ('21000000-0000-0000-0000-000000000001', '21a00000-0000-0000-0000-000000000004', '21c00000-0000-0000-0000-000000000001', 'income', 10, now());
SELECT public.transfers_create('21000000-0000-0000-0000-000000000001', '21a00000-0000-0000-0000-000000000001', '21a00000-0000-0000-0000-000000000002', 50, 'IDR', now());
INSERT INTO public.transaction_staging (user_id, account_id, transfer_to_account_id, amount, occurred_at, description)
VALUES ('21000000-0000-0000-0000-000000000002', '21a00000-0000-0000-0000-000000000001', '21a00000-0000-0000-0000-000000000002', 20, now(), 'pending transfer'),
 (NULL, '21a00000-0000-0000-0000-000000000001', NULL, 30, now(), 'unresolved owner');
-- A staging-only owner makes the second account shared too.
CREATE TABLE public.security_before_transactions AS SELECT to_jsonb(t) AS row FROM public.transactions t;
CREATE TABLE public.security_before_staging AS SELECT to_jsonb(s) AS row FROM public.transaction_staging s;
CREATE TABLE public.security_before_accounts AS SELECT to_jsonb(a) AS row FROM public.accounts a;
