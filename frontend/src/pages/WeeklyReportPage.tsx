import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Container,
    Divider,
    IconButton,
    MenuItem,
    Select,
    SelectChangeEvent,
    Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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

/* ── Recurring Themes (lightweight insight list) ──────────────────────────── */
const RecurringThemes: React.FC<{ themes: Theme[]; onDismiss: (t: Theme) => void }> = ({ themes, onDismiss }) => {
    if (themes.length === 0) return null;

    const polarityColor = (p: string) =>
        p === 'positive' ? palette.success : p === 'negative' ? palette.error : palette.textMuted;

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Recurring Themes
            </Typography>
            {themes.slice(0, 8).map((t) => (
                <Box
                    key={t.id}
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        py: 1,
                        borderBottom: `1px solid ${palette.rule}40`,
                        '&:last-child': { borderBottom: 'none' },
                    }}
                >
                    <Box
                        sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: polarityColor(t.polarity),
                            flexShrink: 0,
                            mt: '7px',
                        }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }}>
                            {t.title}
                        </Typography>
                        {t.description && (
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, display: 'block' }}>
                                {t.description}
                            </Typography>
                        )}
                    </Box>
                    <IconButton
                        size="small"
                        onClick={() => onDismiss(t)}
                        sx={{ p: 0.25, flexShrink: 0, color: palette.textMuted, opacity: 0.35, '&:hover': { opacity: 0.8 } }}
                        aria-label="dismiss theme"
                    >
                        <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Box>
            ))}
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

/* ── Main page ─────────────────────────────────────────────────────────────── */
const WeeklyReportPage: React.FC = () => {
    const navigate = useNavigate();
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

    const markLoopDone = useCallback(async (id: string) => {
        try {
            await capturesApi.patch(id, { status: 'done' });
            setOpenLoops((prev) => prev.filter((c) => c.id !== id));
        } catch { /* noop */ }
    }, []);

    const dismissLoop = useCallback(async (id: string) => {
        try {
            await capturesApi.patch(id, { status: 'dismissed' });
            setOpenLoops((prev) => prev.filter((c) => c.id !== id));
        } catch { /* noop */ }
    }, []);

    // Themes
    const [themes, setThemes] = useState<Theme[]>([]);
    const loadThemes = useCallback(() => {
        entriesApi.listThemes().then(setThemes).catch(() => {});
    }, []);
    useEffect(() => { loadThemes(); }, [loadThemes]);

    const dismissTheme = useCallback(async (theme: Theme) => {
        try {
            await entriesApi.updateTheme(theme.id, { status: 'dismissed' });
            setThemes((prev) => prev.filter((t) => t.id !== theme.id));
        } catch { /* noop */ }
    }, []);

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
    const keyInsight = report?.draft_status_update || result?.audit_text || null;

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                {/* ── Day / Week tabs ────────────────────────────────── */}
                <DayWeekTabs active="week" />

                {/* ── Week selector + generate ───────────────────────── */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
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
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: palette.textMuted,
                                '& .MuiSelect-select': { py: 0.25, pr: 3 },
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

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={loading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                        onClick={handleRegenerate}
                        disabled={loading || !selectedWeek}
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

                {result?.message && !keyInsight && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {result.message}
                    </Typography>
                )}

                {/* ── Key Insight (top summary, no label) ───────────── */}
                {keyInsight && (
                    <Typography
                        variant="body1"
                        sx={{
                            mb: 3,
                            lineHeight: 1.7,
                            fontSize: '15px',
                            color: palette.textPrimary,
                        }}
                    >
                        {keyInsight}
                    </Typography>
                )}

                {/* ── Category Breakdown ──────────────────────────────── */}
                {report && (
                    <CategoryBreakdown
                        activity={report.time_breakdown.activity || {}}
                        captures={report.time_breakdown.captures || {}}
                    />
                )}

                {/* ── Recurring Themes ────────────────────────────────── */}
                <RecurringThemes themes={themes} onDismiss={dismissTheme} />

                {/* ── Open Loops ──────────────────────────────────────── */}
                <OpenLoops loops={openLoops} onDone={markLoopDone} onDismiss={dismissLoop} />

                {/* ── Past Weeks entry ────────────────────────────────── */}
                <Divider sx={{ my: 2, borderColor: `${palette.rule}60` }} />
                <Box
                    onClick={() => navigate('/weeks')}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.5,
                        cursor: 'pointer',
                        borderRadius: '4px',
                        mx: -0.5,
                        px: 0.5,
                        WebkitTapHighlightColor: 'transparent',
                        transition: 'background-color 0.1s',
                        '&:active': { bgcolor: `${palette.rule}20` },
                        '@media (hover: hover)': {
                            '&:hover': { bgcolor: `${palette.rule}15` },
                        },
                    }}
                >
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                        Past weeks
                    </Typography>
                    <ChevronRightIcon sx={{ fontSize: 18, color: palette.textMuted, opacity: 0.5 }} />
                </Box>
            </Box>
        </Container>
    );
};

export default WeeklyReportPage;
