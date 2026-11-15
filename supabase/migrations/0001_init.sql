-- NFS – Neural Forecasting System: initial schema.
-- Run in the Supabase SQL editor (or `supabase db push`). Safe to read top-to-bottom.
--
-- Security model
--   * Users READ and DELETE only their own rows (Row Level Security).
--   * Users cannot INSERT/UPDATE prediction data. Only the FastAPI backend writes predictions,
--     using the server-only service-role key (which bypasses RLS) after verifying the user's JWT.
--     This means a stored probability always comes from the real model, never from the browser.
--   * Analytics functions are SECURITY INVOKER, so RLS applies and each user only aggregates their own rows.

-- ------------------------------------------------------------------ helpers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text check (full_name is null or char_length(full_name) <= 120),
  email          text,
  theme          text not null default 'dark' check (theme in ('dark', 'light')),
  toasts_enabled boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ prediction_batches
create table if not exists public.prediction_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  filename        text not null check (char_length(filename) <= 255),
  total_rows      integer not null check (total_rows >= 0),
  successful_rows integer not null check (successful_rows >= 0),
  failed_rows     integer not null check (failed_rows >= 0),
  high_count      integer not null default 0 check (high_count >= 0),
  medium_count    integer not null default 0 check (medium_count >= 0),
  low_count       integer not null default 0 check (low_count >= 0),
  processing_ms   integer check (processing_ms is null or processing_ms >= 0),
  model_name      text,
  created_at      timestamptz not null default now(),
  constraint batch_rows_consistent check (successful_rows + failed_rows = total_rows),
  constraint batch_risk_consistent check (high_count + medium_count + low_count = successful_rows)
);
create index if not exists prediction_batches_user_created_idx on public.prediction_batches (user_id, created_at desc);

-- ------------------------------------------------------------------ predictions (single)
create table if not exists public.predictions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  customer_id       text check (customer_id is null or char_length(customer_id) <= 100),
  features          jsonb not null,                 -- the 19 model input fields as submitted
  churn_probability numeric(6, 4) not null check (churn_probability between 0 and 1),
  risk_level        text not null check (risk_level in ('Low', 'Medium', 'High')),
  predicted_churn   boolean not null,
  threshold         numeric(4, 3) not null,
  model_name        text not null,
  drivers           jsonb,                          -- what-if drivers returned by the model service
  -- Segment fields copied from `features` so segment analytics need no JSON parsing:
  contract          text,
  tenure            integer,
  monthly_charges   numeric(8, 2),
  tech_support      text,
  created_at        timestamptz not null default now()
);
create index if not exists predictions_user_created_idx  on public.predictions (user_id, created_at desc);
create index if not exists predictions_user_risk_idx     on public.predictions (user_id, risk_level);
create index if not exists predictions_user_customer_idx on public.predictions (user_id, customer_id);

-- ------------------------------------------------------------------ batch_prediction_results
-- One row per SUCCESSFULLY scored customer. Failed rows are only counted on the batch, never stored with
-- a probability. Only the four segment fields are kept (not the full customer row).
create table if not exists public.batch_prediction_results (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.prediction_batches (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  row_number        integer not null check (row_number >= 1),
  customer_id       text check (customer_id is null or char_length(customer_id) <= 100),
  churn_probability numeric(6, 4) not null check (churn_probability between 0 and 1),
  risk_level        text not null check (risk_level in ('Low', 'Medium', 'High')),
  predicted_churn   boolean not null,
  contract          text,
  tenure            integer,
  monthly_charges   numeric(8, 2),
  tech_support      text,
  created_at        timestamptz not null default now()
);
create index if not exists batch_results_batch_row_idx    on public.batch_prediction_results (batch_id, row_number);
create index if not exists batch_results_batch_risk_idx   on public.batch_prediction_results (batch_id, risk_level);
create index if not exists batch_results_user_created_idx on public.batch_prediction_results (user_id, created_at desc);
create index if not exists batch_results_user_risk_idx    on public.batch_prediction_results (user_id, risk_level);

-- ------------------------------------------------------------------ privileges + Row Level Security
alter table public.profiles                 enable row level security;
alter table public.predictions              enable row level security;
alter table public.prediction_batches       enable row level security;
alter table public.batch_prediction_results enable row level security;

revoke all on public.profiles, public.predictions, public.prediction_batches, public.batch_prediction_results from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, theme, toasts_enabled) on public.profiles to authenticated;
grant select, delete on public.predictions, public.prediction_batches, public.batch_prediction_results to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists predictions_select_own on public.predictions;
create policy predictions_select_own on public.predictions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists predictions_delete_own on public.predictions;
create policy predictions_delete_own on public.predictions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists batches_select_own on public.prediction_batches;
create policy batches_select_own on public.prediction_batches for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists batches_delete_own on public.prediction_batches;
create policy batches_delete_own on public.prediction_batches for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists results_select_own on public.batch_prediction_results;
create policy results_select_own on public.batch_prediction_results for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists results_delete_own on public.batch_prediction_results;
create policy results_delete_own on public.batch_prediction_results for delete to authenticated
  using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ analytics functions (SECURITY INVOKER => RLS applies)
