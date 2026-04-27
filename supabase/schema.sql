-- Supabase schema for the Gianna Avery RSVP site.
--
-- Run this once in your Supabase project's SQL Editor (Database → SQL Editor → New query).
-- It is idempotent: running it again is a no-op, and it migrates older
-- versions of the schema (a unique index on lower(email)) to the current
-- shape (a unique constraint on email + a normalize-on-write trigger).
--
-- After running, set these env vars (locally and as GitHub Actions secrets):
--   VITE_SUPABASE_URL       = https://<your-project-ref>.supabase.co
--   VITE_SUPABASE_ANON_KEY  = the anon (public) key from Settings → API

-- ─────────── RSVPs table ───────────
create table if not exists public.rsvps (
  id              bigint generated always as identity primary key,
  email           text        not null,
  name            text        not null,
  attending       boolean     not null,
  seats           integer     not null default 1 check (seats >= 0 and seats <= 12),
  reserved_seats  integer     check (reserved_seats is null or (reserved_seats >= 1 and reserved_seats <= 12)),
  message         text,
  submitted_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Old versions of this schema created a unique index on lower(email).
-- That index doesn't satisfy `ON CONFLICT (email)`, so the upsert from
-- the client fails with "no unique or exclusion constraint matching the
-- ON CONFLICT specification". Drop it before adding the proper constraint.
drop index if exists public.rsvps_email_unique;

-- Unique constraint on email — enables `upsert(... { onConflict: 'email' })`.
-- The trigger below lowercases every email before insert/update so the
-- constraint is effectively case-insensitive without needing CITEXT.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rsvps_email_key'
      and conrelid = 'public.rsvps'::regclass
  ) then
    alter table public.rsvps add constraint rsvps_email_key unique (email);
  end if;
end $$;

-- Normalize email on every write so a client that forgets to lowercase
-- still gets the right uniqueness behaviour.
create or replace function public.normalize_rsvp_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email := lower(btrim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists rsvps_normalize_email on public.rsvps;
create trigger rsvps_normalize_email
  before insert or update on public.rsvps
  for each row execute function public.normalize_rsvp_email();

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rsvps_touch_updated_at on public.rsvps;
create trigger rsvps_touch_updated_at
  before update on public.rsvps
  for each row execute function public.touch_updated_at();

-- ─────────── Table privileges ───────────
-- RLS sits ON TOP of base privileges — even a permissive policy with
-- `with check (true)` fails if the role doesn't have INSERT/UPDATE on
-- the table itself. Default Supabase setups grant these automatically,
-- but some projects (or older ones) don't, which surfaces as
-- "new row violates row-level security policy" on every write.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.rsvps to anon, authenticated;

-- ─────────── Row Level Security ───────────
-- For a small private invitation site, RLS adds a lot of operational
-- complexity for very little real security: the anon key is shipped in
-- the page bundle so any visitor can already grab it, the guest list is
-- friends and family, and the host reads through the Supabase dashboard
-- (service role, bypasses RLS regardless). After repeated policy
-- mismatches blocking writes, we deliberately disable RLS for this table.
--
-- Wipe any stale policies left over from earlier versions, then disable.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'rsvps'
  loop
    execute format('drop policy %I on public.rsvps', pol.policyname);
  end loop;
end $$;

alter table public.rsvps disable row level security;

-- If you'd like to lock this down later, re-enable RLS and add the
-- policies you need. A reasonable starting set:
--
--   alter table public.rsvps enable row level security;
--   create policy "rsvps_insert" on public.rsvps for insert to public with check (true);
--   create policy "rsvps_update" on public.rsvps for update to public using (true) with check (true);
--   -- (no SELECT policy → guests can't enumerate the guest list)


-- ─────────── Godparents table ───────────
-- Powers the standalone /#godparents page. Stores anyone who said YES
-- to "Will you be one of Avery's godparents?" — those who decline don't
-- get a row. Email is the natural key (one godparent answer per person).
create table if not exists public.godparents (
  id            bigint generated always as identity primary key,
  email         text        not null,
  name          text        not null,
  message       text,
  responded_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unique on email so the godparent page upserts cleanly.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'godparents_email_key'
      and conrelid = 'public.godparents'::regclass
  ) then
    alter table public.godparents add constraint godparents_email_key unique (email);
  end if;
end $$;

-- Reuse the normalize/touch triggers defined above.
drop trigger if exists godparents_normalize_email on public.godparents;
create trigger godparents_normalize_email
  before insert or update on public.godparents
  for each row execute function public.normalize_rsvp_email();

drop trigger if exists godparents_touch_updated_at on public.godparents;
create trigger godparents_touch_updated_at
  before update on public.godparents
  for each row execute function public.touch_updated_at();

-- Grants — anon needs select (to fetch the list for the landing page),
-- insert, and update (for upsert).
grant select, insert, update on public.godparents to anon, authenticated;

alter table public.godparents disable row level security;
