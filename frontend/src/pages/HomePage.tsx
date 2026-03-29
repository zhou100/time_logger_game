import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import RecordingPage from './RecordingPage';
import LandingPage from './LandingPage';

const HomePage: React.FC = () => {
    const { isAuthenticated, isLoading, useSupabase } = useAuth();
    // For Supabase, block render until async session resolves (avoids LandingPage flash).
    // For JWT, user is initialized synchronously from localStorage — render immediately.
    if (isLoading && useSupabase) return null;
    return isAuthenticated ? <RecordingPage /> : <LandingPage />;
};

export default HomePage;
