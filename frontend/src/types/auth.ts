export interface User {
    id: number;
    email: string;
    created_at: string;
}

export interface LoginCredentials {
    username: string;  // Keep as username for FastAPI compatibility
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
}

export interface TokenData {
    sub: string;  // user email
    exp: number;  // expiration timestamp
    iat?: number; // issued at timestamp
    jti?: string; // JWT ID
}

export interface AuthState {
    accessToken: string | null;
    refreshToken: string | null;
    user: User | null;
}

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (credentials: LoginCredentials) => Promise<void>;
    register: (credentials: RegisterCredentials) => Promise<void>;
    logout: () => void;
    refreshAccessToken: () => Promise<string>;
}
