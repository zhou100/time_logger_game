import axios, { AxiosError } from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse } from '../types/auth';
import { API_BASE_URL } from './api';
import { getSupabase, isSupabaseConfigured } from './supabase';
import Logger from '../utils/logger';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Separate axios instance for auth (form-encoded login)
const authAxios = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    withCredentials: true,
});

const formAxios = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    withCredentials: true,
});

function decodeToken(token: string): Record<string, unknown> | null {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(
            atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        ));
    } catch {
        return null;
    }
}

function isTokenExpired(token: string): boolean {
    const decoded = decodeToken(token);
    if (!decoded?.exp) return true;
    return (decoded.exp as number) <= Math.floor(Date.now() / 1000);
}

class AuthService {
    private accessToken: string | null = localStorage.getItem(TOKEN_KEY);
    private refreshToken: string | null = localStorage.getItem(REFRESH_TOKEN_KEY);
    private isRefreshing = false;
    private queue: Array<(token: string) => void> = [];

    private store(access: string, refresh: string) {
        this.accessToken = access;
        this.refreshToken = refresh;
        localStorage.setItem(TOKEN_KEY, access);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    }

    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        const form = new URLSearchParams();
        form.append('username', credentials.username);
        form.append('password', credentials.password);
        const res = await formAxios.post<AuthResponse>('/v1/auth/token', form);
        this.store(res.data.access_token, res.data.refresh_token);
        Logger.info(`Logged in as user_id=${res.data.user_id}`);
        return res.data;
    }

    async register(credentials: RegisterCredentials): Promise<AuthResponse> {
        const res = await authAxios.post<AuthResponse>('/v1/auth/register', credentials);
        this.store(res.data.access_token, res.data.refresh_token);
        Logger.info(`Registered user_id=${res.data.user_id}`);
        return res.data;
    }

    async googleLogin(credential: string): Promise<AuthResponse> {
        const { authApi } = await import('./api');
        const res = await authApi.googleAuth(credential);
        this.store(res.access_token, res.refresh_token);
        Logger.info(`Google login: user_id=${res.user_id}`);
        return res as unknown as AuthResponse;
    }

    async getNewToken(): Promise<string> {
        if (!this.refreshToken) {
            this.clearTokens();
            throw new Error('No refresh token');
        }

        if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
                this.queue.push((token: string) => {
                    token ? resolve(token) : reject(new Error('Refresh failed'));
                });
            });
        }

        this.isRefreshing = true;
        try {
            const res = await authAxios.post<AuthResponse>('/v1/auth/refresh', {
                refresh_token: this.refreshToken,
            });
            this.store(res.data.access_token, res.data.refresh_token);
            this.queue.forEach(cb => cb(res.data.access_token));
            this.queue = [];
            return res.data.access_token;
        } catch (err) {
            this.queue.forEach(cb => cb(''));
            this.queue = [];
            const axiosErr = err as AxiosError;
            if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) {
                this.clearTokens();
            }
            throw err;
        } finally {
            this.isRefreshing = false;
        }
    }

    async getValidToken(): Promise<string> {
        // Supabase mode: get token from Supabase session
        if (isSupabaseConfigured) {
            const sb = getSupabase();
            if (sb) {
                const { data: { session } } = await sb.auth.getSession();
                if (session?.access_token) return session.access_token;
            }
            throw new Error('Not authenticated');
        }
        if (!this.accessToken) throw new Error('Not authenticated');
        if (isTokenExpired(this.accessToken)) return this.getNewToken();
        return this.accessToken;
    }

    getUserIdFromToken(): number | null {
        if (!this.accessToken) return null;
        const decoded = decodeToken(this.accessToken);
        const sub = decoded?.sub;
        if (!sub) return null;
        const id = parseInt(sub as string, 10);
        return isNaN(id) ? null : id;
    }

    logout() { this.clearTokens(); }

    isAuthenticated(): boolean {
        if (isSupabaseConfigured) {
            // In Supabase mode, auth state is managed by AuthContext
            return !!this.accessToken && !isTokenExpired(this.accessToken);
        }
        return !!this.accessToken && !isTokenExpired(this.accessToken);
    }

    getStoredToken(): string | null { return this.accessToken; }
}

export default new AuthService();
