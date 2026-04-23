import React, { useReducer, useEffect, useRef, useState } from 'react';
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
//   EMAIL_STEP ──(SEND_OTP_OK)──▶ OTP_STEP ──(VERIFY_OK)──▶ navigate('/')
//       ▲                            │
//       └────(BACK_TO_EMAIL)─────────┘
//
// status: idle | pending | error — orthogonal to step
//
type Step = 'email' | 'otp';
type Status = 'idle' | 'pending' | 'error';

interface State {
    step: Step;
    status: Status;
    email: string;
    otp: string;
    error: string | null;
    attempts: number;
    disabled: boolean;           // attempts >= MAX_ATTEMPTS
    resendCooldown: number;      // seconds remaining on resend lockout
}

type Action =
    | { type: 'SET_EMAIL'; email: string }
    | { type: 'SET_OTP'; otp: string }
    | { type: 'SEND_OTP_START' }
    | { type: 'SEND_OTP_OK' }
    | { type: 'SEND_OTP_ERR'; error: string }
    | { type: 'VERIFY_START' }
    | { type: 'VERIFY_OK' }
    | { type: 'VERIFY_ERR'; error: string }
    | { type: 'RESEND_START' }
    | { type: 'RESEND_OK' }
    | { type: 'RESEND_ERR'; error: string }
    | { type: 'TICK_COOLDOWN' }
    | { type: 'BACK_TO_EMAIL' };

const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_S = 30;

const initialState: State = {
    step: 'email',
    status: 'idle',
    email: '',
    otp: '',
    error: null,
    attempts: 0,
    disabled: false,
    resendCooldown: 0,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_EMAIL':
            return { ...state, email: action.email, error: null };
        case 'SET_OTP':
            return { ...state, otp: action.otp, error: null };
        case 'SEND_OTP_START':
            return { ...state, status: 'pending', error: null };
        case 'SEND_OTP_OK':
            return {
                ...state,
                step: 'otp',
                status: 'idle',
                error: null,
                attempts: 0,
                disabled: false,
                otp: '',
                resendCooldown: RESEND_COOLDOWN_S,
            };
        case 'SEND_OTP_ERR':
            return { ...state, status: 'error', error: action.error };
        case 'VERIFY_START':
            return { ...state, status: 'pending', error: null };
        case 'VERIFY_OK':
            return { ...state, status: 'idle', error: null };
        case 'VERIFY_ERR': {
            const attempts = state.attempts + 1;
            return {
                ...state,
                status: 'error',
                error: action.error,
                attempts,
                disabled: attempts >= MAX_ATTEMPTS,
            };
        }
        case 'RESEND_START':
            return { ...state, status: 'pending', error: null };
        case 'RESEND_OK':
            return {
                ...state,
                status: 'idle',
                error: null,
                attempts: 0,
                disabled: false,
                otp: '',
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
    const otpInputRef = useRef<HTMLInputElement>(null);

    // Already-authenticated users shouldn't see the sign-in form.
    useEffect(() => {
        if (isAuthenticated) navigate('/', { replace: true });
    }, [isAuthenticated, navigate]);

    // Auto-focus OTP input when step 2 appears
    useEffect(() => {
        if (state.step === 'otp') {
            otpInputRef.current?.focus();
        }
    }, [state.step]);

    // Resend cooldown countdown
    useEffect(() => {
        if (state.resendCooldown <= 0) return;
        const t = setTimeout(() => dispatch({ type: 'TICK_COOLDOWN' }), 1000);
        return () => clearTimeout(t);
    }, [state.resendCooldown]);

    // Auto-submit when OTP is 6 digits
    useEffect(() => {
        if (state.step === 'otp' && state.otp.length === 6 && !state.disabled && state.status !== 'pending') {
            void handleVerify();
        }
    }, [state.otp]);

    const handleSendOtp = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!state.email.trim()) return;
        dispatch({ type: 'SEND_OTP_START' });
        const { error } = await sendOTP(state.email.trim());
        if (error) dispatch({ type: 'SEND_OTP_ERR', error });
        else dispatch({ type: 'SEND_OTP_OK' });
    };

    const handleVerify = async () => {
        if (state.otp.length !== 6) return;
        dispatch({ type: 'VERIFY_START' });
        const { error } = await verifyOTP(state.email.trim(), state.otp);
        if (error) {
            dispatch({ type: 'VERIFY_ERR', error });
        } else {
            dispatch({ type: 'VERIFY_OK' });
            navigate('/', { replace: true });
        }
    };

    const handleResend = async () => {
        if (state.resendCooldown > 0 || state.status === 'pending') return;
        dispatch({ type: 'RESEND_START' });
        const { error } = await sendOTP(state.email.trim());
        if (error) dispatch({ type: 'RESEND_ERR', error });
        else dispatch({ type: 'RESEND_OK' });
    };

    // Only allow digits; cap at 6
    const handleOtpChange = (raw: string) => {
        const digits = raw.replace(/\D/g, '').slice(0, 6);
        dispatch({ type: 'SET_OTP', otp: digits });
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
                    {state.step === 'email' ? 'Welcome' : 'Enter your code'}
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

                            <Box component="form" onSubmit={handleSendOtp} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
                                    {state.status === 'pending' ? 'Sending…' : 'Send code'}
                                </Button>
                            </Box>
                        </>
                    )}

                    {state.step === 'otp' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <TextField
                                inputRef={otpInputRef}
                                label="6-digit code"
                                value={state.otp}
                                onChange={(e) => handleOtpChange(e.target.value)}
                                disabled={state.disabled || state.status === 'pending'}
                                fullWidth
                                inputProps={{
                                    inputMode: 'numeric',
                                    pattern: '[0-9]*',
                                    maxLength: 6,
                                    autoComplete: 'one-time-code',
                                    'aria-describedby': 'otp-helper',
                                    style: {
                                        fontFamily: '"JetBrains Mono", monospace',
                                        letterSpacing: '0.4em',
                                        fontSize: '1.2rem',
                                        textAlign: 'center',
                                    },
                                }}
                                placeholder="• • • • • •"
                            />
                            <Box id="otp-helper" aria-live="polite">
                                {state.error && state.status === 'error' ? (
                                    <Typography variant="body2" color="error">
                                        {state.error}
                                        {state.disabled && ' — request a new code below.'}
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        We sent a code to <strong>{state.email}</strong>.
                                        Usually arrives in under 30 seconds. Check spam if you don&rsquo;t see it.
                                    </Typography>
                                )}
                            </Box>
                            {state.status === 'pending' && (
                                <Typography variant="body2" color="text.secondary" aria-live="polite">
                                    Verifying…
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
