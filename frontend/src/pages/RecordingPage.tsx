import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    LinearProgress,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RecordButton from '../components/RecordButton';
import EntryCard from '../components/EntryCard';
import { useEntries, useEntryStatus, ENTRIES_KEY } from '../hooks/useEntries';
import { useQueryClient } from '@tanstack/react-query';
import { useUpload } from '../hooks/useUpload';
import { useRealtimeNotifications } from '../hooks/useRealtimeChannel';
import { entriesApi } from '../services/api';
import { AuditResponse, EntryItem } from '../types/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';
import Logger from '../utils/logger';

/**
 * Time-weighted breakdown:
 * 1. All non-null estimated_minutes → exact percentages
 * 2. Some null → fill nulls with average, show "~" prefix
 * 3. All null → equal weight (1/N each), show "~" prefix
 */
function computeBreakdown(entries: EntryItem[]): { breakdown: Record<string, number>; approximate: boolean } {
    const cats = entries.flatMap((e) => e.categories);
    if (cats.length === 0) return { breakdown: {}, approximate: false };

    const hasAny = cats.some((c) => c.estimated_minutes != null);
    const hasAll = cats.every((c) => c.estimated_minutes != null);

    const weights: Record<string, number> = {};
    if (hasAny) {
        const nonNull = cats.filter((c) => c.estimated_minutes != null).map((c) => c.estimated_minutes!);
        const avg = nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
        for (const c of cats) {
            const w = c.estimated_minutes ?? avg;
            weights[c.category] = (weights[c.category] ?? 0) + w;
        }
    } else {
        for (const c of cats) {
            weights[c.category] = (weights[c.category] ?? 0) + 1;
        }
    }

    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const breakdown = Object.fromEntries(
        Object.entries(weights).map(([cat, w]) => [cat, Math.round((w / total) * 100)])
    );
    return { breakdown, approximate: !hasAll };
}

