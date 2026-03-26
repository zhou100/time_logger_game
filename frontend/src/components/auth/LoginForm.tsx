import React, { useState, useEffect } from 'react';
import { TextField, Button, Box, Typography, Link, Alert, Container, Divider } from '@mui/material';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../contexts/AuthContext';
import { Link as RouterLink, useNavigate } from 'react-router-dom';


export const LoginForm: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { login, googleLogin, registrationSuccess, clearRegistrationSuccess } = useAuth();
    const navigate = useNavigate();

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
            console.log('Login successful, navigating to home');
            navigate('/'); // Navigate to home page after successful login
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

                    {process.env.REACT_APP_GOOGLE_CLIENT_ID && (
                        <>
                            <Divider sx={{ my: 1 }}>or</Divider>
                            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                <GoogleLogin
                                    onSuccess={async (response: any) => {
                                        try {
                                            setLoading(true);
                                            await googleLogin(response.credential);
                                            navigate('/');
                                        } catch (err) {
                                            setError(err instanceof Error ? err.message : 'Google login failed');
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    onError={() => setError('Google login failed')}
                                    size="large"
                                    width="300"
                                    text="signin_with"
                                />
                            </Box>
                        </>
                    )}

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
