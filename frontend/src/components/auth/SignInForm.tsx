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
//   EMAIL_STEP ──(SEND_OK)──▶ CODE_STEP ──(VERIFY_OK)──▶ AuthContext SIGNED_IN
//       ▲                         │
//       └────(BACK_TO_EMAIL)──────┘
//
// User types the 6-digit code from the email back into the form. Avoids the
// iOS Safari magic-link problem where tapping the link from Gmail opens the
// session in Chrome/Gmail in-app browser instead of the Safari tab the user
// started in.
//
type Step = 'email' | 'code';
type Status = 'idle' | 'pending' | 'error';

interface State {
    step: Step;
    status: Status;
    email: string;
    code: string;
    error: string | null;
    resendCooldown: number;
}

type Action =
    | { type: 'SET_EMAIL'; email: string }
    | { type: 'SET_CODE'; code: string }
    | { type: 'SEND_START' }
    | { type: 'SEND_OK' }
    | { type: 'SEND_ERR'; error: string }
    | { type: 'VERIFY_START' }
    | { type: 'VERIFY_ERR'; error: string }
    | { type: 'RESEND_START' }
    | { type: 'RESEND_OK' }
    | { type: 'RESEND_ERR'; error: string }
    | { type: 'TICK_COOLDOWN' }
    | { type: 'BACK_TO_EMAIL' };

const RESEND_COOLDOWN_S = 30;
// Supabase OTP length is configurable per project (6-10 digits). Accept the
// full range so the frontend keeps working if the Supabase setting is rotated.
const CODE_MIN_LENGTH = 6;
const CODE_MAX_LENGTH = 10;

const initialState: State = {
    step: 'email',
    status: 'idle',
    email: '',
    code: '',
    error: null,
    resendCooldown: 0,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_EMAIL':
            return { ...state, email: action.email, error: null };
        case 'SET_CODE':
            // Strip non-digits, cap at CODE_MAX_LENGTH
            return {
                ...state,
                code: action.code.replace(/\D/g, '').slice(0, CODE_MAX_LENGTH),
                error: null,
            };
        case 'SEND_START':
            return { ...state, status: 'pending', error: null };
        case 'SEND_OK':
            return {
                ...state,
                step: 'code',
                status: 'idle',
                error: null,
                code: '',
                resendCooldown: RESEND_COOLDOWN_S,
            };
        case 'SEND_ERR':
            return { ...state, status: 'error', error: action.error };
        case 'VERIFY_START':
            return { ...state, status: 'pending', error: null };
        case 'VERIFY_ERR':
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
    const { sendOTP, verifyOTP, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [state, dispatch] = useReducer(reducer, initialState);
    const [googleError, setGoogleError] = useState<string | null>(null);

    useEffect(() => {
        if (isAuthenticated) navigate('/', { replace: true });
    }, [isAuthenticated, navigate]);

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

    const handleVerify = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (state.code.length < CODE_MIN_LENGTH || state.code.length > CODE_MAX_LENGTH) return;
        dispatch({ type: 'VERIFY_START' });
        const { error } = await verifyOTP(state.email.trim(), state.code);
        if (error) dispatch({ type: 'VERIFY_ERR', error });
        // On success, AuthContext.onAuthStateChange fires SIGNED_IN and the
        // isAuthenticated effect above redirects to "/".
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
                                    {state.status === 'pending' ? 'Sending…' : 'Email me a code'}
                                </Button>
                            </Box>
                        </>
                    )}

                    {state.step === 'code' && (
                        <Box component="form" onSubmit={handleVerify} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Typography variant="body1" color="text.primary" aria-live="polite">
                                We sent a sign-in code to <strong>{state.email}</strong>.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Enter it below to sign in. Check your spam folder if it doesn&rsquo;t arrive in 30 seconds.
                            </Typography>
                            <TextField
                                label="Sign-in code"
                                value={state.code}
                                onChange={(e) => dispatch({ type: 'SET_CODE', code: e.target.value })}
                                required
                                fullWidth
                                autoFocus
                                disabled={state.status === 'pending'}
                                inputProps={{
                                    inputMode: 'numeric',
                                    pattern: '[0-9]*',
                                    autoComplete: 'one-time-code',
                                    maxLength: CODE_MAX_LENGTH,
                                    'aria-label': 'code',
                                }}
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
                                disabled={state.status === 'pending' || state.code.length < CODE_MIN_LENGTH}
                                startIcon={state.status === 'pending' ? <CircularProgress size={16} /> : null}
                            >
                                {state.status === 'pending' ? 'Verifying…' : 'Verify'}
                            </Button>
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
                                        : 'Resend code'}
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
