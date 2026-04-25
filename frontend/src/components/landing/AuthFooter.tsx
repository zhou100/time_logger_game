import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Link,
    TextField,
    Typography,
} from '@mui/material';
import { palette } from '../../theme';
import { getSupabase } from '../../services/supabase';
import { readClaimToken } from '../../services/demoApi';
import { mapAuthError } from '../../contexts/AuthContext';
import Logger from '../../utils/logger';
import { capture as captureEvent } from '../../services/analytics';

/**
 * Auth footer for the interaction-first landing.
 *
 * Both Google OAuth and magic-link redirect to `/welcome?state=<claim_token>`
 * so item 5's /welcome page can call `/v1/entries/claim-demo-session` with
 * the HMAC token.
 *
 * Why we don't reuse `GoogleSignInButton` here:
 *   - That component calls `AuthContext.loginWithGoogle()`, which uses a fixed
 *     `redirectTo: window.location.origin` and does NOT thread a claim_token.
 *     The interaction-first plan requires the claim_token to ride along on
 *     OAuth state. Modifying AuthContext is out of scope (item 5 will reconcile
 *     /welcome) so we issue the supabase call inline here, while reusing the
 *     Google brand-styled button visuals.
 *
 * Sticky on mobile via the `sticky` prop; safe-area-inset padding keeps clear
 * of the iOS home-indicator.
 */

interface Props {
    /** Sticky bottom strip (mobile-friendly) when true. */
    sticky?: boolean;
}

const GoogleG: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path
            fill="#4285F4"
            d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9087c1.7018-1.5668 2.6836-3.8745 2.6836-6.6151z"
        />
        <path
            fill="#34A853"
            d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2582c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
        />
        <path
            fill="#FBBC05"
            d="M3.9636 10.71c-.18-.54-.2823-1.1168-.2823-1.71 0-.5932.1023-1.17.2823-1.71V4.9582H.9573A8.9966 8.9966 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9636 10.71z"
        />
        <path
            fill="#EA4335"
            d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
        />
    </svg>
);

