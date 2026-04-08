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
    EARNING = 'EARNING',
    LEARNING = 'LEARNING',
    RELAXING = 'RELAXING',
    FAMILY = 'FAMILY',
    TODO = 'TODO',
    EXPERIMENT = 'EXPERIMENT',
    REFLECTION = 'REFLECTION',
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
    id?: string;
    text: string | null;
    category: string;
    estimated_minutes?: number | null;
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
    activity_breakdown?: Record<string, number> | null;
    capture_counts?: Record<string, number> | null;
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

export interface WeeklyAuditHistoryItem {
    audit_date: string;
    entries: number;
    breakdown: Record<string, number>;
    audit_text: string | null;
    generated_at: string | null;
    week_label: string;
}

// ── Captures (Capture Inbox) ──────────────────────────────────────────────────

export type CaptureStatus = 'open' | 'done' | 'dismissed';
export type CaptureCategory = 'TODO' | 'EXPERIMENT' | 'REFLECTION';

export interface Capture {
    id: string;
    entry_id: string;
    category: CaptureCategory;
    display_text: string | null;
    status: CaptureStatus;
    edited: boolean;
    source_date: string | null;
    classified_at: string | null;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export interface ApiError {
    detail: string | { msg: string; loc: string[] }[] | Record<string, unknown>;
}
