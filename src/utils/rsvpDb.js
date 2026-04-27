import { supabase, isSupabaseConfigured } from './supabaseClient.js';

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
    email: user.email,
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
