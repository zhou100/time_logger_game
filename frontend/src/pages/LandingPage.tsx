import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box,
    Container,
    Link,
    Typography,
    Alert,
} from '@mui/material';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { palette } from '../theme';

interface OpenLoop {
    id: string;
    text: string;
    day: string;
}

interface RecurringTheme {
    label: string;
    count: number;
}

interface RecentEntry {
    id: string;
    time: string;
    text: string;
}

const DEMO_RECENT_ENTRIES: RecentEntry[] = [
    {
        id: 'r1',
        time: '9:42 AM · today',
        text:
            'Long call with the client — decided to push the launch back two weeks so the onboarding isn’t a mess.',
    },
    {
        id: 'r2',
        time: '2:15 PM · yesterday',
        text:
            'Keep getting pulled into scheduling that should belong to someone else. Need to draw a line here.',
    },
    {
        id: 'r3',
        time: '6:30 PM · Tuesday',
        text:
            'Finally through the compliance review. Three weeks of back-and-forth for something that should have been a form.',
    },
];

const DEMO_OPEN_LOOPS: OpenLoop[] = [
    { id: 'l1', text: 'Fix the login bug before standup', day: 'from Tue' },
    { id: 'l2', text: 'Block time for deep work mornings', day: 'from Wed' },
    { id: 'l3', text: 'Review design mockups for the new page', day: 'from Thu' },
];

const DEMO_THEMES: RecurringTheme[] = [
    { label: 'deep work', count: 4 },
    { label: 'client prep', count: 3 },
    { label: 'boundary setting', count: 2 },
];

const DEMO_COACH_LINE =
    'You keep circling back to focus. Maybe it’s time to actually block mornings for the work that matters.';

