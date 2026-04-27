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

  const invitationId = user.invitation?.id || null;
  const row = {
    invitation_id: invitationId,
    email: user.email ? normalizeEmail(user.email) : null,
    name: user.invitation?.name || user.name,
    attending: rsvp.attending,
    seats: rsvp.seats,
    reserved_seats: user.invitation?.seats ?? user.reservedSeats ?? null,
    bringing_kids: !!rsvp.bringingKids,
    kids_count: rsvp.bringingKids ? Math.max(0, Number(rsvp.kidsCount) || 0) : 0,
    is_godparent: !!rsvp.isGodparent || !!user.invitation?.is_godparent,
    message: rsvp.message || null,
    submitted_at: rsvp.submittedAt
  };

  // Prefer the invitation_id as the upsert key — it's the new natural key.
  // For legacy submissions without an invitation, fall back to email.
  const onConflict = invitationId ? 'invitation_id' : 'email';
  const { error } = await supabase
    .from('rsvps')
    .upsert(row, { onConflict });

  if (error) {
    console.error('[RSVP db] upsert failed', error);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

// ──────────── Invitations ────────────

export async function fetchInvitation(guid) {
  if (!isSupabaseConfigured()) return null;
  const cleanGuid = String(guid || '').trim().toLowerCase();
  if (!cleanGuid) return null;

  const { data, error } = await supabase
    .from('invitations')
    .select('id, guid, name, seats, is_godparent, created_at')
    .eq('guid', cleanGuid)
    .maybeSingle();

  if (error) {
    console.warn('[Invitation db] fetch failed', error);
    return null;
  }
  return data || null;
}

export async function createInvitation({ name, seats, isGodparent }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase is not configured.' };
  }
  const cleanName = String(name || '').trim();
  const seatNum = Math.max(1, Math.min(12, Math.floor(Number(seats) || 1)));
  if (!cleanName) {
    return { ok: false, reason: 'Please enter the guest name.' };
  }

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      name: cleanName,
      seats: seatNum,
      is_godparent: !!isGodparent
    })
    .select('id, guid, name, seats, is_godparent, created_at')
    .single();

  if (error) {
    console.error('[Invitation db] create failed', error);
    return { ok: false, reason: error.message };
  }
  return { ok: true, invitation: data };
}

export async function updateInvitation({ guid, name, seats, isGodparent }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase is not configured.' };
  }
  const cleanGuid = String(guid || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const seatNum = Math.max(1, Math.min(12, Math.floor(Number(seats) || 1)));
  if (!cleanGuid) {
    return { ok: false, reason: 'Missing invitation id.' };
  }
  if (!cleanName) {
    return { ok: false, reason: 'Please enter the guest name.' };
  }

  const { data, error } = await supabase
    .from('invitations')
    .update({
      name: cleanName,
      seats: seatNum,
      is_godparent: !!isGodparent
    })
    .eq('guid', cleanGuid)
    .select('id, guid, name, seats, is_godparent, created_at')
    .single();

  if (error) {
    console.error('[Invitation db] update failed', error);
    return { ok: false, reason: error.message };
  }
  return { ok: true, invitation: data };
}

// Bulk-insert invitations from a CSV import. Each row is validated; any
// row missing a name (or otherwise unusable) is skipped and reported.
export async function bulkCreateInvitations(rows) {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: 'Supabase is not configured.',
      inserted: 0,
      skipped: rows?.length || 0,
      errors: []
    };
  }

  const valid = [];
  const errors = [];
  rows.forEach((row, idx) => {
    const lineNumber = idx + 2; // +1 for header, +1 for 1-based numbering
    const name = String(row.name || '').trim();
    const seats = Math.max(1, Math.min(12, Math.floor(Number(row.seats) || 1)));
    if (!name) {
      errors.push({ line: lineNumber, reason: 'missing name' });
      return;
    }
    valid.push({
      name,
      seats,
      is_godparent: !!row.isGodparent
    });
  });

  if (valid.length === 0) {
    return {
      ok: false,
      reason: errors.length ? 'No valid rows to import.' : 'CSV had no data rows.',
      inserted: 0,
      skipped: rows.length,
      errors
    };
  }

  const { data, error } = await supabase
    .from('invitations')
    .insert(valid)
    .select('id, guid, name, seats, is_godparent, created_at');

  if (error) {
    console.error('[Invitation db] bulk insert failed', error);
    return {
      ok: false,
      reason: error.message,
      inserted: 0,
      skipped: rows.length,
      errors
    };
  }

  return {
    ok: true,
    inserted: data.length,
    skipped: errors.length,
    errors
  };
}

export async function deleteInvitation(guid) {
  if (!isSupabaseConfigured()) return { ok: false, reason: 'Supabase is not configured.' };
  const { error } = await supabase.from('invitations').delete().eq('guid', guid);
  if (error) {
    console.error('[Invitation db] delete failed', error);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

// Returns admin-created invitations with each one's RSVP status joined in.
// Status values: 'pending' (no RSVP yet), 'attending', 'declined'.
export async function fetchAllInvitationsWithStatus() {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase not configured', invitations: [] };
  }
  const [invRes, rsvpRes] = await Promise.all([
    supabase
      .from('invitations')
      .select('id, guid, name, seats, is_godparent, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('rsvps')
      .select('invitation_id, attending, seats, bringing_kids, kids_count, message, submitted_at')
  ]);

  if (invRes.error) {
    return { ok: false, reason: invRes.error.message, invitations: [] };
  }

  const rsvpByInviteId = new Map();
  (rsvpRes.data || []).forEach((r) => {
    if (r.invitation_id != null) rsvpByInviteId.set(r.invitation_id, r);
  });

  const invitations = (invRes.data || []).map((inv) => {
    const rsvp = rsvpByInviteId.get(inv.id);
    return {
      ...inv,
      status: rsvp ? (rsvp.attending ? 'attending' : 'declined') : 'pending',
      rsvp_seats: rsvp?.seats ?? null,
      rsvp_bringing_kids: rsvp?.bringing_kids || false,
      rsvp_kids_count: rsvp?.kids_count || 0,
      rsvp_message: rsvp?.message || '',
      submitted_at: rsvp?.submitted_at || null
    };
  });

  return { ok: true, invitations };
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
    .select('email, name, attending, seats, message, submitted_at, reserved_seats, bringing_kids, kids_count, is_godparent')
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
    bringingKids: !!data.bringing_kids,
    kidsCount: data.kids_count || 0,
    isGodparent: !!data.is_godparent,
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
      .select('email, name, attending, seats, reserved_seats, bringing_kids, kids_count, is_godparent, message, submitted_at')
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
  // Combine the rsvps.is_godparent flag with the existence of a row in
  // the godparents table — either signal counts.
  const rsvps = (rsvpsRes.data || []).map((r) => ({
    ...r,
    is_godparent:
      !!r.is_godparent || godparentEmails.has((r.email || '').toLowerCase())
  }));

  return {
    ok: true,
    rsvps,
    godparents: godparentsRes.data || []
  };
}
