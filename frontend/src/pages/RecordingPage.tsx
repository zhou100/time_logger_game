import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    LinearProgress,
    Paper,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RecordButton from '../components/RecordButton';
import EntryCard from '../components/EntryCard';
import { useEntries, useEntryStatus, ENTRIES_KEY } from '../hooks/useEntries';
import { useQueryClient } from '@tanstack/react-query';
import { useUpload } from '../hooks/useUpload';
import { useWebSocket } from '../hooks/useWebSocket';
import { entriesApi } from '../services/api';
import { AuditResponse, EntryItem } from '../types/api';
import Logger from '../utils/logger';

// Category colours consistent with the wireframe
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

/** Equal-weight breakdown: count classifications per category as % of total. */
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

const RecordingPage: React.FC = () => {
    useWebSocket();

    const queryClient = useQueryClient();
    const { data: entriesData } = useEntries(0, 20);
    const upload = useUpload();

    const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | undefined>();

    // Audit state
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
    const [auditError, setAuditError] = useState<string | undefined>();

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

    const handleGenerateAudit = useCallback(async () => {
        setAuditLoading(true);
        setAuditError(undefined);
        setAuditResult(null);
        try {
            // Always send today's date in UTC so the backend filter is correct
            const todayUtc = new Date().toISOString().split('T')[0];
            const result = await entriesApi.generateAudit(todayUtc);
            setAuditResult(result);
        } catch (err) {
            setAuditError(err instanceof Error ? err.message : 'Audit generation failed');
        } finally {
            setAuditLoading(false);
        }
    }, []);

    const entries = entriesData?.items ?? [];
    const breakdown = useMemo(() => computeBreakdown(entries), [entries]);
    const hasBreakdown = Object.keys(breakdown).length > 0;

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: 4, mb: 8 }}>
                <Typography
                    variant="h3"
                    component="h1"
                    gutterBottom
                    sx={{
                        fontWeight: 'bold',
                        background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                        backgroundClip: 'text',
                        textFillColor: 'transparent',
                        mb: 4,
                        textAlign: 'center',
                    }}
                >
                    Time Logger
                </Typography>

                {/* ── Recorder ──────────────────────────────────────────────── */}
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2, mb: 3 }}>
                    <RecordButton onRecordingComplete={handleRecordingComplete} />

                    {isProcessing && (
                        <Box sx={{ mt: 2, textAlign: 'center' }}>
                            <Chip
                                label={stepLabel(entryStatus?.step ?? null, upload.isPending)}
                                color="primary"
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
                                    sx={{ borderColor: CATEGORY_COLORS[c.category] ?? '#888', color: CATEGORY_COLORS[c.category] ?? '#888' }}
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
                </Paper>

                {/* ── Two-column: entries + breakdown/audit ─────────────────── */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, gap: 2 }}>

                    {/* Left: today's entries */}
                    <Paper elevation={1} sx={{ p: 2 }}>
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
                    </Paper>

                    {/* Right: breakdown bars + AI audit */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                        {/* Category breakdown */}
                        <Paper elevation={1} sx={{ p: 2 }}>
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
                                    ))
                            )}
                        </Paper>

                        {/* AI Audit */}
                        <Paper elevation={1} sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                                <Typography variant="overline" color="text.secondary">
                                    AI Audit
                                </Typography>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={auditLoading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                                    onClick={handleGenerateAudit}
                                    disabled={auditLoading || entries.length === 0}
                                >
                                    Generate Audit
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
                                        {auditResult.audit_text}
                                    </Typography>
                                    {auditResult.generated_at && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                            Based on {auditResult.entries} entries · {new Date(auditResult.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </Typography>
                                    )}
                                </Box>
                            )}
                        </Paper>

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
