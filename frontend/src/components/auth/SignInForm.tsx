import React, { useReducer, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Container,
    Box,
    TextField,
    Button,
    Typography,
    Alert,
    Divider,
    Link,
    CircularProgress,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { palette } from '../../theme';
import GoogleSignInButton from './GoogleSignInButton';

// ── State machine ─────────────────────────────────────────────────────────────
//
//   EMAIL_STEP ──(SEND_OK)──▶ SENT_STEP
//       ▲                         │
//       └────(BACK_TO_EMAIL)──────┘
//
// Clicking the link in the email redirects back to the app and triggers
// onAuthStateChange in AuthContext — this form doesn't handle that; it just
// gets the email out the door and tells the user to check their inbox.
//
type Step = 'email' | 'sent';
type Status = 'idle' | 'pending' | 'error';

interface State {
    step: Step;
    status: Status;
    email: string;
    error: string | null;
    resendCooldown: number;
}

type Action =
    | { type: 'SET_EMAIL'; email: string }
    | { type: 'SEND_START' }
    | { type: 'SEND_OK' }
    | { type: 'SEND_ERR'; error: string }
    | { type: 'RESEND_START' }
    | { type: 'RESEND_OK' }
    | { type: 'RESEND_ERR'; error: string }
    | { type: 'TICK_COOLDOWN' }
    | { type: 'BACK_TO_EMAIL' };

const RESEND_COOLDOWN_S = 30;

const initialState: State = {
    step: 'email',
    status: 'idle',
    email: '',
    error: null,
    resendCooldown: 0,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_EMAIL':
            return { ...state, email: action.email, error: null };
        case 'SEND_START':
            return { ...state, status: 'pending', error: null };
        case 'SEND_OK':
            return {
                ...state,
                step: 'sent',
                status: 'idle',
                error: null,
                resendCooldown: RESEND_COOLDOWN_S,
            };
        case 'SEND_ERR':
            return { ...state, status: 'error', error: action.error };
        case 'RESEND_START':
            return { ...state, status: 'pending', error: null };
        case 'RESEND_OK':
            return {
                ...state,
                status: 'idle',
                error: null,
                resendCooldown: RESEND_COOLDOWN_S,
            };
        case 'RESEND_ERR':
            return { ...state, status: 'error', error: action.error };
        case 'TICK_COOLDOWN':
            return { ...state, resendCooldown: Math.max(0, state.resendCooldown - 1) };
        case 'BACK_TO_EMAIL':
            return { ...initialState, email: state.email };
        default:
            return state;
    }
}

const SignInForm: React.FC = () => {
    const { sendOTP, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [state, dispatch] = useReducer(reducer, initialState);
    const [googleError, setGoogleError] = useState<string | null>(null);

    // Already-authenticated users shouldn't see the sign-in form.
    useEffect(() => {
        if (isAuthenticated) navigate('/', { replace: true });
    }, [isAuthenticated, navigate]);

    // Resend cooldown countdown
    useEffect(() => {
        if (state.resendCooldown <= 0) return;
        const t = setTimeout(() => dispatch({ type: 'TICK_COOLDOWN' }), 1000);
        return () => clearTimeout(t);
    }, [state.resendCooldown]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!state.email.trim()) return;
        dispatch({ type: 'SEND_START' });
        const { error } = await sendOTP(state.email.trim());
        if (error) dispatch({ type: 'SEND_ERR', error });
        else dispatch({ type: 'SEND_OK' });
    };

    const handleResend = async () => {
        if (state.resendCooldown > 0 || state.status === 'pending') return;
        dispatch({ type: 'RESEND_START' });
        const { error } = await sendOTP(state.email.trim());
        if (error) dispatch({ type: 'RESEND_ERR', error });
        else dispatch({ type: 'RESEND_OK' });
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box
                sx={{
                    mt: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                }}
            >
                <Typography variant="h2" component="h1" sx={{ mb: 1 }}>
                    {state.step === 'email' ? 'Welcome' : 'Check your inbox'}
                </Typography>

                <Box sx={{ width: '100%', maxWidth: 400 }}>
                    {googleError && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setGoogleError(null)}>
                            {googleError}
                        </Alert>
                    )}

                    {state.step === 'email' && (
                        <>
                            <GoogleSignInButton variant="form" onError={setGoogleError} />

                            <Divider sx={{ my: 2, color: palette.textMuted, fontSize: '0.8rem' }}>
                                or
                            </Divider>

                            <Box component="form" onSubmit={handleSend} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                <TextField
                                    label="Email"
                                    type="email"
                                    value={state.email}
                                    onChange={(e) => dispatch({ type: 'SET_EMAIL', email: e.target.value })}
                                    required
                                    fullWidth
                                    autoFocus
                                    disabled={state.status === 'pending'}
                                    inputProps={{ autoComplete: 'email' }}
                                />
                                {state.error && state.status === 'error' && (
                                    <Typography variant="body2" color="error" aria-live="polite">
                                        {state.error}
                                    </Typography>
                                )}
                                <Button
                                    type="submit"
                                    variant="contained"
                                    color="primary"
                                    fullWidth
                                    size="large"
                                    disabled={state.status === 'pending' || !state.email.trim()}
                                    startIcon={state.status === 'pending' ? <CircularProgress size={16} /> : null}
                                >
                                    {state.status === 'pending' ? 'Sending…' : 'Email me a link'}
                                </Button>
                            </Box>
                        </>
                    )}

                    {state.step === 'sent' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Typography variant="body1" color="text.primary" aria-live="polite">
                                We sent a sign-in link to <strong>{state.email}</strong>.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Open the email and click the link to sign in. It usually arrives in under
                                30 seconds. Check your spam folder if you don&rsquo;t see it.
                            </Typography>
                            {state.error && state.status === 'error' && (
                                <Typography variant="body2" color="error" aria-live="polite">
                                    {state.error}
                                </Typography>
                            )}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                <Button
                                    variant="text"
                                    onClick={handleResend}
                                    disabled={state.resendCooldown > 0 || state.status === 'pending'}
                                    sx={{ color: palette.accent, textTransform: 'none' }}
                                    aria-live="polite"
                                >
                                    {state.resendCooldown > 0
                                        ? `Resend in ${state.resendCooldown}s…`
                                        : 'Resend link'}
                                </Button>
                                <Link
                                    component="button"
                                    type="button"
                                    variant="body2"
                                    onClick={() => dispatch({ type: 'BACK_TO_EMAIL' })}
                                    sx={{ color: palette.textMuted }}
                                >
                                    Wrong email?
                                </Link>
                            </Box>
                        </Box>
                    )}
                </Box>
            </Box>
        </Container>
    );
};

export default SignInForm;
