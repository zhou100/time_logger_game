import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, Typography, Link, Alert, Container, Divider } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { palette } from '../../theme';

export const LoginForm: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { login, loginWithGoogle, registrationSuccess, clearRegistrationSuccess, useSupabase } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        return () => { clearRegistrationSuccess(); };
    }, [clearRegistrationSuccess]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            setLoading(true);
            await login({ username, password });
            navigate('/');
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            if (typeof detail === 'string') {
                setError(detail);
            } else if (err?.response?.status === 401) {
                setError('Invalid email or password');
            } else {
                setError(err instanceof Error ? err.message : 'Login failed');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            await loginWithGoogle();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Google login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="h2" component="h1" sx={{ mb: 1 }}>Login</Typography>
                <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 400, mx: 'auto', p: 3 }}>
                    {registrationSuccess && <Alert severity="success" sx={{ mb: 2 }}>{registrationSuccess}</Alert>}
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <TextField label="Email" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required fullWidth disabled={loading} />
                    <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth disabled={loading} />
                    <Button type="submit" variant="contained" color="primary" fullWidth size="large" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </Button>

                    {useSupabase && (
                        <>
                            <Divider sx={{ my: 1, color: 'text.secondary' }}>or</Divider>
                            <Button variant="outlined" fullWidth size="large" onClick={handleGoogleLogin} disabled={loading}>
                                Sign in with Google
                            </Button>
                        </>
                    )}

                    <Typography align="center" variant="body2" mt={2}>
                        Don't have an account?{' '}
                        <Link component={RouterLink} to="/register" sx={{ color: palette.accent }}>Register here</Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};
