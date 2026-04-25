import React, { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Container, Link, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api, { entriesApi } from '../services/api';
import { clearDemoSession } from '../services/demoApi';
import EntryCard from '../components/EntryCard';
import { EntryItem } from '../types/api';
import { palette } from '../theme';
import Logger from '../utils/logger';
import { capture as captureEvent } from '../services/analytics';

/**
 * /welcome — post-OAuth save-handoff page.
 *
 * On mount: read the `state` URL param (claim_token round-tripped via Supabase
 * OAuth/magic-link), POST it to /api/v1/entries/claim-demo-session under the
 * just-signed-in user's JWT, and surface the just-claimed entry in an
 * EntryCard. Idempotent: a second visit with the same token returns
 * `claimed: 0` (treated as the empty-fallback path, not an error).
 *
 * Empty/error fallback copy is calm by design — see DESIGN.md "never alarm."
 *
 * The Supabase HttpOnly cookie `tlg_demo_sid` cannot be cleared from JS
 * (intentional, set+expired only by the backend). It expires at 24h
 * naturally; we don't fight that here.
 */

type ClaimResponse = { claimed: number; entry_ids: string[] };
type Phase = 'loading' | 'success' | 'empty' | 'error';

const SPINNER_CAP_MS = 500;
const FORWARD_LINK_LABEL = 'See all my entries →';

const WelcomePage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const { user, isLoading: authLoading } = useAuth();

    const [phase, setPhase] = useState<Phase>('loading');
    const [entry, setEntry] = useState<EntryItem | null>(null);
    const [spinnerCapElapsed, setSpinnerCapElapsed] = useState(false);

    // Guard: claim must run exactly once. React 18 StrictMode double-invokes
    // effects in dev; we rely on idempotency on the backend, but skipping
    // the second call avoids a no-op network round-trip and a second URL
    // history.replaceState.
    const ranRef = useRef(false);

    // Observability: `signup_completed` should fire once per signed-in
    // mount. Same StrictMode concern as the claim flow, hence the ref.
    const signupEventFiredRef = useRef(false);
    useEffect(() => {
        if (user && !signupEventFiredRef.current) {
            signupEventFiredRef.current = true;
            captureEvent('signup_completed');
        }
    }, [user]);

    // Spinner cap timer. When auth is still hydrating, we wait at most
    // SPINNER_CAP_MS for `user` to materialize before treating it as a
    // session-error fallback.
    useEffect(() => {
        const t = window.setTimeout(() => setSpinnerCapElapsed(true), SPINNER_CAP_MS);
        return () => window.clearTimeout(t);
    }, []);

    // Claim flow.
    useEffect(() => {
        if (ranRef.current) return;

        // Still hydrating session and we haven't hit the cap → keep waiting.
        if (authLoading && !user && !spinnerCapElapsed) return;

        // After cap: if still no user, surface the calm error fallback.
        if (!user) {
            if (spinnerCapElapsed) {
                ranRef.current = true;
                clearDemoSession();
                stripStateFromUrl();
                setPhase('error');
            }
            return;
        }

        ranRef.current = true;

        const stateParam = searchParams.get('state');
        const claimToken = stateParam ? decodeURIComponent(stateParam) : '';

        // No claim_token at all — user signed in without recording, or the
        // state was stripped between mic and OAuth. Empty-fallback path.
        if (!claimToken) {
            clearDemoSession();
            stripStateFromUrl();
            setPhase('empty');
            return;
        }

        (async () => {
            try {
                const res = await api.post<ClaimResponse>(
                    '/v1/entries/claim-demo-session',
                    { claim_token: claimToken },
                );
                const { claimed, entry_ids } = res.data;

                if (claimed > 0 && entry_ids.length > 0) {
                    captureEvent('demo_claim_succeeded', {
                        claimed_count: claimed,
                        entry_id: entry_ids[0],
                    });
                    // Fetch the most recent entry. The just-claimed row is the
                    // newest because the claim transaction owns it now.
                    // We list(0, 5) (small slice) and pick by id; if the
                    // backend ever returns multiple claimed ids, this still
                    // surfaces the first one in the list.
                    try {
                        const list = await entriesApi.list(0, 5);
                        const targetId = entry_ids[0];
                        const found =
                            list.items.find((e) => e.id === targetId) ?? list.items[0] ?? null;
                        setEntry(found);
                        setPhase('success');
                    } catch (fetchErr) {
                        Logger.warn('Welcome: failed to fetch claimed entry', fetchErr);
                        // Claim succeeded but render fetch failed — treat as
                        // empty fallback rather than alarm.
                        setPhase('empty');
                    }
                } else {
                    captureEvent('demo_claim_missing');
                    // claimed === 0 is normal (idempotent replay, missing
                    // cookie, expired session). Empty fallback, not error.
                    setPhase('empty');
                }
            } catch (err) {
                Logger.warn('Welcome: claim-demo-session failed', err);
                captureEvent('demo_claim_failed', {
                    error_message: err instanceof Error ? err.message : 'unknown',
                });
                setPhase('error');
            } finally {
                clearDemoSession();
                stripStateFromUrl();
            }
        })();
    }, [authLoading, user, spinnerCapElapsed, searchParams]);

    // ── Render ─────────────────────────────────────────────────────────────

    if (phase === 'loading') {
        return (
            <Box
                sx={{ minHeight: '40vh', display: 'grid', placeItems: 'center' }}
                aria-label="Loading"
            >
                <CircularProgress size={28} />
            </Box>
        );
    }

    return (
        <Container
            maxWidth={false}
            sx={{
                width: '100%',
                maxWidth: { xs: 360, sm: 520, md: 640 },
                mx: 'auto',
                px: { xs: 2, md: 0 },
                pt: { xs: 4, md: 6 },
                pb: { xs: 6, md: 8 },
            }}
        >
            <Typography
                variant="h2"
                component="h1"
                sx={{
                    mb: 3,
                    color: palette.textPrimary,
                    fontFamily: '"DM Serif Display", serif',
                    fontSize: '1.75rem',
                    fontWeight: 400,
                }}
            >
                {phase === 'success' && 'Your debrief is saved.'}
                {phase === 'empty' && 'Your account is ready.'}
                {phase === 'error' && "We'll find your entry in a moment."}
            </Typography>

            {phase === 'success' && entry && (
                <Box
                    component="section"
                    aria-label="Saved debrief"
                    sx={{
                        bgcolor: palette.surface,
                        border: `1px solid ${palette.rule}`,
                        borderRadius: 2,
                        p: { xs: 2, md: 2.5 },
                        mb: 3,
                    }}
                >
                    <EntryCard entry={entry} readOnly />
                </Box>
            )}

            {phase === 'success' && (
                <Link
                    component={RouterLink}
                    to="/recording"
                    sx={{
                        display: 'inline-block',
                        color: palette.accent,
                        fontFamily: '"DM Sans", sans-serif',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                    }}
                >
                    {FORWARD_LINK_LABEL}
                </Link>
            )}

            {phase === 'empty' && (
                <Typography
                    variant="body1"
                    sx={{ color: palette.textPrimary, lineHeight: 1.6 }}
                >
                    Start by recording your first debrief{' '}
                    <Link
                        component={RouterLink}
                        to="/recording"
                        sx={{
                            color: palette.accent,
                            fontWeight: 500,
                            textDecoration: 'none',
                            '&:hover': { textDecoration: 'underline' },
                        }}
                    >
                        →
                    </Link>
                </Typography>
            )}

            {phase === 'error' && (
                <Typography
                    variant="body1"
                    sx={{ color: palette.textPrimary, lineHeight: 1.6 }}
                >
                    <Link
                        component={RouterLink}
                        to="/recording"
                        sx={{
                            color: palette.accent,
                            fontWeight: 500,
                            textDecoration: 'none',
                            '&:hover': { textDecoration: 'underline' },
                        }}
                    >
                        Take me to my recordings →
                    </Link>
                </Typography>
            )}
        </Container>
    );
};

// ── helpers ──────────────────────────────────────────────────────────────────

function stripStateFromUrl(): void {
    try {
        if (typeof window !== 'undefined' && window.history?.replaceState) {
            window.history.replaceState({}, '', '/welcome');
        }
    } catch {
        // ignore
    }
}

export default WelcomePage;
