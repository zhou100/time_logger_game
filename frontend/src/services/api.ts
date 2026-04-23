import axios, { AxiosError, AxiosInstance } from 'axios';
import {
    LoginRequest,
    TokenResponse,
    RegisterRequest,
    PresignResponse,
    SubmitResponse,
    EntryStatus,
    EntryItem,
    EntryListResponse,
    CategoryItem,
    AuditResponse,
    AvailableWeek,
    Capture,
    CaptureCategory,
    CaptureStatus,
    Theme,
    CoachingPreferences,
    CoachingPreferencesPatch,
} from '../types/api';
import { getSupabase } from './supabase';
import { readSupabaseSession } from './supabaseStorage';
import Logger from '../utils/logger';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:10000';

// Supabase refreshSession() can wedge on a storage lock; cap it so a stuck
// refresh doesn't translate to a hung request for the user.
const REFRESH_TIMEOUT_MS = 5000;
// Refresh slightly before expiry to absorb client clock skew and avoid
// tripping-then-retrying on every request near the boundary.
const TOKEN_EXPIRY_SKEW_S = 30;

// ── Axios instance ────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
});

// Public endpoints that don't need an auth header. Left for safety even though
// the frontend no longer calls the JWT auth routes after the Supabase-only migration.
const PUBLIC_PATHS = ['/v1/auth/token', '/v1/auth/register', '/v1/auth/refresh', '/v1/auth/google'];

function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
        ),
    ]);
}

async function getAccessToken(): Promise<string | null> {
    // Sync read — hot path. Avoids supabase-js storage-lock hangs per request.
    const session = readSupabaseSession();
    if (!session?.access_token) return null;

    const nowWithSkew = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SKEW_S;
    if (!session.expires_at || session.expires_at > nowWithSkew) {
        return session.access_token;
    }

    // Near/past expiry — refresh via supabase-js with a timeout.
    const sb = getSupabase();
    if (!sb) return session.access_token; // no way to refresh; send what we have
    try {
        const { data } = await withTimeout(sb.auth.refreshSession(), REFRESH_TIMEOUT_MS, 'refresh');
        return data.session?.access_token ?? null;
    } catch (err) {
        Logger.warn('Token refresh failed (pre-request)', err);
        return null;
    }
}

// ── Request interceptor: attach Bearer token ──────────────────────────────────

api.interceptors.request.use(async (config) => {
    const isPublic = PUBLIC_PATHS.some(p => config.url?.includes(p));
    if (!isPublic) {
        const token = await getAccessToken();
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return config;
});

// ── Response interceptor: handle 401 with token refresh ───────────────────────
//
// Concurrent-401 queue: if N requests 401 simultaneously, only ONE refresh
// fires; the rest wait on the same promise and retry with the new token.
// If refresh fails or times out, sign out cleanly — no indefinite spinner.
//
let isRefreshing = false;
let refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: unknown) => void;
}> = [];

api.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
        const original = error.config as any;

        if (error.response?.status !== 401 || original._retry) {
            return Promise.reject(error);
        }

        if (!isRefreshing) {
            isRefreshing = true;
            try {
                const sb = getSupabase();
                if (!sb) throw new Error('Supabase client not configured');
                const { data, error: refreshError } = await withTimeout(
                    sb.auth.refreshSession(),
                    REFRESH_TIMEOUT_MS,
                    'refresh',
                );
                if (refreshError) throw refreshError;
                const newToken = data.session?.access_token;
                if (!newToken) throw new Error('refreshSession returned no access_token');

                refreshQueue.forEach(({ resolve }) => resolve(newToken));
                refreshQueue = [];
                original._retry = true;
                original.headers['Authorization'] = `Bearer ${newToken}`;
                return api(original);
            } catch (refreshErr) {
                Logger.error('Token refresh failed on 401; signing out', refreshErr);
                refreshQueue.forEach(({ reject }) => reject(refreshErr));
                refreshQueue = [];
                // Sign out so AuthContext's onAuthStateChange clears user state.
                const sb = getSupabase();
                sb?.auth.signOut().catch(() => { /* best effort */ });
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        return new Promise((resolve, reject) => {
            refreshQueue.push({
                resolve: (token: string) => {
                    original._retry = true;
                    original.headers['Authorization'] = `Bearer ${token}`;
                    resolve(api(original));
                },
                reject,
            });
        });
    }
);

