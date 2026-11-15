-- NFS: attribute breakdowns for segment analytics (tenure bands, monthly-charge bands, tech-support status).
-- Run AFTER 0001_init.sql. Idempotent (create or replace). SECURITY INVOKER => Row Level Security applies,
-- so each user only aggregates their own rows.
create or replace function public.attribute_breakdowns()
returns jsonb language sql stable set search_path = public as $$
  with s as (
    select tenure, monthly_charges, tech_support, churn_probability, risk_level from public.predictions
    union all
    select tenure, monthly_charges, tech_support, churn_probability, risk_level from public.batch_prediction_results
  ),
  banded as (
    select
      case when tenure is null then null when tenure < 12 then 1 when tenure < 24 then 2 when tenure < 48 then 3 else 4 end as tenure_ord,
      case when tenure is null then null when tenure < 12 then '0-11 months' when tenure < 24 then '12-23 months' when tenure < 48 then '24-47 months' else '48+ months' end as tenure_label,
      case when monthly_charges is null then null when monthly_charges < 35 then 1 when monthly_charges < 65 then 2 when monthly_charges <= 85 then 3 else 4 end as charge_ord,
      case when monthly_charges is null then null when monthly_charges < 35 then 'Under $35' when monthly_charges < 65 then '$35 to $64.99' when monthly_charges <= 85 then '$65 to $85' else 'Over $85' end as charge_label,
      tech_support, churn_probability, risk_level
    from s
  )
  select jsonb_build_object(
    'tenure_band', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) from (
        select tenure_ord as ord, tenure_label as label, count(*) as predictions,
               count(*) filter (where risk_level = 'High') as high, round(avg(churn_probability), 4) as avg_probability
        from banded where tenure_ord is not null group by tenure_ord, tenure_label) t),
    'monthly_charge_band', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) from (
        select charge_ord as ord, charge_label as label, count(*) as predictions,
               count(*) filter (where risk_level = 'High') as high, round(avg(churn_probability), 4) as avg_probability
        from banded where charge_ord is not null group by charge_ord, charge_label) t),
    'tech_support', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.label), '[]'::jsonb) from (
        select tech_support as label, count(*) as predictions,
               count(*) filter (where risk_level = 'High') as high, round(avg(churn_probability), 4) as avg_probability
        from banded where tech_support is not null group by tech_support) t)
  );
$$;

revoke all on function public.attribute_breakdowns() from public, anon;
grant execute on function public.attribute_breakdowns() to authenticated;
