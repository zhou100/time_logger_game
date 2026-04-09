import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AuthService from '../services/auth';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
import { readSupabaseSession } from '../services/supabaseStorage';
import { User, RegisterCredentials, LoginCredentials } from '../types/auth';
import Logger from '../utils/logger';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    register: (credentials: RegisterCredentials) => Promise<void>;
    login: (credentials: LoginCredentials) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => void;
    registrationSuccess: string | null;
    clearRegistrationSuccess: () => void;
    refreshAccessToken: () => Promise<string>;
    useSupabase: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const useSupabase = isSupabaseConfigured;

    // Synchronously restore user from localStorage so the very first render
    // already has isAuthenticated=true — no blank page, no LandingPage flash.
    const [user, setUser] = useState<User | null>(() => {
        if (useSupabase) {
            // Read the Supabase session synchronously from localStorage so the
            // very first render already has isAuthenticated=true. Going through
            // sb.auth.getSession() can hang on a storage lock — see
            // services/supabaseStorage.ts for the rationale.
            const session = readSupabaseSession();
            if (session?.user?.email) {
                return { id: 0, email: session.user.email };
            }
        } else {
            // JWT mode: getStoredToken() returns the token regardless of expiry.
            // An expired access token can still be decoded for user-id; the Axios
            // request interceptor will auto-refresh it via the 30-day refresh token.
            if (AuthService.getStoredToken()) {
                const userId = AuthService.getUserIdFromToken();
                if (userId !== null) return { id: userId, email: '' };
            }
        }
        return null;
    });
    const [isLoading, setIsLoading] = useState(true);
    const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);

    // Re-hydrate user on mount
    useEffect(() => {
        // Eager unblock: if we already restored a user synchronously from
        // localStorage, don't gate the UI on a network round-trip. Awaiting
        // sb.auth.getSession() can hang indefinitely (supabase-js _acquireLock
        // deadlock or slow token refresh), which previously left users stuck
        // on a spinner forever. The finally{} below covers the no-user case.
        if (user) setIsLoading(false);

        const rehydrate = async () => {
            try {
                if (useSupabase) {
                    const sb = getSupabase();
                    if (!sb) return;
                    const { data: { session } } = await sb.auth.getSession();
                    if (session?.user) {
                        // Don't clobber a synchronously-restored user with id:0
                        setUser((prev) => prev ?? { id: 0, email: session.user.email || '' });
                        // Fetch real DB user id in the background
                        import('../services/api').then(({ authApi }) =>
                            authApi.getCurrentUser()
                                .then((profile) => setUser({ id: profile.id, email: session.user.email || '' }))
                                .catch(() => { /* keep fallback id:0 */ })
                        );
                    } else {
                        // No session — clear any stale synchronously-restored user
                        setUser(null);
                    }
                } else {
                    // getStoredToken() returns the raw token regardless of expiry.
                    // An expired token can still be decoded for user-id, and the
                    // Axios request interceptor (getValidToken) will auto-refresh it.
                    if (AuthService.getStoredToken()) {
                        const userId = AuthService.getUserIdFromToken();
                        if (userId !== null) {
                            setUser((prev) => prev ?? { id: userId, email: '' });
                            // Fetch full profile in background (triggers token refresh if expired)
                            try {
                                const { authApi } = await import('../services/api');
                                const profile = await authApi.getCurrentUser();
                                setUser({ id: profile.id, email: profile.email });
                            } catch {
                                // Only log out if tokens were actually cleared (e.g. 401 on refresh).
                                if (!AuthService.getStoredToken()) {
                                    setUser(null);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                Logger.error('Auth rehydration failed:', err);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        rehydrate();
    }, [useSupabase]);

    // Listen for Supabase auth state changes
    useEffect(() => {
        if (!useSupabase) return;
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
    }, [useSupabase]);

    const register = useCallback(async (credentials: RegisterCredentials) => {
        if (useSupabase) {
            const sb = getSupabase()!;
            const { error } = await sb.auth.signUp({
                email: credentials.email,
                password: credentials.password,
            });
            if (error) throw new Error(error.message);
            setRegistrationSuccess('Registration successful! Please check your email.');
        } else {
            const response = await AuthService.register(credentials);
            setRegistrationSuccess('Registration successful! Please log in.');
            Logger.info(`Registered: user_id=${response.user_id}`);
        }
    }, [useSupabase]);

    const clearRegistrationSuccess = useCallback(() => setRegistrationSuccess(null), []);

    const login = useCallback(async (credentials: LoginCredentials) => {
        if (useSupabase) {
            const sb = getSupabase()!;
            const { data, error } = await sb.auth.signInWithPassword({
                email: credentials.username,
                password: credentials.password,
            });
            if (error) throw new Error(error.message);
            if (data.user) {
                try {
                    const { authApi } = await import('../services/api');
                    const profile = await authApi.getCurrentUser();
                    setUser({ id: profile.id, email: data.user.email || '' });
                } catch {
                    setUser({ id: 0, email: data.user.email || '' });
                }
            }
        } else {
            const response = await AuthService.login(credentials);
            setUser({ id: response.user_id, email: response.email });
            Logger.info(`Logged in: user_id=${response.user_id}`);
        }
    }, [useSupabase]);

    const loginWithGoogle = useCallback(async () => {
        if (useSupabase) {
            const sb = getSupabase()!;
            const { error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin },
            });
            if (error) throw new Error(error.message);
        }
    }, [useSupabase]);

    const logout = useCallback(() => {
        if (useSupabase) {
            const sb = getSupabase();
            sb?.auth.signOut();
        } else {
            AuthService.logout();
        }
        setUser(null);
    }, [useSupabase]);

    const refreshAccessToken = useCallback(async () => {
        if (useSupabase) {
            const sb = getSupabase()!;
            const { data, error } = await sb.auth.refreshSession();
            if (error) throw error;
            return data.session?.access_token || '';
        }
        try {
            return await AuthService.getNewToken();
        } catch (err) {
            Logger.error('Token refresh failed:', err);
            logout();
            throw err;
        }
    }, [useSupabase, logout]);

    // isAuthenticated is always derived from user state (React-controlled).
    // Never read AuthService.isAuthenticated() here — its mutable token fields
    // can be cleared by the response interceptor mid-session without triggering
    // a React re-render, causing stale isAuthenticated=false flips.
    const isAuthenticated = !!user;

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated,
            isLoading,
            register,
            login,
            loginWithGoogle,
            logout,
            registrationSuccess,
            clearRegistrationSuccess,
            refreshAccessToken,
            useSupabase,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
