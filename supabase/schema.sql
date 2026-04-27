-- Supabase schema for the Gianna Avery RSVP site.
--
-- Run this once in your Supabase project's SQL Editor (Database → SQL Editor → New query).
-- It is idempotent: running it again is a no-op.
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

-- One RSVP per email (case-insensitive). Upsert from the client uses this.
create unique index if not exists rsvps_email_unique
  on public.rsvps (lower(email));

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

-- Allow anyone to update — combined with the unique-email index, the
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
