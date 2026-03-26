// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginRequest {
    username: string;   // email
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
}

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    user_id: number;
    email: string;
}

// ── Categories ────────────────────────────────────────────────────────────────

export enum Category {
    TODO = 'TODO',
    IDEA = 'IDEA',
    THOUGHT = 'THOUGHT',
    TIME_RECORD = 'TIME_RECORD',
}

// ── Entries (v2 pipeline) ─────────────────────────────────────────────────────

export interface PresignResponse {
    entry_id: string;
    upload_url: string;
    audio_key: string;
}

export interface SubmitResponse {
    entry_id: string;
    job_id: string;
}

export interface CategoryItem {
    text: string | null;
    category: string;
    estimated_minutes: number | null;
}

export interface EntryStatus {
    entry_id: string;
    job_id: string | null;
    status: 'pending' | 'processing' | 'done' | 'failed' | 'unknown';
    step: string | null;
    transcript: string | null;
    categories: CategoryItem[];
}

export interface EntryItem {
    id: string;
    transcript: string | null;
    recorded_at: string | null;
    created_at: string;
    duration_seconds: number | null;
    categories: CategoryItem[];
}

export interface EntryListResponse {
    items: EntryItem[];
    total: number;
    skip: number;
    limit: number;
}


// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditResponse {
    entries: number;
    breakdown: Record<string, number>;
    approximate: boolean;
    audit_text: string | null;
    generated_at: string | null;
    cached?: boolean;
    message?: string;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export interface ApiError {
    detail: string | { msg: string; loc: string[] }[] | Record<string, unknown>;
}

