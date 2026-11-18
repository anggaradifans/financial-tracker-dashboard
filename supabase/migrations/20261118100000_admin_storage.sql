-- Admin roles are server-owned app_metadata; never use editable user_metadata.
create or replace function public.is_storage_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid() and raw_app_meta_data->>'role' = 'admin');
$$;
revoke all on function public.is_storage_admin() from public, anon;
grant execute on function public.is_storage_admin() to authenticated;

create table public.storage_daily_samples (
  day date primary key default current_date,
  measured_at timestamptz not null default now(),
  database_bytes bigint not null
);
alter table public.storage_daily_samples enable row level security;
revoke all on public.storage_daily_samples from anon, authenticated;

-- Private collector. Can be scheduled by the database owner with pg_cron.
create or replace function public.collect_storage_sample() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_daily_samples(day, measured_at, database_bytes)
  values(current_date, now(), pg_database_size(current_database()))
  on conflict(day) do update set measured_at = excluded.measured_at, database_bytes = excluded.database_bytes;
  delete from public.storage_daily_samples where day < current_date - 90;
end;
$$;
revoke all on function public.collect_storage_sample() from public, anon, authenticated;

create or replace function public.admin_storage_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_storage_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  perform public.collect_storage_sample();
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'limit_bytes', 500000000,
    'measured_at', now(),
    'samples', coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from public.storage_daily_samples s), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(t order by (t->>'total_bytes')::bigint desc) from (
      select jsonb_build_object('name', schemaname || '.' || relname,
        'rows', n_live_tup, 'total_bytes', pg_total_relation_size(relid),
        'index_bytes', pg_indexes_size(relid)) t
      from pg_stat_user_tables where schemaname in ('public', 'auth', 'storage')
    ) x), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_storage_status() from public, anon;
grant execute on function public.admin_storage_status() to authenticated;

-- A bounded, consistent transaction export. Exact decimals and timestamps are
-- serialized by Postgres into text, avoiding browser numeric rounding.
create or replace function public.admin_export_financial_records() returns text
language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  if not public.is_storage_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if (select count(*) from (select 1 from public.transactions limit 10001) t) > 10000 then
    raise exception 'More than 10,000 transactions. Use a PostgreSQL dump for a complete backup.';
  end if;
  select jsonb_build_object(
    'format_version', 1, 'exported_at', now(), 'scope', 'project financial records',
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.transactions t), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.categories c), '[]'::jsonb)
  )::text into result;
  if octet_length(result) > 20000000 then raise exception 'Export exceeds 20 MB. Use a PostgreSQL dump for a complete backup.'; end if;
  return result;
end;
$$;
revoke all on function public.admin_export_financial_records() from public, anon;
grant execute on function public.admin_export_financial_records() to authenticated;
