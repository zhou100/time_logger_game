import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AuthService from '../services/auth';
import { User, RegisterCredentials, LoginCredentials } from '../types/auth';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    register: (credentials: RegisterCredentials) => Promise<void>;
    login: (credentials: LoginCredentials) => Promise<void>;
    logout: () => void;
    registrationSuccess: string | null;
    clearRegistrationSuccess: () => void;
    refreshAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);

    // Check authentication status on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                if (AuthService.isAuthenticated()) {
                    // Try to get a valid token
                    await AuthService.getValidToken();
                    // If successful, fetch user details
                    // You might want to implement a getCurrentUser API endpoint
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                AuthService.logout();
                setUser(null);
            }
        };
        checkAuth();
    }, []);

    const register = useCallback(async (credentials: RegisterCredentials) => {
        try {
            console.log('Registration started in AuthContext');
            await AuthService.register(credentials);
            console.log('Registration successful in AuthContext');
            setRegistrationSuccess('Registration successful! Please log in.');
        } catch (error) {
            console.log('Registration failed:', error);
            throw error;
        }
    }, []);

    const clearRegistrationSuccess = useCallback(() => {
        setRegistrationSuccess(null);
    }, []);

    const login = useCallback(async (credentials: LoginCredentials) => {
        try {
            console.log('Login started in AuthContext');
            const response = await AuthService.login(credentials);
            console.log('Login successful, setting user state');
            // Set a basic user object
            setUser({
                id: 0, // We'll update this when we implement getCurrentUser
                email: credentials.username,
                created_at: new Date().toISOString() // Temporary until we get it from backend
            });
            console.log('User state updated');
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }, []);

    const logout = useCallback(() => {
        AuthService.logout();
        setUser(null);
    }, []);

    const refreshAccessToken = useCallback(async () => {
        try {
            return await AuthService.getNewToken();
        } catch (error) {
            console.error('Token refresh failed:', error);
            logout();
            throw error;
        }
    }, [logout]);

    const value = {
        user,
        isAuthenticated: AuthService.isAuthenticated(),
        register,
        login,
        logout,
        registrationSuccess,
        clearRegistrationSuccess,
        refreshAccessToken,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
