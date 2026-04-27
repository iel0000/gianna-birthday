import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Push an RSVP into Supabase as the canonical record. Local storage still
// drives the UI's "already-submitted" lock; this is a write-only mirror so
// the host can query the database for the real guest list.
//
// Returns { ok: true } on success, { ok: false, reason } if Supabase is
// unconfigured or the request fails. The caller treats failures as
// soft errors — the local save is the source of truth for the UX.
export async function persistRsvpToSupabase({ user, rsvp }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase not configured' };
  }

  const row = {
    email: normalizeEmail(user.email),
    name: user.name,
    attending: rsvp.attending,
    seats: rsvp.seats,
    reserved_seats: user.reservedSeats ?? null,
    message: rsvp.message || null,
    submitted_at: rsvp.submittedAt
  };

  // Upsert on email so a host re-sending an invitation overwrites cleanly.
  // The schema has a unique index on lower(email).
  const { error } = await supabase
    .from('rsvps')
    .upsert(row, { onConflict: 'email' });

  if (error) {
    console.error('[RSVP db] upsert failed', error);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

// Look up an existing RSVP by email so the site can show the locked
// summary on a fresh device, before any local cache exists.
//
// Returns the RSVP row (in the shape the rest of the app uses) or null
// if no row exists / Supabase isn't configured / the request fails.
export async function fetchRsvpFromSupabase(email) {
  if (!isSupabaseConfigured()) return null;
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const { data, error } = await supabase
    .from('rsvps')
    .select('email, name, attending, seats, message, submitted_at, reserved_seats')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error) {
    console.warn('[RSVP db] fetch failed', error);
    return null;
  }
  if (!data) return null;

  return {
    email: data.email,
    name: data.name,
    attending: data.attending,
    seats: data.seats,
    message: data.message || '',
    submittedAt: data.submitted_at,
    reservedSeats: data.reserved_seats
  };
}

// Save a "yes, I'll be a godparent" response. Upserts on email so a guest
// can revisit and update their message without creating a duplicate.
export async function recordGodparent({ name, email, message }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase not configured' };
  }

  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || '').trim();
  if (!cleanEmail || !cleanName) {
    return { ok: false, reason: 'Name and email are both required.' };
  }

  const { error } = await supabase
    .from('godparents')
    .upsert(
      {
        email: cleanEmail,
        name: cleanName,
        message: message ? String(message).trim() : null,
        responded_at: new Date().toISOString()
      },
      { onConflict: 'email' }
    );

  if (error) {
    console.error('[Godparent db] upsert failed', error);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

// List everyone who said yes — used by the landing page to display the
// godparent names. Returns [] if Supabase isn't configured or the call
// fails (graceful degrade — landing page just hides the section).
export async function fetchGodparents() {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('godparents')
    .select('email, name, message, responded_at')
    .order('responded_at', { ascending: true });

  if (error) {
    console.warn('[Godparent db] fetch failed', error);
    return [];
  }
  return data || [];
}

// Full RSVP list for the host's admin page. Returns the rows in submit
// order, with a `is_godparent` flag joined from the godparents table.
export async function fetchAllRsvps() {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase not configured', rsvps: [], godparents: [] };
  }

  const [rsvpsRes, godparentsRes] = await Promise.all([
    supabase
      .from('rsvps')
      .select('email, name, attending, seats, reserved_seats, message, submitted_at')
      .order('submitted_at', { ascending: false }),
    supabase.from('godparents').select('email, name, message, responded_at')
  ]);

  if (rsvpsRes.error) {
    return {
      ok: false,
      reason: rsvpsRes.error.message,
      rsvps: [],
      godparents: []
    };
  }

  const godparentEmails = new Set(
    (godparentsRes.data || []).map((g) => (g.email || '').toLowerCase())
  );
  const rsvps = (rsvpsRes.data || []).map((r) => ({
    ...r,
    is_godparent: godparentEmails.has((r.email || '').toLowerCase())
  }));

  return {
    ok: true,
    rsvps,
    godparents: godparentsRes.data || []
  };
}
