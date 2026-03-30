import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import RecordingPage from './RecordingPage';
import ReflectPage from './ReflectPage';
import LandingPage from './LandingPage';

interface HomePageProps {
    page?: 'log' | 'reflect';
}

const HomePage: React.FC<HomePageProps> = ({ page = 'log' }) => {
    const { isAuthenticated } = useAuth();
    if (!isAuthenticated) return <LandingPage />;
    return page === 'reflect' ? <ReflectPage /> : <RecordingPage />;
};

export default HomePage;