const RecordingPage: React.FC = () => {
    useRealtimeNotifications();

    const queryClient = useQueryClient();
    const { data: entriesData } = useEntries(0, 20);
    const upload = useUpload();

    const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | undefined>();

    // Audit state
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
    const [auditError, setAuditError] = useState<string | undefined>();

    // Weekly coach state
    const [weeklyLoading, setWeeklyLoading] = useState(false);
    const [weeklyResult, setWeeklyResult] = useState<AuditResponse | null>(null);
    const [weeklyError, setWeeklyError] = useState<string | undefined>();

    const { data: entryStatus } = useEntryStatus(pendingEntryId);

    // When status polling detects completion, refresh the entries list
    useEffect(() => {
        if (entryStatus?.status === 'done' || entryStatus?.status === 'failed') {
            queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
            setPendingEntryId(null);
        }
    }, [entryStatus?.status, queryClient]);

    const isProcessing =
        upload.isPending ||
        (!!pendingEntryId &&
            entryStatus?.status !== 'done' &&
            entryStatus?.status !== 'failed');

    const handleRecordingComplete = useCallback(
        async (blob: Blob) => {
            setUploadError(undefined);
            setPendingEntryId(null);
            try {
                Logger.info('Starting two-phase upload');
                const { entry_id } = await upload.mutateAsync({
                    blob,
                    options: { recordedAt: new Date().toISOString() },
                });
                setPendingEntryId(entry_id);
                Logger.info(`Entry ${entry_id} submitted for processing`);
            } catch (err) {
                Logger.error('Upload failed:', err);
                setUploadError(err instanceof Error ? err.message : 'Upload failed');
            }
        },
        [upload]
    );

    const handleGenerateAudit = useCallback(async (regenerate = false) => {
        setAuditLoading(true);
        setAuditError(undefined);
        if (regenerate) setAuditResult(null);
        try {
            const todayUtc = new Date().toISOString().split('T')[0];
            const result = await entriesApi.generateAudit(todayUtc, regenerate);
            setAuditResult(result);
        } catch (err) {
            setAuditError(err instanceof Error ? err.message : 'Audit generation failed');
        } finally {
            setAuditLoading(false);
        }
    }, []);

    // Auto-load cached audit on mount
    useEffect(() => {
        if (entries.length > 0 && !auditResult && !auditLoading) {
            handleGenerateAudit(false);
        }
    }, [entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleWeeklyReview = useCallback(async () => {
        setWeeklyLoading(true);
        setWeeklyError(undefined);
        try {
            const result = await entriesApi.generateWeeklyAudit();
            setWeeklyResult(result);
        } catch (err) {
            setWeeklyError(err instanceof Error ? err.message : 'Weekly review failed');
        } finally {
            setWeeklyLoading(false);
        }
    }, []);

    const entries = entriesData?.items ?? [];
    const { breakdown, approximate } = useMemo(() => computeBreakdown(entries), [entries]);
    const hasBreakdown = Object.keys(breakdown).length > 0;

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 4, mb: 8 }}>
                <Typography variant="h1" component="h1" gutterBottom sx={{ mb: 4 }}>
                    Time Logger
                </Typography>

                {/* ── Recorder ──────────────────────────────────────────────── */}
                <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper', mb: 3 }}>
                    <RecordButton onRecordingComplete={handleRecordingComplete} />

                    {isProcessing && (
                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                            <Chip
                                label={stepLabel(entryStatus?.step ?? null, upload.isPending)}
                                size="small"
                                variant="outlined"
                                icon={<CircularProgress size={12} />}
                            />
                        </Box>
                    )}

                    {(uploadError || entryStatus?.status === 'failed') && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {uploadError ?? 'Processing failed. Please try again.'}
                        </Alert>
                    )}

                    {entryStatus?.status === 'done' && entryStatus.categories.length > 0 && (
                        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                            {entryStatus.categories.map((c, i) => (
                                <Chip
                                    key={i}
                                    label={c.category}
                                    size="small"
                                    sx={{
                                        borderColor: CATEGORY_COLORS[c.category] ?? palette.textMuted,
                                        color: CATEGORY_COLORS[c.category] ?? palette.textMuted,
                                        bgcolor: `${CATEGORY_COLORS[c.category] ?? palette.textMuted}0F`,
                                    }}
                                    variant="outlined"
                                />
                            ))}
                        </Box>
                    )}

                    {entryStatus?.transcript && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                            "{entryStatus.transcript}"
                        </Typography>
                    )}
                </Box>

                {/* ── Two-column: entries + breakdown/audit ─────────────────── */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, gap: 2 }}>

                    {/* Left: today's entries */}
                    <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                        <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                            Today's Entries {entries.length > 0 && `— ${entries.length}`}
                        </Typography>

                        {entries.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                Record your day to see entries here.
                            </Typography>
                        ) : (
                            entries.slice(0, 10).map((entry) => (
                                <EntryCard key={entry.id} entry={entry} />
                            ))
                        )}
                    </Box>

                    {/* Right: breakdown bars + AI audit */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                        {/* Category breakdown */}
                        <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                            <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                                Time Breakdown — today
                            </Typography>

                            {!hasBreakdown ? (
                                <Typography variant="body2" color="text.secondary">
                                    Breakdown will appear once entries are classified.
                                </Typography>
                            ) : (
                                Object.entries(breakdown)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([cat, pct]) => (
                                        <Box key={cat} sx={{ mb: 1 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography variant="caption">
                                                    {CATEGORY_LABELS[cat] ?? cat}
                                                </Typography>
                                                <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                                    {approximate ? '~' : ''}{pct}%
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
                                    ))
                            )}
                        </Box>

                        {/* AI Audit */}
                        <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Typography variant="overline" color="text.secondary">
                                    AI Audit
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={auditLoading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                                    onClick={() => handleGenerateAudit(!!auditResult)}
                                    disabled={auditLoading || entries.length === 0}
                                >
                                    {auditResult ? 'Regenerate' : 'Generate Audit'}
                                </Button>
                            </Box>

                            {auditError && (
                                <Alert severity="error" sx={{ mb: 1 }}>{auditError}</Alert>
                            )}

                            {auditResult === null && !auditLoading && !auditError && (
                                <Typography variant="body2" color="text.secondary">
                                    {entries.length === 0
                                        ? 'Record your day first.'
                                        : 'Click "Generate Audit" for an honest breakdown of your day.'}
                                </Typography>
                            )}

                            {auditResult?.message && !auditResult.audit_text && (
                                <Typography variant="body2" color="text.secondary">
                                    {auditResult.message}
                                </Typography>
                            )}

                            {auditResult?.audit_text && (
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
                                        {auditResult.audit_text}
                                    </Typography>
                                    {auditResult.generated_at && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                                            Based on {auditResult.entries} entries · {new Date(auditResult.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Box>

                        {/* Weekly Coach Letter */}
                        <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Typography variant="overline" color="text.secondary">
                                    Weekly Coach
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={weeklyLoading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                                    onClick={handleWeeklyReview}
                                    disabled={weeklyLoading}
                                >
                                    {weeklyResult ? 'Regenerate' : 'Generate Weekly Review'}
                                </Button>
                            </Box>

                            {weeklyError && (
                                <Alert severity="error" sx={{ mb: 1 }}>{weeklyError}</Alert>
                            )}

                            {weeklyResult === null && !weeklyLoading && !weeklyError && (
                                <Typography variant="body2" color="text.secondary">
                                    Get an honest weekly review comparing your days and calling out patterns.
                                </Typography>
                            )}

                            {weeklyResult?.message && !weeklyResult.audit_text && (
                                <Typography variant="body2" color="text.secondary">
                                    {weeklyResult.message}
                                </Typography>
                            )}

                            {weeklyResult?.audit_text && (
                                <Box
                                    sx={{
                                        borderLeft: `2px solid ${palette.info}`,
                                        pl: 2,
                                        py: 1,
                                        bgcolor: palette.surface2,
                                        borderRadius: '0 8px 8px 0',
                                    }}
                                >
                                    <Typography variant="overline" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                                        Your Weekly Coach says:
                                    </Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                                        {weeklyResult.audit_text}
                                    </Typography>
                                    {weeklyResult.generated_at && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontVariantNumeric: 'tabular-nums' }}>
                                            Based on {weeklyResult.entries} entries this week
                                            {weeklyResult.cached && ' (cached)'}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Box>

                    </Box>
                </Box>

            </Box>
        </Container>
    );
};

function stepLabel(step: string | null, isUploading: boolean): string {
    if (isUploading) return 'Uploading audio…';
    switch (step) {
        case 'queued': return 'Queued…';
        case 'starting': return 'Starting…';
        case 'transcribing': return 'Transcribing audio…';
        case 'refining': return 'Refining transcript…';
        case 'classifying': return 'Classifying…';
        case 'complete': return 'Done';
        default: return step ?? 'Processing…';
    }
}

export default RecordingPage;
