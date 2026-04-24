import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { getSupabase } from '../services/supabase';
import { readSupabaseSession } from '../services/supabaseStorage';
import { User } from '../types/auth';
import Logger from '../utils/logger';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    /**
     * Send a sign-in magic link to the given email. Supabase handles the
     * redirect-back-to-app flow; onAuthStateChange fires SIGNED_IN when the
     * user clicks the link in their inbox.
     */
    sendOTP: (email: string) => Promise<{ error?: string }>;
    loginWithGoogle: () => Promise<void>;
    logout: () => void;
    refreshAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
};

/**
 * Map a Supabase AuthError to a user-facing message.
 * Single source of truth so messages stay consistent across the app.
 */
export function mapAuthError(err: AuthError | Error | null | undefined): string {
    if (!err) return 'Something went wrong. Please try again.';
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('expired') || msg.includes('otp_expired')) {
        return 'This link has expired — send a new one.';
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
        return 'Too many magic links sent in the last hour. Try Google sign-in, or try again in ~30 minutes.';
    }
    if (msg.includes('network') || msg.includes('failed to fetch')) {
        return "Couldn't reach the server — check your connection.";
    }
    if (msg.includes('invalid email')) {
        return 'That email looks invalid. Double-check and try again.';
    }
    return err.message || 'Something went wrong. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Synchronously restore user from localStorage so the first render
    // already has isAuthenticated=true — no blank page, no LandingPage flash.
    // Going through sb.auth.getSession() can hang on a storage lock; see
    // services/supabaseStorage.ts for the rationale.
    const [user, setUser] = useState<User | null>(() => {
        const session = readSupabaseSession();
        return session?.user?.email ? { id: 0, email: session.user.email } : null;
    });
    const [isLoading, setIsLoading] = useState(true);

    // Re-hydrate user on mount
    useEffect(() => {
        // Eager unblock: if we already restored a user synchronously, don't
        // gate the UI on a network round-trip. The finally{} below covers the
        // no-user case.
        if (user) setIsLoading(false);

        const rehydrate = async () => {
            try {
                const sb = getSupabase();
                if (!sb) return;
                const { data: { session } } = await sb.auth.getSession();
                if (session?.user) {
                    setUser((prev) => prev ?? { id: 0, email: session.user.email || '' });
                    // Fetch real DB user id in the background
                    import('../services/api').then(({ authApi }) =>
                        authApi.getCurrentUser()
                            .then((profile) => setUser({ id: profile.id, email: session.user.email || '' }))
                            .catch(() => { /* keep fallback id:0 */ }),
                    );
                } else {
                    setUser(null);
                }
            } catch (err) {
                Logger.error('Auth rehydration failed:', err);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        rehydrate();
    }, []);

    // Listen for Supabase auth state changes (OTP verify, OAuth callback, signOut)
    useEffect(() => {
        const sb = getSupabase();
        if (!sb) return;

        const { data: { subscription } } = sb.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                try {
                    const { authApi } = await import('../services/api');
                    const profile = await authApi.getCurrentUser();
                    setUser({ id: profile.id, email: session.user.email || '' });
                } catch {
                    setUser({ id: 0, email: session.user.email || '' });
                }
            } else {
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const sendOTP = useCallback(async (email: string): Promise<{ error?: string }> => {
        const sb = getSupabase();
        if (!sb) return { error: 'Auth service is not available.' };
        const { error } = await sb.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: window.location.origin,
            },
        });
        if (error) {
            Logger.warn('sendOTP failed', error);
            return { error: mapAuthError(error) };
        }
        return {};
    }, []);

    const loginWithGoogle = useCallback(async () => {
        const sb = getSupabase();
        if (!sb) throw new Error('Auth service is not available.');
        const { error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
        if (error) throw new Error(mapAuthError(error));
    }, []);

    const logout = useCallback(() => {
        const sb = getSupabase();
        sb?.auth.signOut().catch(() => { /* best effort */ });
        setUser(null);
    }, []);

    const refreshAccessToken = useCallback(async () => {
        const sb = getSupabase();
        if (!sb) throw new Error('Auth service is not available.');
        const { data, error } = await sb.auth.refreshSession();
        if (error) throw error;
        return data.session?.access_token || '';
    }, []);

    // isAuthenticated is always derived from user state (React-controlled).
    const isAuthenticated = !!user;

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated,
            isLoading,
            sendOTP,
            loginWithGoogle,
            logout,
            refreshAccessToken,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
