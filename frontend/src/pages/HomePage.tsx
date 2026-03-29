import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import RecordingPage from './RecordingPage';
import LandingPage from './LandingPage';

const HomePage: React.FC = () => {
    const { isAuthenticated, isLoading, useSupabase } = useAuth();
    // For Supabase, we must wait for async session fetch before knowing auth state.
    // For JWT, isAuthenticated is synchronous from localStorage — render immediately.
    if (isLoading && useSupabase) return null;
    return isAuthenticated ? <RecordingPage /> : <LandingPage />;
};

export default HomePage;
