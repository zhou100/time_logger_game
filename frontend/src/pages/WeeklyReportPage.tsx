import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    IconButton,
    MenuItem,
    Select,
    SelectChangeEvent,
    Typography,
} from '@mui/material';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import { capturesApi, entriesApi } from '../services/api';
import { AuditResponse, AvailableWeek, Capture, Theme } from '../types/api';
import DayWeekTabs from '../components/DayWeekTabs';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

/** Format "2026-04-07" -> "Apr 7" */
const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** True if the given Monday falls in the current calendar week. */
const isCurrentWeek = (weekStart: string) => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return weekStart === monday.toISOString().slice(0, 10);
};

/** Add N days to a YYYY-MM-DD date (local), returning YYYY-MM-DD. */
const addDays = (dateStr: string, days: number) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

/** YYYY-MM-DD portion of an ISO timestamp interpreted in the user's local tz. */
const isoToLocalDate = (iso: string) => {
    const dt = new Date(iso);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

const splitParagraphs = (text: string) =>
    text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const CoachLetter: React.FC<{ text: string }> = ({ text }) => {
    const paragraphs = splitParagraphs(text);

    return (
        <Box sx={{ mb: 3 }}>
            {paragraphs.map((paragraph, index) => (
                <Typography
                    key={`${index}-${paragraph.slice(0, 24)}`}
                    variant="body1"
                    sx={{
                        mb: index === paragraphs.length - 1 ? 0 : 1.5,
                        lineHeight: 1.7,
                        fontSize: '15px',
                        color: palette.textPrimary,
                    }}
                >
                    {paragraph}
                </Typography>
            ))}
        </Box>
    );
};

/* ── Category Breakdown bar ────────────────────────────────────────────────── */
const CategoryBreakdown: React.FC<{ activity: Record<string, number>; captures: Record<string, number> }> = ({ activity, captures }) => {
    const sorted = Object.entries(activity).sort(([, a], [, b]) => b - a);
    const captureEntries = Object.entries(captures);
    if (sorted.length === 0 && captureEntries.length === 0) return null;

    const maxPct = sorted.length > 0 ? sorted[0][1] : 0;

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Category Breakdown
            </Typography>
            {sorted.map(([cat, pct]) => (
                <Box key={cat} sx={{ display: 'flex', alignItems: 'center', mb: 0.75, minHeight: 28 }}>
                    <Typography variant="caption" sx={{ width: 80, flexShrink: 0, color: palette.textMuted }}>
                        {CATEGORY_LABELS[cat] ?? cat}
                    </Typography>
                    <Box sx={{ flex: 1, mx: 1, height: 6, borderRadius: 3, bgcolor: `${palette.rule}40`, overflow: 'hidden' }}>
                        <Box
                            sx={{
                                height: '100%',
                                borderRadius: 3,
                                bgcolor: CATEGORY_COLORS[cat] ?? palette.textMuted,
                                width: `${maxPct > 0 ? (pct / maxPct) * 100 : 0}%`,
                                transition: 'width 0.3s ease-out',
                            }}
                        />
                    </Box>
                    <Typography
                        variant="caption"
                        sx={{ width: 36, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: CATEGORY_COLORS[cat] ?? palette.textMuted }}
                    >
                        {pct}%
                    </Typography>
                </Box>
            ))}
            {captureEntries.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                    {captureEntries.map(([cat, count]) => `${count} ${CATEGORY_LABELS[cat] ?? cat}${count > 1 ? 's' : ''}`).join(' \u00b7 ')}
                </Typography>
            )}
        </Box>
    );
};

/* ── Recurring Themes teaser (hero quote + "N more") ──────────────────────── */
const polarityColor = (p: string) =>
    p === 'positive' ? palette.success : p === 'negative' ? palette.error : palette.textMuted;