-- "customers_analysed" = distinct customer IDs, plus every scored row that has no customer ID.
create or replace function public.analytics_overview()
returns jsonb language sql stable set search_path = public as $$
  with a as (
    select customer_id, churn_probability, risk_level, predicted_churn, created_at, 'single'::text as source from public.predictions
    union all
    select customer_id, churn_probability, risk_level, predicted_churn, created_at, 'batch'::text  as source from public.batch_prediction_results
  )
  select jsonb_build_object(
    'total_predictions',  count(*),
    'single_predictions', count(*) filter (where source = 'single'),
    'batch_predictions',  count(*) filter (where source = 'batch'),
    'customers_analysed', count(distinct customer_id) filter (where customer_id is not null) + count(*) filter (where customer_id is null),
    'predicted_churn',    count(*) filter (where predicted_churn),
    'high',               count(*) filter (where risk_level = 'High'),
    'medium',             count(*) filter (where risk_level = 'Medium'),
    'low',                count(*) filter (where risk_level = 'Low'),
    'avg_probability',    round(avg(churn_probability), 4),
    'first_prediction_at', min(created_at),
    'last_prediction_at',  max(created_at),
    'batches',            (select count(*) from public.prediction_batches)
  )
  from a;
$$;

create or replace function public.activity_by_day(p_days integer default 30)
returns table (activity_day date, prediction_count bigint, high_count bigint, churn_count bigint, avg_probability numeric)
language sql stable set search_path = public as $$
  with a as (
    select churn_probability, risk_level, predicted_churn, created_at from public.predictions
    union all
    select churn_probability, risk_level, predicted_churn, created_at from public.batch_prediction_results
  )
  select (created_at at time zone 'utc')::date,
         count(*),
         count(*) filter (where risk_level = 'High'),
         count(*) filter (where predicted_churn),
         round(avg(churn_probability), 4)
  from a
  where created_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
  group by 1
  order by 1;
$$;

create or replace function public.breakdown_by_contract()
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.contract), '[]'::jsonb)
  from (
    select contract,
           count(*)                                    as predictions,
           count(*) filter (where risk_level = 'High') as high,
           round(avg(churn_probability), 4)            as avg_probability
    from (
      select contract, risk_level, churn_probability from public.predictions
      union all
      select contract, risk_level, churn_probability from public.batch_prediction_results
    ) s
    where contract is not null
    group by contract
  ) t;
$$;

-- Three supported segments (customers can belong to more than one). The fourth proposed segment,
-- "Frequent support contacts", is intentionally absent: the dataset has no support-ticket field.
create or replace function public.segment_stats()
returns jsonb language sql stable set search_path = public as $$
  with s as (
    select contract, tenure, monthly_charges, tech_support, churn_probability, risk_level from public.predictions
    union all
    select contract, tenure, monthly_charges, tech_support, churn_probability, risk_level from public.batch_prediction_results
  ),
  seg as (
    select 'new_month_to_month'::text as key, * from s where contract = 'Month-to-month' and tenure < 12
    union all
    select 'high_bill_no_tech_support', * from s where monthly_charges > 85 and tech_support = 'No'
    union all
    select 'loyal_long_term', * from s where tenure >= 36 and contract <> 'Month-to-month'
  ),
  keys(key) as (values ('new_month_to_month'), ('high_bill_no_tech_support'), ('loyal_long_term'))
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb)
  from (
    select k.key,
           row_number() over () as ord,
           count(seg.key)                                       as size,
           count(*) filter (where seg.risk_level = 'High')      as high,
           count(*) filter (where seg.risk_level = 'Medium')    as medium,
           count(*) filter (where seg.risk_level = 'Low')       as low,
           round(avg(seg.churn_probability), 4)                 as avg_probability,
           round(avg(seg.tenure), 1)                            as avg_tenure,
           round(avg(seg.monthly_charges), 2)                   as avg_monthly_charges
    from keys k left join seg on seg.key = k.key
    group by k.key
  ) t;
$$;

revoke all on function public.analytics_overview(), public.activity_by_day(integer), public.breakdown_by_contract(), public.segment_stats() from public, anon;
grant execute on function public.analytics_overview(), public.activity_by_day(integer), public.breakdown_by_contract(), public.segment_stats() to authenticated;
