import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import RecordingPage from './RecordingPage';
import LandingPage from './LandingPage';

const HomePage: React.FC = () => {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <RecordingPage /> : <LandingPage />;
};

export default HomePage;
