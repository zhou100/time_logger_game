import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import RecordingPage from './RecordingPage';
import LandingPage from './LandingPage';

const HomePage: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) {
        return (
            <Box sx={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={28} />
            </Box>
        );
    }
    return isAuthenticated ? <RecordingPage /> : <LandingPage />;
};

export default HomePage;
