import axios, { AxiosError } from 'axios';
import type { 
    LoginRequest, 
    LoginResponse, 
    RegisterRequest,
    TranscriptionResponse,
    ApiError 
} from '../types/api';

// API endpoints configuration
export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/login',
        REGISTER: '/api/register',
        ME: '/api/me'
    },
    AUDIO: {
        UPLOAD: '/api/audio/upload'
    }
};

// Create axios instance
const api = axios.create({
    baseURL: 'http://localhost:8000',  // Updated to match our FastAPI server port
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true,
    auth: {
        username: process.env.REACT_APP_API_USERNAME || 'admin',  // Default value for development
        password: process.env.REACT_APP_API_PASSWORD || 'admin'   // Default value for development
    }
});

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
        throw new Error(errorResponse.detail[0]?.msg || 'Please check your input and try again.');
    } else if (!error.response) {
        throw new Error('Network error. Please check your connection and try again.');
    } else {
        throw new Error('An unexpected error occurred. Please try again.');
    }
}

// Add token to requests if available
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth API
export const authApi = {
    login: async (data: LoginRequest): Promise<LoginResponse> => {
        try {
            console.log('Sending login request:', { username: data.username });
            const formData = new URLSearchParams();
            formData.append('username', data.username);
            formData.append('password', data.password);

            const response = await api.post(
                API_ENDPOINTS.AUTH.LOGIN,
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