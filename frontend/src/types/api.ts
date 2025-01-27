// Authentication types
export interface LoginRequest {
    username: string;  // This is actually the email
    password: string;
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
}

// Category types
export enum Category {
    TODO = 'TODO',
    IDEA = 'IDEA',
    THOUGHT = 'THOUGHT',
    TIME_RECORD = 'TIME_RECORD'
}

// Ensure Category values are valid at runtime
const CATEGORY_VALUES = Object.values(Category);
if (!CATEGORY_VALUES.every(value => typeof value === 'string')) {
    throw new Error('All Category enum values must be strings');
}

// Audio processing types
export interface TranscriptionResponse {
    chat_history_id: number;
    transcribed_text: string;
    categories: Array<{
        category: Category;
        extracted_content: string;
    }>;
}

// Error response types
export interface ValidationError {
    loc: string[];
    msg: string;
    type: string;
}

export interface ApiError {
    detail: string | ValidationError[] | Record<string, any>;
}
