/**
 * Synchronously read the Supabase session from localStorage without going
 * through supabase-js. supabase-js's getSession() can hang on a storage lock
 * or a slow refresh, which we cannot tolerate on the request hot path or on
 * app boot.
 *
 * Scans localStorage for the `sb-<ref>-auth-token` key Supabase v2 writes.
 * Tolerates both the v2 top-level shape and the older { currentSession: ... }
 * shape.
 */

export interface StoredSupabaseSession {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    user?: {
        id?: string;
        email?: string;
    };
}

export function readSupabaseSession(): StoredSupabaseSession | null {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                // Supabase v2 stores the session at the top level
                if (parsed?.access_token) return parsed as StoredSupabaseSession;
                // Older shape: { currentSession: {...} }
                if (parsed?.currentSession?.access_token) {
                    return parsed.currentSession as StoredSupabaseSession;
                }
                return null;
            }
        }
    } catch { /* fall through */ }
    return null;
}
