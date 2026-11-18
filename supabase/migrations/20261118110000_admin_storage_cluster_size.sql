-- Align capacity and growth with the combined database-size query used by
-- Supabase. Keep old samples but exclude their different scope from forecasts.
-- Safe to apply after the initial admin-storage migration; no records are moved.
alter table public.storage_daily_samples
  add column if not exists measurement_scope text not null default 'current_database';

create or replace function public.storage_cluster_bytes() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(pg_database_size(datname)), 0)::bigint from pg_catalog.pg_database;
$$;
revoke all on function public.storage_cluster_bytes() from public, anon, authenticated;

create or replace function public.collect_storage_sample() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_daily_samples(day, measured_at, database_bytes, measurement_scope)
  values(current_date, now(), public.storage_cluster_bytes(), 'all_databases')
  on conflict(day) do update set measured_at = excluded.measured_at, database_bytes = excluded.database_bytes, measurement_scope = excluded.measurement_scope;
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
    'database_bytes', (select database_bytes from public.storage_daily_samples where day = current_date),
    'measurement_scope', 'all_databases',
    'limit_bytes', 500000000,
    'measured_at', now(),
    'samples', coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from public.storage_daily_samples s where s.measurement_scope = 'all_databases'), '[]'::jsonb),
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
