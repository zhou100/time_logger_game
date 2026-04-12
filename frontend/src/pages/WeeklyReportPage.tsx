import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Collapse,
    Container,
    Divider,
    IconButton,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { capturesApi, entriesApi } from '../services/api';
import { AuditResponse, Capture, WeeklyAuditHistoryItem, WeeklyReportJson, Theme } from '../types/api';
import DayWeekTabs from '../components/DayWeekTabs';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';

/* ── Category Breakdown bar ────────────────────────────────────────────────── */
const CategoryBreakdown: React.FC<{ activity: Record<string, number>; captures: Record<string, number> }> = ({ activity, captures }) => {
    const sorted = Object.entries(activity).sort(([, a], [, b]) => b - a);
    const captureEntries = Object.entries(captures);
    if (sorted.length === 0 && captureEntries.length === 0) return null;

    const maxPct = sorted.length > 0 ? sorted[0][1] : 0;

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Category Breakdown
            </Typography>
            {sorted.map(([cat, pct]) => (
                <Box key={cat} sx={{ display: 'flex', alignItems: 'center', mb: 1, minHeight: 32 }}>
                    <Typography variant="body2" sx={{ width: 90, flexShrink: 0, color: palette.textPrimary }}>
                        {CATEGORY_LABELS[cat] ?? cat}
                    </Typography>
                    <Box sx={{ flex: 1, mx: 1.5, height: 8, borderRadius: 4, bgcolor: `${palette.rule}40`, overflow: 'hidden' }}>
                        <Box
                            sx={{
                                height: '100%',
                                borderRadius: 4,
                                bgcolor: CATEGORY_COLORS[cat] ?? palette.textMuted,
                                width: `${maxPct > 0 ? (pct / maxPct) * 100 : 0}%`,
                                transition: 'width 0.3s ease-out',
                            }}
                        />
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{ width: 40, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: CATEGORY_COLORS[cat] ?? palette.textMuted }}
                    >
                        {pct}%
                    </Typography>
                </Box>
            ))}
            {captureEntries.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {captureEntries.map(([cat, count]) => `${count} ${CATEGORY_LABELS[cat] ?? cat}${count > 1 ? 's' : ''}`).join(' \u00b7 ')}
                </Typography>
            )}
        </Box>
    );
};

