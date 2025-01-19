import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, Typography, Link, Alert, Container } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Link as RouterLink } from 'react-router-dom';

export const LoginForm: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { login, registrationSuccess, clearRegistrationSuccess } = useAuth();

    useEffect(() => {
        // Clear registration success message when component unmounts
        return () => {
            clearRegistrationSuccess();
        };
    }, [clearRegistrationSuccess]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        try {
            setLoading(true);
            await login({ username, password });
        } catch (err) {
            console.error('Login error:', err);
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box
                sx={{
                    marginTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                <Typography component="h1" variant="h5">
                    Login
                </Typography>
                <Box
                    component="form"
                    onSubmit={handleSubmit}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        maxWidth: 400,
                        mx: 'auto',
                        p: 3,
                    }}
                >
                    {registrationSuccess && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            {registrationSuccess}
                        </Alert>
                    )}
                    
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        label="Username or Email"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        fullWidth
                        error={!!error && error.includes('username')}
                        disabled={loading}
                    />

                    <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        fullWidth
                        error={!!error && error.includes('password')}
                        disabled={loading}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        fullWidth
                        size="large"
                        disabled={loading}
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </Button>

                    <Typography align="center" mt={2}>
                        Don't have an account?{' '}
                        <Link component={RouterLink} to="/register">
                            Register here
                        </Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};