// ── Error helper ──────────────────────────────────────────────────────────────

function handleError(err: AxiosError): never {
    const status = err.response?.status;
    const data = err.response?.data as any;
    const detail = typeof data?.detail === 'string' ? data.detail : null;

    if (status === 401) throw new Error(detail || 'Authentication failed.');
    if (status === 409) throw new Error(detail || 'Email already registered.');
    if (status === 422) throw new Error('Validation error. Check your input.');
    if (status === 404) throw new Error(detail || 'Not found.');
    if (status === 500) throw new Error('Server error. Try again later.');
    throw new Error(detail || 'Unexpected error.');
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
    async login(data: LoginRequest): Promise<TokenResponse> {
        try {
            const res = await api.post<TokenResponse>('/v1/auth/token', data);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async register(data: RegisterRequest): Promise<TokenResponse> {
        try {
            const res = await api.post<TokenResponse>('/v1/auth/register', data);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async googleAuth(credential: string): Promise<TokenResponse> {
        try {
            const res = await api.post<TokenResponse>('/v1/auth/google', { credential });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getCurrentUser(): Promise<{ id: number; email: string }> {
        try {
            const res = await api.get<{ id: number; email: string }>('/v1/auth/me');
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },
};

// ── Entries API (v2 two-phase upload) ─────────────────────────────────────────

export const entriesApi = {
    /**
     * Phase 1: obtain a presigned PUT URL and entry_id.
     * The client should PUT audio directly to upload_url (bypasses app server).
     */
    async presign(contentType = 'audio/webm'): Promise<PresignResponse> {
        try {
            const res = await api.post<PresignResponse>('/v1/entries/presign', null, {
                params: { content_type: contentType },
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    /**
     * Upload audio bytes directly to the presigned URL (no auth header needed —
     * this goes straight to MinIO/S3, not through the app server).
     */
    async uploadToStorage(uploadUrl: string, blob: Blob): Promise<void> {
        try {
            await axios.put(uploadUrl, blob, {
                headers: { 'Content-Type': blob.type || 'audio/webm' },
                timeout: 60_000,
            });
        } catch (err) {
            if (axios.isAxiosError(err) && !err.response) {
                // Network error (CORS block, timeout, or unreachable)
                throw new Error(
                    'Upload failed — could not reach storage. Please refresh the page and try again.'
                );
            }
            throw err;
        }
    },

    /**
     * Phase 2: register the entry and enqueue processing.
     */
    async submit(
        entryId: string,
        audioKey: string,
        opts?: { recordedAt?: string; durationSeconds?: number; localDate?: string }
    ): Promise<SubmitResponse> {
        try {
            const res = await api.post<SubmitResponse>(`/v1/entries/${entryId}/submit`, {
                audio_key: audioKey,
                recorded_at: opts?.recordedAt,
                duration_seconds: opts?.durationSeconds,
                local_date: opts?.localDate,
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getStatus(entryId: string): Promise<EntryStatus> {
        try {
            const res = await api.get<EntryStatus>(`/v1/entries/${entryId}/status`);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async list(skip = 0, limit = 20, date?: string): Promise<EntryListResponse> {
        try {
            const res = await api.get<EntryListResponse>('/v1/entries/', {
                params: { skip, limit, ...(date ? { date } : {}) },
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async search(
        query: string,
        opts?: { skip?: number; limit?: number; category?: string; dateFrom?: string; dateTo?: string }
    ): Promise<EntryListResponse> {
        try {
            const res = await api.get<EntryListResponse>('/v1/entries/search', {
                params: {
                    q: query,
                    skip: opts?.skip ?? 0,
                    limit: opts?.limit ?? 20,
                    ...(opts?.category ? { category: opts.category } : {}),
                    ...(opts?.dateFrom ? { date_from: opts.dateFrom } : {}),
                    ...(opts?.dateTo ? { date_to: opts.dateTo } : {}),
                },
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async deleteEntry(entryId: string): Promise<void> {
        try {
            await api.delete(`/v1/entries/${entryId}`);
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async updateEntry(entryId: string, data: { transcript?: string; categories?: CategoryItem[]; date?: string }): Promise<EntryItem> {
        try {
            const res = await api.patch<EntryItem>(`/v1/entries/${entryId}`, data);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async reclassifyEntry(entryId: string): Promise<EntryItem> {
        try {
            const res = await api.post<EntryItem>(`/v1/entries/${entryId}/reclassify`);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async generateAudit(date: string, regenerate = false): Promise<AuditResponse> {
        try {
            const res = await api.post<AuditResponse>('/v1/entries/audit', { date, regenerate });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getWeeklyAudit(weekStart: string): Promise<AuditResponse | null> {
        try {
            const res = await api.get<AuditResponse>(`/v1/entries/audit/weekly`, {
                params: { week_start: weekStart },
                validateStatus: (s) => s === 200 || s === 204,
            });
            if (res.status === 204) return null;
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async generateWeeklyAudit(weekStart: string, regenerate = false): Promise<AuditResponse> {
        try {
            const res = await api.post<AuditResponse>('/v1/entries/audit/weekly', { week_start: weekStart, regenerate });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getAvailableWeeks(limit = 20): Promise<AvailableWeek[]> {
        try {
            const res = await api.get<AvailableWeek[]>(`/v1/entries/audit/weekly/available-weeks`, {
                params: { limit },
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async listThemes(status?: 'active' | 'pinned' | 'dismissed' | 'resolved'): Promise<Theme[]> {
        try {
            const res = await api.get<Theme[]>('/v1/entries/themes', {
                params: status ? { status } : {},
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async updateTheme(themeId: string, data: { status?: string; user_note?: string }): Promise<Theme> {
        try {
            const res = await api.patch<Theme>(`/v1/entries/themes/${themeId}`, data);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async deleteTheme(themeId: string): Promise<void> {
        try {
            await api.delete(`/v1/entries/themes/${themeId}`);
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getActiveDates(): Promise<string[]> {
        try {
            const res = await api.get<string[]>('/v1/entries/active-dates');
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },
};

// ── Coaching preferences API ──────────────────────────────────────────────────

/**
 * Validation error from PATCH /users/me/preferences.
 * `fields` maps field name → message so the form can show inline hints.
 */
export class PreferencesValidationError extends Error {
    fields: Record<string, string>;
    constructor(fields: Record<string, string>, generalMessage = 'Validation error') {
        super(generalMessage);
        this.name = 'PreferencesValidationError';
        this.fields = fields;
    }
}

function _extractFieldErrors(detail: unknown): Record<string, string> {
    const fields: Record<string, string> = {};
    if (Array.isArray(detail)) {
        for (const item of detail) {
            if (item && typeof item === 'object' && 'loc' in item && 'msg' in item) {
                const loc = (item as any).loc as unknown[];
                // FastAPI loc is ['body', 'field_name', ...]; take first non-'body' segment
                const field = loc.find(
                    (l) => typeof l === 'string' && l !== 'body'
                ) as string | undefined;
                if (field) fields[field] = String((item as any).msg);
            }
        }
    }
    return fields;
}

export const preferencesApi = {
    async get(): Promise<CoachingPreferences> {
        try {
            const res = await api.get<CoachingPreferences>('/v1/users/me/preferences');
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async patch(body: CoachingPreferencesPatch): Promise<CoachingPreferences> {
        try {
            const res = await api.patch<CoachingPreferences>('/v1/users/me/preferences', body);
            return res.data;
        } catch (err) {
            const ax = err as AxiosError;
            if (ax.response?.status === 422) {
                const data = ax.response?.data as any;
                const fields = _extractFieldErrors(data?.detail);
                throw new PreferencesValidationError(fields, 'Some preferences are invalid.');
            }
            throw handleError(ax);
        }
    },
};

// ── Captures API (Capture Inbox) ──────────────────────────────────────────────

export const capturesApi = {
    async list(opts?: { category?: CaptureCategory; status?: CaptureStatus | 'all' }): Promise<Capture[]> {
        try {
            const res = await api.get<Capture[]>('/v1/captures/', {
                params: {
                    ...(opts?.category ? { category: opts.category } : {}),
                    ...(opts?.status ? { status: opts.status } : {}),
                },
            });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async patch(
        captureId: string,
        data: { status?: CaptureStatus; edited_text?: string }
    ): Promise<Capture> {
        try {
            const res = await api.patch<Capture>(`/v1/captures/${captureId}`, data);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },
};

export default api;
