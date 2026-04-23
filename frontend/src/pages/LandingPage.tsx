import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box,
    Button,
    Container,
    Link,
    Typography,
    Alert,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
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
            <Box sx={{ mt: { xs: 6, md: 8 }, mb: 8 }}>
                {/* ── Hero ───────────────────────────────────────────────── */}
                <Box sx={{ mb: 6 }}>
                    <Typography variant="h1" component="h1" sx={{ mb: 2 }}>
                        Debrief your day.
                    </Typography>
                    <Typography variant="h3" component="p" color="text.secondary" sx={{ mb: 1 }}>
                        A daily work debrief, powered by your voice. Turn what you did into a
                        clear, structured brief.
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 540 }}>
                        No timers. No typing. Just talk.
                    </Typography>

                    {googleError && (
                        <Alert severity="error" sx={{ mb: 2, maxWidth: 480 }} onClose={() => setGoogleError(null)}>
                            {googleError}
                        </Alert>
                    )}

                    {/* CTA row — Google primary, email alternative */}
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            gap: { xs: 1.5, sm: 2 },
                            alignItems: { xs: 'stretch', sm: 'center' },
                            maxWidth: { xs: '100%', sm: 520 },
                        }}
                    >
                        <Box sx={{ flex: { xs: 'none', sm: '1 1 auto' }, minWidth: 0 }}>
                            <GoogleSignInButton variant="landing" onError={setGoogleError} />
                        </Box>
                        <Button
                            component={RouterLink}
                            to="/login"
                            variant="outlined"
                            color="primary"
                            size="large"
                            fullWidth
                            startIcon={<MicIcon />}
                            sx={{
                                height: 48,
                                flex: { xs: 'none', sm: '1 1 auto' },
                                textTransform: 'none',
                            }}
                        >
                            Start your debrief
                        </Button>
                    </Box>
                </Box>

                {/* ── Demo section ───────────────────────────────────────── */}
                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Here&rsquo;s what Brief notices over a week
                </Typography>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' },
                        gap: 2,
                    }}
                >
                    {/* Left: Open Loops */}
                    <Box
                        sx={{
                            p: 3,
                            borderRadius: '8px',
                            border: `1px solid ${palette.rule}`,
                            bgcolor: 'background.paper',
                        }}
                    >
                        <Typography
                            variant="overline"
                            component="h2"
                            color="text.secondary"
                            display="block"
                            gutterBottom
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
                                        py: 1.25,
                                        borderBottom: `1px solid ${palette.rule}`,
                                        '&:last-child': { borderBottom: 'none' },
                                    }}
                                >
                                    <Box
                                        aria-hidden="true"
                                        sx={{
                                            width: 16,
                                            height: 16,
                                            mt: 0.25,
                                            border: `1.5px solid ${palette.textMuted}`,
                                            borderRadius: '3px',
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box
                            sx={{
                                p: 3,
                                borderRadius: '8px',
                                border: `1px solid ${palette.rule}`,
                                bgcolor: 'background.paper',
                            }}
                        >
                            <Typography
                                variant="overline"
                                component="h2"
                                color="text.secondary"
                                display="block"
                                gutterBottom
                            >
                                Recurring Themes
                            </Typography>
                            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                                {DEMO_THEMES.map((t) => (
                                    <Box
                                        key={t.label}
                                        component="li"
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'baseline',
                                            py: 1,
                                            borderBottom: `1px solid ${palette.rule}`,
                                            '&:last-child': { borderBottom: 'none' },
                                        }}
                                    >
                                        <Typography variant="body2">{t.label}</Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 600,
                                                fontVariantNumeric: 'tabular-nums',
                                                color: palette.textMuted,
                                            }}
                                        >
                                            {t.count}×
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        {/* AI Coach letter pattern — left vermilion border + surface */}
                        <Box
                            sx={{
                                pl: 2,
                                py: 1.5,
                                bgcolor: 'background.paper',
                                borderRadius: '0 8px 8px 0',
                                border: `1px solid ${palette.rule}`,
                                borderLeftWidth: '2px',
                                borderLeftColor: palette.accent,
                            }}
                        >
                            <Typography
                                variant="overline"
                                component="h2"
                                color="text.secondary"
                                display="block"
                                sx={{ mb: 0.5 }}
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

                {/* ── Footer CTA ─────────────────────────────────────────── */}
                <Box sx={{ mt: 6 }}>
                    <Button
                        component={RouterLink}
                        to="/login"
                        variant="contained"
                        color="primary"
                        size="large"
                        sx={{ px: 4, py: 1.5, mr: 2, textTransform: 'none' }}
                    >
                        Sign up free
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login" sx={{ color: palette.accent }}>
                            Sign in
                        </Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};

export default LandingPage;