const AuthFooter: React.FC<Props> = ({ sticky = false }) => {
    const [oauthLoading, setOauthLoading] = useState(false);
    const [oauthError, setOAuthError] = useState<string | null>(null);
    const [magicLinkOpen, setMagicLinkOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [magicSending, setMagicSending] = useState(false);
    const [magicSent, setMagicSent] = useState(false);
    const [magicError, setMagicError] = useState<string | null>(null);

    const buildRedirectTo = () => {
        // REACT_APP_WELCOME_HANDOFF_ENABLED gates whether OAuth/magic-link
        // callbacks route through /welcome. Default 'true' (handoff enabled).
        if (process.env.REACT_APP_WELCOME_HANDOFF_ENABLED === 'false') {
            return `${window.location.origin}/recording`;
        }
        const claimToken = readClaimToken();
        const base = `${window.location.origin}/welcome`;
        return claimToken ? `${base}?state=${encodeURIComponent(claimToken)}` : base;
    };

    const handleGoogle = async () => {
        // Emit before the redirect so the event lands even if Supabase
        // navigates away mid-flight. PostHog buffers locally and flushes
        // on next page load if needed.
        captureEvent('save_clicked', { method: 'google' });
        const sb = getSupabase();
        if (!sb) {
            setOAuthError('Auth service is not available.');
            return;
        }
        setOAuthError(null);
        setOauthLoading(true);
        try {
            const { error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: buildRedirectTo() },
            });
            if (error) throw new Error(mapAuthError(error));
            // success: Supabase redirects; this component unmounts.
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
            Logger.warn('Google OAuth failed', err);
            setOAuthError(msg);
            setOauthLoading(false);
        }
    };

    const handleMagicLink = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // Same convention as Google: emit on submit, before any network call,
        // so empty-email validation failures still register intent.
        captureEvent('save_clicked', { method: 'magic_link' });
        setMagicError(null);
        const trimmed = email.trim();
        if (!trimmed) {
            setMagicError('Enter an email address.');
            return;
        }
        const sb = getSupabase();
        if (!sb) {
            setMagicError('Auth service is not available.');
            return;
        }
        setMagicSending(true);
        try {
            const { error } = await sb.auth.signInWithOtp({
                email: trimmed,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: buildRedirectTo(),
                },
            });
            if (error) throw error;
            setMagicSent(true);
        } catch (err) {
            setMagicError(mapAuthError(err as Error));
        } finally {
            setMagicSending(false);
        }
    };

    return (
        <Box
            component="footer"
            sx={{
                ...(sticky
                    ? {
                          position: 'sticky',
                          bottom: 0,
                          bgcolor: palette.bg,
                          borderTop: `1px solid ${palette.rule}`,
                          zIndex: 2,
                      }
                    : {}),
                pt: 3,
                pb: { xs: 'calc(16px + env(safe-area-inset-bottom))', md: 4 },
                px: { xs: 2, md: 0 },
            }}
        >
            <Box sx={{ maxWidth: 360, mx: 'auto' }}>
                <Typography
                    variant="overline"
                    component="div"
                    sx={{
                        color: palette.textPrimary,
                        fontWeight: 600,
                        textAlign: 'center',
                        mb: 1.5,
                    }}
                >
                    KEEP YOUR HISTORY ACROSS DEVICES
                </Typography>

                {oauthError && (
                    <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setOAuthError(null)}>
                        {oauthError}
                    </Alert>
                )}

                {/*
                 * Google brand-styled button. Same visual spec as
                 * components/auth/GoogleSignInButton.tsx (white bg, #DADCE0 border,
                 * blue G logo, #3C4043 text). We can't reuse that component here
                 * because it locks the redirect to window.location.origin; we need
                 * /welcome?state=<claim_token>.
                 */}
                <Button
                    onClick={handleGoogle}
                    disabled={oauthLoading}
                    fullWidth
                    size="large"
                    startIcon={oauthLoading ? <CircularProgress size={16} /> : <GoogleG />}
                    aria-label="Sign in with Google"
                    sx={{
                        bgcolor: '#FFFFFF',
                        color: '#3C4043',
                        border: '1px solid #DADCE0',
                        textTransform: 'none',
                        fontFamily: '"DM Sans", sans-serif',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        height: 48,
                        borderRadius: '8px',
                        boxShadow: 'none',
                        '&:hover': {
                            bgcolor: '#F8F9FA',
                            borderColor: '#DADCE0',
                            boxShadow: 'none',
                        },
                        '&:disabled': {
                            bgcolor: '#FFFFFF',
                            color: '#3C4043',
                            opacity: 0.7,
                        },
                    }}
                >
                    {oauthLoading ? 'Signing in…' : 'Sign in with Google'}
                </Button>

                {!magicLinkOpen ? (
                    <Typography
                        variant="body2"
                        sx={{ mt: 1.5, textAlign: 'center', color: palette.textMuted }}
                    >
                        or{' '}
                        <Link
                            component="button"
                            type="button"
                            onClick={() => setMagicLinkOpen(true)}
                            sx={{
                                color: palette.accent,
                                fontWeight: 500,
                                textDecoration: 'none',
                                '&:hover': { textDecoration: 'underline' },
                            }}
                        >
                            get a magic link
                        </Link>
                    </Typography>
                ) : (
                    <Box
                        component="form"
                        onSubmit={handleMagicLink}
                        sx={{
                            mt: 1.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                        }}
                    >
                        {magicSent ? (
                            <Typography
                                variant="body2"
                                sx={{ color: palette.textPrimary, textAlign: 'center' }}
                            >
                                Check your inbox — we sent a sign-in link to{' '}
                                <strong>{email}</strong>.
                            </Typography>
                        ) : (
                            <>
                                <TextField
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    size="small"
                                    fullWidth
                                    autoFocus
                                    inputProps={{ 'aria-label': 'Email for magic link' }}
                                />
                                {magicError && (
                                    <Typography
                                        variant="caption"
                                        sx={{ color: palette.error }}
                                    >
                                        {magicError}
                                    </Typography>
                                )}
                                <Button
                                    type="submit"
                                    variant="outlined"
                                    color="primary"
                                    disabled={magicSending}
                                    startIcon={
                                        magicSending ? <CircularProgress size={14} /> : null
                                    }
                                >
                                    {magicSending ? 'Sending…' : 'Send magic link'}
                                </Button>
                            </>
                        )}
                    </Box>
                )}

                <Typography
                    variant="caption"
                    sx={{
                        display: 'block',
                        textAlign: 'center',
                        color: palette.textMuted,
                        mt: 3,
                    }}
                >
                    © Debrief ·{' '}
                    <Link
                        component={RouterLink}
                        to="/privacy"
                        sx={{ color: palette.textMuted, textDecoration: 'underline' }}
                    >
                        Privacy
                    </Link>
                </Typography>
            </Box>
        </Box>
    );
};

export default AuthFooter;
