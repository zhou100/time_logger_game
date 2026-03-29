import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import RecordingPage from './RecordingPage';
import LandingPage from './LandingPage';

const HomePage: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) return null; // wait for rehydration before deciding
    return isAuthenticated ? <RecordingPage /> : <LandingPage />;
};

export default HomePage;
