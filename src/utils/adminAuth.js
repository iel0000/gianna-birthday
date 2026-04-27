import { supabase, isSupabaseConfigured } from './supabaseClient.js';

// Thin wrapper over Supabase Auth — used to gate the admin guest-list page.
// The admin account itself is created from the Supabase dashboard
// (Authentication → Users → Add user). The site doesn't expose any
// signup path; only signin.

export async function adminSignIn({ email, password }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase is not configured for this site.' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password: String(password || '')
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: true, session: data.session, user: data.user };
}

export async function adminSignOut() {
  if (!isSupabaseConfigured()) return;
  await supabase.auth.signOut();
}

export async function getAdminSession() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

// Fires whenever the admin session changes (sign in / sign out / token refresh).
// Returns an unsubscribe function.
export function onAdminAuthChange(callback) {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data?.subscription?.unsubscribe?.();
}
