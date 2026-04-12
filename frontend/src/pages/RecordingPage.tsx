import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    Container,
    IconButton,
    Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RecordButton from '../components/RecordButton';
import EntryCard from '../components/EntryCard';
import DatePickerPopover from '../components/DatePickerPopover';
import DayWeekTabs from '../components/DayWeekTabs';
import { useEntries, useEntryStatus, ENTRIES_KEY } from '../hooks/useEntries';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUpload } from '../hooks/useUpload';
import { useRealtimeNotifications } from '../hooks/useRealtimeChannel';
import { entriesApi } from '../services/api';
import { palette } from '../theme';
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

const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeDateParam(raw: string | null, today: string): string | null {
    if (!raw || !DATE_PARAM_RE.test(raw)) return null;
    if (raw > today) return null;
    return raw;
}

const RecordingPage: React.FC = () => {
    useRealtimeNotifications();

    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const today = useMemo(localToday, []);
    const initialDate = sanitizeDateParam(searchParams.get('date'), today) ?? today;
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
        const routeDate = sanitizeDateParam(searchParams.get('date'), today);
        if (routeDate && routeDate !== selectedDate) {
            setSelectedDate(routeDate);
        }
        if (!routeDate && selectedDate !== today) {
            setSelectedDate(today);
        }
    }, [searchParams, selectedDate, today]);

    const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | undefined>();

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

    const entries = entriesData?.items ?? [];

    return (
        <Container maxWidth="md">
            <Box sx={{ mt: { xs: 2, md: 4 }, mb: 8 }}>
                {/* ── Day / Week tabs ──────────────────────────────────── */}
                <DayWeekTabs active="day" />

                {/* ── Hero zone: centered date + record ───────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 2, pb: 1.5, gap: 0.75 }}>
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

                {/* ── Processing feedback ─────────────────────────────── */}
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

                {/* ── Entry timeline ──────────────────────────────────── */}
                <Box sx={{ px: { xs: 0, sm: 1 } }}>
                    {entries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
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