const LandingPage: React.FC = () => {
    const [googleError, setGoogleError] = useState<string | null>(null);

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: { xs: 5, md: 8 }, mb: { xs: 6, md: 8 } }}>
                {/* ── Hero ───────────────────────────────────────────────── */}
                <Box sx={{ mb: { xs: 6, md: 8 } }}>
                    <Typography variant="h1" component="h1" sx={{ mb: 2 }}>
                        Debrief your day.
                    </Typography>
                    <Typography
                        variant="h3"
                        component="p"
                        color="text.secondary"
                        sx={{ mb: { xs: 3, md: 4 }, maxWidth: 520 }}
                    >
                        Talk. We turn it into your weekly brief.
                    </Typography>

                    {googleError && (
                        <Alert severity="error" sx={{ mb: 2, maxWidth: 480 }} onClose={() => setGoogleError(null)}>
                            {googleError}
                        </Alert>
                    )}

                    {/* Primary CTA — Google. Magic link is a lightweight alternative below. */}
                    <Box sx={{ maxWidth: 400 }}>
                        <GoogleSignInButton
                            variant="landing"
                            label="Sign in with Google to start"
                            onError={setGoogleError}
                        />
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 1.5, textAlign: 'center' }}
                        >
                            or{' '}
                            <Link
                                component={RouterLink}
                                to="/login"
                                sx={{ color: palette.accent, fontWeight: 500 }}
                            >
                                get a magic link
                            </Link>
                        </Typography>
                    </Box>
                </Box>

                {/* ── Transition: Your recent debrief ───────────────────── */}
                <Box sx={{ mb: { xs: 6, md: 8 } }}>
                    <Typography
                        variant="h2"
                        component="h2"
                        sx={{ mb: { xs: 2, md: 3 } }}
                    >
                        Your recent debrief
                    </Typography>
                    <Box
                        component="ul"
                        sx={{
                            listStyle: 'none',
                            m: 0,
                            p: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: { xs: 2, md: 2.5 },
                        }}
                    >
                        {DEMO_RECENT_ENTRIES.map((entry) => (
                            <Box
                                key={entry.id}
                                component="li"
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' },
                                    columnGap: { xs: 0, sm: 3 },
                                    rowGap: 0.5,
                                    alignItems: 'baseline',
                                    borderTop: `1px solid ${palette.rule}`,
                                    pt: { xs: 1.5, md: 2 },
                                }}
                            >
                                <Typography
                                    variant="overline"
                                    color="text.secondary"
                                    sx={{
                                        fontWeight: 600,
                                        fontVariantNumeric: 'tabular-nums',
                                        letterSpacing: '0.08em',
                                    }}
                                >
                                    {entry.time}
                                </Typography>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        fontStyle: 'italic',
                                        lineHeight: 1.65,
                                        color: palette.textPrimary,
                                    }}
                                >
                                    &ldquo;{entry.text}&rdquo;
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>

                {/* ── Demo section ───────────────────────────────────────── */}
                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 2 }}>
                    Here&rsquo;s what Brief notices over a week
                </Typography>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' },
                        gap: { xs: 2, md: 3 },
                    }}
                >
                    {/* Left: Open Loops */}
                    <Box
                        sx={{
                            p: { xs: 2.5, md: 3 },
                            borderRadius: '8px',
                            border: `1px solid ${palette.textMuted}`,
                            bgcolor: 'background.paper',
                        }}
                    >
                        <Typography
                            variant="overline"
                            component="h2"
                            color="text.primary"
                            display="block"
                            sx={{ mb: 1.5, fontWeight: 600 }}
                        >
                            Open Loops — {DEMO_OPEN_LOOPS.length}
                        </Typography>
                        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                            {DEMO_OPEN_LOOPS.map((loop) => (
                                <Box
                                    key={loop.id}
                                    component="li"
                                    sx={{
                                        display: 'flex',
                                        gap: 1.5,
                                        alignItems: 'flex-start',
                                        py: 1.5,
                                        borderBottom: `1px solid ${palette.rule}`,
                                        '&:last-child': { borderBottom: 'none' },
                                    }}
                                >
                                    <Box
                                        aria-hidden="true"
                                        sx={{
                                            width: 20,
                                            height: 20,
                                            mt: 0.25,
                                            border: `1.5px solid ${palette.textMuted}`,
                                            borderRadius: '4px',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ color: palette.textPrimary }}>
                                            {loop.text}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {loop.day}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>

                    {/* Right: Recurring Themes + coach quote */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 3 } }}>
                        <Box
                            sx={{
                                p: { xs: 2.5, md: 3 },
                                borderRadius: '8px',
                                border: `1px solid ${palette.textMuted}`,
                                bgcolor: 'background.paper',
                            }}
                        >
                            <Typography
                                variant="overline"
                                component="h2"
                                color="text.primary"
                                display="block"
                                sx={{ mb: 2, fontWeight: 600 }}
                            >
                                What kept coming up
                            </Typography>
                            <Box
                                component="ul"
                                sx={{
                                    listStyle: 'none',
                                    m: 0,
                                    p: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 1.25,
                                }}
                            >
                                {(() => {
                                    const maxCount = Math.max(...DEMO_THEMES.map((t) => t.count));
                                    return DEMO_THEMES.map((t) => (
                                        <Box
                                            key={t.label}
                                            component="li"
                                            sx={{ position: 'relative' }}
                                        >
                                            {/* proportional fill bar behind the row */}
                                            <Box
                                                aria-hidden="true"
                                                sx={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    bottom: 0,
                                                    left: 0,
                                                    width: `${(t.count / maxCount) * 100}%`,
                                                    bgcolor: palette.accent,
                                                    opacity: 0.14,
                                                    borderRadius: '4px',
                                                }}
                                            />
                                            <Box
                                                sx={{
                                                    position: 'relative',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'baseline',
                                                    px: 1.5,
                                                    py: 1,
                                                }}
                                            >
                                                <Typography
                                                    variant="body1"
                                                    sx={{
                                                        fontFamily: '"DM Serif Display", serif',
                                                        fontSize: '1.0625rem',
                                                        color: palette.textPrimary,
                                                    }}
                                                >
                                                    {t.label}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        fontWeight: 600,
                                                        fontVariantNumeric: 'tabular-nums',
                                                        color: palette.textMuted,
                                                        letterSpacing: '0.04em',
                                                    }}
                                                >
                                                    {t.count} times
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ));
                                })()}
                            </Box>
                        </Box>

                        {/* AI Coach letter pattern — left vermilion border + surface */}
                        <Box
                            sx={{
                                pl: 2,
                                pr: 2.5,
                                py: 2,
                                bgcolor: 'background.paper',
                                borderRadius: '0 8px 8px 0',
                                border: `1px solid ${palette.textMuted}`,
                                borderLeftWidth: '3px',
                                borderLeftColor: palette.accent,
                            }}
                        >
                            <Typography
                                variant="overline"
                                component="h2"
                                color="text.primary"
                                display="block"
                                sx={{ mb: 0.5, fontWeight: 600 }}
                            >
                                AI Coach
                            </Typography>
                            <Typography variant="body2" sx={{ lineHeight: 1.7, fontStyle: 'italic' }}>
                                {DEMO_COACH_LINE}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Based on this week&rsquo;s entries · sample
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Container>
    );
};

export default LandingPage;
