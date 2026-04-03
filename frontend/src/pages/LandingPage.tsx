import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box,
    Button,
    Container,
    LinearProgress,
    Link,
    Typography,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EntryCard from '../components/EntryCard';
import { EntryItem } from '../types/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';

const DEMO_ENTRIES: EntryItem[] = [
    {
        id: 'demo-1',
        transcript: 'Spent 2 hours on the dashboard redesign this morning',
        recorded_at: null,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        duration_seconds: 12,
        categories: [{ text: 'Spent 2 hours on the dashboard redesign', category: 'EARNING', estimated_minutes: 120 }],
    },
    {
        id: 'demo-2',
        transcript: 'Read a chapter on system design patterns during lunch',
        recorded_at: null,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        duration_seconds: 8,
        categories: [{ text: 'Read a chapter on system design patterns', category: 'LEARNING', estimated_minutes: 30 }],
    },
    {
        id: 'demo-3',
        transcript: 'Went for a 30 minute run after work',
        recorded_at: null,
        created_at: new Date(Date.now() - 10800000).toISOString(),
        duration_seconds: 5,
        categories: [{ text: 'Went for a 30 minute run', category: 'RELAXING', estimated_minutes: 30 }],
    },
    {
        id: 'demo-4',
        transcript: 'Fix the login bug before standup tomorrow. Also had an idea to add voice replay to the audit feature.',
        recorded_at: null,
        created_at: new Date(Date.now() - 14400000).toISOString(),
        duration_seconds: 10,
        categories: [
            { text: 'Fix the login bug before standup tomorrow', category: 'TODO' },
            { text: 'Add voice replay to the audit feature', category: 'IDEA' },
        ],
    },
    {
        id: 'demo-5',
        transcript: 'Picked up the kids from school and helped with homework',
        recorded_at: null,
        created_at: new Date(Date.now() - 18000000).toISOString(),
        duration_seconds: 6,
        categories: [{ text: 'Picked up kids and helped with homework', category: 'FAMILY', estimated_minutes: 90 }],
    },
];

const DEMO_AUDIT = `Your day is heavily weighted toward Earning (44%) — the 2-hour dashboard block is solid deep work. But you're missing balance: Learning got a quick lunch read (11%) and Relaxing was just a run (11%). Family time (33%) is healthy with the school pickup.

The uncomfortable truth: you have two follow-up items (a TODO and an IDEA) that came up mid-day but no time blocked to act on them. TODOs that linger become stress.

Actionable insight: Block 30 minutes tomorrow morning for that login bug fix — it's deadline-sensitive (standup) and will free your mind for deeper work the rest of the day.`;

const DEMO_ACTIVITY_BREAKDOWN: Record<string, number> = { EARNING: 44, FAMILY: 33, LEARNING: 11, RELAXING: 11 };
const DEMO_CAPTURE_COUNTS: Record<string, number> = { TODO: 1, IDEA: 1 };

const LandingPage: React.FC = () => {

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 8, mb: 8 }}>
                {/* Hero */}
                <Box sx={{ mb: 6 }}>
                    <Typography variant="h1" component="h1" sx={{ mb: 2 }}>
                        Time Logger
                    </Typography>
                    <Typography variant="h3" component="p" color="text.secondary" sx={{ mb: 1 }}>
                        Track your time by voice. AI categorizes your day.
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 540 }}>
                        Record a quick voice note, and our AI breaks it down into tasks, ideas,
                        time logs, and reflections — then coaches you on how your day is going.
                    </Typography>
                    <Button
                        component={RouterLink}
                        to="/register"
                        variant="contained"
                        size="large"
                        startIcon={<MicIcon />}
                        sx={{ px: 4, py: 1.5 }}
                    >
                        Get Started Free
                    </Button>
                </Box>

                {/* Demo: two-column layout mirroring the real app */}
                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Here's what a typical day looks like
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, gap: 2 }}>
                    {/* Left: demo entries */}
                    <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                            Today's Entries — {DEMO_ENTRIES.length}
                        </Typography>
                        {DEMO_ENTRIES.map((entry) => (
                            <EntryCard key={entry.id} entry={entry} readOnly />
                        ))}
                    </Box>

                    {/* Right: breakdown + audit */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                            <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                                How you spent time — today
                            </Typography>
                            {Object.entries(DEMO_ACTIVITY_BREAKDOWN)
                                .sort(([, a], [, b]) => b - a)
                                .map(([cat, pct]) => (
                                    <Box key={cat} sx={{ mb: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="caption">
                                                {CATEGORY_LABELS[cat] ?? cat}
                                            </Typography>
                                            <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                {pct}%
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={pct}
                                            sx={{
                                                '& .MuiLinearProgress-bar': {
                                                    borderRadius: 4,
                                                    backgroundColor: CATEGORY_COLORS[cat] ?? palette.textMuted,
                                                    transition: 'width 600ms ease-out',
                                                },
                                            }}
                                        />
                                    </Box>
                                ))}
                            <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${palette.rule}` }}>
                                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                    What came up
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {Object.entries(DEMO_CAPTURE_COUNTS)
                                        .map(([cat, count]) => `${count} ${CATEGORY_LABELS[cat] ?? cat}`)
                                        .join(' · ')}
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Typography variant="overline" color="text.secondary">
                                    AI Audit
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<AutoAwesomeIcon fontSize="small" />}
                                    disabled
                                >
                                    Generate Audit
                                </Button>
                            </Box>
                            <Box
                                sx={{
                                    borderLeft: `2px solid ${palette.accent}`,
                                    pl: 2,
                                    py: 1,
                                    bgcolor: 'background.paper',
                                    borderRadius: '0 8px 8px 0',
                                }}
                            >
                                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                    Your AI Coach says:
                                </Typography>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                                    {DEMO_AUDIT}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    Based on 5 entries · sample
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* Footer CTA */}
                <Box sx={{ mt: 6 }}>
                    <Button
                        component={RouterLink}
                        to="/register"
                        variant="contained"
                        size="large"
                        sx={{ px: 4, py: 1.5, mr: 2 }}
                    >
                        Sign Up Free
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login" sx={{ color: palette.accent }}>Log in</Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};

export default LandingPage;
