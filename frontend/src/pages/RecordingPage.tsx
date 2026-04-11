import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    IconButton,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import RecordButton from '../components/RecordButton';
import EntryCard from '../components/EntryCard';
import DatePickerPopover from '../components/DatePickerPopover';
import { useEntries, useEntryStatus, ENTRIES_KEY } from '../hooks/useEntries';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUpload } from '../hooks/useUpload';
import { useRealtimeNotifications } from '../hooks/useRealtimeChannel';
import { entriesApi } from '../services/api';
import { AuditResponse } from '../types/api';
import { CATEGORY_COLORS, CATEGORY_LABELS, palette } from '../theme';
import Logger from '../utils/logger';


/** Format "2026-03-25" → "Mar 25" */
function formatDateLabel(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Local-timezone today as YYYY-MM-DD */
function localToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const RecordingPage: React.FC = () => {
    useRealtimeNotifications();

    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const today = useMemo(localToday, []);
    const initialDate = searchParams.get('date') || today;
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const isToday = selectedDate === today;

    // Calendar popover state
    const calBtnRef = useRef<HTMLButtonElement>(null);
    const [calAnchor, setCalAnchor] = useState<HTMLElement | null>(null);

    const { data: activeDatesRaw = [] } = useQuery({
        queryKey: ['active-dates'],
        queryFn: () => entriesApi.getActiveDates(),
        staleTime: 5 * 60_000,
    });
    const activeDates = useMemo(() => new Set(activeDatesRaw), [activeDatesRaw]);

    const { data: entriesData } = useEntries(0, 20, selectedDate);
    const upload = useUpload();

    const updateSelectedDate = useCallback((nextDate: string) => {
        setSelectedDate(nextDate);
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (nextDate === today) params.delete('date');
            else params.set('date', nextDate);
            return params;
        }, { replace: true });
    }, [setSearchParams, today]);

    const shiftDate = useCallback((days: number) => {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() + days);
        const nextDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        updateSelectedDate(nextDate);
    }, [selectedDate, updateSelectedDate]);

    useEffect(() => {
        const routeDate = searchParams.get('date');
        if (routeDate && routeDate !== selectedDate) {
            setSelectedDate(routeDate);
        }
        if (!routeDate && selectedDate !== today) {
            setSelectedDate(today);
        }
    }, [searchParams, selectedDate, today]);

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
                    options: { recordedAt: new Date().toISOString(), localDate: selectedDate },
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
            const result = await entriesApi.generateAudit(selectedDate, regenerate);
            setAuditResult(result);
        } catch (err) {
            setAuditError(err instanceof Error ? err.message : 'Audit generation failed');
        } finally {
            setAuditLoading(false);
        }
    }, [selectedDate]);


    const entries = entriesData?.items ?? [];
    const activityBreakdown = entriesData?.activity_breakdown ?? {};
    const captureCounts = entriesData?.capture_counts ?? {};
    const hasActivityBreakdown = Object.keys(activityBreakdown).length > 0;
    const hasCaptureCounts = Object.keys(captureCounts).length > 0;

    // Audit panel visibility
    const [auditVisible, setAuditVisible] = useState(false);

    // Reset audit when date changes
    useEffect(() => {
        setAuditResult(null);
        setAuditError(undefined);
        setAuditVisible(false);
    }, [selectedDate]);

    // Load cached audit silently (don't auto-show)
    useEffect(() => {
        if (entries.length > 0 && !auditResult && !auditLoading) {
            handleGenerateAudit(false);
        }
    }, [entries.length, selectedDate]); // eslint-disable-line

    const handleShowAudit = useCallback(() => {
        setAuditVisible(true);
        if (!auditResult && !auditLoading) {
            handleGenerateAudit(false);
        }
    }, [auditResult, auditLoading, handleGenerateAudit]);

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                <Typography variant="h1" component="h1" gutterBottom sx={{ mb: 1, display: { xs: 'none', md: 'block' } }}>
                    Debrief
                </Typography>

                {/* ── Hero zone: centered date + record ───────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: { xs: 2, md: 0 }, pb: 1.5, gap: 0.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => shiftDate(-1)} aria-label="Previous day">
                            <ChevronLeftIcon />
                        </IconButton>
                        <Typography
                            variant="body1"
                            sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'center', fontWeight: 500 }}
                        >
                            {isToday ? 'Today' : formatDateLabel(selectedDate)}
                        </Typography>
                        <IconButton size="small" onClick={() => shiftDate(1)} disabled={isToday} aria-label="Next day">
                            <ChevronRightIcon />
                        </IconButton>
                        <IconButton
                            ref={calBtnRef}
                            size="small"
                            onClick={() => setCalAnchor(calBtnRef.current)}
                            aria-label="Open calendar"
                        >
                            <CalendarMonthIcon fontSize="small" />
                        </IconButton>
                        {!isToday && (
                            <IconButton size="small" onClick={() => updateSelectedDate(today)} aria-label="Go to today"
                                sx={{ color: palette.accent }}>
                                <Typography variant="caption" fontWeight={700}>Today</Typography>
                            </IconButton>
                        )}
                    </Box>
                    <RecordButton onRecordingComplete={handleRecordingComplete} />
                    <Typography variant="caption" color="text.secondary">Tap to debrief</Typography>
                </Box>

                <DatePickerPopover
                    anchorEl={calAnchor}
                    onClose={() => setCalAnchor(null)}
                    selectedDate={selectedDate}
                    activeDates={activeDates}
                    maxDate={today}
                    onSelect={updateSelectedDate}
                />

                {/* ── Processing feedback ─────────────────────────────────── */}
                {isProcessing && (
                    <Box sx={{ mb: 2, textAlign: 'center' }}>
                        <Chip
                            label={stepLabel(entryStatus?.step ?? null, upload.isPending)}
                            size="small"
                            variant="outlined"
                            icon={<CircularProgress size={12} />}
                        />
                    </Box>
                )}

                {(uploadError || entryStatus?.status === 'failed') && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {uploadError ?? 'Processing failed. Please try again.'}
                    </Alert>
                )}

                {entryStatus?.transcript && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic', textAlign: 'center' }}>
                        "{entryStatus.transcript}"
                    </Typography>
                )}

                {/* ── Chip breakdown ──────────────────────────────────────── */}
                {(hasActivityBreakdown || hasCaptureCounts) && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'center', mb: 2 }}>
                        {hasActivityBreakdown && Object.entries(activityBreakdown)
                            .sort(([, a], [, b]) => b - a)
                            .map(([cat, pct]) => (
                                <Chip
                                    key={cat}
                                    label={`${CATEGORY_LABELS[cat] ?? cat} ${pct}%`}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        fontWeight: 600,
                                        fontVariantNumeric: 'tabular-nums',
                                        fontSize: '0.7rem',
                                        borderColor: `${CATEGORY_COLORS[cat] ?? palette.textMuted}4D`,
                                        color: CATEGORY_COLORS[cat] ?? palette.textMuted,
                                        bgcolor: `${CATEGORY_COLORS[cat] ?? palette.textMuted}0A`,
                                        borderRadius: '12px',
                                    }}
                                />
                            ))}
                        {hasCaptureCounts && Object.entries(captureCounts).map(([cat, count]) => (
                            <Chip
                                key={`cap-${cat}`}
                                label={`${count} ${CATEGORY_LABELS[cat] ?? cat}${count > 1 ? 's' : ''}`}
                                size="small"
                                variant="outlined"
                                sx={{
                                    fontSize: '0.7rem',
                                    borderColor: palette.rule,
                                    color: palette.textMuted,
                                    borderRadius: '12px',
                                }}
                            />
                        ))}
                    </Box>
                )}

                {/* ── Daily Debrief toggle ────────────────────────────────── */}
                {!auditVisible && entries.length > 0 && (
                    <Button
                        fullWidth
                        variant="outlined"
                        onClick={handleShowAudit}
                        startIcon={auditLoading ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
                        disabled={auditLoading}
                        sx={{
                            mb: 1.5,
                            py: 1.5,
                            borderColor: palette.rule,
                            color: palette.textMuted,
                            bgcolor: 'background.paper',
                            '&:hover': { borderColor: `${palette.accent}4D`, color: palette.accent },
                        }}
                    >
                        Daily Debrief
                    </Button>
                )}

                {/* ── Daily Debrief expanded card ─────────────────────────── */}
                {auditVisible && (
                    <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, bgcolor: 'background.paper', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <Typography variant="overline" color="text.secondary">
                                Daily Debrief
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                <IconButton
                                    size="small"
                                    onClick={() => handleGenerateAudit(true)}
                                    disabled={auditLoading || entries.length === 0}
                                    title="Regenerate"
                                    sx={{ border: `1px solid ${palette.rule}`, borderRadius: '4px', width: 28, height: 28 }}
                                >
                                    {auditLoading ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 16 }} />}
                                </IconButton>
                                <IconButton
                                    size="small"
                                    onClick={() => setAuditVisible(false)}
                                    title="Hide"
                                    sx={{ border: `1px solid ${palette.rule}`, borderRadius: '4px', width: 28, height: 28 }}
                                >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Box>
                        </Box>

                        {auditError && (
                            <Alert severity="error" sx={{ mb: 1 }}>{auditError}</Alert>
                        )}

                        {auditResult === null && !auditLoading && !auditError && (
                            <Typography variant="body2" color="text.secondary">
                                Generating your daily debrief...
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
                )}

                {/* ── Entries (primary card) ──────────────────────────────── */}
                <Box sx={{ p: 3, borderRadius: '8px', border: `1px solid ${palette.rule}`, borderColor: `${palette.accent}26`, bgcolor: 'background.paper' }}>
                    <Typography variant="overline" color="text.secondary" display="block" gutterBottom>
                        {isToday ? "Today's" : formatDateLabel(selectedDate)} Entries {entries.length > 0 && `— ${entries.length}`}
                    </Typography>

                    {entries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            {isToday ? 'Record your day to see entries here.' : 'No entries recorded on this day.'}
                        </Typography>
                    ) : (
                        entries.slice(0, 10).map((entry) => (
                            <EntryCard key={entry.id} entry={entry} />
                        ))
                    )}
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
