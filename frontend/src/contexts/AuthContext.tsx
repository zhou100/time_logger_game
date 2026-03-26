import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AuthService from '../services/auth';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
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
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);
    const useSupabase = isSupabaseConfigured;

    // Re-hydrate user on mount
    useEffect(() => {
        const rehydrate = async () => {
            try {
                if (useSupabase) {
                    const sb = getSupabase();
                    if (!sb) return;
                    const { data: { session } } = await sb.auth.getSession();
                    if (session?.user) {
                        // Fetch real DB user id from backend (needed for realtime subscriptions)
                        try {
                            const { authApi } = await import('../services/api');
                            const profile = await authApi.getCurrentUser();
                            setUser({ id: profile.id, email: session.user.email || '' });
                        } catch {
                            // Fallback if backend is unreachable
                            setUser({ id: 0, email: session.user.email || '' });
                        }
                    }
                } else {
                    if (AuthService.isAuthenticated()) {
                        const token = await AuthService.getValidToken();
                        const userId = AuthService.getUserIdFromToken();
                        if (userId !== null) {
                            const { authApi } = await import('../services/api');
                            const profile = await authApi.getCurrentUser();
                            setUser({ id: profile.id, email: profile.email });
                        }
                    }
                }
            } catch (err) {
                Logger.error('Auth rehydration failed:', err);
                if (!useSupabase) AuthService.clearTokens();
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

    // For Supabase: determine isAuthenticated from user state
    const isAuthenticated = useSupabase ? !!user : AuthService.isAuthenticated();

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
