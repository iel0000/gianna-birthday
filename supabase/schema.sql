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

-- ─────────── Row Level Security ───────────
-- The site uses the anon key in the browser. RLS keeps the data private:
-- guests can submit/upsert their own row but cannot read anyone's RSVPs.
-- The host queries via Supabase's table editor (which uses the service
-- role and bypasses RLS).

alter table public.rsvps enable row level security;

-- Allow anyone to insert (a guest submitting their first RSVP).
drop policy if exists "rsvps_anon_insert" on public.rsvps;
create policy "rsvps_anon_insert"
  on public.rsvps
  for insert
  to anon
  with check (true);

-- Allow anyone to update — combined with the unique-email constraint, the
-- client's upsert resolves a conflict by updating the existing row.
-- (If you want stricter behaviour later, replace this with a policy that
-- only allows updating the matched email via a server-side function.)
drop policy if exists "rsvps_anon_update" on public.rsvps;
create policy "rsvps_anon_update"
  on public.rsvps
  for update
  to anon
  using (true)
  with check (true);

-- Deliberately NO select policy for anon — guests cannot read each
-- other's RSVPs from the browser. The host reads via the Supabase
-- dashboard or service-role queries.
