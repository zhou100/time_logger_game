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

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface UserStats {
    total_entries: number;
    current_streak: number;
    longest_streak: number;
    total_minutes_logged: number;
    level: number;
    xp: number;
    xp_to_next_level: number;
}

// ── WebSocket events ──────────────────────────────────────────────────────────

export type WsEvent =
    | { type: 'entry.classified'; entry_id: string; transcript: string; categories: CategoryItem[] }
    | { type: 'entry.failed'; entry_id: string; error: string }
    | { type: 'stats.updated'; total_entries: number; current_streak: number; level: number; xp: number }
    | { type: 'streak.extended'; streak: number }
    | { type: 'level_up'; old_level: number; new_level: number };

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditResponse {
    entries: number;
    breakdown: Record<string, number>;
    audit_text: string | null;
    generated_at: string | null;
    message?: string;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export interface ApiError {
    detail: string | { msg: string; loc: string[] }[] | Record<string, unknown>;
}

// Legacy — kept for backward-compatibility with existing components
export interface TranscriptionResponse {
    chat_history_id: number;
    transcribed_text: string;
    categories: Array<{
        category: Category;
        extracted_content: string;
    }>;
}
