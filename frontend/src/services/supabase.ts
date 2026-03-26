import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (!supabase) {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}

export const isSupabaseConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