const RecurringThemesTeaser: React.FC<{ themes: Theme[] }> = ({ themes }) => {
    if (themes.length === 0) return null;

    const hero = themes[0];
    const moreCount = themes.length - 1;
    const heroQuote = hero.description?.trim() || hero.title;

    return (
        <Box
            component={RouterLink}
            to="/themes"
            aria-label="Open recurring themes"
            sx={{
                display: 'block',
                mb: 3,
                p: { xs: 2, md: 2.5 },
                border: `1px solid ${palette.rule}`,
                borderRadius: '12px',
                bgcolor: 'background.paper',
                textDecoration: 'none',
                color: palette.textPrimary,
                transition: 'border-color 0.15s ease',
                '&:hover': { borderColor: palette.textMuted },
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
                <Box
                    sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: polarityColor(hero.polarity),
                        flexShrink: 0,
                    }}
                />
                <Typography variant="overline" color="text.secondary">
                    Recurring Themes
                </Typography>
            </Box>
            <Typography
                sx={{
                    fontFamily: '"DM Serif Display", "Noto Serif SC", serif',
                    fontStyle: 'italic',
                    fontSize: { xs: '1.15rem', md: '1.3rem' },
                    lineHeight: 1.4,
                    color: palette.textPrimary,
                    position: 'relative',
                    pl: 2,
                    '&::before': {
                        content: '"\\201C"',
                        position: 'absolute',
                        left: -2,
                        top: -8,
                        fontSize: '2.2rem',
                        color: palette.accentSoft,
                        lineHeight: 1,
                    },
                }}
            >
                {heroQuote}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.25 }}>
                <Typography variant="caption" color="text.secondary">
                    {moreCount > 0 ? `+${moreCount} more thread${moreCount > 1 ? 's' : ''}` : 'See all threads'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    Open &rsaquo;
                </Typography>
            </Box>
        </Box>
    );
};

/* ── Open Loops ───────────────────────────────────────────────────────────── */
const OpenLoops: React.FC<{
    loops: Capture[];
    onDone: (id: string) => void;
    onDismiss: (id: string) => void;
}> = ({ loops, onDone, onDismiss }) => {
    if (loops.length === 0) return null;

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Open Loops · {loops.length}
            </Typography>
            {loops.map((c) => (
                <Box
                    key={c.id}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.75,
                        borderBottom: `1px solid ${palette.rule}30`,
                        '&:last-child': { borderBottom: 'none' },
                    }}
                >
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
                        {c.display_text || '(no text)'}
                    </Typography>
                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                        <IconButton size="small" onClick={() => onDone(c.id)} aria-label="mark done" sx={{ color: palette.success, p: 0.5 }}>
                            <CheckIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        <IconButton size="small" onClick={() => onDismiss(c.id)} aria-label="dismiss" sx={{ color: palette.textMuted, opacity: 0.5, p: 0.5 }}>
                            <CloseIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

/* ── Closed this week ─────────────────────────────────────────────────────── */
const ClosedLoops: React.FC<{
    loops: Capture[];
    onUndo: (id: string) => void;
}> = ({ loops, onUndo }) => {
    if (loops.length === 0) return null;

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Closed this week · {loops.length}
            </Typography>
            {loops.map((c) => {
                const isDone = c.status === 'done';
                return (
                    <Box
                        key={c.id}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            borderBottom: `1px solid ${palette.rule}30`,
                            '&:last-child': { borderBottom: 'none' },
                        }}
                    >
                        <CheckIcon
                            sx={{
                                fontSize: 14,
                                flexShrink: 0,
                                color: isDone ? palette.success : palette.textMuted,
                                opacity: isDone ? 0.85 : 0.4,
                            }}
                        />
                        <Typography
                            variant="body2"
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                lineHeight: 1.4,
                                color: palette.textMuted,
                                textDecoration: 'line-through',
                                textDecorationColor: `${palette.textMuted}80`,
                            }}
                        >
                            {c.display_text || '(no text)'}
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={() => onUndo(c.id)}
                            aria-label="reopen loop"
                            sx={{ color: palette.textMuted, opacity: 0.4, p: 0.5, '&:hover': { opacity: 0.85 } }}
                        >
                            <UndoIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Box>
                );
            })}
        </Box>
    );
};

