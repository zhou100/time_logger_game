import axios, { AxiosError } from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse, User, TokenData } from '../types/auth';
import api, { API_ENDPOINTS } from './api';

// Create axios instance with default config
const apiInstance = axios.create({
    baseURL: 'http://localhost:8000/api',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    withCredentials: true,
    validateStatus: (status) => status < 500,
});

// Add request interceptor for debugging
apiInstance.interceptors.request.use(request => {
    console.log('Starting Request:', {
        url: request.url,
        method: request.method,
        headers: request.headers,
        data: request.data
    });
    return request;
});

// Add response interceptor for debugging
apiInstance.interceptors.response.use(
    response => {
        console.log('Response:', {
            status: response.status,
            headers: response.headers,
            data: response.data
        });
        return response;
    },
    error => {
        console.error('Response Error:', {
            message: error.message,
            response: error.response,
            request: error.request
        });
        return Promise.reject(error);
    }
);

// Token helpers
const decodeToken = (token: string): TokenData => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        return payload as TokenData;
    } catch (error) {
        console.error('Error decoding token:', error);
        throw new Error('Invalid token format');
    }
};

const isTokenExpired = (token: string): boolean => {
    try {
        const decoded = decodeToken(token);
        // Add 30 seconds buffer
        return decoded.exp * 1000 < Date.now() + 30000;
    } catch {
        return true;
    }
};

// Authentication service
const AuthService = {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        try {
            console.log('Sending login request:', { username: credentials.username });
            
            const formData = new URLSearchParams();
            formData.append('grant_type', 'password');
            formData.append('username', credentials.username);
            formData.append('password', credentials.password);

            console.log('Login request form data:', Object.fromEntries(formData));
            const response = await api.post<AuthResponse>(
                API_ENDPOINTS.AUTH.TOKEN,
                formData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            console.log('Login response:', response.data);

            // Store tokens
            if (response.data.access_token) {
                localStorage.setItem('access_token', response.data.access_token);
                localStorage.setItem('refresh_token', response.data.refresh_token);
                return response.data;
            } else {
                console.error('Login response missing tokens:', response.data);
                throw new Error('Invalid login response: missing tokens');
            }
        } catch (error) {
            console.error('Login error:', error);
            if (error instanceof AxiosError && error.response) {
                console.error('Login error response:', {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers
                });
            }
            throw error;
        }
    },

    async register(credentials: RegisterCredentials): Promise<User> {
        try {
            console.log('Sending registration request:', credentials);
            const response = await api.post<User>(API_ENDPOINTS.AUTH.REGISTER, credentials);
            return response.data;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    },

    async refreshToken(): Promise<string> {
        try {
            const refreshToken = localStorage.getItem('refresh_token');
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const formData = new URLSearchParams();
            formData.append('grant_type', 'refresh_token');
            formData.append('refresh_token', refreshToken);

            const response = await api.post<AuthResponse>(
                API_ENDPOINTS.AUTH.TOKEN,
                formData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const { access_token, refresh_token } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            
            return access_token;
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.logout(); // Clear tokens on refresh failure
            throw new Error('Session expired. Please log in again.');
        }
    },

    logout(): void {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },

    isAuthenticated(): boolean {
        const token = localStorage.getItem('access_token');
        return !!token && !isTokenExpired(token);
    },

    getAccessToken(): string | null {
        const token = localStorage.getItem('access_token');
        if (token && !isTokenExpired(token)) {
            return token;
        }
        return null;
    },

    async getValidToken(): Promise<string> {
        const token = this.getAccessToken();
        if (token) {
            return token;
        }
        
        // Try to refresh the token
        try {
            return await this.refreshToken();
        } catch (error) {
            throw new Error('Unable to get valid token. Please log in again.');
        }
    }
};

export default AuthService;
