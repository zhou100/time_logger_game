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

// Audio processing types
export interface TranscriptionResponse {
    chat_history_id: number;
    transcribed_text: string;
    categories: Array<{
        category: string;
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
