import { createClient } from '@supabase/supabase-js';

// Supabase project URL + anon key are public keys (safe to ship in the
// client bundle). Row Level Security policies restrict what an anon
// caller can actually do — see the SQL in supabase/schema.sql.
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = () => Boolean(supabase);
