import axios from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse, User } from '../types/auth';

// Update API URL to include /api prefix
const API_URL = 'http://localhost:8000/api';

// Create axios instance with default config
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    withCredentials: true,
    // Add additional axios config for better error handling
    validateStatus: (status) => status < 500, // Reject only if the status code is greater than or equal to 500
});

// Add request interceptor for debugging
api.interceptors.request.use(request => {
    console.log('Starting Request:', {
        url: request.url,
        method: request.method,
        headers: request.headers,
        data: request.data
    });
    return request;
});

// Add response interceptor for debugging
api.interceptors.response.use(
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

// Error handling helper
const handleApiError = (error: any) => {
    console.log('API Error Details:', error);
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Response error:', {
            data: error.response.data,
            status: error.response.status,
            headers: error.response.headers
        });
        throw new Error(error.response.data.detail || 'An error occurred');
    } else if (error.request) {
        // The request was made but no response was received
        console.error('Request error:', error.request);
        throw new Error('Network error - Unable to connect to the server. Please check if the server is running.');
    } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error:', error.message);
        throw new Error('An unexpected error occurred');
    }
};

// Authentication service
const AuthService = {
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        try {
            const formData = new FormData();
            formData.append('username', credentials.username);
            formData.append('password', credentials.password);

            const response = await api.post<AuthResponse>(
                '/token',
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            if (response.data.access_token) {
                localStorage.setItem('token', response.data.access_token);
            }

            return response.data;
        } catch (error) {
            handleApiError(error);
            throw error;
        }
    },

    async register(credentials: RegisterCredentials): Promise<User> {
        try {
            console.log('Sending register request:', {
                url: `${API_URL}/register`,
                email: credentials.email,
                data: credentials
            });

            const response = await api.post<User>(
                '/register',
                credentials
            );
            console.log('Register response:', response.data);
            return response.data;
        } catch (error) {
            handleApiError(error);
            throw error;
        }
    },

    async testConnection(): Promise<void> {
        try {
            console.log('Testing connection to:', `${API_URL}/test`);
            const response = await api.get('/test');
            console.log('Test response:', response.data);
        } catch (error) {
            console.error('Test connection failed:', error);
            handleApiError(error);
            throw error;
        }
    },

    logout(): void {
        localStorage.removeItem('token');
    },

    isAuthenticated(): boolean {
        return !!localStorage.getItem('token');
    },

    getCurrentUser(): string | null {
        return localStorage.getItem('token');
    }
};

export default AuthService;