/* ── Main page ─────────────────────────────────────────────────────────────── */
const WeeklyReportPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuditResponse | null>(null);
    const [error, setError] = useState<string | undefined>();

    // Week selector state
    const [weeks, setWeeks] = useState<AvailableWeek[]>([]);
    const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
    const [weeksLoading, setWeeksLoading] = useState(true);
    const activeRequestRef = useRef(0);

    // Open loops (live from captures API)
    const [openLoops, setOpenLoops] = useState<Capture[]>([]);
    const loadOpenLoops = useCallback(() => {
        capturesApi.list({ category: 'TODO', status: 'open' }).then(setOpenLoops).catch(() => {});
    }, []);
    useEffect(() => { loadOpenLoops(); }, [loadOpenLoops]);

    // Closed loops across all time — filtered to the selected week via resolved_at below.
    const [closedTodos, setClosedTodos] = useState<Capture[]>([]);
    const loadClosedTodos = useCallback(() => {
        capturesApi.list({ category: 'TODO', status: 'all' })
            .then((rows) => setClosedTodos(rows.filter((c) => c.status !== 'open' && c.resolved_at)))
            .catch(() => {});
    }, []);
    useEffect(() => { loadClosedTodos(); }, [loadClosedTodos]);

    // Reflections — used to show a pulled-quote gem preview on the Thought Gems card.
    const [reflections, setReflections] = useState<Capture[]>([]);
    useEffect(() => {
        capturesApi.list({ category: 'REFLECTION', status: 'all' }).then(setReflections).catch(() => {});
    }, []);

    const markLoopDone = useCallback(async (id: string) => {
        try {
            const updated = await capturesApi.patch(id, { status: 'done' });
            setOpenLoops((prev) => prev.filter((c) => c.id !== id));
            setClosedTodos((prev) => [updated, ...prev.filter((c) => c.id !== id)]);
        } catch { /* noop */ }
    }, []);

    const dismissLoop = useCallback(async (id: string) => {
        try {
            const updated = await capturesApi.patch(id, { status: 'dismissed' });
            setOpenLoops((prev) => prev.filter((c) => c.id !== id));
            setClosedTodos((prev) => [updated, ...prev.filter((c) => c.id !== id)]);
        } catch { /* noop */ }
    }, []);

    const undoLoop = useCallback(async (id: string) => {
        try {
            const updated = await capturesApi.patch(id, { status: 'open' });
            setClosedTodos((prev) => prev.filter((c) => c.id !== id));
            setOpenLoops((prev) => [updated, ...prev.filter((c) => c.id !== id)]);
        } catch { /* noop */ }
    }, []);

    // Themes
    const [themes, setThemes] = useState<Theme[]>([]);
    const loadThemes = useCallback(() => {
        entriesApi.listThemes().then(setThemes).catch(() => {});
    }, []);
    useEffect(() => { loadThemes(); }, [loadThemes]);

    // ── Load week report (GET cache first, POST generate if needed) ──────────
    const loadWeekReport = useCallback(async (weekStart: string, forceRegenerate = false) => {
        const requestId = ++activeRequestRef.current;
        setLoading(true);
        setError(undefined);
        setResult(null);

        try {
            if (!forceRegenerate) {
                const cached = await entriesApi.getWeeklyAudit(weekStart);
                if (requestId !== activeRequestRef.current) return;
                if (cached) {
                    setResult(cached);
                    setLoading(false);
                    return;
                }
            }

            // No cache (or regenerating) -- generate
            const res = await entriesApi.generateWeeklyAudit(weekStart, forceRegenerate);
            if (requestId !== activeRequestRef.current) return;
            setResult(res);
            loadThemes();

            // Refresh available weeks (generation may set has_report)
            entriesApi.getAvailableWeeks().then((w) => {
                if (requestId === activeRequestRef.current) setWeeks(w);
            }).catch(() => {});
        } catch (err) {
            if (requestId !== activeRequestRef.current) return;
            setError(err instanceof Error ? err.message : 'Weekly review failed');
        } finally {
            if (requestId === activeRequestRef.current) setLoading(false);
        }
    }, [loadThemes]);

    // ── Fetch available weeks on mount ───────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setWeeksLoading(true);
        entriesApi.getAvailableWeeks().then((w) => {
            if (cancelled) return;
            setWeeks(w);
            if (w.length > 0) {
                setSelectedWeek(w[0].week_start);
            }
            setWeeksLoading(false);
        }).catch(() => {
            if (!cancelled) setWeeksLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    // ── Auto-load report when selected week changes ──────────────────────────
    useEffect(() => {
        if (selectedWeek) {
            loadWeekReport(selectedWeek);
        }
    }, [selectedWeek, loadWeekReport]);

    const handleWeekChange = (e: SelectChangeEvent<string>) => {
        setSelectedWeek(e.target.value);
    };

    const handleRegenerate = useCallback(() => {
        if (selectedWeek) loadWeekReport(selectedWeek, true);
    }, [selectedWeek, loadWeekReport]);

    const report = result?.report_json;
    const coachLetter = result?.audit_text || report?.draft_status_update || null;

    const weekEndStr = selectedWeek ? addDays(selectedWeek, 6) : null;

    const closedThisWeek = useMemo(() => {
        if (!selectedWeek || !weekEndStr) return [];
        return closedTodos
            .filter((c) => {
                if (!c.resolved_at) return false;
                const d = isoToLocalDate(c.resolved_at);
                return d >= selectedWeek && d <= weekEndStr;
            })
            .sort((a, b) => (b.resolved_at! > a.resolved_at! ? 1 : -1));
    }, [closedTodos, selectedWeek, weekEndStr]);

    const gemPreview = useMemo(() => {
        if (!selectedWeek || !weekEndStr) return null;
        const inWeek = reflections
            .filter((c) => c.source_date && c.source_date >= selectedWeek && c.source_date <= weekEndStr)
            .sort((a, b) => (b.source_date! > a.source_date! ? 1 : -1));
        return { top: inWeek[0] ?? null, count: inWeek.length };
    }, [reflections, selectedWeek, weekEndStr]);

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                {/* ── Day / Week tabs ────────────────────────────────── */}
                <DayWeekTabs active="week" />

                {/* ── Week selector + generate ───────────────────────── */}
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: { xs: 1.25, sm: 2 },
                        mb: 2,
                        minWidth: 0,
                    }}
                >
                    <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
                        {weeksLoading ? (
                            <Typography variant="overline" color="text.secondary">Loading weeks...</Typography>
                        ) : weeks.length > 0 ? (
                            <Select
                                value={selectedWeek || ''}
                                onChange={handleWeekChange}
                                size="small"
                                variant="standard"
                                disableUnderline
                                sx={{
                                    maxWidth: '100%',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: palette.textMuted,
                                    '& .MuiSelect-select': {
                                        py: 0.25,
                                        pr: 3,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    },
                                }}
                            >
                                {weeks.map((w) => (
                                    <MenuItem key={w.week_start} value={w.week_start}>
                                        {fmtDate(w.week_start)} {'\u2013'} {fmtDate(w.week_end)}
                                        {' \u00b7 '}{w.entry_count} entries
                                        {isCurrentWeek(w.week_start) ? ' (this week)' : ''}
                                    </MenuItem>
                                ))}
                            </Select>
                        ) : (
                            <Typography variant="overline" color="text.secondary">No weeks with 3+ entries</Typography>
                        )}
                    </Box>

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={loading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                        onClick={handleRegenerate}
                        disabled={loading || !selectedWeek}
                        sx={{
                            flex: '0 0 auto',
                            minHeight: 44,
                            px: { xs: 1.25, sm: 1.5 },
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {result ? 'Regenerate' : 'Generate'}
                    </Button>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* ── Loading state ──────────────────────────────────── */}
                {loading && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
                        <CircularProgress size={28} sx={{ mb: 2 }} />
                        <Typography variant="body2" color="text.secondary">
                            Generating weekly report...
                        </Typography>
                    </Box>
                )}

                {/* ── Empty state (no weeks available) ──────────────── */}
                {weeks.length === 0 && !weeksLoading && !loading && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center', py: 4 }}>
                        Record throughout the week to get your first report. Needs 3+ entries in a week.
                    </Typography>
                )}

                {result?.message && !coachLetter && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {result.message}
                    </Typography>
                )}

                {/* ── AI Coach letter (top summary, no label) ───────── */}
                {coachLetter && <CoachLetter text={coachLetter} />}

                {/* ── Category Breakdown ──────────────────────────────── */}
                {report && (
                    <CategoryBreakdown
                        activity={report.time_breakdown.activity || {}}
                        captures={report.time_breakdown.captures || {}}
                    />
                )}

                {/* ── Thought Gems (pulled-quote preview) ───────────── */}
                {selectedWeek && gemPreview && (
                    <Box
                        component={RouterLink}
                        to={`/thoughts?week_start=${encodeURIComponent(selectedWeek)}`}
                        aria-label="Thought Gems"
                        sx={{
                            display: 'block',
                            mb: 3,
                            p: { xs: 2, md: 2.5 },
                            border: `1px solid ${palette.rule}`,
                            borderRadius: '12px',
                            bgcolor: 'background.paper',
                            textDecoration: 'none',
                            color: palette.textPrimary,
                            transition: 'border-color 0.15s ease',
                            '&:hover': { borderColor: palette.textMuted },
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
                            <LocalFloristIcon sx={{ fontSize: 14, color: palette.accent }} />
                            <Typography variant="overline" color="text.secondary">
                                Thought Gems
                            </Typography>
                        </Box>
                        {gemPreview.top ? (
                            <>
                                <Typography
                                    sx={{
                                        fontFamily: '"DM Serif Display", "Noto Serif SC", serif',
                                        fontStyle: 'italic',
                                        fontSize: { xs: '1.15rem', md: '1.3rem' },
                                        lineHeight: 1.4,
                                        color: palette.textPrimary,
                                        position: 'relative',
                                        pl: 2,
                                        '&::before': {
                                            content: '"\\201C"',
                                            position: 'absolute',
                                            left: -2,
                                            top: -8,
                                            fontSize: '2.2rem',
                                            color: palette.accentSoft,
                                            lineHeight: 1,
                                        },
                                    }}
                                >
                                    {gemPreview.top.display_text || '(no text)'}
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.25 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {gemPreview.count > 1
                                            ? `+${gemPreview.count - 1} more gem${gemPreview.count - 1 > 1 ? 's' : ''}`
                                            : 'See all reflections'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Open &rsaquo;
                                    </Typography>
                                </Box>
                            </>
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                No reflections this week yet.
                            </Typography>
                        )}
                    </Box>
                )}

                {/* ── Recurring Themes teaser ─────────────────────────── */}
                <RecurringThemesTeaser themes={themes} />

                {/* ── Open Loops ──────────────────────────────────────── */}
                <OpenLoops loops={openLoops} onDone={markLoopDone} onDismiss={dismissLoop} />

                {/* ── Closed this week ────────────────────────────────── */}
                <ClosedLoops loops={closedThisWeek} onUndo={undoLoop} />
            </Box>
        </Container>
    );
};

export default WeeklyReportPage;
