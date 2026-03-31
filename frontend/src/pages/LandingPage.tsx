import React, { useMemo } from 'react';
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
        transcript: 'Worked on the dashboard redesign for about 2 hours this morning',
        recorded_at: null,
        created_at: new Date(Date.now() - 3600000).toISOString(),
        duration_seconds: 8,
        categories: [{ text: 'Worked on the dashboard redesign for about 2 hours', category: 'EARNING', estimated_minutes: 120 }],
    },
    {
        id: 'demo-2',
        transcript: 'Read a chapter of Designing Data-Intensive Applications over lunch',
        recorded_at: null,
        created_at: new Date(Date.now() - 7200000).toISOString(),
        duration_seconds: 12,
        categories: [{ text: 'Read a chapter of Designing Data-Intensive Applications over lunch', category: 'LEARNING', estimated_minutes: 30 }],
    },
    {
        id: 'demo-3',
        transcript: 'Picked up the kids from school and went to the park',
        recorded_at: null,
        created_at: new Date(Date.now() - 10800000).toISOString(),
        duration_seconds: 5,
        categories: [{ text: 'Picked up the kids from school and went to the park', category: 'FAMILY', estimated_minutes: 90 }],
    },
    {
        id: 'demo-4',
        transcript: 'Hit the gym for an hour after work',
        recorded_at: null,
        created_at: new Date(Date.now() - 14400000).toISOString(),
        duration_seconds: 10,
        categories: [{ text: 'Gym session after work', category: 'RELAXING', estimated_minutes: 60 }],
    },
    {
        id: 'demo-5',
        transcript: 'Had back-to-back meetings with the product team',
        recorded_at: null,
        created_at: new Date(Date.now() - 18000000).toISOString(),
        duration_seconds: 6,
        categories: [{ text: 'Back-to-back meetings with the product team', category: 'EARNING', estimated_minutes: 90 }],
    },
];

const DEMO_AUDIT = `Your day leans heavily toward Earning (about 55%), with a solid 2-hour deep work block on the dashboard. That's your most productive stretch. The back-to-back meetings ate another 90 minutes, though, and you didn't mention what came out of them.

Good balance on the personal side: family time with the kids, a gym session, and some learning over lunch. You're hitting all four quadrants, which most people don't manage.

Actionable insight: Try recording a voice note right after those meetings to capture what actually came out of them. If the answer is "nothing," that's useful data too.`;

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
