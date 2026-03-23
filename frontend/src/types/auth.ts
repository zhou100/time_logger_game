export interface User {
    id: number;
    email: string;
}

export interface LoginCredentials {
    username: string;  // email — FastAPI OAuth2 form uses "username"
    password: string;
}

export interface RegisterCredentials {
    email: string;
    password: string;
}

export interface AuthResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    user_id: number;
    email: string;
}

export interface TokenData {
    sub: string;    // user_id as string
    email: string;
    exp: number;
    type: 'access' | 'refresh';
    jti?: string;
}
