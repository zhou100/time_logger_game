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
    WeeklyAuditHistoryItem,
} from '../types/api';
import AuthService from './auth';
import Logger from '../utils/logger';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:10000';

// ── Axios instance ────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

// Public endpoints that don't need an auth header
const PUBLIC_PATHS = ['/v1/auth/token', '/v1/auth/register', '/v1/auth/refresh', '/v1/auth/google'];

// ── Request interceptor: attach Bearer token ──────────────────────────────────

api.interceptors.request.use(async (config) => {
    const isPublic = PUBLIC_PATHS.some(p => config.url?.includes(p));
    if (!isPublic) {
        const token = await AuthService.getValidToken();
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return config;
});

// ── Response interceptor: handle 401 with token refresh ───────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

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
                const newToken = await AuthService.getNewToken();
                refreshQueue.forEach(cb => cb(newToken));
                refreshQueue = [];
                original._retry = true;
                original.headers['Authorization'] = `Bearer ${newToken}`;
                return api(original);
            } catch (refreshErr) {
                refreshQueue = [];
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        return new Promise(resolve => {
            refreshQueue.push((token: string) => {
                original._retry = true;
                original.headers['Authorization'] = `Bearer ${token}`;
                resolve(api(original));
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
        await axios.put(uploadUrl, blob, {
            headers: { 'Content-Type': blob.type || 'audio/webm' },
        });
    },

    /**
     * Phase 2: register the entry and enqueue processing.
     */
    async submit(
        entryId: string,
        audioKey: string,
        opts?: { recordedAt?: string; localDate?: string; durationSeconds?: number }
    ): Promise<SubmitResponse> {
        try {
            const res = await api.post<SubmitResponse>(`/v1/entries/${entryId}/submit`, {
                audio_key: audioKey,
                recorded_at: opts?.recordedAt,
                local_date: opts?.localDate,
                duration_seconds: opts?.durationSeconds,
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

    async generateAudit(date: string, regenerate = false): Promise<AuditResponse> {
        try {
            const res = await api.post<AuditResponse>('/v1/entries/audit', { date, regenerate });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async generateWeeklyAudit(regenerate = false): Promise<AuditResponse> {
        try {
            const res = await api.post<AuditResponse>('/v1/entries/audit/weekly', { regenerate });
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getWeeklyAuditHistory(limit = 10): Promise<WeeklyAuditHistoryItem[]> {
        try {
            const res = await api.get<WeeklyAuditHistoryItem[]>(`/v1/entries/audit/weekly/history?limit=${limit}`);
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },

    async getActiveDates(): Promise<string[]> {
        try {
            const res = await api.get<string[]>('/v1/entries/active-dates');
            return res.data;
        } catch (e) { throw handleError(e as AxiosError); }
    },
};

export default api;