/* ── Recurring Themes (display-only list) ──────────────────────────────────── */
const RecurringThemes: React.FC<{ themes: Theme[]; onDismiss: (t: Theme) => void }> = ({ themes, onDismiss }) => {
    if (themes.length === 0) return null;

    const polarityColor = (p: string) =>
        p === 'positive' ? palette.success : p === 'negative' ? palette.error : palette.info;

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Recurring Themes
            </Typography>
            {themes.slice(0, 8).map((t) => (
                <Box
                    key={t.id}
                    sx={{
                        py: 1.5,
                        px: 2,
                        mb: 1,
                        borderRadius: '8px',
                        bgcolor: palette.surface,
                        borderLeft: `3px solid ${polarityColor(t.polarity)}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                    }}
                >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
                            {t.title}
                        </Typography>
                        {t.description && (
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, mt: 0.25, display: 'block' }}>
                                {t.description}
                            </Typography>
                        )}
                        {(t.streak ?? []).length > 0 && (
                            <Box sx={{ display: 'flex', gap: '2px', mt: 0.75 }}>
                                {(t.streak ?? []).map((on, i) => (
                                    <Box
                                        key={i}
                                        sx={{
                                            width: 5,
                                            height: 5,
                                            borderRadius: '50%',
                                            bgcolor: on ? polarityColor(t.polarity) : palette.rule,
                                            opacity: on ? 0.85 : 0.45,
                                        }}
                                    />
                                ))}
                            </Box>
                        )}
                    </Box>
                    <IconButton
                        size="small"
                        onClick={() => onDismiss(t)}
                        sx={{ p: 0.25, flexShrink: 0, color: palette.textMuted, opacity: 0.5, '&:hover': { opacity: 1 } }}
                        aria-label="dismiss theme"
                    >
                        <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Box>
            ))}
        </Box>
    );
};

/* ── Status Update (copy-able) ─────────────────────────────────────────────── */
const StatusUpdate: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="overline" color="text.secondary">
                    Status Update
                </Typography>
                <Button
                    size="small"
                    variant="text"
                    startIcon={<ContentCopyIcon fontSize="small" />}
                    onClick={handleCopy}
                    sx={{ color: palette.textMuted, textTransform: 'none' }}
                >
                    {copied ? 'Copied!' : 'Copy'}
                </Button>
            </Box>
            <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
                {text}
            </Typography>
        </Box>
    );
};

/* ── Main page ─────────────────────────────────────────────────────────────── */
const WeeklyReportPage: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuditResponse | null>(null);
    const [error, setError] = useState<string | undefined>();
    const [history, setHistory] = useState<WeeklyAuditHistoryItem[]>([]);
    const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

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

    const formatRange = (start?: string, end?: string) => {
        if (!start || !end) return '';
        const fmt = (s: string) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };
        return `${fmt(start)} \u2192 ${fmt(end)}`;
    };

    // Load history on mount
    useEffect(() => {
        entriesApi.getWeeklyAuditHistory().then(setHistory).catch(() => {});
    }, []);

    const handleGenerate = useCallback(async () => {
        const shouldRegenerate = result !== null;
        setLoading(true);
        setError(undefined);
        try {
            const res = await entriesApi.generateWeeklyAudit(shouldRegenerate);
            setResult(res);
            const hist = await entriesApi.getWeeklyAuditHistory();
            setHistory(hist);
            loadThemes();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Weekly review failed');
        } finally {
            setLoading(false);
        }
    }, [result, loadThemes]);

    const report = result?.report_json;

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                {/* ── Day / Week tabs ────────────────────────────────── */}
                <DayWeekTabs active="week" />

                {/* ── Week header + generate ─────────────────────────── */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="overline" color="text.secondary">
                        This Week
                        {(result?.week_start && result?.week_end) &&
                            ` \u00b7 ${formatRange(result.week_start, result.week_end)}`}
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={loading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                        onClick={handleGenerate}
                        disabled={loading}
                    >
                        {result ? 'Regenerate' : 'Generate'}
                    </Button>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {/* ── Summary (top, lightweight) ─────────────────────── */}
                {result?.audit_text && (
                    <Typography
                        variant="body1"
                        sx={{
                            mb: 3,
                            lineHeight: 1.7,
                            fontSize: '15px',
                            color: palette.textPrimary,
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {result.audit_text}
                    </Typography>
                )}

                {result === null && !loading && !error && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center', py: 4 }}>
                        Get an honest weekly review comparing your days and calling out patterns.
                    </Typography>
                )}

                {result?.message && !result.audit_text && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {result.message}
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
                {openLoops.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                            Open Loops · {openLoops.length}
                        </Typography>
                        {openLoops.map((c) => (
                            <Box
                                key={c.id}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    py: 1,
                                    px: 2,
                                    mb: 0.75,
                                    borderRadius: '8px',
                                    bgcolor: palette.surface,
                                }}
                            >
                                <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>
                                    {c.display_text || '(no text)'}
                                </Typography>
                                <Box sx={{ display: 'flex', ml: 1, flexShrink: 0 }}>
                                    <IconButton size="small" onClick={() => markLoopDone(c.id)} aria-label="mark done" sx={{ color: palette.success }}>
                                        <CheckIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => dismissLoop(c.id)} aria-label="dismiss" sx={{ color: palette.textMuted }}>
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* ── Status Update ───────────────────────────────────── */}
                {report?.draft_status_update && <StatusUpdate text={report.draft_status_update} />}

                {/* ── Past Reviews ────────────────────────────────────── */}
                {history.length > 0 && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                            Past Reviews
                        </Typography>
                        {history.map((item) => {
                            const isOpen = expandedReviews.has(item.audit_date);
                            return (
                                <Box
                                    key={item.audit_date}
                                    sx={{
                                        py: 1.5,
                                        px: 2,
                                        mb: 1,
                                        borderRadius: '8px',
                                        bgcolor: palette.surface,
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => {
                                        setExpandedReviews((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(item.audit_date)) next.delete(item.audit_date);
                                            else next.add(item.audit_date);
                                            return next;
                                        });
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                            {item.week_label} \u00b7 {item.entries} entries
                                        </Typography>
                                        <ExpandMoreIcon
                                            fontSize="small"
                                            sx={{
                                                color: 'text.secondary',
                                                transform: isOpen ? 'rotate(180deg)' : 'none',
                                                transition: 'transform 0.2s',
                                            }}
                                        />
                                    </Box>
                                    <Collapse in={isOpen} timeout="auto" unmountOnExit>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'text.primary', mt: 1 }}>
                                            {item.audit_text}
                                        </Typography>
                                    </Collapse>
                                </Box>
                            );
                        })}
                    </>
                )}
            </Box>
        </Container>
    );
};

export default WeeklyReportPage;
