import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
    Alert,
    Box,
    CircularProgress,
    Container,
    Stack,
    Typography,
} from '@mui/material';
import { capturesApi } from '../services/api';
import { Capture } from '../types/api';
import { palette } from '../theme';

const WEEK_START_PARAM = 'week_start';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const RECENT_WEEKS = 3;

function toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseLocalDate(s: string): Date | null {
    if (!DATE_REGEX.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
}

function snapToMonday(date: Date): Date {
    const result = new Date(date);
    const offset = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - offset);
    return result;
}

function currentMondayString(): string {
    return toLocalDateString(snapToMonday(new Date()));
}

function sanitizeWeekStart(raw: string | null): string | null {
    if (!raw) return null;
    const parsed = parseLocalDate(raw);
    if (!parsed) return null;
    return toLocalDateString(snapToMonday(parsed));
}

function addDays(dateStr: string, days: number): string {
    const d = parseLocalDate(dateStr);
    if (!d) return dateStr;
    d.setDate(d.getDate() + days);
    return toLocalDateString(d);
}

function mondayOf(dateStr: string): string | null {
    const d = parseLocalDate(dateStr);
    if (!d) return null;
    return toLocalDateString(snapToMonday(d));
}

function formatShort(dateStr: string): string {
    const d = parseLocalDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatWeekLabel(monday: string): string {
    const sunday = addDays(monday, 6);
    return `${formatShort(monday)} \u2013 ${formatShort(sunday)}`;
}

function displayOrFallback(text: string | null): string {
    return (text && text.trim()) || '(no text)';
}

interface ReflectionRowProps {
    capture: Capture;
}

const ReflectionRow: React.FC<ReflectionRowProps> = ({ capture }) => {
    const sourceDate = capture.source_date!;
    return (
        <Box
            sx={{
                py: 1.25,
                borderBottom: `1px solid ${palette.rule}40`,
                '&:last-child': { borderBottom: 'none' },
            }}
        >
            <Typography variant="body1" sx={{ lineHeight: 1.55, mb: 0.5 }}>
                {displayOrFallback(capture.display_text)}
            </Typography>
            <RouterLink
                to={`/?date=${encodeURIComponent(sourceDate)}`}
                style={{
                    fontSize: '12px',
                    color: palette.textMuted,
                    textDecoration: 'none',
                    display: 'inline-block',
                    minHeight: 44,
                    lineHeight: '44px',
                    letterSpacing: '0.04em',
                }}
            >
                {formatShort(sourceDate)}
            </RouterLink>
        </Box>
    );
};

const ThoughtGardenPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const rawWeekStart = searchParams.get(WEEK_START_PARAM);
    const sanitized = sanitizeWeekStart(rawWeekStart);
    const weekStart = sanitized ?? currentMondayString();
    const weekEnd = addDays(weekStart, 6);

    useEffect(() => {
        if (rawWeekStart !== null && sanitized === null) {
            const next = new URLSearchParams(searchParams);
            next.delete(WEEK_START_PARAM);
            setSearchParams(next, { replace: true });
        }
    }, [rawWeekStart, sanitized, searchParams, setSearchParams]);

    const [reflections, setReflections] = useState<Capture[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const loadReflections = useCallback(async () => {
        setLoading(true);
        setError(undefined);
        try {
            const data = await capturesApi.list({ category: 'REFLECTION', status: 'all' });
            setReflections(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load reflections');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReflections();
    }, [loadReflections]);

    const gems = useMemo(() => {
        return reflections
            .filter((c) => c.source_date && c.source_date >= weekStart && c.source_date <= weekEnd)
            .sort((a, b) => (b.source_date! > a.source_date! ? 1 : b.source_date! < a.source_date! ? -1 : 0));
    }, [reflections, weekStart, weekEnd]);

    const recentByWeek = useMemo(() => {
        const priorStart = addDays(weekStart, -RECENT_WEEKS * 7);
        const priorEnd = addDays(weekStart, -1);
        const buckets = new Map<string, Capture[]>();
        for (const c of reflections) {
            if (!c.source_date) continue;
            if (c.source_date < priorStart || c.source_date > priorEnd) continue;
            const monday = mondayOf(c.source_date);
            if (!monday) continue;
            const bucket = buckets.get(monday) ?? [];
            bucket.push(c);
            buckets.set(monday, bucket);
        }
        const keys = Array.from(buckets.keys()).sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
        return keys.map((monday) => ({
            monday,
            items: (buckets.get(monday) ?? []).sort(
                (a, b) => (b.source_date! > a.source_date! ? 1 : b.source_date! < a.source_date! ? -1 : 0)
            ),
        }));
    }, [reflections, weekStart]);

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
            <Stack spacing={3}>
                <Box>
                    <Typography variant="overline" color="text.secondary">
                        Thought Garden
                    </Typography>
                    <Typography variant="h3" sx={{ mt: 0.5, mb: 0.5 }}>
                        Reflections worth rereading
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {formatWeekLabel(weekStart)}
                    </Typography>
                </Box>

                {error && <Alert severity="error">{error}</Alert>}

                {loading ? (
                    <Box sx={{ minHeight: '20vh', display: 'grid', placeItems: 'center' }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : (
                    <>
                        <Box>
                            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                Gems
                            </Typography>
                            {gems.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                    No reflections yet this week. Record an honest thought.
                                </Typography>
                            ) : (
                                <Box
                                    sx={{
                                        border: `1px solid ${palette.rule}`,
                                        borderRadius: '12px',
                                        bgcolor: 'background.paper',
                                        px: { xs: 2, md: 3 },
                                    }}
                                >
                                    {gems.map((c) => (
                                        <ReflectionRow key={c.id} capture={c} />
                                    ))}
                                </Box>
                            )}
                        </Box>

                        {recentByWeek.length > 0 && (
                            <Box>
                                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                    Recent Reflections
                                </Typography>
                                <Stack spacing={2}>
                                    {recentByWeek.map(({ monday, items }) => (
                                        <Box key={monday}>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ display: 'block', mb: 0.5 }}
                                            >
                                                {formatWeekLabel(monday)}
                                            </Typography>
                                            <Box
                                                sx={{
                                                    border: `1px solid ${palette.rule}`,
                                                    borderRadius: '12px',
                                                    bgcolor: 'background.paper',
                                                    px: { xs: 2, md: 3 },
                                                }}
                                            >
                                                {items.map((c) => (
                                                    <ReflectionRow key={c.id} capture={c} />
                                                ))}
                                            </Box>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </>
                )}
            </Stack>
        </Container>
    );
};

export default ThoughtGardenPage;
