/**
 * Anonymous public demo API client for the interaction-first landing.
 *
 * Endpoints live under /v1/public/demo/* and require `withCredentials` so the
 * HttpOnly `tlg_demo_sid` cookie tags along on every request. The cookie is
 * set by /verify-turnstile and /presign on the backend.
 *
 * Tokens this file is responsible for managing on the client:
 *   - permit_token  → sessionStorage `tlg_demo_permit` (HMAC, ~1h lifetime)
 *   - claim_token   → sessionStorage `tlg_demo_claim_token` (HMAC, 24h, used by /welcome)
 */
import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from './api';

// ── sessionStorage keys ───────────────────────────────────────────────────────

export const PERMIT_STORAGE_KEY = 'tlg_demo_permit';
export const CLAIM_STORAGE_KEY = 'tlg_demo_claim_token';

// ── Response types ────────────────────────────────────────────────────────────

export interface VerifyTurnstileResponse {
    permit_token: string;
    expires_at: string; // ISO 8601 UTC
}

export interface DemoPresignResponse {
    entry_id: string;
    upload_url: string;
    content_type: string;
    permit_token: string;
    claim_token: string;
}

export interface DemoFakeOutput {
    summary: string;
    key_points: string[];
    todos: string[];
}

export type DemoSubmitResponse =
    | { entry_id: string; job_id: string; demo?: undefined; fake_output?: undefined }
    | { entry_id: string; demo: 'capped'; fake_output: DemoFakeOutput; job_id?: undefined };

export interface DemoClassification {
    text: string;
    category: string;
}

export interface DemoTeaser {
    stem: string;
    count: number;
}

export interface DemoStatusResponse {
    step: 'queued' | 'transcribing' | 'classifying' | 'done' | 'failed';
    transcript: string | null;
    classifications: DemoClassification[];
    summary: string | null;
    demo_teaser: DemoTeaser | null;
}

// ── Axios instance ────────────────────────────────────────────────────────────
//
// Separate from `api` because:
// - These endpoints don't need a Bearer token (they're public).
// - They DO need `withCredentials: true` for the demo session cookie.
// - The auth interceptor on `api` would just be dead weight here.

const demoClient = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 20_000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
});

// ── sessionStorage helpers ────────────────────────────────────────────────────
//
// The `permit_token` is an HMAC over (session_id, exp_iso). We don't trust the
// payload — just need the exp to know whether to skip the Turnstile widget.
// Read the exp out of the matching expires_at we stored alongside it.

interface StoredPermit {
    token: string;
    expires_at: string; // ISO
}

export function readPermit(): StoredPermit | null {
    try {
        const raw = sessionStorage.getItem(PERMIT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredPermit;
        if (!parsed.token || !parsed.expires_at) return null;
        const exp = new Date(parsed.expires_at).getTime();
        if (Number.isNaN(exp) || exp < Date.now()) {
            sessionStorage.removeItem(PERMIT_STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writePermit(token: string, expires_at: string): void {
    try {
        sessionStorage.setItem(
            PERMIT_STORAGE_KEY,
            JSON.stringify({ token, expires_at }),
        );
    } catch {
        // sessionStorage unavailable — nothing to do; caller will re-challenge.
    }
}

export function clearPermit(): void {
    try {
        sessionStorage.removeItem(PERMIT_STORAGE_KEY);
    } catch {
        // ignore
    }
}

export function readClaimToken(): string | null {
    try {
        return sessionStorage.getItem(CLAIM_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function writeClaimToken(token: string): void {
    try {
        sessionStorage.setItem(CLAIM_STORAGE_KEY, token);
    } catch {
        // ignore
    }
}

export function clearClaimToken(): void {
    try {
        sessionStorage.removeItem(CLAIM_STORAGE_KEY);
    } catch {
        // ignore
    }
}

/** Drop both permit and claim_token. Used by /welcome after the claim. */
export function clearDemoSession(): void {
    clearPermit();
    clearClaimToken();
}

// ── Cookie probe ──────────────────────────────────────────────────────────────
//
// The `tlg_demo_sid` cookie is HttpOnly so JS can't read it directly. We test
// cookie support indirectly by setting+reading a non-HttpOnly probe. If this
// round-trips, third-party-style demo cookies are likely to survive too. If
// it doesn't, the user is on Safari ITP / cookies disabled / private mode.

export function detectCookieBlocked(): boolean {
    try {
        const probeName = 'tlg_cookie_probe';
        document.cookie = `${probeName}=1; path=/; SameSite=Lax`;
        const survived = document.cookie
            .split(';')
            .some((c) => c.trim().startsWith(`${probeName}=`));
        // Clean up immediately — we don't want this lingering.
        document.cookie = `${probeName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        return !survived;
    } catch {
        return true;
    }
}

// ── API calls ─────────────────────────────────────────────────────────────────

function unwrapError(err: AxiosError): Error {
    const data = err.response?.data as { detail?: string; error?: string } | undefined;
    const detail = data?.detail || data?.error;
    return new Error(detail || err.message || 'Demo request failed');
}

export const demoApi = {
    async verifyTurnstile(token: string): Promise<VerifyTurnstileResponse> {
        try {
            const res = await demoClient.post<VerifyTurnstileResponse>(
                '/v1/public/demo/verify-turnstile',
                { token },
            );
            return res.data;
        } catch (e) {
            throw unwrapError(e as AxiosError);
        }
    },

    async presign(contentType: string, permitToken: string): Promise<DemoPresignResponse> {
        try {
            const res = await demoClient.post<DemoPresignResponse>(
                '/v1/public/demo/presign',
                { content_type: contentType, permit_token: permitToken },
            );
            return res.data;
        } catch (e) {
            throw unwrapError(e as AxiosError);
        }
    },

    /**
     * Direct PUT to the presigned URL. NO credentials — the URL is the auth.
     */
    async uploadAudio(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
        await axios.put(uploadUrl, blob, {
            headers: { 'Content-Type': contentType },
            timeout: 60_000,
            // explicitly false so Cookie header doesn't ride along to S3
            withCredentials: false,
        });
    },

    async submit(entryId: string, permitToken: string): Promise<DemoSubmitResponse> {
        try {
            const res = await demoClient.post<DemoSubmitResponse>(
                '/v1/public/demo/submit',
                { entry_id: entryId, permit_token: permitToken },
            );
            return res.data;
        } catch (e) {
            throw unwrapError(e as AxiosError);
        }
    },

    async status(entryId: string): Promise<DemoStatusResponse> {
        try {
            const res = await demoClient.get<DemoStatusResponse>(
                `/v1/public/demo/status/${encodeURIComponent(entryId)}`,
            );
            return res.data;
        } catch (e) {
            throw unwrapError(e as AxiosError);
        }
    },
};
