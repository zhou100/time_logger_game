// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/auth/login',
        REGISTER: '/auth/register',
        ME: '/auth/me'
    },
    AUDIO: {
        UPLOAD: '/audio/upload'
    },
    CATEGORIES: {
        LIST: '/api/categories',
    },
    ENTRIES: {
        LIST: '/api/entries'
    }
} as const;

// Axios configuration
export const AXIOS_CONFIG = {
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    }
};
