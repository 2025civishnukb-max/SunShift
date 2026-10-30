-- SunShift account storage. Run this once in Supabase SQL Editor.
-- Every row is protected by its owner's authenticated user id.
create table if not exists public.home_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.appliance_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  time text not null check (time ~ '^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$'),
  kwh numeric(8,2) not null check (kwh > 0 and kwh <= 1000),
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists appliance_schedule_user_date_idx on public.appliance_schedule(user_id, date, created_at);
-- Clean up any legacy duplicates before enforcing idempotent adds.
delete from public.appliance_schedule older
using public.appliance_schedule newer
where older.user_id = newer.user_id
  and older.name = newer.name
  and older.date = newer.date
  and older.time = newer.time
  and older.ctid > newer.ctid;
create unique index if not exists appliance_schedule_no_duplicate_idx
  on public.appliance_schedule(user_id, name, date, time);

-- Serialize additions per account and cap the list at 50 reminders.
create or replace function public.limit_appliance_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare reminder_count integer;
begin
  if exists (
    select 1 from public.appliance_schedule
    where user_id = new.user_id and name = new.name and date = new.date and time = new.time
  ) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select count(*) into reminder_count from public.appliance_schedule where user_id = new.user_id;
  if reminder_count >= 50 then
    raise exception 'Reminder limit reached (50 per account).' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists appliance_schedule_limit on public.appliance_schedule;
create trigger appliance_schedule_limit
  before insert on public.appliance_schedule
  for each row execute function public.limit_appliance_schedule();

create table if not exists public.energy_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists energy_runs_user_created_idx on public.energy_runs(user_id, created_at desc);

alter table public.home_settings enable row level security;
alter table public.appliance_schedule enable row level security;
alter table public.energy_runs enable row level security;

drop policy if exists "Users manage their own home settings" on public.home_settings;
create policy "Users manage their own home settings" on public.home_settings
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own appliance schedule" on public.appliance_schedule;
create policy "Users manage their own appliance schedule" on public.appliance_schedule
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own energy runs" on public.energy_runs;
create policy "Users manage their own energy runs" on public.energy_runs
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.home_settings, public.appliance_schedule, public.energy_runs to authenticated;
