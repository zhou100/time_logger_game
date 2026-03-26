import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AuthService from '../services/auth';
import { User, RegisterCredentials, LoginCredentials } from '../types/auth';
import Logger from '../utils/logger';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    register: (credentials: RegisterCredentials) => Promise<void>;
    login: (credentials: LoginCredentials) => Promise<void>;
    googleLogin: (credential: string) => Promise<void>;
    logout: () => void;
    registrationSuccess: string | null;
    clearRegistrationSuccess: () => void;
    refreshAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);

    // Re-hydrate user from stored token on mount
    useEffect(() => {
        const rehydrate = async () => {
            try {
                if (AuthService.isAuthenticated()) {
                    const token = await AuthService.getValidToken();
                    const userId = AuthService.getUserIdFromToken();
                    if (userId !== null) {
                        // Fetch the real user profile
                        const { authApi } = await import('../services/api');
                        const profile = await authApi.getCurrentUser();
                        setUser({ id: profile.id, email: profile.email });
                    }
                }
            } catch (err) {
                Logger.error('Auth rehydration failed:', err);
                AuthService.clearTokens();
                setUser(null);
            }
        };
        rehydrate();
    }, []);

    const register = useCallback(async (credentials: RegisterCredentials) => {
        const response = await AuthService.register(credentials);
        setRegistrationSuccess('Registration successful! Please log in.');
        Logger.info(`Registered: user_id=${response.user_id}`);
    }, []);

    const clearRegistrationSuccess = useCallback(() => setRegistrationSuccess(null), []);

    const login = useCallback(async (credentials: LoginCredentials) => {
        const response = await AuthService.login(credentials);
        setUser({ id: response.user_id, email: response.email });
        Logger.info(`Logged in: user_id=${response.user_id}`);
    }, []);

    const googleLogin = useCallback(async (credential: string) => {
        const response = await AuthService.googleLogin(credential);
        setUser({ id: response.user_id, email: response.email });
        Logger.info(`Google login: user_id=${response.user_id}`);
    }, []);

    const logout = useCallback(() => {
        AuthService.logout();
        setUser(null);
    }, []);

    const refreshAccessToken = useCallback(async () => {
        try {
            return await AuthService.getNewToken();
        } catch (err) {
            Logger.error('Token refresh failed:', err);
            logout();
            throw err;
        }
    }, [logout]);

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: AuthService.isAuthenticated(),
            register,
            login,
            googleLogin,
            logout,
            registrationSuccess,
            clearRegistrationSuccess,
            refreshAccessToken,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
