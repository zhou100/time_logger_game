import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
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
import PushPinIcon from '@mui/icons-material/PushPin';
import { capturesApi, entriesApi } from '../services/api';
import { AuditResponse, Capture, WeeklyAuditHistoryItem, WeeklyReportJson, Theme } from '../types/api';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';

/** Renders the 4 structured sections of the weekly report */
const StructuredReport: React.FC<{ report: WeeklyReportJson }> = ({ report }) => {
    const [copied, setCopied] = React.useState(false);
    const tb = report.time_breakdown;
    const activityEntries = Object.entries(tb.activity || {}).sort(([, a], [, b]) => b - a);
    const captureEntries = Object.entries(tb.captures || {});

    const handleCopy = () => {
        const text = report.draft_status_update || '';
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        } else {
            // textarea fallback
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
        <>
            {/* Section 1: Time Breakdown */}
            <Box sx={{ p: 3, mb: 2, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    Time Breakdown
                </Typography>
                {activityEntries.map(([cat, pct]) => (
                    <Box key={cat} sx={{ mb: 0.5, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{CATEGORY_LABELS[cat] ?? cat}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: CATEGORY_COLORS[cat] ?? palette.textMuted }}>
                            {pct}%
                        </Typography>
                    </Box>
                ))}
                {captureEntries.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {captureEntries.map(([cat, count]) => `${count} ${CATEGORY_LABELS[cat] ?? cat}${count > 1 ? 's' : ''}`).join(' \u00b7 ')}
                    </Typography>
                )}
                {tb.naval_balance && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                        {tb.naval_balance}
                    </Typography>
                )}
            </Box>

            {/* Section 2: Open Loops */}
            {report.open_loops.length > 0 && (
                <Box sx={{ p: 3, mb: 2, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                    <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        Open Loops \u00b7 {report.open_loops.length}
                    </Typography>
                    {report.open_loops.map((item, i) => (
                        <Typography key={i} variant="body2" sx={{ mb: 0.5, pl: 1, borderLeft: `2px solid ${palette.accent}` }}>
                            {item}
                        </Typography>
                    ))}
                </Box>
            )}

            {/* Section 3: Recurring Themes */}
            {report.recurring_themes.length > 0 && (
                <Box sx={{ p: 3, mb: 2, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                    <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        Patterns
                    </Typography>
                    {report.recurring_themes.map((theme, i) => (
                        <Typography key={i} variant="body2" sx={{ mb: 0.5 }}>
                            \u2022 {theme}
                        </Typography>
                    ))}
                </Box>
            )}

            {/* Section 4: Draft Status Update */}
            {report.draft_status_update && (
                <Box sx={{ p: 3, mb: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
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
                        {report.draft_status_update}
                    </Typography>
                </Box>
            )}
        </>
    );
};

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

    const toggleThemePin = useCallback(async (theme: Theme) => {
        const next = theme.status === 'pinned' ? 'active' : 'pinned';
        try {
            const updated = await entriesApi.updateTheme(theme.id, { status: next });
            setThemes((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } catch { /* noop */ }
    }, []);

    const dismissTheme = useCallback(async (theme: Theme) => {
        try {
            await entriesApi.updateTheme(theme.id, { status: 'dismissed' });
            setThemes((prev) => prev.filter((t) => t.id !== theme.id));
        } catch { /* noop */ }
    }, []);

    const polarityColor = (p: string) =>
        p === 'positive' ? palette.success : p === 'negative' ? palette.error : palette.info;

    const formatRange = (start?: string, end?: string) => {
        if (!start || !end) return '';
        const fmt = (s: string) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        };
        return `${fmt(start)} \u2192 ${fmt(end)} \u00b7 7 days`;
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

    return (
        <Container maxWidth="sm">
            <Box sx={{ mt: 4, mb: 8 }}>
                <Typography variant="h1" component="h1" gutterBottom sx={{ mb: 3 }}>
                    Weekly Report
                </Typography>

                {/* Themes */}
                {themes.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Recurring Themes
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
                            {themes.slice(0, 8).map((t) => {
                                const streak = t.streak ?? [];
                                const activeCount = streak.filter(Boolean).length;
                                return (
                                    <Box key={t.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
                                        <Chip
                                            size="small"
                                            label={t.title}
                                            onDelete={() => dismissTheme(t)}
                                            icon={
                                                <PushPinIcon
                                                    fontSize="small"
                                                    onClick={(e) => { e.stopPropagation(); toggleThemePin(t); }}
                                                    sx={{
                                                        cursor: 'pointer',
                                                        color: t.status === 'pinned' ? polarityColor(t.polarity) : 'text.disabled',
                                                        transform: t.status === 'pinned' ? 'none' : 'rotate(45deg)',
                                                    }}
                                                />
                                            }
                                            sx={{
                                                borderColor: polarityColor(t.polarity),
                                                color: polarityColor(t.polarity),
                                                bgcolor: 'background.paper',
                                                border: `1px solid ${polarityColor(t.polarity)}`,
                                                fontWeight: 500,
                                            }}
                                            variant="outlined"
                                        />
                                        {streak.length > 0 && (
                                            <Box sx={{ display: 'flex', gap: '2px', mt: '2px' }} aria-label={`${activeCount} of 14 days active`}>
                                                {streak.map((on, i) => (
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
                                );
                            })}
                        </Box>
                    </Box>
                )}

                {/* Open Loops — live from captures */}
                {openLoops.length > 0 && (
                    <Box sx={{ mb: 3, p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                        <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Open Loops · {openLoops.length}
                        </Typography>
                        {openLoops.map((c) => (
                            <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, pl: 1, borderLeft: `2px solid ${palette.accent}` }}>
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

                {/* This Week — header */}
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

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                )}

                {result === null && !loading && !error && (
                    <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper', mb: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                            Get an honest weekly review comparing your days and calling out patterns.
                        </Typography>
                    </Box>
                )}

                {result?.message && !result.audit_text && (
                    <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper', mb: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                            {result.message}
                        </Typography>
                    </Box>
                )}

                {result?.audit_text && (
                    <>
                        {/* Structured report sections */}
                        {result.report_json && <StructuredReport report={result.report_json} />}

                        {/* Prose coach letter */}
                        <Box sx={{
                            p: 3, mb: 3, borderRadius: '8px',
                            border: `1px solid ${palette.rule}`, bgcolor: 'background.paper',
                        }}>
                            <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                Coach Letter
                            </Typography>
                            <Box sx={{
                                borderLeft: `2px solid ${palette.info}`,
                                pl: 2, py: 1,
                                bgcolor: palette.surface2,
                                borderRadius: '0 8px 8px 0',
                            }}>
                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                                    {result.audit_text}
                                </Typography>
                            </Box>
                            {result.generated_at && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                                    {result.entries} entries
                                    {result.cached && ' \u00b7 cached'}
                                </Typography>
                            )}
                            {result.new_themes && result.new_themes.length > 0 && (
                                <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {result.new_themes.map((nt) => (
                                        <Chip
                                            key={nt.id}
                                            size="small"
                                            label={nt.is_new ? `+ ${nt.title}` : `${nt.title} (${nt.occurrences}\u00d7)`}
                                            sx={{
                                                bgcolor: 'background.paper',
                                                border: `1px solid ${polarityColor(nt.polarity)}`,
                                                color: polarityColor(nt.polarity),
                                                fontSize: '0.7rem',
                                            }}
                                        />
                                    ))}
                                </Box>
                            )}
                        </Box>
                    </>
                )}

                {/* Past Reviews */}
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
                                        p: 1.5,
                                        mb: 1,
                                        borderRadius: '8px',
                                        border: `1px solid ${palette.rule}`,
                                        bgcolor: 'background.paper',
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
