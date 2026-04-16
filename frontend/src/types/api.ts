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
    local_date?: string | null;
    match_sources?: string[] | null;
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

export interface WeeklyReportJson {
    time_breakdown: {
        activity: Record<string, number>;
        captures: Record<string, number>;
        best_day: string | null;
        worst_day: string | null;
        naval_balance: string | null;
    };
    open_loops: string[];
    recurring_themes: string[];
    draft_status_update: string;
}

export interface AuditResponse {
    entries: number;
    breakdown: Record<string, number>;
    approximate: boolean;
    audit_text: string | null;
    report_json?: WeeklyReportJson | null;
    generated_at: string | null;
    cached?: boolean;
    message?: string;
    week_start?: string;
    week_end?: string;
    days_covered?: number;
    new_themes?: NewThemeRef[];
}

export interface NewThemeRef {
    id: string;
    title: string;
    polarity: 'positive' | 'negative' | 'neutral';
    is_new: boolean;
    occurrences: number;
}

export interface Theme {
    id: string;
    title: string;
    description: string | null;
    polarity: 'positive' | 'negative' | 'neutral';
    category: string | null;
    first_seen: string;
    last_seen: string;
    occurrences: number;
    status: 'active' | 'pinned' | 'dismissed' | 'resolved';
    user_note: string | null;
    evidence: Array<{ audit_date: string; snippet: string }>;
    streak?: boolean[];
}

export interface AvailableWeek {
    week_start: string;
    week_end: string;
    entry_count: number;
    has_report: boolean;
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
