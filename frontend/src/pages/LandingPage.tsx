import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Container, Link, Typography } from '@mui/material';
import { palette } from '../theme';
import MicButton, { MicState } from '../components/landing/MicButton';
import TrySayingChips from '../components/landing/TrySayingChips';
import DebriefStrip, { DebriefPhase } from '../components/landing/DebriefStrip';
import TurnstileWidget from '../components/landing/TurnstileWidget';
import AuthFooter from '../components/landing/AuthFooter';
import TeaserCard from '../components/landing/TeaserCard';
import SignInGate from '../components/landing/SignInGate';
import { useDemoRecording } from '../hooks/useDemoRecording';
import { detectCookieBlocked, readPermit } from '../services/demoApi';
import { capture as captureEvent } from '../services/analytics';

/**
 * Interaction-first landing.
 *
 * Information Architecture (mobile-first 375px reference, single column at
 * every breakpoint):
 *   1. Top nav (rendered by NavBar above us — Sign-in link suppressed on `/`)
 *   2. Hero h1
 *   3. Subtitle
 *   4. Mic button
 *   5. "Tap to speak" label
 *   6. "No sign-in required" support
 *   7. Cookie-blocked caption (conditional)
 *   8. Turnstile widget (after first mic tap; cached for ~1h)
 *   9. "TRY SAYING" overline
 *  10. Three try-saying chips
 *  11. Debrief overline (pre-tap vs YOUR DEBRIEF)
 *  12. Debrief strip (fake → skeleton → real)
 *  13. Teaser card (rendered only when demo_teaser is non-null on 2nd+ recording)
 *  14. PII disclosure caption + privacy link (moved here from #8 per dogfooding)
 *  15. Auth footer (overline + Google + magic link + privacy)
 *  16. Footer fine print is included inside AuthFooter
 *
 * Above the mobile fold (375 × 812): items 1–6.
 */

type RecStateAll =
    | 'idle'
    | 'requesting-mic'
    | 'recording'
    | 'processing'
    | 'done'
    | 'error'
    | 'capped'
    | 'mic-denied';

const SR_LIVE_MESSAGES: Record<Exclude<RecStateAll, 'processing'>, string> = {
    idle: 'Ready',
    'requesting-mic': 'Requesting microphone',
    recording: 'Recording',
    done: 'Debrief ready.',
    error: 'Something went wrong.',
    capped: 'Demo is resting until tomorrow.',
    'mic-denied': 'Microphone permission denied.',
};

const SR_PROCESSING_MESSAGES: Record<string, string> = {
    transcribing: 'Transcribing',
    classifying: 'Summarizing',
};

function srLiveMessage(recState: string, step: string | null): string {
    if (recState === 'processing') {
        return (step && SR_PROCESSING_MESSAGES[step]) || 'Processing';
    }
    return SR_LIVE_MESSAGES[recState as Exclude<RecStateAll, 'processing'>] || 'Ready';
}

