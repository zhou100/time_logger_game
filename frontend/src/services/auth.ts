import axios, { AxiosError } from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse } from '../types/auth';
import { API_BASE_URL } from './api';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { readSupabaseSession } from './supabaseStorage';
import Logger from '../utils/logger';

// supabase-js refreshSession() can wedge on a storage lock; cap it so a
// stuck refresh doesn't translate to a 30s spinner for the user.
const REFRESH_TIMEOUT_MS = 5000;
// Refresh slightly before expiry to absorb client clock skew and avoid
// trip-then-retry on every request near the boundary.
const TOKEN_EXPIRY_SKEW_S = 30;

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Separate axios instance for auth (form-encoded login)
const authAxios = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

const formAxios = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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
    // Subtract a skew margin so we refresh slightly before the boundary,
    // avoiding a guaranteed 401 → refresh → retry on every request when
    // the token is one second from expiry.
    return (decoded.exp as number) <= Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SKEW_S;
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
        // Supabase mode: read the access token directly from localStorage.
        // Avoid awaiting sb.auth.getSession() on every request — it can hang
        // indefinitely (supabase-js _acquireLock deadlock or slow refresh),
        // which would block every API call and freeze the app.
        if (isSupabaseConfigured) {
            const stored = readSupabaseSession();
            if (stored?.access_token && !isTokenExpired(stored.access_token)) {
                return stored.access_token;
            }
            // Token missing or expired — fall back to supabase-js refresh.
            // This is the only place we accept the risk of waiting on
            // supabase-js, and we cap it with a hard timeout so a wedged
            // refresh degrades to a normal auth error instead of an
            // infinite spinner.
            const sb = getSupabase();
            if (sb) {
                try {
                    const refreshPromise = sb.auth.refreshSession();
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('refresh timeout')), REFRESH_TIMEOUT_MS)
                    );
                    const { data: { session } } = await Promise.race([
                        refreshPromise,
                        timeoutPromise,
                    ]) as Awaited<ReturnType<typeof sb.auth.refreshSession>>;
                    if (session?.access_token) return session.access_token;
                } catch (err) {
                    Logger.error('Supabase refreshSession failed:', err);
                }
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
