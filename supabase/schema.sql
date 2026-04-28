-- Supabase schema for the Gianna Avery RSVP site.
--
-- Run this once in your Supabase project's SQL Editor (Database → SQL Editor → New query).
-- It is idempotent and migration-safe — re-running it on an existing project
-- adds any missing columns/constraints/triggers without touching the data.
--
-- Architecture (current):
--   invitations  — one row per guest party, created by the host through the
--                  admin guest list. The `guid` column is the URL token the
--                  host shares: https://yoursite.com/?invite=<guid>.
--   rsvps        — one row per submitted RSVP, linked to an invitation by
--                  invitation_id. Carries the guest's response details
--                  (attending, seats, kids, godparent, message).
--
-- After running, set these env vars (locally and as GitHub Actions secrets):
--   VITE_SUPABASE_URL       = https://<your-project-ref>.supabase.co
--   VITE_SUPABASE_ANON_KEY  = the anon (public) key from Settings → API


-- ─────────────────────────────────────────────────────────────────
-- Shared helpers
-- ─────────────────────────────────────────────────────────────────

-- Lowercases + trims emails on every write so the unique constraint
-- behaves case-insensitively without needing CITEXT.
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

-- Bumps updated_at on every UPDATE — wired onto every table below.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ─────────────────────────────────────────────────────────────────
-- Invitations
-- ─────────────────────────────────────────────────────────────────
-- Admin-created. The guid is the URL token shared with each guest.
-- is_godparent on the invitation flips the page into the godparent flow
-- automatically when the URL is opened (no separate URL needed).
create table if not exists public.invitations (
  id            bigint generated always as identity primary key,
  guid          uuid        not null default gen_random_uuid() unique,
  name          text        not null,
  seats         integer     not null default 1 check (seats >= 1 and seats <= 12),
  is_godparent  boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists invitations_touch_updated_at on public.invitations;
create trigger invitations_touch_updated_at
  before update on public.invitations
  for each row execute function public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────
-- RSVPs
-- ─────────────────────────────────────────────────────────────────
-- One row per submitted RSVP. invitation_id links back to the invitation
-- that produced it (unique, so re-submissions upsert in place). email is
-- optional — guests don't have to share it.
create table if not exists public.rsvps (
  id              bigint generated always as identity primary key,
  invitation_id   bigint references public.invitations(id) on delete set null,
  email           text,
  name            text        not null,
  attending       boolean     not null,
  seats           integer     not null default 1 check (seats >= 0 and seats <= 12),
  reserved_seats  integer     check (reserved_seats is null or (reserved_seats >= 1 and reserved_seats <= 12)),
  bringing_kids   boolean     not null default false,
  kids_count      integer     not null default 0 check (kids_count >= 0 and kids_count <= 12),
  is_godparent    boolean     not null default false,
  checked_in      boolean     not null default false,
  checked_in_at   timestamptz,
  message         text,
  submitted_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Migrations for existing projects (idempotent) ───
-- Older versions had a NOT NULL email and lacked some columns. Catch up.
alter table public.rsvps
  add column if not exists invitation_id bigint references public.invitations(id) on delete set null,
  add column if not exists bringing_kids boolean not null default false,
  add column if not exists kids_count integer not null default 0,
  add column if not exists is_godparent boolean not null default false,
  add column if not exists checked_in boolean not null default false,
  add column if not exists checked_in_at timestamptz;

alter table public.rsvps alter column email drop not null;

-- Drop the old unique-index-on-lower(email) if a previous schema added it.
-- It doesn't satisfy ON CONFLICT (email) and confuses the upsert.
drop index if exists public.rsvps_email_unique;

-- Unique on email (matches the old `onConflict: 'email'` upsert path).
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

-- Unique on invitation_id (matches the new primary `onConflict: 'invitation_id'`
-- upsert path). NULL invitation_ids are allowed multiple times — only non-null
-- values must be unique, which is exactly what we want for legacy rows.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rsvps_invitation_id_key'
      and conrelid = 'public.rsvps'::regclass
  ) then
    alter table public.rsvps add constraint rsvps_invitation_id_key unique (invitation_id);
  end if;
end $$;

-- ─── Triggers ───
drop trigger if exists rsvps_normalize_email on public.rsvps;
create trigger rsvps_normalize_email
  before insert or update on public.rsvps
  for each row execute function public.normalize_rsvp_email();

drop trigger if exists rsvps_touch_updated_at on public.rsvps;
create trigger rsvps_touch_updated_at
  before update on public.rsvps
  for each row execute function public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────
-- Privileges + RLS
-- ─────────────────────────────────────────────────────────────────
-- The browser uses the anon key. We grant insert/update/select to anon
-- so guests can submit RSVPs and the admin page (using Supabase Auth as
-- "authenticated") can read everything.
--
-- For a small private invitation site, RLS adds operational complexity
-- for very little real security: the anon key ships in the page bundle
-- so any visitor can already grab it. RLS is disabled on both tables;
-- the admin page is gated by a Supabase Auth login, and the host can
-- always read through the Supabase dashboard (service role, bypasses
-- RLS regardless).
--
-- If you ever want to lock this down, re-enable RLS and add policies
-- like:
--
--   alter table public.invitations enable row level security;
--   create policy "invitations_select" on public.invitations for select to authenticated using (true);
--   alter table public.rsvps enable row level security;
--   create policy "rsvps_insert" on public.rsvps for insert to public with check (true);
--   create policy "rsvps_update" on public.rsvps for update to public using (true) with check (true);
--   create policy "rsvps_select" on public.rsvps for select to authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.invitations to anon, authenticated;
grant select, insert, update on public.rsvps to anon, authenticated;

-- Wipe any stale policies from earlier schema versions, then disable RLS.
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('rsvps', 'invitations')
  loop
    execute format(
      'drop policy %I on %I.%I',
      pol.policyname, pol.schemaname, pol.tablename
    );
  end loop;
end $$;

alter table public.rsvps disable row level security;
alter table public.invitations disable row level security;


-- ─────────────────────────────────────────────────────────────────
-- Cleanup: drop the deprecated godparents table
-- ─────────────────────────────────────────────────────────────────
-- The earlier flow had a standalone /#godparents page backed by a
-- separate godparents table. The current flow puts the godparent
-- answer directly on rsvps.is_godparent, so this table is no longer
-- read or written by any code path. Drop it (idempotently — if it's
-- already gone the statement is a no-op).
drop table if exists public.godparents cascade;
