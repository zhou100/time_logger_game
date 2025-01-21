import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { 
    LoginRequest, 
    LoginResponse, 
    RegisterRequest,
    TranscriptionResponse,
    ApiError 
} from '../types/api';
import AuthService from './auth';

// API Configuration
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
    AUTH: {
        TOKEN: '/api/auth/token',
        REGISTER: '/api/auth/register',
        ME: '/api/auth/me'
    },
    AUDIO: {
        UPLOAD: '/api/audio/upload'
    }
};

// Create axios instance with default config
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    withCredentials: true
});

// Track if we're currently refreshing the token
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

// Subscribe to token refresh
const subscribeTokenRefresh = (cb: (token: string) => void) => {
    refreshSubscribers.push(cb);
};

// Notify subscribers about new token
const onTokenRefreshed = (token: string) => {
    refreshSubscribers.forEach(cb => cb(token));
    refreshSubscribers = [];
};

// Add request interceptor for auth token and debugging
api.interceptors.request.use(async (request: InternalAxiosRequestConfig) => {
    // Skip token for auth endpoints
    if (request.url?.includes('/api/auth/')) {
        return request;
    }

    try {
        const token = await AuthService.getValidToken();
        if (token) {
            request.headers.Authorization = `Bearer ${token}`;
        }
    } catch (error) {
        console.error('Error getting valid token:', error);
    }
    
    // Ensure proper Content-Type for FormData
    if (request.data instanceof FormData) {
        delete request.headers['Content-Type'];
    }
    
    // Debug logging
    console.log('Starting Request:', {
        url: request.url,
        method: request.method,
        headers: request.headers,
        data: request.data instanceof FormData ? 'FormData' : request.data
    });
    return request;
});

// Add response interceptor for token refresh and debugging
api.interceptors.response.use(
    response => {
        console.log('Response:', {
            status: response.status,
            headers: response.headers,
            data: response.data
        });
        return response;
    },
    async (error: AxiosError) => {
        const originalRequest = error.config;
        if (!originalRequest) {
            return Promise.reject(error);
        }

        // Handle 401 errors
        if (error.response?.status === 401 && !originalRequest.headers['X-Retry']) {
            if (!isRefreshing) {
                isRefreshing = true;

                try {
                    const newToken = await AuthService.refreshToken();
                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                    originalRequest.headers['X-Retry'] = 'true';
                    onTokenRefreshed(newToken);
                    return api(originalRequest);
                } catch (refreshError) {
                    refreshSubscribers = [];
                    throw refreshError;
                } finally {
                    isRefreshing = false;
                }
            } else {
                // Wait for token refresh
                return new Promise(resolve => {
                    subscribeTokenRefresh(token => {
                        originalRequest.headers['Authorization'] = `Bearer ${token}`;
                        originalRequest.headers['X-Retry'] = 'true';
                        resolve(api(originalRequest));
                    });
                });
            }
        }

        console.error('Response Error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            headers: error.response?.headers
        });
        return Promise.reject(error);
    }
);

// Error handling helper
function handleApiError(error: AxiosError) {
    console.error('API Error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
    });

    if (error.response?.status === 401) {
        throw new Error('Authentication failed. Please check your credentials.');
    } else if (error.response?.status === 409) {
        throw new Error('This email is already registered. Please use a different email or try logging in.');
    } else if (error.response?.status === 422) {
        const errorResponse = error.response.data as { detail: string | { msg: string }[] };
        if (typeof errorResponse.detail === 'string') {
            throw new Error(errorResponse.detail);
        }
        throw new Error('Validation error. Please check your input.');
    } else {
        throw new Error('An unexpected error occurred. Please try again.');
    }
}

// Auth API
export const authApi = {
    login: async (data: LoginRequest): Promise<LoginResponse> => {
        try {
            console.log('Sending login request:', { username: data.username });
            const formData = new URLSearchParams();
            formData.append('username', data.username);
            formData.append('password', data.password);

            const response = await api.post(
                API_ENDPOINTS.AUTH.TOKEN,
                formData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            console.log('Login response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Login error:', error);
            if (error instanceof AxiosError) {
                console.error('Response data:', error.response?.data);
                handleApiError(error);
            }
            throw error;
        }
    },

    register: async (data: RegisterRequest) => {
        try {
            console.log('Sending registration request:', data);
            const response = await api.post(API_ENDPOINTS.AUTH.REGISTER, data);
            console.log('Registration response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Registration error:', error);
            if (error instanceof AxiosError) {
                console.error('Response data:', error.response?.data);
                handleApiError(error);
            }
            throw error;
        }
    },

    getCurrentUser: async () => {
        try {
            const response = await api.get(API_ENDPOINTS.AUTH.ME);
            return response.data;
        } catch (error) {
            if (error instanceof AxiosError) {
                handleApiError(error);
            }
            throw error;
        }
    }
};

// Audio API
export const audioApi = {
    uploadAudio: async (audioBlob: Blob): Promise<TranscriptionResponse> => {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.webm');

            const response = await api.post<TranscriptionResponse>(
                API_ENDPOINTS.AUDIO.UPLOAD,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );
            return response.data;
        } catch (error) {
            if (error instanceof AxiosError) {
                handleApiError(error);
            }
            throw error;
        }
    }
};

export default api;