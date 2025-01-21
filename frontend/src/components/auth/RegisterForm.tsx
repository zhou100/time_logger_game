import React, { useState } from 'react';
import { TextField, Button, Box, Typography, Link, Alert, Container } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

export const RegisterForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        
        if (password !== confirmPassword) {
            setError("Passwords don't match");
            return;
        }
        
        try {
            setLoading(true);
            console.log('Attempting to register with:', { email });
            await register({ email, password });
            // Show success message before redirecting
            setSuccess('Registration successful! Redirecting to login...');
            // Wait a moment to show the success message
            setTimeout(() => {
                navigate('/login');
            }, 1500);
        } catch (err) {
            console.log('Registration error:', err);
            setError(err instanceof Error ? err.message : 'Registration failed');
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
                    Register
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
                    {success && (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            {success}
                        </Alert>
                    )}

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        fullWidth
                        error={!!error && error.includes('email')}
                        disabled={loading}
                    />

                    <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        fullWidth
                        error={!!error && error.includes('Password')}
                        helperText="Password must be at least 8 characters long"
                        disabled={loading}
                    />

                    <TextField
                        label="Confirm Password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        fullWidth
                        error={!!error && error.includes('match')}
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
                        {loading ? 'Registering...' : 'Register'}
                    </Button>

                    <Typography align="center" mt={2}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login">
                            Login here
                        </Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};
