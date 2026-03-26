import React, { useState } from 'react';
import { TextField, Button, Box, Typography, Link, Alert, Container, Divider } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { palette } from '../../theme';

export const RegisterForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { register, loginWithGoogle, useSupabase } = useAuth();
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
            await register({ email, password });
            setSuccess('Registration successful! Redirecting to login...');
            setTimeout(() => navigate('/login'), 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        try {
            setLoading(true);
            await loginWithGoogle();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Google sign-up failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="h2" component="h1" sx={{ mb: 1 }}>Register</Typography>
                <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 400, mx: 'auto', p: 3 }}>
                    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth disabled={loading} />
                    <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth helperText="Password must be at least 8 characters long" disabled={loading} />
                    <TextField label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required fullWidth disabled={loading} />
                    <Button type="submit" variant="contained" color="primary" fullWidth size="large" disabled={loading}>
                        {loading ? 'Registering...' : 'Register'}
                    </Button>

                    {useSupabase && (
                        <>
                            <Divider sx={{ my: 1, color: 'text.secondary' }}>or</Divider>
                            <Button variant="outlined" fullWidth size="large" onClick={handleGoogleSignUp} disabled={loading}>
                                Sign up with Google
                            </Button>
                        </>
                    )}

                    <Typography align="center" variant="body2" mt={2}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login" sx={{ color: palette.accent }}>Login here</Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};
