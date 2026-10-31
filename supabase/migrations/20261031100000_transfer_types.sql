-- Linked account transfers (issue #17), part 1 of 2: the two transaction types.
--
-- A transfer is stored as two transactions, a debit (transfer_out) and a credit
-- (transfer_in). They are separate enum values rather than income/outcome rows
-- with a marker column on purpose: every query that filters on an explicit
-- 'income' or 'outcome' then leaves transfers out by default. The alternative
-- would make each consumer remember to exclude them, which fails open.
--
-- This is its own file because a new enum value cannot be used (in a CHECK,
-- index or function body that runs) in the transaction that adds it. Both
-- `supabase db push` and the test harness apply each file as one transaction,
-- so 20261031110000_linked_transfers.sql can rely on these values.
--
-- Rollback: enum values cannot be dropped. Leaving them is harmless; undo
-- 20261031110000_linked_transfers.sql instead.

ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'transfer_in';
