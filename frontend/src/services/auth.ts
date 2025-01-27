import axios, { AxiosError } from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse, User } from '../types/auth';
import api, { API_ENDPOINTS } from './api';
import Logger from '../utils/logger';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Create axios instance with default config
const apiInstance = axios.create({
    baseURL: 'http://localhost:10000/api',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    withCredentials: true,
});

// Create axios instance for form data requests
const formApi = axios.create({
    baseURL: 'http://localhost:10000/api',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
    },
    withCredentials: true,
});

// Add request interceptor for debugging
apiInstance.interceptors.request.use(request => {
    Logger.debug('Starting Request:', {
        url: request.url,
        method: request.method,
        headers: request.headers,
    });
    return request;
});

// Add response interceptor for debugging
apiInstance.interceptors.response.use(
    response => {
        Logger.debug('Response:', {
            status: response.status,
            headers: response.headers,
        });
        return response;
    },
    error => {
        Logger.error('Response Error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
        });
        return Promise.reject(error);
    }
);

// Token helpers
const decodeToken = (token: string): any => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (error) {
        Logger.error('Error decoding token:', error);
        return null;
    }
};

const isTokenExpired = (token: string): boolean => {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
        return true;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp <= currentTime;
};

class AuthService {
    private accessToken: string | null = null;
    private tokenForRefresh: string | null = null;
    private isRefreshing: boolean = false;
    private refreshSubscribers: ((token: string) => void)[] = [];

    constructor() {
        // Load tokens from localStorage on initialization
        this.accessToken = localStorage.getItem(TOKEN_KEY);
        this.tokenForRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
        Logger.info('Auth service initialized:', { 
            hasAccessToken: !!this.accessToken,
            hasRefreshToken: !!this.tokenForRefresh 
        });

        // Check token validity on initialization
        if (this.accessToken && isTokenExpired(this.accessToken)) {
            Logger.info('Access token expired on initialization, attempting refresh');
            this.getNewToken().catch(error => {
                Logger.error('Failed to refresh token on initialization:', error);
                this.clearTokens();
            });
        }
    }

    private setTokens(accessToken: string, refreshToken: string) {
        this.accessToken = accessToken;
        this.tokenForRefresh = refreshToken;
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        Logger.info('Tokens updated and stored');
    }

    private clearTokens() {
        this.accessToken = null;
        this.tokenForRefresh = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        Logger.info('Tokens cleared');
    }

    private onRefreshSuccess(token: string) {
        this.refreshSubscribers.forEach(cb => cb(token));
        this.refreshSubscribers = [];
    }

    private onRefreshFailure(error: Error) {
        this.refreshSubscribers.forEach(cb => cb(''));
        this.refreshSubscribers = [];
        throw error;
    }

    public async login(credentials: LoginCredentials): Promise<AuthResponse> {
        try {
            Logger.info('Sending login request:', { username: credentials.username });
            
            // Convert credentials to form data
            const formData = new URLSearchParams();
            formData.append('username', credentials.username);
            formData.append('password', credentials.password);
            
            const response = await formApi.post<AuthResponse>(API_ENDPOINTS.AUTH.TOKEN, formData);

            if (!response.data.access_token || !response.data.refresh_token) {
                throw new Error('Invalid login response: missing tokens');
            }

            this.setTokens(response.data.access_token, response.data.refresh_token);
            return response.data;
        } catch (error) {
            Logger.error('Login error:', error);
            if (error instanceof AxiosError && error.response) {
                const data = error.response.data;
                if (typeof data === 'object' && data.detail) {
                    throw new Error(data.detail);
                }
            }
            this.clearTokens();
            throw new Error('Login failed. Please check your credentials and try again.');
        }
    }

    public async register(credentials: RegisterCredentials): Promise<User> {
        try {
            Logger.info('Sending registration request:', { email: credentials.email });
            const response = await api.post<User>(API_ENDPOINTS.AUTH.REGISTER, credentials);
            return response.data;
        } catch (error) {
            Logger.error('Registration error:', error);
            throw error;
        }
    }

    public async getNewToken(): Promise<string> {
        if (!this.tokenForRefresh) {
            Logger.error('No refresh token available');
            this.clearTokens();
            throw new Error('No refresh token available');
        }

        if (this.isRefreshing) {
            Logger.debug('Token refresh already in progress, waiting...');
            return new Promise((resolve, reject) => {
                this.refreshSubscribers.push((token: string) => {
                    if (token) {
                        resolve(token);
                    } else {
                        reject(new Error('Token refresh failed'));
                    }
                });
            });
        }

        try {
            this.isRefreshing = true;
            Logger.info('Attempting to refresh token');
            
            const response = await api.post<AuthResponse>(
                API_ENDPOINTS.AUTH.REFRESH,
                { refresh_token: this.tokenForRefresh }
            );

            if (!response.data.access_token || !response.data.refresh_token) {
                throw new Error('Invalid refresh response: missing tokens');
            }

            this.setTokens(response.data.access_token, response.data.refresh_token);
            this.onRefreshSuccess(response.data.access_token);
            return response.data.access_token;
        } catch (error) {
            Logger.error('Token refresh failed:', error);
            if (error instanceof AxiosError) {
                if (error.response?.status === 401 || error.response?.status === 403) {
                    this.clearTokens();
                }
            }
            this.onRefreshFailure(error as Error);
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }

    public async getValidToken(): Promise<string> {
        if (!this.accessToken) {
            Logger.error('No access token available');
            throw new Error('No access token available');
        }

        if (isTokenExpired(this.accessToken)) {
            Logger.info('Access token expired, refreshing...');
            return this.getNewToken();
        }

        return this.accessToken;
    }

    public logout(): void {
        this.clearTokens();
    }

    public isAuthenticated(): boolean {
        return !!this.accessToken && !isTokenExpired(this.accessToken);
    }

    public getStoredToken(): string | null {
        return this.accessToken;
    }
}

export default new AuthService();