const LandingPage: React.FC = () => {
    // ── Cookie-blocked detection (run once on mount) ──────────────────────
    const [cookieBlocked, setCookieBlocked] = useState(false);
    useEffect(() => {
        const blocked = detectCookieBlocked();
        setCookieBlocked(blocked);
        // Observability: server can't see this signal, so the client emits it.
        if (blocked) captureEvent('cookie_blocked');
    }, []);

    // ── Landing-mounted event (fires once on first paint) ─────────────────
    useEffect(() => {
        captureEvent('landing_viewed');
    }, []);

    // ── First-tap guard so `mic_tapped` only emits once per mount ─────────
    const micTappedRef = useRef(false);

    // ── Turnstile permit lifecycle ────────────────────────────────────────
    // The widget renders only after the first mic tap AND only when the
    // cached permit is missing/expired. Cached permit is stored as
    //   sessionStorage.tlg_demo_permit = JSON({ token, expires_at })
    // Renew flow:
    //   first tap → render widget → solve → /verify-turnstile → cached → start()
    //   subsequent taps within the hour → start() directly
    const [hasTapped, setHasTapped] = useState(false);
    const [permitToken, setPermitToken] = useState<string | null>(() => {
        const p = readPermit();
        return p?.token ?? null;
    });
    const [pendingStart, setPendingStart] = useState(false); // true while waiting for fresh permit
    const [gateOpen, setGateOpen] = useState(false); // sign-in gate after first real debrief

    // ── sr-live region — pipeline state announcements ─────────────────────
    const liveRegionRef = useRef<HTMLDivElement | null>(null);
    const [liveMessage, setLiveMessage] = useState<string>('Ready');

    // ── Demo recording orchestration ──────────────────────────────────────
    const {
        state: recState,
        step,
        summary,
        classifications,
        demoTeaser,
        fakeOutput,
        start,
        stop,
        reset,
    } = useDemoRecording({
        getPermitToken: () => permitToken,
        onPermitRotated: (next) => setPermitToken(next),
    });

    // Map record state → mic visual state
    const micState: MicState = useMemo(() => {
        switch (recState) {
            case 'recording':
                return 'recording';
            case 'requesting-mic':
            case 'processing':
                return 'processing';
            case 'mic-denied':
                return 'denied';
            default:
                return 'idle';
        }
    }, [recState]);

    // Update sr-live region as pipeline progresses.
    useEffect(() => {
        setLiveMessage(srLiveMessage(recState, step));
    }, [recState, step]);

    // Map record state → debrief phase
    const debriefPhase: DebriefPhase = useMemo(() => {
        if (recState === 'done') return 'done';
        if (recState === 'capped') return 'capped';
        if (recState === 'error') return 'error';
        if (recState === 'processing' || recState === 'requesting-mic') return 'pipeline';
        return 'pre-tap';
    }, [recState]);

    // ── Mic tap handler ───────────────────────────────────────────────────
    const onMicTap = () => {
        if (!micTappedRef.current) {
            // First tap of this mount — fires once even if the user later
            // bounces between idle/recording/done states.
            micTappedRef.current = true;
            captureEvent('mic_tapped');
        }
        if (recState === 'recording') {
            stop();
            return;
        }
        // After a real debrief, gate further recording behind sign-in. We treat
        // "real" as state=done with at least one classification — empty Whisper
        // output, capped/fake debriefs, and pipeline errors all fall through
        // to the reset-and-re-record path so the user is never stuck.
        if (recState === 'done' && classifications.length >= 1) {
            setGateOpen(true);
            return;
        }
        // Done (no classifications) / error / capped → reset and re-arm
        if (recState === 'done' || recState === 'error' || recState === 'capped') {
            reset();
        }
        setHasTapped(true);
        if (permitToken) {
            // Permit is fresh; start straight away.
            start();
        } else {
            // Wait for Turnstile to mint a permit, then auto-start.
            setPendingStart(true);
        }
    };

    // After widget mints a fresh permit, just commit it to state. The auto-
    // start fires from the effect below — calling start() synchronously here
    // would capture a stale opts.getPermitToken closure (pre-setState), so
    // recorder.onstop would later see permitToken=null and error out with
    // "Verification expired."
    const onPermitObtained = (token: string) => {
        setPermitToken(token);
    };

    // Auto-start once both the permit has landed in state AND the user is
    // waiting on it. Deferring to an effect guarantees start() runs against a
    // render where opts.getPermitToken() returns the new token.
    useEffect(() => {
        if (permitToken && pendingStart) {
            setPendingStart(false);
            start();
        }
    }, [permitToken, pendingStart, start]);

    // From try-saying chips: announce the phrase and start recording.
    const onChipTap = (phrase: string) => {
        setLiveMessage(`Try saying: ${phrase}`);
        // Briefly bounce the message back so screen readers re-announce.
        setTimeout(() => setLiveMessage('Ready'), 50);
    };

    const showTurnstile = hasTapped && !permitToken;

    return (
        <>
            {/* sr-live region — polite so it doesn't interrupt the visual UX */}
            <Box
                ref={liveRegionRef}
                aria-live="polite"
                aria-atomic="true"
                sx={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    clip: 'rect(0 0 0 0)',
                    whiteSpace: 'nowrap',
                }}
            >
                {liveMessage}
            </Box>

            <Container
                maxWidth={false}
                sx={{
                    maxWidth: { xs: 360, sm: 520, md: 640 },
                    mx: 'auto',
                    pt: { xs: 4, md: 6 },
                    pb: { xs: 2, md: 4 },
                    px: { xs: 2, md: 3 },
                }}
            >
                {/* ── 2. Hero h1 ─────────────────────────────────────────── */}
                <Typography
                    variant="h1"
                    component="h1"
                    sx={{ textAlign: 'center', mb: 1 }}
                >
                    Debrief your day.
                </Typography>

                {/* ── 3. Subtitle ────────────────────────────────────────── */}
                <Typography
                    component="p"
                    sx={{
                        textAlign: 'center',
                        color: palette.textMuted,
                        fontFamily: '"DM Serif Display", serif',
                        fontSize: '1.25rem',
                        lineHeight: 1.4,
                        mb: { xs: 1.5, md: 2 },
                    }}
                >
                    Speak your day. Get a clear summary, key points, and todos.
                </Typography>

                {/* ── 4. Mic button ──────────────────────────────────────── */}
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                    <MicButton
                        state={micState}
                        onTap={onMicTap}
                        descriptionId="mic-supporting-text"
                    />
                </Box>

                {/* ── 5. Mic label "Tap to speak" ────────────────────────── */}
                <Typography
                    sx={{
                        fontFamily: '"DM Sans", sans-serif',
                        fontSize: '15px',
                        color: palette.textPrimary,
                        textAlign: 'center',
                        mb: 0.5,
                    }}
                >
                    {recState === 'recording' ? 'Tap to stop' : 'Tap to speak'}
                </Typography>

                {/* ── 6. "No sign-in required" ───────────────────────────── */}
                <Typography
                    id="mic-supporting-text"
                    variant="caption"
                    sx={{
                        display: 'block',
                        textAlign: 'center',
                        color: palette.textMuted,
                        mb: 1,
                    }}
                >
                    No sign-in required
                </Typography>

                {/* ── 7. Cookie-blocked caption (conditional) ────────────── */}
                {cookieBlocked && (
                    <Typography
                        variant="caption"
                        sx={{
                            display: 'block',
                            textAlign: 'center',
                            color: palette.textMuted,
                            maxWidth: 360,
                            mx: 'auto',
                            mb: 1,
                        }}
                    >
                        Heads up — your browser is blocking cookies, so this one recording won’t
                        save if you come back.
                    </Typography>
                )}

                {/* ── Mic-denied caption (only when applicable) ──────────── */}
                {micState === 'denied' && (
                    <Typography
                        variant="caption"
                        sx={{
                            display: 'block',
                            textAlign: 'center',
                            color: palette.textMuted,
                            mb: 1,
                        }}
                    >
                        Enable mic in browser settings ↗
                    </Typography>
                )}

                {/* ── 9. Turnstile widget (after first tap, no fresh permit) */}
                {showTurnstile && (
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                        <TurnstileWidget onPermit={onPermitObtained} />
                    </Box>
                )}

                {/* ── 10/11. Try-saying overline + chips ─────────────────── */}
                <Box sx={{ mb: 3 }}>
                    <TrySayingChips
                        onSpeak={onChipTap}
                        onStartRecording={() => {
                            // Same pathway as a mic tap.
                            onMicTap();
                        }}
                        disabled={
                            recState === 'recording' ||
                            recState === 'processing' ||
                            recState === 'requesting-mic'
                        }
                    />
                </Box>

                {/* ── 13. Debrief strip ──────────────────────────────────── */}
                <Box sx={{ mb: 3 }}>
                    <DebriefStrip
                        phase={debriefPhase}
                        summary={summary}
                        classifications={classifications}
                        fakeOutput={fakeOutput}
                    />
                </Box>

                {/* ── Cost-capped banner (thin vermilion band) ───────────── */}
                {recState === 'capped' && (
                    <Box
                        sx={{
                            bgcolor: palette.accent,
                            color: '#F5EDE0',
                            textAlign: 'center',
                            py: 1.25,
                            px: 2,
                            borderRadius: '4px',
                            mb: 3,
                        }}
                    >
                        <Typography variant="body2" sx={{ color: '#F5EDE0', fontWeight: 500 }}>
                            Demo is resting until tomorrow —{' '}
                            <Link
                                component={RouterLink}
                                to="/login"
                                sx={{
                                    color: '#F5EDE0',
                                    textDecoration: 'underline',
                                    fontWeight: 600,
                                }}
                            >
                                sign in to try yours
                            </Link>
                            .
                        </Typography>
                    </Box>
                )}

                {/* ── 14. Teaser card (only when demo_teaser present) ────── */}
                {demoTeaser && (
                    <Box sx={{ mb: 3 }}>
                        <TeaserCard teaser={demoTeaser} />
                    </Box>
                )}

                {/* PII disclosure — moved here from above-the-mic per dogfooding
                    feedback. Saying "deleted after 24h" up top introduced friction
                    before users had decided to engage. Sits as fine print just above
                    the auth surface where retention is contextually relevant. */}
                <Typography
                    variant="caption"
                    sx={{
                        display: 'block',
                        textAlign: 'center',
                        color: palette.textMuted,
                        maxWidth: 360,
                        mx: 'auto',
                        mb: 2,
                    }}
                >
                    Recordings are deleted after 24h unless you save them.{' '}
                    <Link
                        component={RouterLink}
                        to="/privacy"
                        sx={{ color: palette.textMuted, textDecoration: 'underline' }}
                    >
                        Privacy
                    </Link>
                </Typography>

                {/* ── 15+16. Auth footer (with privacy fine print) ───────── */}
                <AuthFooter />
            </Container>

            {/* Sign-in gate fires after the user has seen one real debrief and
                taps the mic again. See onMicTap above for the gate condition. */}
            <SignInGate open={gateOpen} onDismiss={() => setGateOpen(false)} />
        </>
    );
};

export default LandingPage;
