import React, { createContext, useContext, useState, useCallback } from 'react';
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
            const response = await AuthService.login(credentials);
            localStorage.setItem('token', response.access_token);
            // You might want to fetch user details here and set them in state
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }, []);

    const logout = useCallback(() => {
        AuthService.logout();
        setUser(null);
    }, []);

    const value = {
        user,
        isAuthenticated: AuthService.isAuthenticated(),
        register,
        login,
        logout,
        registrationSuccess,
        clearRegistrationSuccess,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
