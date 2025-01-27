import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { 
    LoginRequest, 
    LoginResponse, 
    RegisterRequest,
    TranscriptionResponse,
    ApiError
} from '../types/api';
import { Category } from '../types/api';
import AuthService from './auth';
import { categorizeText } from '../utils/categorization';
import Logger from '../utils/logger';

// API Configuration
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:10000';

export const API_ENDPOINTS = {
    AUTH: {
        TOKEN: '/auth/token',
        REGISTER: '/auth/register',
        REFRESH: '/auth/refresh',
        USER: '/users/me'
    },
    AUDIO: {
        UPLOAD: '/audio/upload'
    }
};

// Create axios instance with default config
const api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
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
    refreshSubscribers.forEach(callback => callback(token));
    refreshSubscribers = [];
};

const onTokenRefreshFailed = () => {
    refreshSubscribers = [];
};

// Add request interceptor for auth token
api.interceptors.request.use(
    async (config) => {
        try {
            // Skip auth for token-related endpoints
            const publicEndpoints = [
                API_ENDPOINTS.AUTH.TOKEN,
                API_ENDPOINTS.AUTH.REGISTER,
                API_ENDPOINTS.AUTH.REFRESH
            ];
            
            if (config.url && publicEndpoints.some(endpoint => config.url?.includes(endpoint))) {
                Logger.debug('Skipping auth for public endpoint:', config.url);
                return config;
            }

            const token = await AuthService.getValidToken();
            if (token) {
                Logger.debug('Adding auth token to request:', {
                    url: config.url,
                    method: config.method
                });
                config.headers['Authorization'] = `Bearer ${token}`;
            }
            return config;
        } catch (error) {
            Logger.error('Error getting valid token:', error);
            throw error;
        }
    },
    (error) => {
        Logger.error('Request interceptor error:', error);
        return Promise.reject(error);
    }
);

// Add response interceptor for token refresh and debugging
api.interceptors.response.use(
    (response) => {
        Logger.debug('Response:', {
            url: response.config.url,
            status: response.status,
            data: response.data ? 'present' : 'none'
        });
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        
        Logger.error('Response error:', {
            url: originalRequest?.url,
            status: error.response?.status,
            retried: originalRequest?._retry || false
        });

        // If error is not 401 or request has already been retried, reject
        if (error.response?.status !== 401 || originalRequest._retry) {
            return Promise.reject(error);
        }

        if (!isRefreshing) {
            isRefreshing = true;
            Logger.info('Starting token refresh');

            try {
                const newToken = await AuthService.getNewToken();
                Logger.info('Token refresh successful');
                
                // Update the failed request with new token
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                originalRequest._retry = true;
                
                // Notify subscribers
                onTokenRefreshed(newToken);
                
                // Retry the original request
                return api(originalRequest);
            } catch (refreshError) {
                Logger.error('Token refresh failed:', refreshError);
                onTokenRefreshFailed();
                throw refreshError;
            } finally {
                isRefreshing = false;
            }
        }

        // If already refreshing, wait for the new token
        return new Promise(resolve => {
            Logger.debug('Waiting for token refresh');
            refreshSubscribers.push((token: string) => {
                originalRequest.headers['Authorization'] = `Bearer ${token}`;
                originalRequest._retry = true;
                resolve(api(originalRequest));
            });
        });
    }
);

// Error handling helper
function handleApiError(error: AxiosError): never {
    Logger.error('API Error:', {
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
    } else if (error.response?.status === 500) {
        throw new Error('Server error. Please try again later.');
    } else {
        throw new Error('An unexpected error occurred. Please try again.');
    }
}

// Auth API
export const authApi = {
    async login(data: LoginRequest): Promise<LoginResponse> {
        try {
            Logger.info('Sending login request:', { username: data.username });
            const response = await api.post<LoginResponse>(API_ENDPOINTS.AUTH.TOKEN, data);
            return response.data;
        } catch (error) {
            throw handleApiError(error as AxiosError);
        }
    },

    async register(data: RegisterRequest): Promise<LoginResponse> {
        try {
            Logger.info('Sending registration request:', { email: data.email });
            const response = await api.post<LoginResponse>(API_ENDPOINTS.AUTH.REGISTER, data);
            return response.data;
        } catch (error) {
            throw handleApiError(error as AxiosError);
        }
    },

    async getCurrentUser(): Promise<{ email: string }> {
        try {
            Logger.info('Fetching current user');
            const response = await api.get<{ email: string }>(API_ENDPOINTS.AUTH.USER);
            return response.data;
        } catch (error) {
            throw handleApiError(error as AxiosError);
        }
    }
};

// Audio API
export const audioApi = {
    async uploadAudio(audioBlob: Blob): Promise<TranscriptionResponse> {
        try {
            const formData = new FormData();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `recording-${timestamp}.webm`;
            
            // Create a new Blob with the correct MIME type
            const audioFile = new Blob([audioBlob], { 
                type: 'audio/webm;codecs=opus' 
            });
            
            formData.append('file', audioFile, filename);

            Logger.info('Uploading audio file:', {
                filename,
                size: audioFile.size,
                type: audioFile.type
            });

            const response = await api.post<TranscriptionResponse>(
                API_ENDPOINTS.AUDIO.UPLOAD,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            Logger.debug('API Response data:', response.data);

            if (!response.data || typeof response.data !== 'object') {
                throw new Error('Invalid response format from server');
            }

            const { transcribed_text, categories = [], chat_history_id } = response.data;

            if (!transcribed_text) {
                throw new Error('No transcribed text received from server');
            }

            // If backend didn't provide categories, use local categorization
            let normalizedCategories = [];
            if (Array.isArray(categories) && categories.length > 0) {
                // Use backend categories if provided
                Logger.debug('Using backend categories:', categories);
                normalizedCategories = categories
                    .filter(cat => cat && typeof cat === 'object')
                    .map(cat => {
                        // Ensure we're using the exact Category enum string value
                        const categoryKey = (cat.category?.toUpperCase() || 'THOUGHT') as keyof typeof Category;
                        const category = Category[categoryKey] || Category.THOUGHT;
                        
                        Logger.debug('Normalizing category:', {
                            original: cat.category,
                            normalized: category,
                            validValues: Object.values(Category)
                        });
                        
                        return {
                            category,
                            extracted_content: cat.extracted_content || transcribed_text
                        };
                    });
            } else {
                // Use local categorization as fallback
                Logger.info('No categories from backend, using local categorization');
                const localCategory = categorizeText(transcribed_text);
                Logger.debug('Local categorization result:', {
                    category: localCategory,
                    text: transcribed_text.substring(0, 50) + '...'
                });
                normalizedCategories = [{
                    category: localCategory,
                    extracted_content: transcribed_text
                }];
            }

            Logger.info('Final categories:', normalizedCategories);

            return {
                transcribed_text,
                categories: normalizedCategories,
                chat_history_id
            };
        } catch (error) {
            throw handleApiError(error as AxiosError);
        }
    }
};

export default api;