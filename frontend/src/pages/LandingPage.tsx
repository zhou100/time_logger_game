import React, { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Box,
    Button,
    Container,
    LinearProgress,
    Link,
    Paper,
    Typography,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EntryCard from '../components/EntryCard';
import { EntryItem } from '../types/api';

const CATEGORY_COLORS: Record<string, string> = {
    TODO: '#1976d2',
    IDEA: '#9c27b0',
    THOUGHT: '#555555',
    TIME_RECORD: '#f57c00',
};

const CATEGORY_LABELS: Record<string, string> = {
    TODO: 'TODO / Deep work',
    IDEA: 'IDEA / Creative',
    THOUGHT: 'THOUGHT / Reflection',
    TIME_RECORD: 'TIME / Logged',
};

const DEMO_ENTRIES: EntryItem[] = [
    {
        id: 'demo-1',
        transcript: 'Fix the login bug before standup tomorrow',
        recorded_at: null,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        duration_seconds: 8,
        categories: [{ text: 'Fix the login bug before standup tomorrow', category: 'TODO' }],
    },
    {
        id: 'demo-2',
        transcript: 'Spent 2 hours on the dashboard redesign',
        recorded_at: null,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        duration_seconds: 12,
        categories: [{ text: 'Spent 2 hours on the dashboard redesign', category: 'TIME_RECORD' }],
    },
    {
        id: 'demo-3',
        transcript: 'Add voice replay to the audit feature',
        recorded_at: null,
        created_at: new Date(Date.now() - 10800000).toISOString(),
        duration_seconds: 5,
        categories: [{ text: 'Add voice replay to the audit feature', category: 'IDEA' }],
    },
    {
        id: 'demo-4',
        transcript: 'The new sprint structure is working better',
        recorded_at: null,
        created_at: new Date(Date.now() - 14400000).toISOString(),
        duration_seconds: 10,
        categories: [{ text: 'The new sprint structure is working better', category: 'THOUGHT' }],
    },
    {
        id: 'demo-5',
        transcript: 'Review PRs from the team before end of day',
        recorded_at: null,
        created_at: new Date(Date.now() - 18000000).toISOString(),
        duration_seconds: 6,
        categories: [{ text: 'Review PRs from the team before end of day', category: 'TODO' }],
    },
];

const DEMO_AUDIT = `Your day shows a healthy mix of deep work and planning. About 40% of your logged time went to actionable tasks (login bug fix, PR reviews), which signals good prioritization. The 2-hour dashboard block stands out as your longest focused session — protect that kind of deep work.

One thing to watch: you have two TODOs that are deadline-sensitive (standup tomorrow, end of day). Consider batching quick tasks earlier so they don't compete with creative thinking later.

Actionable insight: Try recording a quick voice note right after each meeting to capture TODOs while they're fresh — you'll spend less time reconstructing action items later.`;

function computeBreakdown(entries: EntryItem[]): Record<string, number> {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const e of entries) {
        for (const c of e.categories) {
            counts[c.category] = (counts[c.category] ?? 0) + 1;
            total++;
        }
    }
    if (total === 0) return {};
    return Object.fromEntries(
        Object.entries(counts).map(([cat, n]) => [cat, Math.round((n / total) * 100)])
    );
}

const LandingPage: React.FC = () => {
    const breakdown = useMemo(() => computeBreakdown(DEMO_ENTRIES), []);

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 6, mb: 8 }}>
                {/* Hero */}
                <Box sx={{ textAlign: 'center', mb: 6 }}>
                    <Typography
                        variant="h2"
                        component="h1"
                        sx={{
                            fontWeight: 'bold',
                            background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            mb: 2,
                        }}
                    >
                        Time Logger
                    </Typography>
                    <Typography variant="h5" color="text.secondary" sx={{ mb: 1 }}>
                        Track your time by voice. AI categorizes your day.
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
                        Record a quick voice note, and our AI breaks it down into tasks, ideas,
                        time logs, and reflections — then coaches you on how your day is going.
                    </Typography>
                    <Button
                        component={RouterLink}
                        to="/register"
                        variant="contained"
                        size="large"
                        startIcon={<MicIcon />}
                        sx={{ borderRadius: 3, px: 4, py: 1.5, fontSize: '1rem' }}
                    >
                        Get Started Free
                    </Button>
                </Box>

                {/* Demo: two-column layout mirroring the real app */}
                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1, textAlign: 'center' }}>
                    Here's what a typical day looks like
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, gap: 2 }}>
                    {/* Left: demo entries */}
                    <Paper elevation={1} sx={{ p: 2 }}>
                        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                            Today's Entries — {DEMO_ENTRIES.length}
                        </Typography>
                        {DEMO_ENTRIES.map((entry) => (
                            <EntryCard key={entry.id} entry={entry} readOnly />
                        ))}
                    </Paper>

                    {/* Right: breakdown + audit */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Paper elevation={1} sx={{ p: 2 }}>
                            <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                                Time Breakdown — today
                            </Typography>
                            {Object.entries(breakdown)
                                .sort(([, a], [, b]) => b - a)
                                .map(([cat, pct]) => (
                                    <Box key={cat} sx={{ mb: 1 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="caption">
                                                {CATEGORY_LABELS[cat] ?? cat}
                                            </Typography>
                                            <Typography variant="caption" fontWeight="bold">{pct}%</Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={pct}
                                            sx={{
                                                height: 8,
                                                borderRadius: 4,
                                                backgroundColor: 'rgba(0,0,0,0.08)',
                                                '& .MuiLinearProgress-bar': {
                                                    borderRadius: 4,
                                                    backgroundColor: CATEGORY_COLORS[cat] ?? '#888',
                                                },
                                            }}
                                        />
                                    </Box>
                                ))}
                        </Paper>

                        <Paper elevation={1} sx={{ p: 2 }}>
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
                                    borderLeft: '3px solid #333',
                                    pl: 1.5,
                                    py: 0.5,
                                    backgroundColor: '#fafaf5',
                                    borderRadius: '0 4px 4px 0',
                                }}
                            >
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Your AI Coach says:
                                </Typography>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                    {DEMO_AUDIT}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    Based on 5 entries · sample
                                </Typography>
                            </Box>
                        </Paper>
                    </Box>
                </Box>

                {/* Footer CTA */}
                <Box sx={{ textAlign: 'center', mt: 6 }}>
                    <Button
                        component={RouterLink}
                        to="/register"
                        variant="contained"
                        size="large"
                        sx={{ borderRadius: 3, px: 4, py: 1.5, fontSize: '1rem', mr: 2 }}
                    >
                        Sign Up Free
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Already have an account?{' '}
                        <Link component={RouterLink} to="/login">Log in</Link>
                    </Typography>
                </Box>
            </Box>
        </Container>
    );
};

export default LandingPage;
